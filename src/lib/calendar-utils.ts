import {
  BUSINESS_TIMEZONE,
  formatAppointmentTimeForGoogleCalendar,
  formatAppointmentTimeForICS,
  formatAppointmentTimeForOutlook,
} from '@/lib/appointment-time-contract';

interface CalendarEvent {
  title: string;
  start: Date;
  end: Date;
  timezone?: string | null;
  description?: string;
  location?: string;
}

/** Generate .ics file content */
export function generateICS(event: CalendarEvent): string {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@radiant`;
  const desc = (event.description || '').replace(/\n/g, '\\n');
  const timezone = event.timezone || BUSINESS_TIMEZONE;
  const ics = formatAppointmentTimeForICS({
    starts_at: event.start.toISOString(),
    ends_at: event.end.toISOString(),
    booking_timezone: timezone,
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Radiant Sales OS//Calendar//DE',
    `X-WR-TIMEZONE:${timezone}`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    ics?.dtstart ?? '',
    ics?.dtend ?? '',
    `SUMMARY:${event.title}`,
    desc ? `DESCRIPTION:${desc}` : '',
    event.location ? `LOCATION:${event.location}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

/** Download ICS file */
export function downloadICS(event: CalendarEvent) {
  const content = generateICS(event);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `termin-${event.start.toISOString().slice(0, 10)}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Google Calendar link */
export function googleCalendarUrl(event: CalendarEvent): string {
  const calendarTime = formatAppointmentTimeForGoogleCalendar({
    starts_at: event.start.toISOString(),
    ends_at: event.end.toISOString(),
    booking_timezone: event.timezone || BUSINESS_TIMEZONE,
  });
  if (!calendarTime) return '';
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: calendarTime.dates,
    ctz: calendarTime.ctz,
    details: event.description || '',
    location: event.location || '',
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** Outlook Web link */
export function outlookCalendarUrl(event: CalendarEvent): string {
  const calendarTime = formatAppointmentTimeForOutlook({
    starts_at: event.start.toISOString(),
    ends_at: event.end.toISOString(),
    booking_timezone: event.timezone || BUSINESS_TIMEZONE,
  });
  if (!calendarTime) return '';
  const params = new URLSearchParams({
    rru: 'addevent',
    startdt: calendarTime.startdt,
    enddt: calendarTime.enddt,
    starttz: calendarTime.starttz,
    endtz: calendarTime.endtz,
    subject: event.title,
    body: event.description || '',
    location: event.location || '',
    path: '/calendar/action/compose',
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}
