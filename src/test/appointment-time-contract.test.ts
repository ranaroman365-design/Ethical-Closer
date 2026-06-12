import { describe, it, expect } from "vitest";
import {
  parseAppointmentTime,
  formatAppointmentTimeForDisplay,
  formatAppointmentTimeForEmail,
  formatAppointmentTimeForGoogleCalendar,
  formatAppointmentTimeForOutlook,
  formatAppointmentTimeForICS,
  formatAppointmentTimeRangeForDisplay,
  computeLocalDateTime,
  getLocalTimeString,
  BUSINESS_TIMEZONE,
} from "@/lib/appointment-time-contract";

/**
 * Canonical test appointment:
 * 08 May 2026, 13:00–14:00 Europe/Berlin
 * = 2026-05-08T11:00:00Z – 2026-05-08T12:00:00Z (CEST = UTC+2)
 */
const CANONICAL = {
  starts_at: "2026-05-08T11:00:00+00:00",
  ends_at: "2026-05-08T12:00:00+00:00",
  booking_timezone: "Europe/Berlin",
  original_local_date: "2026-05-08",
  original_local_time: "13:00",
};

describe("Appointment Time Contract — Timezone Consistency", () => {
  it("parseAppointmentTime returns 13:00 start and 14:00 end", () => {
    const parsed = parseAppointmentTime(CANONICAL);
    expect(parsed.localStartTime).toBe("13:00");
    expect(parsed.localEndTime).toBe("14:00");
    expect(parsed.localDate).toBe("2026-05-08");
    expect(parsed.timezone).toBe("Europe/Berlin");
  });

  it("formatAppointmentTimeForDisplay shows 13:00", () => {
    const display = formatAppointmentTimeForDisplay(CANONICAL);
    expect(display.startTime).toBe("13:00");
    expect(display.endTime).toBe("14:00");
    expect(display.dateTime).toContain("13:00");
    expect(display.source).toBe("original");
  });

  it("formatAppointmentTimeRangeForDisplay shows 13:00–14:00", () => {
    const range = formatAppointmentTimeRangeForDisplay(CANONICAL);
    expect(range).toContain("13:00");
    expect(range).toContain("14:00");
    expect(range).toContain("Europe/Berlin");
  });

  it("formatAppointmentTimeForEmail shows 13:00", () => {
    const email = formatAppointmentTimeForEmail(CANONICAL);
    expect(email.time).toBe("13:00");
    expect(email.range).toBe("13:00–14:00");
    expect(email.timezone).toBe("Europe/Berlin");
  });

  it("formatAppointmentTimeForGoogleCalendar uses UTC dates + ctz", () => {
    const google = formatAppointmentTimeForGoogleCalendar(CANONICAL);
    expect(google).not.toBeNull();
    // UTC: 11:00Z start, 12:00Z end
    expect(google!.dates).toBe("20260508T110000Z/20260508T120000Z");
    expect(google!.ctz).toBe("Europe/Berlin");
    // Must NOT contain 13:00 in UTC (that would be wrong)
    expect(google!.dates).not.toContain("130000Z");
  });

  it("formatAppointmentTimeForOutlook uses ISO UTC + timezone params", () => {
    const outlook = formatAppointmentTimeForOutlook(CANONICAL);
    expect(outlook).not.toBeNull();
    expect(outlook!.startdt).toBe("2026-05-08T11:00:00.000Z");
    expect(outlook!.enddt).toBe("2026-05-08T12:00:00.000Z");
    expect(outlook!.starttz).toBe("Europe/Berlin");
    expect(outlook!.endtz).toBe("Europe/Berlin");
    // Must NOT have 13:00 as UTC
    expect(outlook!.startdt).not.toContain("T13:");
  });

  it("formatAppointmentTimeForICS uses TZID with local time, not wrong UTC Z", () => {
    const ics = formatAppointmentTimeForICS(CANONICAL);
    expect(ics).not.toBeNull();
    // Must be: DTSTART;TZID=Europe/Berlin:20260508T130000
    expect(ics!.dtstart).toBe("DTSTART;TZID=Europe/Berlin:20260508T130000");
    expect(ics!.dtend).toBe("DTEND;TZID=Europe/Berlin:20260508T140000");
    // Must NOT have wrong UTC Z suffix with local time
    expect(ics!.dtstart).not.toContain("130000Z");
    expect(ics!.dtend).not.toContain("140000Z");
  });

  it("computeLocalDateTime returns 13:00 for UTC 11:00Z", () => {
    const result = computeLocalDateTime("2026-05-08T11:00:00Z");
    expect(result.time).toBe("13:00");
    expect(result.date).toBe("2026-05-08");
  });

  it("getLocalTimeString returns 13:00", () => {
    const time = getLocalTimeString("2026-05-08T11:00:00Z", "Europe/Berlin");
    expect(time).toBe("13:00");
  });

  it("works without original_local_* fields (Intl fallback)", () => {
    const input = {
      starts_at: "2026-05-08T11:00:00+00:00",
      ends_at: "2026-05-08T12:00:00+00:00",
      booking_timezone: "Europe/Berlin",
    };
    const parsed = parseAppointmentTime(input);
    expect(parsed.localStartTime).toBe("13:00");
    expect(parsed.localEndTime).toBe("14:00");
    expect(parsed.source).toBe("intl");
  });

  it("handles Postgres timestamp format with offset", () => {
    const input = {
      starts_at: "2026-05-08 11:00:00+00",
      ends_at: "2026-05-08 12:00:00+00",
      booking_timezone: "Europe/Berlin",
    };
    const parsed = parseAppointmentTime(input);
    expect(parsed.localStartTime).toBe("13:00");
    expect(parsed.localEndTime).toBe("14:00");
  });

  it("winter time (CET = UTC+1) also works correctly", () => {
    // 15 Jan 2026, 14:00 Berlin = 13:00 UTC (CET)
    const winter = {
      starts_at: "2026-01-15T13:00:00+00:00",
      ends_at: "2026-01-15T14:00:00+00:00",
      booking_timezone: "Europe/Berlin",
    };
    const parsed = parseAppointmentTime(winter);
    expect(parsed.localStartTime).toBe("14:00");
    expect(parsed.localEndTime).toBe("15:00");

    const ics = formatAppointmentTimeForICS(winter);
    expect(ics!.dtstart).toBe("DTSTART;TZID=Europe/Berlin:20260115T140000");
  });
});
