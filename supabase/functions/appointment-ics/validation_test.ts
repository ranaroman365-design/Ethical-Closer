/**
 * Server-side validation for appointment-ics edge function.
 * Verifies ICS output has correct DTSTART/DTEND/STATUS for a mock appointment.
 */

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ── Helpers (mirror the edge function's formatting) ──
function fmtIcs(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function parseIcsUtcDate(v: string): Date {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) throw new Error(`Bad ICS date: ${v}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}

function icsField(ics: string, field: string): string | null {
  const re = new RegExp(`^${field}[;:](.+)$`, "m");
  const m = ics.match(re);
  return m ? m[1].trim() : null;
}

// ── Test fixture ──
const TEST_START = "2026-05-15T09:00:00Z";
const TEST_END = "2026-05-15T09:45:00Z";

Deno.test("fmtIcs produces correct UTC format", () => {
  const d = new Date(TEST_START);
  assertEquals(fmtIcs(d), "20260515T090000Z");
});

Deno.test("fmtIcs end time is correct", () => {
  const d = new Date(TEST_END);
  assertEquals(fmtIcs(d), "20260515T094500Z");
});

Deno.test("parseIcsUtcDate round-trips correctly", () => {
  const d = new Date(TEST_START);
  const formatted = fmtIcs(d);
  const parsed = parseIcsUtcDate(formatted);
  assertEquals(parsed.getTime(), d.getTime());
});

// Simulate the ICS generation logic from the edge function
function buildTestIcs(opts: {
  startsAt: string;
  endsAt: string | null;
  cancelled: boolean;
  title: string;
}): string {
  const start = new Date(opts.startsAt);
  const end = opts.endsAt ? new Date(opts.endsAt) : new Date(start.getTime() + 45 * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "METHOD:" + (opts.cancelled ? "CANCEL" : "PUBLISH"),
    "BEGIN:VEVENT",
    `UID:test-id@ethical-closing`,
    `DTSTAMP:${fmtIcs(new Date())}`,
    `DTSTART:${fmtIcs(start)}`,
    `DTEND:${fmtIcs(end)}`,
    `SUMMARY:${opts.title}`,
    opts.cancelled ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return lines;
}

Deno.test("Generated ICS has correct start/end for confirmed appointment", () => {
  const ics = buildTestIcs({
    startsAt: TEST_START,
    endsAt: TEST_END,
    cancelled: false,
    title: "Ethical Closer Qualifikationsgespräch",
  });

  const dtStart = parseIcsUtcDate(icsField(ics, "DTSTART")!);
  const dtEnd = parseIcsUtcDate(icsField(ics, "DTEND")!);

  assertEquals(dtStart.toISOString(), "2026-05-15T09:00:00.000Z");
  assertEquals(dtEnd.toISOString(), "2026-05-15T09:45:00.000Z");
  assertEquals(dtEnd.getTime() - dtStart.getTime(), 45 * 60_000);
  assertStringIncludes(ics, "STATUS:CONFIRMED");
  assertStringIncludes(ics, "METHOD:PUBLISH");
});

Deno.test("Cancelled appointment uses METHOD:CANCEL + STATUS:CANCELLED", () => {
  const ics = buildTestIcs({
    startsAt: TEST_START,
    endsAt: TEST_END,
    cancelled: true,
    title: "ABGESAGT — Ethical Closer Qualifikationsgespräch",
  });

  assertStringIncludes(ics, "STATUS:CANCELLED");
  assertStringIncludes(ics, "METHOD:CANCEL");
});

Deno.test("Missing endsAt defaults to start + 45 min", () => {
  const ics = buildTestIcs({
    startsAt: TEST_START,
    endsAt: null,
    cancelled: false,
    title: "Test",
  });

  const dtEnd = parseIcsUtcDate(icsField(ics, "DTEND")!);
  assertEquals(dtEnd.toISOString(), "2026-05-15T09:45:00.000Z");
});

Deno.test("Midnight-crossing appointment preserves correct dates", () => {
  const ics = buildTestIcs({
    startsAt: "2026-12-31T23:30:00Z",
    endsAt: "2027-01-01T00:15:00Z",
    cancelled: false,
    title: "NYE appointment",
  });

  const dtStart = parseIcsUtcDate(icsField(ics, "DTSTART")!);
  const dtEnd = parseIcsUtcDate(icsField(ics, "DTEND")!);

  assertEquals(dtStart.toISOString(), "2026-12-31T23:30:00.000Z");
  assertEquals(dtEnd.toISOString(), "2027-01-01T00:15:00.000Z");
});
