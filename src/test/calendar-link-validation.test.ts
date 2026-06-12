/**
 * Calendar Link Validation Suite
 * 
 * Validates .ics, Google Calendar, and Outlook links for a test booking
 * to ensure correct start/end times and timezone handling.
 */

import { describe, it, expect } from "vitest";
import { generateIcsBlob } from "@/lib/generate-ics";
import { getGoogleCalendarUrl, getOutlookCalendarUrl } from "@/lib/calendar-links";

/** Read Blob text — multiple strategies for jsdom compatibility */
async function readBlobText(blob: Blob): Promise<string> {
  // Strategy 1: arrayBuffer (works in most envs)
  try {
    const buf = await blob.arrayBuffer();
    return new TextDecoder().decode(buf);
  } catch {}
  // Strategy 2: FileReader
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}
import { generateICS } from "@/lib/calendar-utils";

// ── Test fixture: a booking on 2026-05-15 at 11:00 Europe/Berlin (= 09:00 UTC) ──
const TEST_BOOKING = {
  startsAt: "2026-05-15T09:00:00Z",
  durationMinutes: 30,
  timezone: "Europe/Berlin",
  title: "Ethical Closer Qualifikationsgespräch",
  description: "Test-Termin",
  location: "Online · Video-Call",
};

const EXPECTED_START_UTC = new Date("2026-05-15T09:00:00Z");
const EXPECTED_END_UTC = new Date("2026-05-15T09:30:00Z");

// ── Helpers ──

