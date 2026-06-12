/**
 * Regression Test: Calendar Card ↔ Detail Modal Day Consistency
 *
 * Verifies that getAppointmentLocalDate() (used for calendar grouping)
 * and formatAppointmentTime().date (shown in the detail modal) always
 * resolve to the SAME local day — especially around midnight boundaries
 * in Europe/Berlin.
 */

import { describe, it, expect } from "vitest";
import {
  getAppointmentLocalDate,
  formatAppointmentTime,
  computeLocalDateTime,
  type AppointmentTimeInput,
} from "@/lib/appointment-time-display";

// ── Helper: extract YYYY-MM-DD from a German date string ──
// e.g. "Mittwoch, 30. April 2025" → "2025-04-30"
const MONTH_MAP: Record<string, string> = {
  Januar: "01", Februar: "02", März: "03", April: "04",
  Mai: "05", Juni: "06", Juli: "07", August: "08",
  September: "09", Oktober: "10", November: "11", Dezember: "12",
};

function extractDateFromGerman(germanDate: string): string {
  // "Mittwoch, 30. April 2025"
  const m = germanDate.match(/(\d+)\.\s+([A-Za-zÄÖÜäöü]+)\s+(\d{4})/);
  if (!m) throw new Error(`Cannot parse German date: "${germanDate}"`);
  const day = m[1].padStart(2, "0");
  const month = MONTH_MAP[m[2]];
  if (!month) throw new Error(`Unknown German month: "${m[2]}"`);
  return `${m[3]}-${month}-${day}`;
}

// ══════════════════════════════════════════════════════════════
// Test cases: each entry is a UTC time that maps to a specific
// Europe/Berlin local time. We verify card date === modal date.
// ══════════════════════════════════════════════════════════════

interface TestSlot {
  label: string;
  utc: string;             // ISO UTC
  expectedLocalDate: string; // YYYY-MM-DD in Europe/Berlin
  expectedLocalTime: string; // HH:mm
}

// Europe/Berlin is UTC+2 in summer (CEST) and UTC+1 in winter (CET).
const TEST_SLOTS: TestSlot[] = [
  // ── Summer (CEST = UTC+2) ──
  {
    label: "Normal afternoon (CEST)",
    utc: "2026-06-15T12:00:00Z",  // 14:00 Berlin
    expectedLocalDate: "2026-06-15",
    expectedLocalTime: "14:00",
  },
  {
    label: "Late evening 23:00 Berlin (CEST)",
    utc: "2026-06-15T21:00:00Z",  // 23:00 Berlin
    expectedLocalDate: "2026-06-15",
    expectedLocalTime: "23:00",
  },
  {
    label: "Just before midnight 23:59 Berlin (CEST)",
    utc: "2026-06-15T21:59:00Z",  // 23:59 Berlin
    expectedLocalDate: "2026-06-15",
    expectedLocalTime: "23:59",
  },
  {
    label: "Midnight 00:00 Berlin (CEST) — next day",
    utc: "2026-06-15T22:00:00Z",  // 00:00 Berlin = 16. Juni
    expectedLocalDate: "2026-06-16",
    expectedLocalTime: "00:00",
  },
  {
    label: "00:30 Berlin (CEST) — next day",
    utc: "2026-06-15T22:30:00Z",  // 00:30 Berlin = 16. Juni
    expectedLocalDate: "2026-06-16",
    expectedLocalTime: "00:30",
  },
  // ── Winter (CET = UTC+1) ──
  {
    label: "Late evening 23:00 Berlin (CET)",
    utc: "2026-01-10T22:00:00Z",  // 23:00 Berlin
    expectedLocalDate: "2026-01-10",
    expectedLocalTime: "23:00",
  },
  {
    label: "Midnight 00:00 Berlin (CET) — next day",
    utc: "2026-01-10T23:00:00Z",  // 00:00 Berlin = 11. Januar
    expectedLocalDate: "2026-01-11",
    expectedLocalTime: "00:00",
  },
  {
    label: "00:30 Berlin (CET) — next day",
    utc: "2026-01-10T23:30:00Z",  // 00:30 Berlin = 11. Januar
    expectedLocalDate: "2026-01-11",
    expectedLocalTime: "00:30",
  },
  // ── DST transition boundary (last Sunday March → CEST) ──
  {
    label: "23:00 Berlin on DST switch day (still CET)",
    utc: "2026-03-28T22:00:00Z",  // 23:00 Berlin (CET, clocks go forward at 2am on 29th)
    expectedLocalDate: "2026-03-28",
    expectedLocalTime: "23:00",
  },
  {
    label: "03:00 Berlin after DST switch (now CEST)",
    utc: "2026-03-29T01:00:00Z",  // 03:00 Berlin (CEST, 2am → 3am)
    expectedLocalDate: "2026-03-29",
    expectedLocalTime: "03:00",
  },
  // ── New Year boundary ──
  {
    label: "NYE 23:30 Berlin (CET)",
    utc: "2026-12-31T22:30:00Z",  // 23:30 Berlin
    expectedLocalDate: "2026-12-31",
    expectedLocalTime: "23:30",
  },
  {
    label: "New Year 00:30 Berlin (CET)",
    utc: "2026-12-31T23:30:00Z",  // 00:30 Berlin = 1. Januar 2027
    expectedLocalDate: "2027-01-01",
    expectedLocalTime: "00:30",
  },
];

