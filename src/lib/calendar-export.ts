/**
 * Client-side export helpers for OperatorCalendar.
 * Pure presentation utilities — no backend, no PII enrichment.
 *
 * - exportAppointmentsCSV: downloads .csv
 * - exportAppointmentsPDF: opens a print-ready HTML window (user picks "Save as PDF")
 */

export type ExportAttendee = {
  email: string;
  name?: string | null;
  /** RFC 5545 PARTSTAT — defaults to NEEDS-ACTION */
  status?: 'NEEDS-ACTION' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE';
  /** RFC 5545 ROLE — defaults to REQ-PARTICIPANT */
  role?: 'CHAIR' | 'REQ-PARTICIPANT' | 'OPT-PARTICIPANT' | 'NON-PARTICIPANT';
};

export type ExportAppointment = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  call_type: string | null;
  appointment_status: string | null;
  call_status: string | null;
  outcome: string | null;
  pricing_tier: string | null;
  lead_id: string | null;
  /** Optional — physical address, room, or video meeting URL */
  location?: string | null;
  /** Optional — invited people; emitted as ATTENDEE lines in .ics */
  attendees?: ExportAttendee[] | null;
  /** Optional — used as ORGANIZER if provided */
  organizer?: ExportAttendee | null;
};

export type ExportMeta = {
  memberName: string;
  memberEmail?: string | null;
  rangeLabel: string;
  generatedAt?: Date;
};

/** Default duration when ends_at is missing or invalid. */
const DEFAULT_DURATION_MS = 30 * 60_000;
/** Hard cap to prevent absurd ranges (24h) from corrupted data. */
const MAX_DURATION_MS = 24 * 60 * 60_000;

/** True when a value parses to a finite Date. */
const isValidIso = (v: unknown): v is string => {
  if (typeof v !== 'string' || !v) return false;
  const t = Date.parse(v);
  return Number.isFinite(t);
};

/**
 * Validate and repair an appointment's start/end timestamps.
 * Returns null when start is unusable — caller should skip the row.
 * Always returns a positive, capped duration when start is valid.
 */
export type RepairReason =
  | 'ends_at_missing'
  | 'ends_at_invalid'
  | 'ends_at_before_start'
  | 'duration_too_long';

export type SkipReason = 'starts_at_missing' | 'starts_at_invalid';

export function normalizeAppointmentDates(a: Pick<ExportAppointment, 'starts_at' | 'ends_at' | 'id'>):
  { startIso: string; endIso: string; durationMs: number; repaired: boolean; repairReason: RepairReason | null } | null {
  if (!isValidIso(a.starts_at)) {
    if (typeof console !== 'undefined') {
      console.warn('[calendar-export] skipping appointment — invalid starts_at', { id: a.id, starts_at: a.starts_at });
    }
    return null;
  }
  const startMs = Date.parse(a.starts_at);
  const startIso = new Date(startMs).toISOString();

  let endMs: number;
  let repairReason: RepairReason | null = null;
  if (isValidIso(a.ends_at)) {
    endMs = Date.parse(a.ends_at as string);
    if (endMs <= startMs) {
      endMs = startMs + DEFAULT_DURATION_MS;
      repairReason = 'ends_at_before_start';
    } else if (endMs - startMs > MAX_DURATION_MS) {
      endMs = startMs + MAX_DURATION_MS;
      repairReason = 'duration_too_long';
    }
  } else {
    endMs = startMs + DEFAULT_DURATION_MS;
    if (a.ends_at == null) repairReason = 'ends_at_missing';
    else repairReason = 'ends_at_invalid';
  }

  if (repairReason && typeof console !== 'undefined') {
    console.info('[calendar-export] repaired ends_at', { id: a.id, reason: repairReason, starts_at: a.starts_at, ends_at: a.ends_at });
  }

  return {
    startIso,
    endIso: new Date(endMs).toISOString(),
    durationMs: endMs - startMs,
    repaired: repairReason !== null,
    repairReason,
  };
}

