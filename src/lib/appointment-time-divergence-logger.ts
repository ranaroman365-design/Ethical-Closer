/**
 * Appointment Time Divergence Logger
 * 
 * Traces a single appointment through ALL rendering paths and logs
 * whether each surface produces the correct business-local time.
 * 
 * Usage: import { logAppointmentTimeDivergence } from '@/lib/appointment-time-divergence-logger';
 *        logAppointmentTimeDivergence(appointmentRow);
 */

import {
  parseAppointmentTime,
  formatAppointmentTimeForDisplay,
  formatAppointmentTimeForEmail,
  formatAppointmentTimeForGoogleCalendar,
  formatAppointmentTimeForOutlook,
  formatAppointmentTimeForICS,
  BUSINESS_TIMEZONE,
  type AppointmentTimeInput,
} from "@/lib/appointment-time-contract";

interface DivergenceReport {
  appointmentId?: string;
  rawDb: {
    starts_at: string | null;
    ends_at: string | null;
    booking_timezone: string | null;
    original_local_date: string | null;
    original_local_time: string | null;
  };
  surfaces: Array<{
    surface: string;
    renderedTime: string;
    expectedTime: string;
    pass: boolean;
  }>;
  allPass: boolean;
}

export function logAppointmentTimeDivergence(
  appointment: AppointmentTimeInput & { id?: string },
  expectedStartTime?: string
): DivergenceReport {
  const parsed = parseAppointmentTime(appointment);
  const expected = expectedStartTime || parsed.localStartTime || "??:??";

  const surfaces: DivergenceReport["surfaces"] = [];

  function check(surface: string, rendered: string) {
    const pass = rendered.includes(expected);
    surfaces.push({ surface, renderedTime: rendered, expectedTime: expected, pass });
  }

  // 1. Display (dashboards, applicant view, internal calendar)
  const display = formatAppointmentTimeForDisplay(appointment);
  check("Display (dashboard/calendar)", display.startTime);

  // 2. Email
  const email = formatAppointmentTimeForEmail(appointment);
  check("Email template", email.time);

  // 3. Google Calendar
  const google = formatAppointmentTimeForGoogleCalendar(appointment);
  if (google) {
    check("Google Calendar (ctz)", google.ctz);
    // Verify UTC dates don't contain local time as UTC
    const hasWrongUtc = google.dates.includes(`${expected.replace(":", "")}Z`);
    surfaces.push({
      surface: "Google Calendar (no wrong UTC)",
      renderedTime: google.dates,
      expectedTime: `must NOT contain ${expected.replace(":", "")}Z`,
      pass: !hasWrongUtc,
    });
  }

  // 4. Outlook
  const outlook = formatAppointmentTimeForOutlook(appointment);
  if (outlook) {
    check("Outlook (starttz)", outlook.starttz);
    const hasWrongUtc = outlook.startdt.includes(`T${expected}:`);
    surfaces.push({
      surface: "Outlook (no wrong UTC)",
      renderedTime: outlook.startdt,
      expectedTime: `must NOT contain T${expected}: in UTC`,
      pass: !hasWrongUtc,
    });
  }

  // 5. ICS
  const ics = formatAppointmentTimeForICS(appointment);
  if (ics) {
    const icsLocalTime = ics.startLocal.substring(9, 13); // T1300 → 1300
    const expectedIcs = expected.replace(":", ""); // 13:00 → 1300
    check("ICS DTSTART local time", `${icsLocalTime} (from ${ics.dtstart})`);
    // Verify no wrong Z
    const hasWrongZ = ics.dtstart.endsWith(`${expectedIcs}00Z`);
    surfaces.push({
      surface: "ICS (no wrong Z suffix)",
      renderedTime: ics.dtstart,
      expectedTime: `must NOT end with ${expectedIcs}00Z`,
      pass: !hasWrongZ,
    });
  }

  const allPass = surfaces.every((s) => s.pass);

  const report: DivergenceReport = {
    appointmentId: appointment.id,
    rawDb: {
      starts_at: appointment.starts_at ?? null,
      ends_at: appointment.ends_at ?? null,
      booking_timezone: appointment.booking_timezone ?? null,
      original_local_date: appointment.original_local_date ?? null,
      original_local_time: appointment.original_local_time ?? null,
    },
    surfaces,
    allPass,
  };

  // Console output
  const label = allPass ? "✅ ALL PASS" : "❌ DIVERGENCE DETECTED";
  console.group(`[AppointmentTimeDivergence] ${label} — ${appointment.id ?? "unknown"}`);
  console.table(report.rawDb);
  for (const s of surfaces) {
    const icon = s.pass ? "✅" : "❌";
    console.log(`${icon} ${s.surface}: ${s.renderedTime}`);
  }
  console.groupEnd();

  return report;
}
