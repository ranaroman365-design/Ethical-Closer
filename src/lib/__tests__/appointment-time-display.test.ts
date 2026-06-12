import { describe, it, expect } from "vitest";
import {
  formatAppointmentTime,
  computeLocalDateTime,
  getAppointmentLocalDate,
  getAppointmentLocalHourMinute,
  getLocalTimeString,
  type AppointmentTimeInput,
} from "@/lib/appointment-time-display";

// ─────────────────────────────────────────────────────────
// DST Regression Tests
//
// Europe/Berlin:
//   CET  = UTC+1  (last Sun Oct → last Sun Mar)
//   CEST = UTC+2  (last Sun Mar → last Sun Oct)
//
// 2025 transitions:
//   → CEST: 2025-03-30 02:00 CET → 03:00 CEST
//   → CET:  2025-10-26 03:00 CEST → 02:00 CET
//
// America/New_York:
//   EST = UTC-5, EDT = UTC-4
//   → EDT: 2025-03-09 02:00 EST → 03:00 EDT
//   → EST: 2025-11-02 02:00 EDT → 01:00 EST
//
// Australia/Sydney:
//   AEST = UTC+10, AEDT = UTC+11
//   → AEDT: 2025-10-05 02:00 → 03:00
//   → AEST: 2025-04-06 03:00 → 02:00
// ─────────────────────────────────────────────────────────

describe("formatAppointmentTime — Path 1 (original_local_date/time)", () => {
  it("summer appointment renders exact local date/time (no shift)", () => {
    const input: AppointmentTimeInput = {
      starts_at: "2025-07-15T09:00:00Z",        // 11:00 CEST
      booking_timezone: "Europe/Berlin",
      original_local_date: "2025-07-15",
      original_local_time: "11:00",
    };
    const result = formatAppointmentTime(input);
    expect(result.source).toBe("original");
    expect(result.startTime).toBe("11:00");
    expect(result.date).toContain("15");
    expect(result.date).toContain("Juli");
    expect(result.date).toContain("2025");
  });

  it("winter appointment renders exact local date/time (no shift)", () => {
    const input: AppointmentTimeInput = {
      starts_at: "2025-12-10T13:00:00Z",        // 14:00 CET
      booking_timezone: "Europe/Berlin",
      original_local_date: "2025-12-10",
      original_local_time: "14:00",
    };
    const result = formatAppointmentTime(input);
    expect(result.source).toBe("original");
    expect(result.startTime).toBe("14:00");
    expect(result.date).toContain("10");
    expect(result.date).toContain("Dezember");
  });

  it("midnight booking (00:00 local) stays on correct date", () => {
    // User books 2025-04-30 00:00 Berlin = 2025-04-29 22:00 UTC
    const input: AppointmentTimeInput = {
      starts_at: "2025-04-29T22:00:00Z",
      booking_timezone: "Europe/Berlin",
      original_local_date: "2025-04-30",
      original_local_time: "00:00",
    };
    const result = formatAppointmentTime(input);
    expect(result.source).toBe("original");
    expect(result.startTime).toBe("00:00");
    expect(result.date).toContain("30");
    expect(result.date).toContain("April");
    // CRITICAL: Must NOT show April 29
    expect(result.dateTime).not.toContain("29");
  });

  it("23:00 local booking does not jump to next day", () => {
    // User books 2025-04-30 23:00 Berlin = 2025-04-30 21:00 UTC
    const input: AppointmentTimeInput = {
      starts_at: "2025-04-30T21:00:00Z",
      booking_timezone: "Europe/Berlin",
      original_local_date: "2025-04-30",
      original_local_time: "23:00",
    };
    const result = formatAppointmentTime(input);
    expect(result.startTime).toBe("23:00");
    expect(result.date).toContain("30");
    expect(result.date).toContain("April");
  });

  it("cross-midnight: 23:30 to 00:30 stays on booking date", () => {
    const input: AppointmentTimeInput = {
      starts_at: "2025-06-14T21:30:00Z",        // 23:30 CEST
      ends_at: "2025-06-15T22:30:00Z",           // would be next day for end
      booking_timezone: "Europe/Berlin",
      original_local_date: "2025-06-14",
      original_local_time: "23:30",
    };
    const result = formatAppointmentTime(input);
    expect(result.source).toBe("original");
    expect(result.date).toContain("14");
    expect(result.date).toContain("Juni");
    expect(result.startTime).toBe("23:30");
  });

  it("Path 1 ignores UTC and uses stored local date even if they disagree", () => {
    // Simulates a DB inconsistency — Path 1 must always trust stored local
    const input: AppointmentTimeInput = {
      starts_at: "2025-05-01T09:00:00Z",   // would be 11:00 CEST
      booking_timezone: "Europe/Berlin",
      original_local_date: "2025-04-30",    // deliberately different date
      original_local_time: "11:00",
    };
    const result = formatAppointmentTime(input);
    expect(result.source).toBe("original");
    expect(result.date).toContain("30");
    expect(result.date).toContain("April");
  });
});