/** Classify why a row would be skipped (start unusable). */
export function classifySkipReason(a: Pick<ExportAppointment, 'starts_at'>): SkipReason {
  if (a.starts_at == null || a.starts_at === '') return 'starts_at_missing';
  return 'starts_at_invalid';
}

const fmtDateTime = (iso: string) => {
  if (!isValidIso(iso)) return '—';
  return new Date(iso).toLocaleString('de-DE', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Berlin',
  });
};

const csvCell = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'calendar';

export function exportAppointmentsCSV(appts: ExportAppointment[], meta: ExportMeta) {
  const generatedAt = meta.generatedAt ?? new Date();

  // Normalize each row — invalid starts_at marks the row as skipped in the
  // export but never aborts the download.
  const normalized = appts.map(a => ({ raw: a, dates: normalizeAppointmentDates(a) }));
  const skipped = normalized.filter(n => !n.dates).length;
  const repaired = normalized.filter(n => n.dates?.repaired).length;

  const header = [
    `# Calendar export`,
    `# Member: ${meta.memberName}${meta.memberEmail ? ` <${meta.memberEmail}>` : ''}`,
    `# Range: ${meta.rangeLabel}`,
    `# Generated: ${generatedAt.toISOString()}`,
    `# Rows: ${appts.length} (valid: ${appts.length - skipped}, skipped: ${skipped}, repaired: ${repaired})`,
    `#`,
  ].join('\n');

  const cols = ['starts_at', 'ends_at', 'call_type', 'pricing_tier',
                'appointment_status', 'call_status', 'outcome', 'lead_id', 'id', 'export_note'];

  const rows = normalized.map(({ raw, dates }) => {
    const note = !dates ? 'invalid_start_skipped' : dates.repaired ? 'ends_at_repaired' : '';
    const row: Record<string, unknown> = { ...raw, export_note: note };
    // Normalize the displayed timestamps when we successfully parsed them.
    if (dates) {
      row.starts_at = dates.startIso;
      row.ends_at = dates.endIso;
    }
    return cols.map(c => csvCell(row[c])).join(',');
  });
  const csv = [header, cols.join(','), ...rows].join('\n');

  const stamp = generatedAt.toISOString().slice(0, 10);
  triggerDownload(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    `calendar-${slug(meta.memberName)}-${stamp}.csv`,
  );
}

