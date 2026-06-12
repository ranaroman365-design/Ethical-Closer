/**
 * Property-based tests: For many random DST environments and slot durations,
 * verify that UTC start/end times are identical across ICS, Google, and Outlook exports.
 *
 * Uses fast-check to generate:
 *   - Random dates across the year (covering both DST transitions)
 *   - Random durations (1–180 min)
 *   - Random hours (0–23), minutes (0–59)
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { getGoogleCalendarUrl, getOutlookCalendarUrl } from "@/lib/calendar-links";
import { generateIcsBlob } from "@/lib/generate-ics";

// ── Helpers ──

/** Read Blob text — multiple strategies for jsdom */
async function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.arrayBuffer === "function") {
    try { return new TextDecoder().decode(await blob.arrayBuffer()); } catch {}
  }
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsText(blob);
  });
}

/** Parse compact Google Calendar date "20260621T100000Z" → Date */
function parseGoogleDate(compact: string): Date {
  const iso = compact.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
    "$1-$2-$3T$4:$5:$6Z"
  );
  return new Date(iso);
}

/** Extract DTSTART from ICS text */
function extractIcsDtstart(ics: string): string | null {
  const vevent = ics.match(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/);
  if (!vevent) return null;
  const m = vevent[1].match(/^DTSTART[;:](.+)$/m);
  return m ? m[1].trim() : null;
}

/** Extract DTEND from ICS text */
function extractIcsDtend(ics: string): string | null {
  const vevent = ics.match(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/);
  if (!vevent) return null;
  const m = vevent[1].match(/^DTEND[;:](.+)$/m);
  return m ? m[1].trim() : null;
}

/** Build expected compact UTC string from Date */
function toCompactUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// ── Arbitraries ──

