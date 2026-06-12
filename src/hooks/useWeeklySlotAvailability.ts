import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns honest weekly call availability from `availability_slots`.
 *
 * Returns null while loading, or when no reliable data exists (no slots at all,
 * or query failure). Callers MUST hide the scarcity block on null — never
 * fabricate numbers. Total = sum of max_bookings; open = sum of remaining.
 */
export interface WeeklyAvailability {
  open: number;
  total: number;
  /** Open slots for today's date only (UTC). 0 when today is fully booked. */
  todayOpen: number;
  /** Open slots for tomorrow's date only (UTC). Used for rollover messaging. */
  tomorrowOpen: number;
}

function startOfIsoWeek(d: Date): string {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  // Monday-based ISO week
  const day = x.getUTCDay() || 7;
  if (day !== 1) x.setUTCDate(x.getUTCDate() - (day - 1));
  return x.toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function useWeeklySlotAvailability(): WeeklyAvailability | null {
  const [data, setData] = useState<WeeklyAvailability | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const start = startOfIsoWeek(new Date());
        const end = addDaysIso(start, 7);
        const { data: rows, error } = await supabase
          .from("availability_slots")
          .select("max_bookings,current_bookings,is_active,date")
          .gte("date", start)
          .lt("date", end)
          .eq("is_active", true);
        if (cancelled) return;
        if (error || !rows || rows.length === 0) {
          setData(null);
          return;
        }
        let total = 0;
        let open = 0;
        let todayOpen = 0;
        let tomorrowOpen = 0;
        const todayIso = new Date().toISOString().slice(0, 10);
        const tomorrowIso = addDaysIso(todayIso, 1);
        for (const r of rows) {
          const max = Number(r.max_bookings ?? 0);
          const cur = Number(r.current_bookings ?? 0);
          const remaining = Math.max(max - cur, 0);
          total += max;
          open += remaining;
          if (r.date === todayIso) todayOpen += remaining;
          else if (r.date === tomorrowIso) tomorrowOpen += remaining;
        }
        if (total <= 0) {
          setData(null);
          return;
        }
        setData({ open, total, todayOpen, tomorrowOpen });
      } catch {
        if (!cancelled) setData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}
