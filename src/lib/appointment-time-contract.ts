export const BUSINESS_TIMEZONE = "Europe/Berlin";

export interface AppointmentTimeInput {
  starts_at?: string | null;
  ends_at?: string | null;
  booking_timezone?: string | null;
  timezone?: string | null;
  original_local_date?: string | null;
  original_local_time?: string | null;
}

export interface ParsedAppointmentTime {
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string;
  localDate: string | null;
  localStartTime: string | null;
  localEndTime: string | null;
  source: "original" | "intl" | "none";
}

export interface FormattedAppointmentTime {
  dateTime: string;
  date: string;
  startTime: string;
  endTime: string | null;
  source: "original" | "intl" | "none";
}

const LOCALE = "de-DE";

function normalizeTimestamp(value?: string | null): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const pg = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\.\d+)?([+-]\d{2})(?::?(\d{2}))?$/);
  if (pg) return `${pg[1]}T${pg[2]}${pg[3]}:${pg[4] ?? "00"}`;
  return trimmed;
}

function parseInstant(value?: string | null): Date | null {
  const normalized = normalizeTimestamp(value);
  if (!normalized) return null;
  const d = new Date(normalized);
  return Number.isFinite(d.getTime()) ? d : null;
}

function formatPartsInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
    ics: `${parts.year}${parts.month}${parts.day}T${hour}${parts.minute}${parts.second}`,
  };
}