/** Generate a random UTC ISO timestamp within 2025-2028 */
const arbStartsAt = fc
  .record({
    year: fc.integer({ min: 2025, max: 2028 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }), // safe for all months
    hour: fc.integer({ min: 0, max: 23 }),
    minute: fc.integer({ min: 0, max: 59 }),
  })
  .map(({ year, month, day, hour, minute }) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00Z`;
  });

/** Duration in minutes: 1 to 180 */
const arbDuration = fc.integer({ min: 1, max: 180 });

/** Timezone: Europe/Berlin covers both CET and CEST */
const arbTimezone = fc.constantFrom("Europe/Berlin", "UTC", "America/New_York", "Asia/Tokyo");

// ══════════════════════════════════════════════════════════════
// PROPERTY TESTS
// ══════════════════════════════════════════════════════════════

describe("Property-based: Google vs Outlook UTC consistency", () => {
  it("start times always match across Google and Outlook for random slots", () => {
    fc.assert(
      fc.property(arbStartsAt, arbDuration, (startsAt, dur) => {
        const expectedMs = new Date(startsAt).getTime();

        const gUrl = new URL(getGoogleCalendarUrl({ startsAt, durationMinutes: dur, title: "P" }));
        const oUrl = new URL(getOutlookCalendarUrl({ startsAt, durationMinutes: dur, title: "P" }));

        const [gStartStr] = gUrl.searchParams.get("dates")!.split("/");
        const gStartMs = parseGoogleDate(gStartStr).getTime();
        const oStartMs = new Date(oUrl.searchParams.get("startdt")!).getTime();

        expect(gStartMs).toBe(expectedMs);
        expect(oStartMs).toBe(expectedMs);
      }),
      { numRuns: 200 }
    );
  });

  it("end times always match across Google and Outlook for random slots", () => {
    fc.assert(
      fc.property(arbStartsAt, arbDuration, (startsAt, dur) => {
        const expectedEndMs = new Date(startsAt).getTime() + dur * 60_000;

        const gUrl = new URL(getGoogleCalendarUrl({ startsAt, durationMinutes: dur, title: "P" }));
        const oUrl = new URL(getOutlookCalendarUrl({ startsAt, durationMinutes: dur, title: "P" }));

        const [, gEndStr] = gUrl.searchParams.get("dates")!.split("/");
        const gEndMs = parseGoogleDate(gEndStr).getTime();
        const oEndMs = new Date(oUrl.searchParams.get("enddt")!).getTime();

        expect(gEndMs).toBe(expectedEndMs);
        expect(oEndMs).toBe(expectedEndMs);
      }),
      { numRuns: 200 }
    );
  });

  it("duration is always preserved in Google link", () => {
    fc.assert(
      fc.property(arbStartsAt, arbDuration, (startsAt, dur) => {
        const gUrl = new URL(getGoogleCalendarUrl({ startsAt, durationMinutes: dur, title: "P" }));
        const [gStartStr, gEndStr] = gUrl.searchParams.get("dates")!.split("/");
        const actualDurMs = parseGoogleDate(gEndStr).getTime() - parseGoogleDate(gStartStr).getTime();
        expect(actualDurMs).toBe(dur * 60_000);
      }),
      { numRuns: 200 }
    );
  });
});

describe("Property-based: ICS matches Google/Outlook", () => {
  it("ICS DTSTART matches Google start for random slots + timezones", async () => {
    await fc.assert(
      fc.asyncProperty(arbStartsAt, arbDuration, arbTimezone, async (startsAt, dur, tz) => {
        const blob = generateIcsBlob({
          startsAt,
          durationMinutes: dur,
          timezone: tz,
          title: "Property Test",
        });
        const ics = await readBlobText(blob);
        const icsDtstart = extractIcsDtstart(ics);

        const expectedCompact = toCompactUtc(new Date(startsAt));
        expect(icsDtstart).toBe(expectedCompact);
      }),
      { numRuns: 150 }
    );
  });

  it("ICS DTEND matches expected end for random slots + timezones", async () => {
    await fc.assert(
      fc.asyncProperty(arbStartsAt, arbDuration, arbTimezone, async (startsAt, dur, tz) => {
        const blob = generateIcsBlob({
          startsAt,
          durationMinutes: dur,
          timezone: tz,
          title: "Property Test",
        });
        const ics = await readBlobText(blob);
        const icsDtend = extractIcsDtend(ics);

        const expectedEnd = new Date(new Date(startsAt).getTime() + dur * 60_000);
        const expectedCompact = toCompactUtc(expectedEnd);
        expect(icsDtend).toBe(expectedCompact);
      }),
      { numRuns: 150 }
    );
  });
});

describe("Property-based: All three formats agree", () => {
  it("Google, Outlook, and ICS encode identical start/end for any random slot", async () => {
    await fc.assert(
      fc.asyncProperty(arbStartsAt, arbDuration, arbTimezone, async (startsAt, dur, tz) => {
        const startDate = new Date(startsAt);
        const endDate = new Date(startDate.getTime() + dur * 60_000);

        // Google
        const gUrl = new URL(getGoogleCalendarUrl({ startsAt, durationMinutes: dur, title: "P" }));
        const [gStartStr, gEndStr] = gUrl.searchParams.get("dates")!.split("/");
        const gStart = parseGoogleDate(gStartStr);
        const gEnd = parseGoogleDate(gEndStr);

        // Outlook
        const oUrl = new URL(getOutlookCalendarUrl({ startsAt, durationMinutes: dur, title: "P" }));
        const oStart = new Date(oUrl.searchParams.get("startdt")!);
        const oEnd = new Date(oUrl.searchParams.get("enddt")!);

        // ICS
        const blob = generateIcsBlob({ startsAt, durationMinutes: dur, timezone: tz, title: "P" });
        const ics = await readBlobText(blob);
        const icsStartCompact = extractIcsDtstart(ics)!;
        const icsEndCompact = extractIcsDtend(ics)!;
        const icsStart = parseGoogleDate(icsStartCompact); // same compact format
        const icsEnd = parseGoogleDate(icsEndCompact);

        // All three must agree on start
        expect(gStart.getTime()).toBe(startDate.getTime());
        expect(oStart.getTime()).toBe(startDate.getTime());
        expect(icsStart.getTime()).toBe(startDate.getTime());

        // All three must agree on end
        expect(gEnd.getTime()).toBe(endDate.getTime());
        expect(oEnd.getTime()).toBe(endDate.getTime());
        expect(icsEnd.getTime()).toBe(endDate.getTime());
      }),
      { numRuns: 200 }
    );
  });
});