describe("formatAppointmentTime — Path 2 (Intl conversion)", () => {
  it("summer UTC→Berlin conversion is correct (+2h)", () => {
    const input: AppointmentTimeInput = {
      starts_at: "2025-07-15T09:00:00Z",
      booking_timezone: "Europe/Berlin",
    };
    const result = formatAppointmentTime(input);
    expect(result.source).toBe("intl");
    expect(result.startTime).toBe("11:00");
    expect(result.date).toContain("15");
    expect(result.date).toContain("Juli");
  });

  it("winter UTC→Berlin conversion is correct (+1h)", () => {
    const input: AppointmentTimeInput = {
      starts_at: "2025-12-10T13:00:00Z",
      booking_timezone: "Europe/Berlin",
    };
    const result = formatAppointmentTime(input);
    expect(result.source).toBe("intl");
    expect(result.startTime).toBe("14:00");
    expect(result.date).toContain("Dezember");
  });

  it("DST spring-forward: 2025-03-30 01:30 UTC → 03:30 CEST", () => {
    const input: AppointmentTimeInput = {
      starts_at: "2025-03-30T01:30:00Z",
      booking_timezone: "Europe/Berlin",
    };
    const result = formatAppointmentTime(input);
    expect(result.source).toBe("intl");
    expect(result.startTime).toBe("03:30");
  });

  it("DST fall-back: 2025-10-26 01:30 UTC → 02:30 CET", () => {
    const input: AppointmentTimeInput = {
      starts_at: "2025-10-26T01:30:00Z",
      booking_timezone: "Europe/Berlin",
    };
    const result = formatAppointmentTime(input);
    expect(result.source).toBe("intl");
    expect(result.startTime).toBe("02:30");
  });

  it("midnight UTC → correct Berlin date (summer: same day +2h)", () => {
    const input: AppointmentTimeInput = {
      starts_at: "2025-07-15T00:00:00Z",
      booking_timezone: "Europe/Berlin",
    };
    const result = formatAppointmentTime(input);
    expect(result.startTime).toBe("02:00");
    expect(result.date).toContain("15");
    expect(result.date).toContain("Juli");
  });

  it("23:00 UTC winter → date jumps to next day in Berlin (+1h = 00:00)", () => {
    const input: AppointmentTimeInput = {
      starts_at: "2025-12-10T23:00:00Z",
      booking_timezone: "Europe/Berlin",
    };
    const result = formatAppointmentTime(input);
    expect(result.startTime).toBe("00:00");
    expect(result.date).toContain("11");
    expect(result.date).toContain("Dezember");
  });

  it("23:00 UTC summer → date jumps to next day in Berlin (+2h = 01:00)", () => {
    const input: AppointmentTimeInput = {
      starts_at: "2025-07-14T23:00:00Z",
      booking_timezone: "Europe/Berlin",
    };
    const result = formatAppointmentTime(input);
    expect(result.startTime).toBe("01:00");
    expect(result.date).toContain("15");
    expect(result.date).toContain("Juli");
  });

  it("New York winter: 15:00 UTC → 10:00 EST", () => {
    const input: AppointmentTimeInput = {
      starts_at: "2025-01-15T15:00:00Z",
      booking_timezone: "America/New_York",
    };
    const result = formatAppointmentTime(input);
    expect(result.startTime).toBe("10:00");
  });

  it("New York summer: 15:00 UTC → 11:00 EDT", () => {
    const input: AppointmentTimeInput = {
      starts_at: "2025-07-15T15:00:00Z",
      booking_timezone: "America/New_York",
    };
    const result = formatAppointmentTime(input);
    expect(result.startTime).toBe("11:00");
  });

  it("New York DST spring-forward: 2025-03-09 07:30 UTC → 03:30 EDT", () => {
    // Switch: 2025-03-09 02:00 EST → 03:00 EDT (07:00 UTC)
    const input: AppointmentTimeInput = {
      starts_at: "2025-03-09T07:30:00Z",
      booking_timezone: "America/New_York",
    };
    const result = formatAppointmentTime(input);
    expect(result.startTime).toBe("03:30");
  });

  it("New York DST fall-back: 2025-11-02 06:30 UTC → 01:30 EST", () => {
    // Switch: 2025-11-02 02:00 EDT → 01:00 EST (06:00 UTC)
    const input: AppointmentTimeInput = {
      starts_at: "2025-11-02T06:30:00Z",
      booking_timezone: "America/New_York",
    };
    const result = formatAppointmentTime(input);
    expect(result.startTime).toBe("01:30");
  });

  it("Sydney AEDT (summer): 2025-01-15 00:00 UTC → 11:00 AEDT", () => {
    // Jan is summer in Australia, AEDT = UTC+11
    const input: AppointmentTimeInput = {
      starts_at: "2025-01-15T00:00:00Z",
      booking_timezone: "Australia/Sydney",
    };
    const result = formatAppointmentTime(input);
    expect(result.startTime).toBe("11:00");
  });

  it("Sydney AEST (winter): 2025-07-15 00:00 UTC → 10:00 AEST", () => {
    // Jul is winter in Australia, AEST = UTC+10
    const input: AppointmentTimeInput = {
      starts_at: "2025-07-15T00:00:00Z",
      booking_timezone: "Australia/Sydney",
    };
    const result = formatAppointmentTime(input);
    expect(result.startTime).toBe("10:00");
  });

  it("Asia/Kolkata (UTC+5:30, no DST): 2025-07-15 18:00 UTC → 23:30", () => {
    const input: AppointmentTimeInput = {
      starts_at: "2025-07-15T18:00:00Z",
      booking_timezone: "Asia/Kolkata",
    };
    const result = formatAppointmentTime(input);
    expect(result.startTime).toBe("23:30");
    expect(result.date).toContain("15");
  });

  it("Asia/Kolkata date jump: 2025-07-15 19:00 UTC → 00:30 next day", () => {
    const input: AppointmentTimeInput = {
      starts_at: "2025-07-15T19:00:00Z",
      booking_timezone: "Asia/Kolkata",
    };
    const result = formatAppointmentTime(input);
    expect(result.startTime).toBe("00:30");
    expect(result.date).toContain("16");
  });

  it("Pacific/Auckland (UTC+12/+13): 2025-01-15 23:00 UTC → 12:00 next day NZDT", () => {
    // Jan: NZDT = UTC+13
    const input: AppointmentTimeInput = {
      starts_at: "2025-01-15T23:00:00Z",
      booking_timezone: "Pacific/Auckland",
    };
    const result = formatAppointmentTime(input);
    expect(result.startTime).toBe("12:00");
    expect(result.date).toContain("16");
  });

  it("UTC timezone: no offset applied", () => {
    const input: AppointmentTimeInput = {
      starts_at: "2025-07-15T14:30:00Z",
      booking_timezone: "UTC",
    };
    const result = formatAppointmentTime(input);
    expect(result.startTime).toBe("14:30");
    expect(result.date).toContain("15");
  });

  it("end time is also converted correctly", () => {
    const input: AppointmentTimeInput = {
      starts_at: "2025-07-15T09:00:00Z",
      ends_at: "2025-07-15T09:30:00Z",
      booking_timezone: "Europe/Berlin",
    };
    const result = formatAppointmentTime(input);
    expect(result.startTime).toBe("11:00");
    expect(result.endTime).toBe("11:30");
  });
});

