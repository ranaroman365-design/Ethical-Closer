import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * generate-availability-slots  (V4 – DST-Aware Slot Engine)
 *
 * Runs daily via pg_cron at 03:00 + on-demand from frontend.
 *
 * FIXED TIME WINDOWS (structured, not every-30-min):
 *   Standard: 09:00, 11:00, 13:00, 15:00, 17:00, 19:00  (6 slots/day, max 3 bookings each)
 *   Priority: 08:30, 10:30, 12:30, 14:30, 16:30          (5 slots/day, max 1 booking each)
 *
 * HORIZONS:
 *   Standard: 14 weekdays ahead
 *   Priority: 3 weekdays ahead
 *
 * TIMEZONE: Uses Europe/Berlin with dynamic DST detection (CET +01:00 / CEST +02:00).
 *           Previously hardcoded to +02:00 which caused 1-hour shifts in winter.
 *
 * REPLENISHMENT: if bookable count < threshold → extend further
 * DEACTIVATION: past slots auto-deactivated
 * DUPLICATE GUARD: checks date + slot_type + starts_at before insert
 */

// ── CONFIG ──────────────────────────────────────────────────
const STANDARD_TIMES = ["09:00", "11:00", "13:00", "15:00", "17:00", "19:00"];
const PRIORITY_TIMES = ["08:30", "10:30", "12:30", "14:30", "16:30"];

const STANDARD_DAYS_AHEAD = 14;
const PRIORITY_DAYS_AHEAD = 3;
const STANDARD_MAX_BOOKINGS = 3;
const PRIORITY_MAX_BOOKINGS = 1;
const MIN_BOOKABLE_STANDARD = 15;
const MIN_BOOKABLE_PRIORITY = 5;
const SLOT_DURATION_MINUTES = 60;
const TIMEZONE = "Europe/Berlin";

/**
 * Compute the UTC offset for a given date in Europe/Berlin.
 * Returns e.g. "+02:00" (CEST) or "+01:00" (CET).
 */
function getBerlinOffset(dateStr: string, timeStr: string): string {
  // Create a date at the target local time by using the timezone formatter
  // to figure out the UTC offset on that specific date.
  const [h, m] = timeStr.split(":").map(Number);

  // Build a UTC date as a reference point for the same calendar day
  const refDate = new Date(`${dateStr}T12:00:00Z`);

  // Use Intl to get the offset. We format the date parts in the target timezone
  // and compare to UTC to derive the offset.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(refDate);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";

  const localYear = parseInt(getPart("year"));
  const localMonth = parseInt(getPart("month")) - 1;
  const localDay = parseInt(getPart("day"));
  const localHour = parseInt(getPart("hour"));
  const localMinute = parseInt(getPart("minute"));

  // Reconstruct what UTC thinks vs what local thinks for the same instant
  const utcMs = refDate.getTime();
  const localAsUtc = Date.UTC(localYear, localMonth, localDay, localHour, localMinute, 0);
  const offsetMinutes = (localAsUtc - utcMs) / 60000;

  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const offH = String(Math.floor(absOffset / 60)).padStart(2, "0");
  const offM = String(absOffset % 60).padStart(2, "0");

  return `${sign}${offH}:${offM}`;
}

/**
 * Convert a Berlin local time string to an ISO string with correct offset.
 */
function berlinTimeToISO(dateStr: string, timeStr: string): string {
  const offset = getBerlinOffset(dateStr, timeStr);
  return `${dateStr}T${timeStr}:00${offset}`;
}

/**
 * Extract the Berlin local HH:MM from a stored UTC/offset timestamp.
 * Used for duplicate detection — compares in Berlin local time, not server UTC.
 */