// ══════════════════════════════════════════════════════════════
// Path A: With original_local_date + original_local_time
//   (best-quality data from booking edge function)
// ══════════════════════════════════════════════════════════════
describe("Day consistency — Path A (original_local fields)", () => {
  for (const slot of TEST_SLOTS) {
    it(`${slot.label}: card date === modal date`, () => {
      const apt: AppointmentTimeInput = {
        starts_at: slot.utc,
        ends_at: new Date(new Date(slot.utc).getTime() + 30 * 60_000).toISOString(),
        booking_timezone: "Europe/Berlin",
        original_local_date: slot.expectedLocalDate,
        original_local_time: slot.expectedLocalTime,
      };

      // Calendar card grouping key
      const cardDate = getAppointmentLocalDate(apt);
      // Detail modal display
      const modal = formatAppointmentTime(apt);
      const modalDate = extractDateFromGerman(modal.date);

      expect(cardDate).toBe(slot.expectedLocalDate);
      expect(modalDate).toBe(slot.expectedLocalDate);
      expect(cardDate).toBe(modalDate);
    });
  }
});

// ══════════════════════════════════════════════════════════════
// Path B: Without original_local fields — Intl conversion only
//   (legacy data or edge case where fields are missing)
// ══════════════════════════════════════════════════════════════
describe("Day consistency — Path B (Intl conversion from UTC + timezone)", () => {
  for (const slot of TEST_SLOTS) {
    it(`${slot.label}: card date === modal date`, () => {
      const apt: AppointmentTimeInput = {
        starts_at: slot.utc,
        ends_at: new Date(new Date(slot.utc).getTime() + 30 * 60_000).toISOString(),
        booking_timezone: "Europe/Berlin",
        original_local_date: null,
        original_local_time: null,
      };

      const cardDate = getAppointmentLocalDate(apt);
      const modal = formatAppointmentTime(apt);
      const modalDate = extractDateFromGerman(modal.date);

      expect(cardDate).toBe(slot.expectedLocalDate);
      expect(modalDate).toBe(slot.expectedLocalDate);
      expect(cardDate).toBe(modalDate);
    });
  }
});

// ══════════════════════════════════════════════════════════════
// Path C: computeLocalDateTime consistency
//   (used by edge functions during booking to SET the fields)
// ══════════════════════════════════════════════════════════════
describe("computeLocalDateTime produces correct local date/time", () => {
  for (const slot of TEST_SLOTS) {
    it(`${slot.label}`, () => {
      const { date, time } = computeLocalDateTime(slot.utc, "Europe/Berlin");
      expect(date).toBe(slot.expectedLocalDate);
      expect(time).toBe(slot.expectedLocalTime);
    });
  }
});

// ══════════════════════════════════════════════════════════════
// Regression: the original +1 day bug
//   UTC date !== local date for late-night Berlin bookings
// ══════════════════════════════════════════════════════════════
describe("Regression: UTC date !== local date for late-night slots", () => {
  it("22:30 UTC (00:30 Berlin CEST) must NOT show the UTC date", () => {
    const apt: AppointmentTimeInput = {
      starts_at: "2026-06-15T22:30:00Z",
      booking_timezone: "Europe/Berlin",
    };

    const cardDate = getAppointmentLocalDate(apt);
    // The old bug would return "2026-06-15" (UTC date) instead of "2026-06-16" (Berlin date)
    expect(cardDate).not.toBe("2026-06-15");
    expect(cardDate).toBe("2026-06-16");
  });

  it("23:30 UTC (00:30 Berlin CET) must NOT show the UTC date", () => {
    const apt: AppointmentTimeInput = {
      starts_at: "2026-01-10T23:30:00Z",
      booking_timezone: "Europe/Berlin",
    };

    const cardDate = getAppointmentLocalDate(apt);
    expect(cardDate).not.toBe("2026-01-10");
    expect(cardDate).toBe("2026-01-11");
  });
});