describe("formatAppointmentTime — Path 3 (no timezone, browser fallback)", () => {
  it("falls back gracefully when no timezone is set", () => {
    const input: AppointmentTimeInput = {
      starts_at: "2025-07-15T09:00:00Z",
    };
    const result = formatAppointmentTime(input);
    expect(result.source).toBe("browser");
    expect(result.dateTime).not.toBe("—");
    expect(result.date.length).toBeGreaterThan(5);
  });

  it("returns '—' when no data at all", () => {
    const result = formatAppointmentTime({});
    expect(result.source).toBe("none");
    expect(result.dateTime).toBe("—");
  });
});

describe("computeLocalDateTime — edge function helper", () => {
  it("summer Berlin: 2025-07-15 09:00 UTC → 2025-07-15 / 11:00", () => {
    const r = computeLocalDateTime("2025-07-15T09:00:00Z", "Europe/Berlin");
    expect(r.date).toBe("2025-07-15");
    expect(r.time).toBe("11:00");
  });

  it("winter Berlin: 2025-12-10 13:00 UTC → 2025-12-10 / 14:00", () => {
    const r = computeLocalDateTime("2025-12-10T13:00:00Z", "Europe/Berlin");
    expect(r.date).toBe("2025-12-10");
    expect(r.time).toBe("14:00");
  });

  it("midnight crossing winter: 2025-12-10 23:00 UTC → 2025-12-11 / 00:00", () => {
    const r = computeLocalDateTime("2025-12-10T23:00:00Z", "Europe/Berlin");
    expect(r.date).toBe("2025-12-11");
    expect(r.time).toBe("00:00");
  });

  it("midnight crossing summer: 2025-07-14 22:00 UTC → 2025-07-15 / 00:00", () => {
    const r = computeLocalDateTime("2025-07-14T22:00:00Z", "Europe/Berlin");
    expect(r.date).toBe("2025-07-15");
    expect(r.time).toBe("00:00");
  });

  it("DST spring-forward boundary: 2025-03-30 01:00 UTC → 03:00 CEST", () => {
    const r = computeLocalDateTime("2025-03-30T01:00:00Z", "Europe/Berlin");
    expect(r.date).toBe("2025-03-30");
    expect(r.time).toBe("03:00");
  });

  it("DST fall-back boundary: 2025-10-26 01:00 UTC → 02:00 CET", () => {
    const r = computeLocalDateTime("2025-10-26T01:00:00Z", "Europe/Berlin");
    expect(r.date).toBe("2025-10-26");
    expect(r.time).toBe("02:00");
  });

  it("pre-DST spring: 2025-03-30 00:30 UTC → 01:30 CET (still winter)", () => {
    const r = computeLocalDateTime("2025-03-30T00:30:00Z", "Europe/Berlin");
    expect(r.date).toBe("2025-03-30");
    expect(r.time).toBe("01:30");
  });

  it("New York summer: 2025-07-15 15:00 UTC → 2025-07-15 / 11:00", () => {
    const r = computeLocalDateTime("2025-07-15T15:00:00Z", "America/New_York");
    expect(r.date).toBe("2025-07-15");
    expect(r.time).toBe("11:00");
  });

  it("New York midnight cross: 2025-01-16 04:30 UTC → 2025-01-15 / 23:30 EST", () => {
    const r = computeLocalDateTime("2025-01-16T04:30:00Z", "America/New_York");
    expect(r.date).toBe("2025-01-15");
    expect(r.time).toBe("23:30");
  });

  it("Tokyo (no DST): 2025-07-15 15:00 UTC → 2025-07-16 / 00:00 JST", () => {
    const r = computeLocalDateTime("2025-07-15T15:00:00Z", "Asia/Tokyo");
    expect(r.date).toBe("2025-07-16");
    expect(r.time).toBe("00:00");
  });

  it("Kolkata half-hour offset: 2025-07-15 18:00 UTC → 2025-07-15 / 23:30", () => {
    const r = computeLocalDateTime("2025-07-15T18:00:00Z", "Asia/Kolkata");
    expect(r.date).toBe("2025-07-15");
    expect(r.time).toBe("23:30");
  });

  it("Kolkata date-jump: 2025-07-15 19:00 UTC → 2025-07-16 / 00:30", () => {
    const r = computeLocalDateTime("2025-07-15T19:00:00Z", "Asia/Kolkata");
    expect(r.date).toBe("2025-07-16");
    expect(r.time).toBe("00:30");
  });

  it("Chatham Islands (UTC+12:45/+13:45): 2025-01-15 10:00 UTC → 2025-01-15 / 23:45 CHADT", () => {
    // Jan: CHADT = UTC+13:45
    const r = computeLocalDateTime("2025-01-15T10:00:00Z", "Pacific/Chatham");
    expect(r.date).toBe("2025-01-15");
    expect(r.time).toBe("23:45");
  });

  it("Sydney DST spring-forward: 2025-10-04 16:00 UTC → 2025-10-05 03:00 AEDT", () => {
    // Switch: 2025-10-05 02:00 AEST → 03:00 AEDT (= 16:00 UTC)
    const r = computeLocalDateTime("2025-10-04T16:00:00Z", "Australia/Sydney");
    expect(r.date).toBe("2025-10-05");
    expect(r.time).toBe("03:00");
  });
});