function formatDateLabel(localDate: string, locale = LOCALE): string {
  const match = localDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return localDate;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function toUtcCalendarDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function parseAppointmentTime(input: AppointmentTimeInput | string | null | undefined): ParsedAppointmentTime {
  const value = typeof input === "string" ? { starts_at: input } : (input ?? {});
  const timezone = value.booking_timezone || value.timezone || BUSINESS_TIMEZONE;
  const startsAt = parseInstant(value.starts_at);
  const endsAt = parseInstant(value.ends_at);

  if (!startsAt) {
    return { startsAt: null, endsAt, timezone, localDate: null, localStartTime: null, localEndTime: null, source: "none" };
  }

  const startParts = formatPartsInTimezone(startsAt, timezone);
  const endParts = endsAt ? formatPartsInTimezone(endsAt, timezone) : null;

  return {
    startsAt,
    endsAt,
    timezone,
    localDate: value.original_local_date || startParts.date,
    localStartTime: value.original_local_time || startParts.time,
    localEndTime: endParts?.time ?? null,
    source: value.original_local_date && value.original_local_time ? "original" : "intl",
  };
}

export function formatAppointmentTimeForDisplay(input: AppointmentTimeInput, opts: { locale?: string; includeTimezone?: boolean } = {}): FormattedAppointmentTime {
  const parsed = parseAppointmentTime(input);
  if (!parsed.localDate || !parsed.localStartTime) {
    return { dateTime: "—", date: "—", startTime: "—", endTime: null, source: "none" };
  }
  const date = formatDateLabel(parsed.localDate, opts.locale ?? LOCALE);
  const timezoneSuffix = opts.includeTimezone ? ` ${parsed.timezone}` : "";
  return {
    dateTime: `${date} · ${parsed.localStartTime}${timezoneSuffix}`,
    date,
    startTime: parsed.localStartTime,
    endTime: parsed.localEndTime,
    source: parsed.source,
  };
}

export function formatAppointmentTimeRangeForDisplay(input: AppointmentTimeInput, opts: { locale?: string; includeTimezone?: boolean } = {}): string {
  const parsed = parseAppointmentTime(input);
  if (!parsed.localDate || !parsed.localStartTime) return "—";
  const date = formatDateLabel(parsed.localDate, opts.locale ?? LOCALE);
  const range = parsed.localEndTime ? `${parsed.localStartTime}–${parsed.localEndTime}` : parsed.localStartTime;
  return `${date}, ${range}${opts.includeTimezone !== false ? ` ${parsed.timezone}` : ""}`;
}

export function formatAppointmentTimeForEmail(input: AppointmentTimeInput, opts: { locale?: string } = {}): { date: string; time: string; range: string; timezone: string } {
  const parsed = parseAppointmentTime(input);
  if (!parsed.localDate || !parsed.localStartTime) return { date: "—", time: "—", range: "—", timezone: parsed.timezone };
  const date = formatDateLabel(parsed.localDate, opts.locale ?? LOCALE);
  const range = parsed.localEndTime ? `${parsed.localStartTime}–${parsed.localEndTime}` : parsed.localStartTime;
  return { date, time: parsed.localStartTime, range, timezone: parsed.timezone };
}

export function formatAppointmentTimeForGoogleCalendar(input: AppointmentTimeInput & { title?: string; description?: string; location?: string }) {
  const parsed = parseAppointmentTime(input);
  if (!parsed.startsAt) return null;
  const end = parsed.endsAt ?? new Date(parsed.startsAt.getTime() + 30 * 60_000);
  return {
    dates: `${toUtcCalendarDate(parsed.startsAt)}/${toUtcCalendarDate(end)}`,
    ctz: parsed.timezone,
    timezone: parsed.timezone,
  };
}

export function formatAppointmentTimeForOutlook(input: AppointmentTimeInput) {
  const parsed = parseAppointmentTime(input);
  if (!parsed.startsAt) return null;
  const end = parsed.endsAt ?? new Date(parsed.startsAt.getTime() + 30 * 60_000);
  return {
    startdt: parsed.startsAt.toISOString(),
    enddt: end.toISOString(),
    starttz: parsed.timezone,
    endtz: parsed.timezone,
    timezone: parsed.timezone,
  };
}

export function formatAppointmentTimeForICS(input: AppointmentTimeInput): { dtstart: string; dtend: string; timezone: string; startLocal: string; endLocal: string } | null {
  const parsed = parseAppointmentTime(input);
  if (!parsed.startsAt) return null;
  const end = parsed.endsAt ?? new Date(parsed.startsAt.getTime() + 30 * 60_000);
  const startLocal = formatPartsInTimezone(parsed.startsAt, parsed.timezone).ics;
  const endLocal = formatPartsInTimezone(end, parsed.timezone).ics;
  return {
    dtstart: `DTSTART;TZID=${parsed.timezone}:${startLocal}`,
    dtend: `DTEND;TZID=${parsed.timezone}:${endLocal}`,
    timezone: parsed.timezone,
    startLocal,
    endLocal,
  };
}

export function formatAppointmentTime(input: AppointmentTimeInput): FormattedAppointmentTime {
  return formatAppointmentTimeForDisplay(input);
}

export function computeLocalDateTime(utcIso: string, tz = BUSINESS_TIMEZONE): { date: string; time: string } {
  const d = parseInstant(utcIso);
  if (!d) return { date: "", time: "" };
  const parts = formatPartsInTimezone(d, tz);
  return { date: parts.date, time: parts.time };
}

export function getAppointmentLocalDate(a: AppointmentTimeInput): string {
  const parsed = parseAppointmentTime(a);
  return parsed.localDate ?? "";
}

export function getAppointmentLocalHourMinute(a: AppointmentTimeInput): { hour: number; minute: number } {
  const parsed = parseAppointmentTime(a);
  if (!parsed.localStartTime) return { hour: 0, minute: 0 };
  const [hour, minute] = parsed.localStartTime.split(":").map(Number);
  return { hour, minute };
}

export function getLocalTimeString(isoUtc: string | null | undefined, tz: string | null | undefined = BUSINESS_TIMEZONE): string {
  if (!isoUtc) return "—";
  const parsed = parseAppointmentTime({ starts_at: isoUtc, booking_timezone: tz || BUSINESS_TIMEZONE });
  return parsed.localStartTime ?? "—";
}