/** Parse ICS DTSTART/DTEND value ending in Z → Date */
function parseIcsUtcDate(icsValue: string): Date {
  // Format: 20260515T090000Z
  const m = icsValue.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) throw new Error(`Invalid ICS UTC date: ${icsValue}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}

/** Extract a named property value from ICS VEVENT block (skips VTIMEZONE) */
function icsField(ics: string, field: string): string | null {
  // Only search inside the VEVENT block to avoid VTIMEZONE DTSTART
  const veventMatch = ics.match(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/);
  if (!veventMatch) return null;
  const vevent = veventMatch[1];
  const re = new RegExp(`^${field}[;:](.+)$`, "m");
  const m = vevent.match(re);
  return m ? m[1].trim() : null;
}

// ═══════════════════════════════════════════════════════════════
// 1. ICS BLOB (generate-ics.ts) — used for .ics download
// ═══════════════════════════════════════════════════════════════
describe("ICS Blob (generate-ics.ts)", () => {
  let icsText: string;

  // Read blob once
  beforeAll(async () => {
    const blob = generateIcsBlob(TEST_BOOKING);
    icsText = await readBlobText(blob);
  });

  it("contains VCALENDAR and VEVENT blocks", () => {
    expect(icsText).toContain("BEGIN:VCALENDAR");
    expect(icsText).toContain("BEGIN:VEVENT");
    expect(icsText).toContain("END:VEVENT");
    expect(icsText).toContain("END:VCALENDAR");
  });

  it("DTSTART matches expected UTC time", () => {
    const raw = icsField(icsText, "DTSTART");
    expect(raw).toBeTruthy();
    const parsed = parseIcsUtcDate(raw!);
    expect(parsed.getTime()).toBe(EXPECTED_START_UTC.getTime());
  });

  it("DTEND matches expected UTC time (start + 30 min)", () => {
    const raw = icsField(icsText, "DTEND");
    expect(raw).toBeTruthy();
    const parsed = parseIcsUtcDate(raw!);
    expect(parsed.getTime()).toBe(EXPECTED_END_UTC.getTime());
  });

  it("includes booking timezone as X-BOOKING-TIMEZONE", () => {
    expect(icsText).toContain("X-BOOKING-TIMEZONE:Europe/Berlin");
  });

  it("VTIMEZONE block references the booking timezone", () => {
    expect(icsText).toContain("TZID:Europe/Berlin");
  });

  it("SUMMARY contains event title", () => {
    expect(icsText).toContain(TEST_BOOKING.title);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. ICS (calendar-utils.ts) — legacy generateICS
// ═══════════════════════════════════════════════════════════════
describe("ICS (calendar-utils.ts)", () => {
  const event = {
    title: TEST_BOOKING.title,
    start: EXPECTED_START_UTC,
    end: EXPECTED_END_UTC,
    description: TEST_BOOKING.description,
    location: TEST_BOOKING.location,
  };

  let icsText: string;
  beforeAll(() => {
    icsText = generateICS(event);
  });

  it("DTSTART matches UTC time", () => {
    const raw = icsField(icsText, "DTSTART");
    expect(raw).toBeTruthy();
    const parsed = parseIcsUtcDate(raw!);
    expect(parsed.getTime()).toBe(EXPECTED_START_UTC.getTime());
  });

  it("DTEND matches UTC time", () => {
    const raw = icsField(icsText, "DTEND");
    expect(raw).toBeTruthy();
    const parsed = parseIcsUtcDate(raw!);
    expect(parsed.getTime()).toBe(EXPECTED_END_UTC.getTime());
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. GOOGLE CALENDAR LINK
// ═══════════════════════════════════════════════════════════════
describe("Google Calendar Link", () => {
  let url: URL;

  beforeAll(() => {
    const raw = getGoogleCalendarUrl(TEST_BOOKING);
    url = new URL(raw);
  });

  it("points to Google Calendar", () => {
    expect(url.hostname).toBe("calendar.google.com");
  });

  it("dates param contains correct UTC start and end", () => {
    const dates = url.searchParams.get("dates")!;
    const [startStr, endStr] = dates.split("/");

    // Google format: 20260515T090000Z
    expect(startStr).toBe("20260515T090000Z");
    expect(endStr).toBe("20260515T093000Z");
  });

  it("title is set correctly", () => {
    expect(url.searchParams.get("text")).toBe(TEST_BOOKING.title);
  });

  it("duration between start and end is exactly 30 minutes", () => {
    const dates = url.searchParams.get("dates")!;
    const [s, e] = dates.split("/").map((d) => parseIcsUtcDate(d));
    expect(e.getTime() - s.getTime()).toBe(30 * 60_000);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. OUTLOOK CALENDAR LINK
// ═══════════════════════════════════════════════════════════════
describe("Outlook Calendar Link", () => {
  let url: URL;

  beforeAll(() => {
    const raw = getOutlookCalendarUrl(TEST_BOOKING);
    url = new URL(raw);
  });

  it("points to Outlook Live", () => {
    expect(url.hostname).toBe("outlook.live.com");
  });

  it("startdt is correct ISO 8601 UTC", () => {
    const startdt = url.searchParams.get("startdt")!;
    const parsed = new Date(startdt);
    expect(parsed.getTime()).toBe(EXPECTED_START_UTC.getTime());
  });

  it("enddt is correct ISO 8601 UTC (start + 30 min)", () => {
    const enddt = url.searchParams.get("enddt")!;
    const parsed = new Date(enddt);
    expect(parsed.getTime()).toBe(EXPECTED_END_UTC.getTime());
  });

  it("subject matches title", () => {
    expect(url.searchParams.get("subject")).toBe(TEST_BOOKING.title);
  });

  it("duration between startdt and enddt is exactly 30 minutes", () => {
    const s = new Date(url.searchParams.get("startdt")!);
    const e = new Date(url.searchParams.get("enddt")!);
    expect(e.getTime() - s.getTime()).toBe(30 * 60_000);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. CROSS-FORMAT CONSISTENCY
// ═══════════════════════════════════════════════════════════════
describe("Cross-format consistency", () => {
  it("all three formats encode the same start time", async () => {
    // ICS blob
    const blob = generateIcsBlob(TEST_BOOKING);
    const ics = await readBlobText(blob);
    const icsStart = parseIcsUtcDate(icsField(ics, "DTSTART")!);

    // Google
    const gUrl = new URL(getGoogleCalendarUrl(TEST_BOOKING));
    const gStart = parseIcsUtcDate(gUrl.searchParams.get("dates")!.split("/")[0]);

    // Outlook
    const oUrl = new URL(getOutlookCalendarUrl(TEST_BOOKING));
    const oStart = new Date(oUrl.searchParams.get("startdt")!);

    expect(icsStart.getTime()).toBe(gStart.getTime());
    expect(icsStart.getTime()).toBe(oStart.getTime());
  });

  it("all three formats encode the same end time", async () => {
    const blob = generateIcsBlob(TEST_BOOKING);
    const ics = await readBlobText(blob);
    const icsEnd = parseIcsUtcDate(icsField(ics, "DTEND")!);

    const gUrl = new URL(getGoogleCalendarUrl(TEST_BOOKING));
    const gEnd = parseIcsUtcDate(gUrl.searchParams.get("dates")!.split("/")[1]);

    const oUrl = new URL(getOutlookCalendarUrl(TEST_BOOKING));
    const oEnd = new Date(oUrl.searchParams.get("enddt")!);

    expect(icsEnd.getTime()).toBe(gEnd.getTime());
    expect(icsEnd.getTime()).toBe(oEnd.getTime());
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. EDGE CASES
// ═══════════════════════════════════════════════════════════════
describe("Edge cases", () => {
  it("handles midnight UTC booking correctly", async () => {
    const midnight = {
      ...TEST_BOOKING,
      startsAt: "2026-12-31T23:30:00Z", // 00:30 Berlin on Jan 1
      durationMinutes: 60,
    };

    const blob = generateIcsBlob(midnight);
    const ics = await readBlobText(blob);
    const dtStart = parseIcsUtcDate(icsField(ics, "DTSTART")!);
    const dtEnd = parseIcsUtcDate(icsField(ics, "DTEND")!);

    expect(dtStart.toISOString()).toBe("2026-12-31T23:30:00.000Z");
    expect(dtEnd.toISOString()).toBe("2027-01-01T00:30:00.000Z");
  });

  it("defaults to 30 min duration when omitted", async () => {
    const noDuration = {
      startsAt: TEST_BOOKING.startsAt,
      timezone: TEST_BOOKING.timezone,
      title: TEST_BOOKING.title,
    };

    const blob = generateIcsBlob(noDuration);
    const ics = await readBlobText(blob);
    const dtStart = parseIcsUtcDate(icsField(ics, "DTSTART")!);
    const dtEnd = parseIcsUtcDate(icsField(ics, "DTEND")!);
    expect(dtEnd.getTime() - dtStart.getTime()).toBe(30 * 60_000);
  });

  it("Google link defaults to 30 min when no duration", () => {
    const url = new URL(getGoogleCalendarUrl({ startsAt: TEST_BOOKING.startsAt, title: "Test" }));
    const [s, e] = url.searchParams.get("dates")!.split("/").map(parseIcsUtcDate);
    expect(e.getTime() - s.getTime()).toBe(30 * 60_000);
  });

  it("Outlook link defaults to 30 min when no duration", () => {
    const url = new URL(getOutlookCalendarUrl({ startsAt: TEST_BOOKING.startsAt, title: "Test" }));
    const s = new Date(url.searchParams.get("startdt")!);
    const e = new Date(url.searchParams.get("enddt")!);
    expect(e.getTime() - s.getTime()).toBe(30 * 60_000);
  });
});