describe("getAppointmentLocalDate", () => {
  it("prefers original_local_date when available", () => {
    expect(getAppointmentLocalDate({
      starts_at: "2025-07-15T09:00:00Z",
      booking_timezone: "Europe/Berlin",
      original_local_date: "2025-07-15",
    })).toBe("2025-07-15");
  });

  it("computes from starts_at + tz when original_local_date is missing", () => {
    expect(getAppointmentLocalDate({
      starts_at: "2025-12-10T23:00:00Z",
      booking_timezone: "Europe/Berlin",
    })).toBe("2025-12-11");
  });

  it("23:00 UTC with Berlin tz returns next day", () => {
    expect(getAppointmentLocalDate({
      starts_at: "2025-07-14T23:00:00Z",
      booking_timezone: "Europe/Berlin",
    })).toBe("2025-07-15");
  });

  it("returns empty string when no data", () => {
    expect(getAppointmentLocalDate({})).toBe("");
  });
});

describe("getAppointmentLocalHourMinute", () => {
  it("uses original_local_time when available", () => {
    const r = getAppointmentLocalHourMinute({
      original_local_time: "14:30",
      starts_at: "2025-07-15T09:00:00Z",
      booking_timezone: "Europe/Berlin",
    });
    expect(r).toEqual({ hour: 14, minute: 30 });
  });

  it("computes from starts_at + tz when original_local_time is missing", () => {
    const r = getAppointmentLocalHourMinute({
      starts_at: "2025-07-15T09:00:00Z",
      booking_timezone: "Europe/Berlin",
    });
    expect(r).toEqual({ hour: 11, minute: 0 });
  });

  it("returns 0:0 when no data", () => {
    expect(getAppointmentLocalHourMinute({})).toEqual({ hour: 0, minute: 0 });
  });
});