function extractBerlinLocalTime(isoString: string): string {
  const d = new Date(isoString);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const created: string[] = [];

    // ── HELPER: Build slot rows for a single date ───────────
    const buildSlots = (
      dateStr: string,
      times: string[],
      slotType: "standard" | "priority",
      maxBookings: number
    ) => {
      const slots: Array<{
        date: string;
        starts_at: string;
        ends_at: string;
        slot_type: string;
        max_bookings: number;
        is_active: boolean;
        visible_order: number;
      }> = [];

      times.forEach((time, idx) => {
        const [h, m] = time.split(":").map(Number);
        const endTotalMin = h * 60 + m + SLOT_DURATION_MINUTES;
        const endH = Math.floor(endTotalMin / 60);
        const endM = endTotalMin % 60;
        const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

        const startsAt = berlinTimeToISO(dateStr, time);
        const endsAt = berlinTimeToISO(dateStr, endTime);

        // Skip past slots
        if (new Date(startsAt) <= now) return;

        slots.push({
          date: dateStr,
          starts_at: startsAt,
          ends_at: endsAt,
          slot_type: slotType,
          max_bookings: maxBookings,
          is_active: true,
          visible_order: slotType === "priority" ? 100 + idx : idx,
        });
      });

      return slots;
    };

    // ── HELPER: Get weekday dates from offset (Berlin local) ─
    const getWeekdayDates = (daysAhead: number): string[] => {
      const dates: string[] = [];
      let d = 0;
      let checked = 0;
      while (dates.length < daysAhead && checked < daysAhead + 10) {
        const date = new Date(now);
        date.setDate(date.getDate() + d);
        // Use Berlin timezone for the date string to avoid day-shift at midnight
        const berlinDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: TIMEZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(date);
        const dow = date.getDay();
        if (dow !== 0 && dow !== 6) {
          dates.push(berlinDate); // YYYY-MM-DD in Berlin local
        }
        d++;
        checked++;
      }
      return dates;
    };

    // ── STEP 1: Generate slots for each date/type ───────────
    const generateForType = async (
      daysAhead: number,
      times: string[],
      slotType: "standard" | "priority",
      maxBookings: number
    ) => {
      const dates = getWeekdayDates(daysAhead);

      for (const dateStr of dates) {
        // DUPLICATE GUARD: Check if ANY slots exist for this date+type
        const { count: existingCount } = await supabase
          .from("availability_slots")
          .select("id", { count: "exact", head: true })
          .eq("date", dateStr)
          .eq("slot_type", slotType);

        if ((existingCount ?? 0) > 0) {
          // Fine-grained: only add MISSING time slots
          const { data: existing } = await supabase
            .from("availability_slots")
            .select("starts_at")
            .eq("date", dateStr)
            .eq("slot_type", slotType);

          // Extract Berlin local times for comparison (NOT server UTC hours)
          const existingTimes = new Set(
            (existing ?? []).map((s) => extractBerlinLocalTime(s.starts_at))
          );

          // Filter to only missing times
          const missingTimes = times.filter((t) => !existingTimes.has(t));
          if (missingTimes.length === 0) continue;

          const slots = buildSlots(dateStr, missingTimes, slotType, maxBookings);
          if (slots.length > 0) {
            const { error } = await supabase.from("availability_slots").insert(slots);
            if (!error) created.push(`${dateStr}: +${slots.length} ${slotType} (fill gaps)`);
          }
          continue;
        }

        // No slots exist → create full set
        const slots = buildSlots(dateStr, times, slotType, maxBookings);
        if (slots.length > 0) {
          const { error } = await supabase.from("availability_slots").insert(slots);
          if (!error) created.push(`${dateStr}: ${slots.length} ${slotType} slots`);
          else console.error(`Insert failed for ${dateStr} ${slotType}:`, error);
        }
      }
    };

    await generateForType(STANDARD_DAYS_AHEAD, STANDARD_TIMES, "standard", STANDARD_MAX_BOOKINGS);
    await generateForType(PRIORITY_DAYS_AHEAD, PRIORITY_TIMES, "priority", PRIORITY_MAX_BOOKINGS);

    // ── STEP 2: REPLENISHMENT CHECK ─────────────────────────
    const nowIso = now.toISOString();

    const countBookable = async (slotType: string, maxBookings: number) => {
      const { count } = await supabase
        .from("availability_slots")
        .select("id", { count: "exact", head: true })
        .eq("slot_type", slotType)
        .eq("is_active", true)
        .gt("starts_at", nowIso)
        .lt("current_bookings", maxBookings);
      return count ?? 0;
    };

    const bookableStandard = await countBookable("standard", STANDARD_MAX_BOOKINGS);
    const bookablePriority = await countBookable("priority", PRIORITY_MAX_BOOKINGS);

    // Extend if below minimum
    const extendIfNeeded = async (
      currentBookable: number,
      minRequired: number,
      times: string[],
      slotType: "standard" | "priority",
      maxBookings: number,
      startDay: number
    ) => {
      if (currentBookable >= minRequired) return;

      let generated = 0;
      for (let d = startDay; d < startDay + 30 && generated < (minRequired - currentBookable); d++) {
        const date = new Date(now);
        date.setDate(date.getDate() + d);
        if (date.getDay() === 0 || date.getDay() === 6) continue;

        const dateStr = new Intl.DateTimeFormat("en-CA", {
          timeZone: TIMEZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(date);

        const { count } = await supabase
          .from("availability_slots")
          .select("id", { count: "exact", head: true })
          .eq("date", dateStr)
          .eq("slot_type", slotType);

        if ((count ?? 0) > 0) continue;

        const slots = buildSlots(dateStr, times, slotType, maxBookings);
        if (slots.length > 0) {
          const { error } = await supabase.from("availability_slots").insert(slots);
          if (!error) {
            generated += slots.length;
            created.push(`REPLENISH ${dateStr}: ${slots.length} ${slotType}`);
          }
        }
      }
    };

    await extendIfNeeded(bookableStandard, MIN_BOOKABLE_STANDARD, STANDARD_TIMES, "standard", STANDARD_MAX_BOOKINGS, STANDARD_DAYS_AHEAD);
    await extendIfNeeded(bookablePriority, MIN_BOOKABLE_PRIORITY, PRIORITY_TIMES, "priority", PRIORITY_MAX_BOOKINGS, PRIORITY_DAYS_AHEAD);

    // ── STEP 3: Deactivate past slots ───────────────────────
    await supabase
      .from("availability_slots")
      .update({ is_active: false })
      .lt("ends_at", nowIso)
      .eq("is_active", true);

    // ── RESPONSE ────────────────────────────────────────────
    const finalStandard = await countBookable("standard", STANDARD_MAX_BOOKINGS);
    const finalPriority = await countBookable("priority", PRIORITY_MAX_BOOKINGS);

    return new Response(
      JSON.stringify({
        success: true,
        created,
        availability: {
          standard_bookable: finalStandard,
          priority_bookable: finalPriority,
        },
        thresholds: {
          min_standard: MIN_BOOKABLE_STANDARD,
          min_priority: MIN_BOOKABLE_PRIORITY,
        },
        config: {
          standard_times: STANDARD_TIMES,
          priority_times: PRIORITY_TIMES,
          standard_days_ahead: STANDARD_DAYS_AHEAD,
          priority_days_ahead: PRIORITY_DAYS_AHEAD,
          slot_duration_minutes: SLOT_DURATION_MINUTES,
          timezone: TIMEZONE,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-availability-slots error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
