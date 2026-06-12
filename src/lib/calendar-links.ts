/**
 * Generate deep-links for Google Calendar, Outlook, and Apple Calendar.
 * Also handles persisting preferred_calendar on the lead record.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  BUSINESS_TIMEZONE,
  formatAppointmentTimeForGoogleCalendar,
  formatAppointmentTimeForOutlook,
} from "@/lib/appointment-time-contract";

export type CalendarProvider = "google" | "outlook" | "apple" | "ics";

interface CalendarLinkOpts {
  startsAt: string; // ISO 8601 UTC
  endsAt?: string | null;
  timezone?: string | null;
  durationMinutes?: number;
  title: string;
  description?: string;
  location?: string;
}

export function getGoogleCalendarUrl(opts: CalendarLinkOpts): string {
  const calendarTime = formatAppointmentTimeForGoogleCalendar({
    starts_at: opts.startsAt,
    ends_at: opts.endsAt ?? null,
    booking_timezone: opts.timezone ?? BUSINESS_TIMEZONE,
  });
  if (!calendarTime) return "";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates: calendarTime.dates,
    ctz: calendarTime.ctz,
    details: opts.description ?? "",
    location: opts.location ?? "Online · Video-Call",
  });
  return `https://calendar.google.com/calendar/event?${params.toString()}`;
}

export function getOutlookCalendarUrl(opts: CalendarLinkOpts): string {
  const calendarTime = formatAppointmentTimeForOutlook({
    starts_at: opts.startsAt,
    ends_at: opts.endsAt ?? null,
    booking_timezone: opts.timezone ?? BUSINESS_TIMEZONE,
  });
  if (!calendarTime) return "";
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: opts.title,
    startdt: calendarTime.startdt,
    enddt: calendarTime.enddt,
    starttz: calendarTime.starttz,
    endtz: calendarTime.endtz,
    body: opts.description ?? "",
    location: opts.location ?? "Online · Video-Call",
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/** Save preferred calendar to the lead record */
export async function savePreferredCalendar(leadId: string, provider: CalendarProvider): Promise<void> {
  if (!leadId) return;
  await (supabase as any)
    .from("leads")
    .update({ preferred_calendar: provider })
    .eq("id", leadId);
}

/** Load preferred calendar from the lead record */
export async function loadPreferredCalendar(leadId: string): Promise<CalendarProvider | null> {
  if (!leadId) return null;
  const { data } = await (supabase as any)
    .from("leads")
    .select("preferred_calendar")
    .eq("id", leadId)
    .maybeSingle();
  return (data?.preferred_calendar as CalendarProvider) ?? null;
}