describe("getLocalTimeString", () => {
  it("returns time in specified timezone", () => {
    expect(getLocalTimeString("2025-07-15T09:00:00Z", "Europe/Berlin")).toBe("11:00");
  });

  it("winter offset applied", () => {
    expect(getLocalTimeString("2025-12-10T13:00:00Z", "Europe/Berlin")).toBe("14:00");
  });

  it("returns '—' for null input", () => {
    expect(getLocalTimeString(null, "Europe/Berlin")).toBe("—");
  });

  it("falls back to browser local when tz is null", () => {
    const result = getLocalTimeString("2025-07-15T09:00:00Z", null);
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("Path 1 vs Path 2 consistency", () => {
  const scenarios = [
    { label: "Summer Berlin 11:00", utc: "2025-07-15T09:00:00Z", tz: "Europe/Berlin", localDate: "2025-07-15", localTime: "11:00" },
    { label: "Winter Berlin 14:00", utc: "2025-12-10T13:00:00Z", tz: "Europe/Berlin", localDate: "2025-12-10", localTime: "14:00" },
    { label: "Midnight Berlin", utc: "2025-04-29T22:00:00Z", tz: "Europe/Berlin", localDate: "2025-04-30", localTime: "00:00" },
    { label: "DST spring", utc: "2025-03-30T01:30:00Z", tz: "Europe/Berlin", localDate: "2025-03-30", localTime: "03:30" },
    { label: "New York winter", utc: "2025-01-15T15:00:00Z", tz: "America/New_York", localDate: "2025-01-15", localTime: "10:00" },
    { label: "New York summer", utc: "2025-07-15T15:00:00Z", tz: "America/New_York", localDate: "2025-07-15", localTime: "11:00" },
    { label: "Tokyo midnight", utc: "2025-07-15T15:00:00Z", tz: "Asia/Tokyo", localDate: "2025-07-16", localTime: "00:00" },
    { label: "Kolkata 23:30", utc: "2025-07-15T18:00:00Z", tz: "Asia/Kolkata", localDate: "2025-07-15", localTime: "23:30" },
    { label: "Sydney summer", utc: "2025-01-15T00:00:00Z", tz: "Australia/Sydney", localDate: "2025-01-15", localTime: "11:00" },
  ];

  for (const s of scenarios) {
    it(`${s.label}: Path 1 and Path 2 show same time`, () => {
      const path1 = formatAppointmentTime({
        starts_at: s.utc,
        booking_timezone: s.tz,
        original_local_date: s.localDate,
        original_local_time: s.localTime,
      });
      const path2 = formatAppointmentTime({
        starts_at: s.utc,
        booking_timezone: s.tz,
      });
      expect(path1.startTime).toBe(path2.startTime);
      expect(path1.startTime).toBe(s.localTime);
    });
  }

  for (const s of scenarios) {
    it(`${s.label}: computeLocalDateTime matches expected`, () => {
      const r = computeLocalDateTime(s.utc, s.tz);
      expect(r.date).toBe(s.localDate);
      expect(r.time).toBe(s.localTime);
    });
  }
});
