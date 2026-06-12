import { BUSINESS_TIMEZONE, formatAppointmentTimeForICS } from "@/lib/appointment-time-contract";

/**
 * Generate an ICS calendar file blob with proper VTIMEZONE support.
 * Uses the stored booking timezone to guarantee correct event time.
 */

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Format a Date to ICS UTC datetime: 20260115T143000Z */
function toIcsUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

interface IcsEventOptions {
  /** ISO 8601 start time (UTC) */
  startsAt: string;
  /** ISO 8601 end time (UTC) */
  endsAt?: string | null;
  /** Duration in minutes (default 30) */
  durationMinutes?: number;
  /** IANA timezone, e.g. "Europe/Berlin" */
  timezone: string;
  /** Event title */
  title: string;
  /** Event description */
  description?: string;
  /** Location / URL */
  location?: string;
}

export function generateIcsBlob(opts: IcsEventOptions): Blob {
  const {
    startsAt,
    endsAt,
    durationMinutes = 30,
    timezone = BUSINESS_TIMEZONE,
    title,
    description = "",
    location = "Online · Video-Call",
  } = opts;

  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + durationMinutes * 60_000);
  const now = new Date();
  const uid = `etc-${start.getTime()}-${Math.random().toString(36).slice(2, 8)}@ethicalcloser.de`;
  const icsTime = formatAppointmentTimeForICS({ starts_at: startsAt, ends_at: endsAt ?? end.toISOString(), booking_timezone: timezone });

  // Use UTC timestamps with timezone via TZID for maximum compatibility.
  // Most modern calendar apps (Google, Apple, Outlook) handle VTIMEZONE
  // via the TZID parameter on DTSTART/DTEND without needing a full
  // VTIMEZONE block. We include both approaches for safety.
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ethical Top Closer//Booking//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    // VTIMEZONE block (simplified — tells calendar apps which TZ to use)
    "BEGIN:VTIMEZONE",
    `TZID:${timezone}`,
    "BEGIN:DAYLIGHT",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtc(now)}`,
    icsTime?.dtstart ?? `DTSTART:${toIcsUtc(start)}`,
    icsTime?.dtend ?? `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escIcs(title)}`,
    `DESCRIPTION:${escIcs(description)}`,
    `LOCATION:${escIcs(location)}`,
    "STATUS:CONFIRMED",
    `X-BOOKING-TIMEZONE:${timezone}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Termin in 15 Minuten",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
}

function escIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function downloadIcs(opts: IcsEventOptions): void {
  const blob = generateIcsBlob(opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "termin-ethical-top-closer.ics";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