export function exportAppointmentsPDF(appts: ExportAppointment[], meta: ExportMeta) {
  const generatedAt = meta.generatedAt ?? new Date();
  // Only include rows with a valid start; sort safely by parsed time.
  const sorted = appts
    .map(a => ({ a, dates: normalizeAppointmentDates(a) }))
    .filter((x): x is { a: ExportAppointment; dates: NonNullable<ReturnType<typeof normalizeAppointmentDates>> } => !!x.dates)
    .sort((x, y) => Date.parse(x.dates.startIso) - Date.parse(y.dates.startIso))
    .map(x => ({ ...x.a, starts_at: x.dates.startIso, ends_at: x.dates.endIso }));

  const rowHtml = sorted.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:#888;padding:24px">Keine Termine im Zeitraum.</td></tr>`
    : sorted.map(a => `
        <tr>
          <td>${fmtDateTime(a.starts_at)}</td>
          <td>${a.ends_at ? fmtDateTime(a.ends_at) : '—'}</td>
          <td>${a.call_type ?? '—'}${a.pricing_tier ? ` · ${a.pricing_tier}` : ''}</td>
          <td>${a.appointment_status ?? '—'}</td>
          <td>${a.outcome ?? a.call_status ?? '—'}</td>
        </tr>`).join('');

  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"/>
<title>Kalender — ${meta.memberName}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
         color: #1a1a1a; padding: 32px; max-width: 900px; margin: 0 auto; }
  h1 { font-family: "Cormorant Garamond", Georgia, serif; font-weight: 600;
       font-size: 28px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
  .meta div { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #eee;
           vertical-align: top; }
  th { background: #fafafa; font-weight: 600; text-transform: uppercase;
       letter-spacing: 0.04em; font-size: 10px; color: #666; }
  tr:nth-child(even) td { background: #fcfcfc; }
  .footer { margin-top: 24px; font-size: 10px; color: #999; text-align: center; }
  @media print {
    body { padding: 16px; }
    .no-print { display: none; }
  }
</style></head>
<body>
  <h1>Kalender — ${meta.memberName}</h1>
  <div class="meta">
    ${meta.memberEmail ? `<div>${meta.memberEmail}</div>` : ''}
    <div>Zeitraum: ${meta.rangeLabel}</div>
    <div>Termine: ${sorted.length}</div>
    <div>Erstellt: ${generatedAt.toLocaleString('de-DE')}</div>
  </div>
  <table>
    <thead><tr>
      <th>Start</th><th>Ende</th><th>Typ</th><th>Status</th><th>Ergebnis</th>
    </tr></thead>
    <tbody>${rowHtml}</tbody>
  </table>
  <div class="footer">ETC · Operator Calendar Export</div>
  <div class="no-print" style="margin-top:24px;text-align:center">
    <button onclick="window.print()" style="padding:10px 20px;font-size:14px;
      border:1px solid #1a1a1a;background:#1a1a1a;color:#fff;border-radius:8px;
      cursor:pointer">Als PDF speichern / Drucken</button>
  </div>
  <script>setTimeout(() => window.print(), 350);</script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) {
    // Popup blocked — fall back to downloading the HTML so user can open & print.
    triggerDownload(
      new Blob([html], { type: 'text/html;charset=utf-8' }),
      `calendar-${slug(meta.memberName)}-${generatedAt.toISOString().slice(0, 10)}.html`,
    );
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ---------------------------------------------------------------------------
// iCalendar (.ics) — RFC 5545.
// Works directly with: Apple Calendar, Outlook (desktop & web), Google Calendar
// (via "Settings → Import & export → Import"), Thunderbird, Fastmail, etc.
// ---------------------------------------------------------------------------

// Escape special chars per RFC 5545 §3.3.11 (TEXT type).
const icsEscape = (v: unknown): string =>
  String(v ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

// UTC timestamp in basic ISO format (YYYYMMDDTHHMMSSZ).
const icsDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
};

/**
 * Format a UTC instant as a "floating" local datetime in the given IANA
 * timezone. Output: YYYYMMDDTHHMMSS (no trailing Z) — to be paired with
 * a `TZID=` parameter on DTSTART/DTEND so calendar clients render the
 * event in that zone regardless of the viewer's local timezone.
 */
const icsLocalDate = (iso: string, tz: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  // Intl may emit "24" for hour at midnight in some engines — normalize.
  const hh = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}${parts.month}${parts.day}T${hh}${parts.minute}${parts.second}`;
};

/** Resolve the user's local IANA timezone, falling back to UTC. */
export const getLocalTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export type EventPreview = {
  id: string;
  title: string;
  startLabel: string;
  endLabel: string;
  durationMin: number;
  location: string | null;
  attendeeCount: number;
  repaired: boolean;
  repairReason: RepairReason | null;
  descriptionLines: string[];
};

export type SkippedPreview = {
  id: string;
  title: string;
  reason: SkipReason;
  rawStartsAt: string | null;
};

/**
 * Shared description builder — used by both buildICS DESCRIPTION and the
 * preview modal so the user sees exactly what will be written.
 */
export function buildDescriptionLines(
  a: ExportAppointment,
  meta: Pick<ExportMeta, 'memberName'>,
  tz: string,
): string[] {
  const location = (a.location ?? '').trim();
  const attendees = (a.attendees ?? []).filter(x => x && x.email);
  return [
    a.appointment_status ? `Status: ${a.appointment_status}` : null,
    a.call_status ? `Call: ${a.call_status}` : null,
    a.outcome ? `Outcome: ${a.outcome}` : null,
    meta.memberName ? `Operator: ${meta.memberName}` : null,
    location ? `Location: ${location}` : null,
    attendees.length
      ? `Attendees: ${attendees.map(x => x.name ? `${x.name} <${x.email}>` : x.email).join(', ')}`
      : null,
    `Timezone: ${tz}`,
  ].filter(Boolean) as string[];
}

/**
 * Build a human-readable list of the events that will end up in the
 * .ics / Google export. Skips rows whose start timestamp is unusable
 * (mirrors the same filter used by buildICS / Google).
 */
export function getEventPreviews(
  appts: ExportAppointment[],
  opts: { timeZone?: string; locale?: string; memberName?: string } = {},
): { previews: EventPreview[]; skipped: number; skippedDetails: SkippedPreview[] } {
  const tz = opts.timeZone || getLocalTimeZone();
  const locale = opts.locale || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
  const memberName = opts.memberName ?? '';
  const fmt = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const fmtTime = new Intl.DateTimeFormat(locale, {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const previews: EventPreview[] = [];
  const skippedDetails: SkippedPreview[] = [];
  for (const a of appts) {
    const norm = normalizeAppointmentDates(a);
    const titleBits = [a.call_type, a.pricing_tier].filter(Boolean).join(' · ');
    const title = titleBits || 'Call';
    if (!norm) {
      skippedDetails.push({
        id: a.id,
        title,
        reason: classifySkipReason(a),
        rawStartsAt: (a.starts_at as string | null | undefined) ?? null,
      });
      continue;
    }
    previews.push({
      id: a.id,
      title,
      startLabel: fmt.format(new Date(norm.startIso)),
      endLabel: fmtTime.format(new Date(norm.endIso)),
      durationMin: Math.round(norm.durationMs / 60000),
      location: (a.location ?? '').trim() || null,
      attendeeCount: (a.attendees ?? []).filter(x => x && x.email).length,
      repaired: norm.repaired,
      repairReason: norm.repairReason,
      descriptionLines: buildDescriptionLines(a, { memberName }, tz),
    });
  }
  return { previews, skipped: skippedDetails.length, skippedDetails };
}

/**
 * Minimal VTIMEZONE block. We don't ship full DST rules — instead we let
 * each calendar client resolve the IANA TZID natively (Apple, Google,
 * Outlook, Thunderbird all do). The block is just a hint so older clients
 * don't choke on an unknown TZID.
 */
const buildVTimezone = (tz: string): string[] => [
  'BEGIN:VTIMEZONE',
  `TZID:${tz}`,
  'X-LIC-LOCATION:' + tz,
  'END:VTIMEZONE',
];

// Fold long lines at 75 octets per RFC 5545 §3.1.
const icsFold = (line: string): string => {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let i = 0;
  while (i < line.length) {
    chunks.push((i === 0 ? '' : ' ') + line.slice(i, i + 74));
    i += 74;
  }
  return chunks.join('\r\n');
};

function buildICS(
  appts: ExportAppointment[],
  meta: ExportMeta,
  tz: string,
): string {
  const generatedAt = meta.generatedAt ?? new Date();
  const dtstamp = icsDate(generatedAt.toISOString());
  const calName = `ETC — ${meta.memberName}`;
  const useTz = tz && tz !== 'UTC';

  const events = appts.flatMap(a => {
    // Validate / repair timestamps. Skip the row entirely if start is unusable.
    const norm = normalizeAppointmentDates(a);
    if (!norm) return [];
    const startIso = norm.startIso;
    const endIso = norm.endIso;

    const dtstart = useTz
      ? `DTSTART;TZID=${tz}:${icsLocalDate(startIso, tz)}`
      : `DTSTART:${icsDate(startIso)}`;
    const dtend = useTz
      ? `DTEND;TZID=${tz}:${icsLocalDate(endIso, tz)}`
      : `DTEND:${icsDate(endIso)}`;

    const titleBits = [a.call_type, a.pricing_tier].filter(Boolean).join(' · ');
    const summary = titleBits || 'Call';

    const location = (a.location ?? '').trim();
    const attendees = (a.attendees ?? []).filter(x => x && x.email);

    const descLines = buildDescriptionLines(a, meta, tz);

    // Per RFC 5545 §3.8.4.1, ATTENDEE / ORGANIZER use CAL-ADDRESS values
    // prefixed with `mailto:`. CN must be quoted-safe — we just escape commas.
    const buildAttendeeLine = (att: ExportAttendee, kind: 'ORGANIZER' | 'ATTENDEE') => {
      const params: string[] = [];
      if (att.name) params.push(`CN=${att.name.replace(/[",;:]/g, ' ')}`);
      if (kind === 'ATTENDEE') {
        params.push(`ROLE=${att.role ?? 'REQ-PARTICIPANT'}`);
        params.push(`PARTSTAT=${att.status ?? 'NEEDS-ACTION'}`);
        params.push('RSVP=TRUE');
      }
      const prefix = `${kind}${params.length ? ';' + params.join(';') : ''}`;
      return `${prefix}:mailto:${att.email}`;
    };

    const organizerLine = a.organizer && a.organizer.email
      ? buildAttendeeLine(a.organizer, 'ORGANIZER')
      : null;
    const attendeeLines = attendees.map(att => buildAttendeeLine(att, 'ATTENDEE'));

    const lines = [
      'BEGIN:VEVENT',
      `UID:${a.id}@ethicalcloser.de`,
      `DTSTAMP:${dtstamp}`,
      dtstart,
      dtend,
      `SUMMARY:${icsEscape(summary)}`,
      descLines.length ? `DESCRIPTION:${icsEscape(descLines.join('\\n'))}` : null,
      location ? `LOCATION:${icsEscape(location)}` : null,
      organizerLine,
      ...attendeeLines,
      a.appointment_status ? `STATUS:${
        /cancel/i.test(a.appointment_status) ? 'CANCELLED'
          : /confirm|booked|scheduled/i.test(a.appointment_status) ? 'CONFIRMED'
          : 'TENTATIVE'
      }` : null,
      'END:VEVENT',
    ].filter(Boolean) as string[];

    return lines.map(icsFold);
  });

  const cal = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ETC//Operator Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(calName)}`,
    `X-WR-CALDESC:${icsEscape(`Range: ${meta.rangeLabel} · TZ: ${tz}`)}`,
    `X-WR-TIMEZONE:${tz}`,
    ...(useTz ? buildVTimezone(tz) : []),
    ...events,
    'END:VCALENDAR',
  ];

  // RFC 5545 requires CRLF line endings.
  return cal.join('\r\n');
}

/**
 * Download an iCalendar (.ics) file. Universal — works in Apple Calendar,
 * Outlook (desktop & web), Google Calendar (via Import), Thunderbird, etc.
 */
export function exportAppointmentsICS(
  appts: ExportAppointment[],
  meta: ExportMeta,
  opts?: { filenameSuffix?: string; timeZone?: string },
) {
  const generatedAt = meta.generatedAt ?? new Date();
  const stamp = generatedAt.toISOString().slice(0, 10);
  const suffix = opts?.filenameSuffix ? `-${opts.filenameSuffix}` : '';
  const tz = opts?.timeZone || getLocalTimeZone();
  triggerDownload(
    new Blob([buildICS(appts, { ...meta, generatedAt }, tz)], {
      type: 'text/calendar;charset=utf-8',
    }),
    `calendar-${slug(meta.memberName)}${suffix}-${stamp}.ics`,
  );
}

/**
 * Outlook variant — identical .ics file with an `outlook` suffix in the
 * filename so users recognize it. Outlook desktop & web both consume .ics.
 */
export function exportAppointmentsOutlook(
  appts: ExportAppointment[],
  meta: ExportMeta,
  opts?: { timeZone?: string },
) {
  exportAppointmentsICS(appts, meta, { filenameSuffix: 'outlook', timeZone: opts?.timeZone });
}

/**
 * Google Calendar bulk-import flow.
 *
 * Google has no public bulk-add URL — the only reliable path is:
 *   1. Download an .ics file
 *   2. Open https://calendar.google.com/calendar/u/0/r/settings/export
 *      (the "Import & export" settings page) so the user can upload it.
 *
 * For a single appointment we also support the classic event-template URL.
 */
const GOOGLE_IMPORT_PAGE = 'https://calendar.google.com/calendar/u/0/r/settings/export';

export type GoogleExportPreview =
  | { kind: 'single'; url: string; params: Record<string, string>; title: string; timeZone: string }
  | { kind: 'bulk'; importPageUrl: string; eventCount: number; timeZone: string; reason: 'multiple' | 'invalid_start' };

/**
 * Pure builder — returns the exact Google Calendar URL (or bulk-import fallback)
 * that `exportAppointmentsGoogle` would open. Safe to call from a preview UI.
 */
export function buildGoogleExportPreview(
  appts: ExportAppointment[],
  meta: ExportMeta,
  opts?: { timeZone?: string },
): GoogleExportPreview {
  const tz = opts?.timeZone || getLocalTimeZone();

  if (appts.length === 1) {
    const a = appts[0];
    const norm = normalizeAppointmentDates(a);
    if (!norm) {
      return { kind: 'bulk', importPageUrl: GOOGLE_IMPORT_PAGE, eventCount: 1, timeZone: tz, reason: 'invalid_start' };
    }
    const start = icsDate(norm.startIso);
    const end = icsDate(norm.endIso);
    const title = [a.call_type, a.pricing_tier].filter(Boolean).join(' · ') || 'Call';
    const location = (a.location ?? '').trim();
    const attendees = (a.attendees ?? []).filter(x => x && x.email);
    const details = [
      a.appointment_status ? `Status: ${a.appointment_status}` : null,
      a.outcome ? `Outcome: ${a.outcome}` : null,
      `Operator: ${meta.memberName}`,
      attendees.length
        ? `Attendees: ${attendees.map(x => x.name ? `${x.name} <${x.email}>` : x.email).join(', ')}`
        : null,
      `Timezone: ${tz}`,
    ].filter(Boolean).join('\n');

    const params: Record<string, string> = {
      action: 'TEMPLATE',
      text: title,
      dates: `${start}/${end}`,
      ctz: tz,
      details,
    };
    if (location) params.location = location;
    if (attendees.length) params.add = attendees.map(x => x.email).join(',');

    const url = 'https://calendar.google.com/calendar/render?'
      + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

    return { kind: 'single', url, params, title, timeZone: tz };
  }

  return { kind: 'bulk', importPageUrl: GOOGLE_IMPORT_PAGE, eventCount: appts.length, timeZone: tz, reason: 'multiple' };
}

export function exportAppointmentsGoogle(
  appts: ExportAppointment[],
  meta: ExportMeta,
  opts?: { timeZone?: string },
) {
  const preview = buildGoogleExportPreview(appts, meta, opts);
  const tz = preview.timeZone;

  if (preview.kind === 'single') {
    window.open(preview.url, '_blank', 'noopener,noreferrer');
    return;
  }

  if (preview.reason === 'invalid_start') {
    console.warn('[calendar-export] Google single-event has invalid start; falling back to .ics import flow');
  }
  exportAppointmentsICS(appts, meta, { filenameSuffix: 'google', timeZone: tz });
  window.open(preview.importPageUrl, '_blank', 'noopener,noreferrer');
}

