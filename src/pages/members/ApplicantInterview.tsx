import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Calendar, Clock, User, Download, ExternalLink, Video,
  CalendarPlus, CheckCircle2, AlertCircle, Timer, Sparkles,
  ArrowRight, TrendingUp, BookOpen,
} from 'lucide-react';
import { format, differenceInHours, differenceInMinutes, isPast } from 'date-fns';
import { formatAppointmentTime } from '@/lib/appointment-time-display';
import { de } from 'date-fns/locale';
import { downloadICS, googleCalendarUrl, outlookCalendarUrl } from '@/lib/calendar-utils';
import { motion } from 'framer-motion';

type AppointmentData = {
  id: string;
  starts_at: string;
  ends_at: string;
  call_type: string;
  appointment_status: string;
  video_call_link: string | null;
  setter_id: string | null;
  join_clicked_at: string | null;
  call_status: string;
  booking_timezone: string | null;
  original_local_date: string | null;
  original_local_time: string | null;
};

type InterviewState = 'no_appointment' | 'booked' | 'no_link' | 'starting_soon' | 'completed';

export default function ApplicantInterview() {
  const { user, profile } = useAuth();
  const firstName = (profile as any)?.full_name?.split(' ')[0] || '';

  const [appointment, setAppointment] = useState<AppointmentData | null>(null);
  const [setterName, setSetterName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  // Tick every minute for countdown
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(iv);
  }, []);

  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const ACTIVE_STATUSES = ['booked', 'confirmed', 'scheduled', 'pending_payment'];
    // 2h grace so an in-progress / just-finished call is still visible
    const minStartIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const loadAppointment = async () => {
      setLoading(true);
      setLoadError(null);
      const email = (user.email ?? '').toLowerCase();

      try {
        // Best-effort backfill: link any orphan lead row(s) for this email to
        // the authenticated user. RPC is idempotent and security-definer.
        try { await supabase.rpc('backfill_my_lead_ownership' as never); } catch { /* best-effort */ }

        let foundAppointment: AppointmentData | null = null;
        let foundSetterId: string | null = null;
        let lookupError: unknown = null;

        // Primary path: query appointments directly. RLS already allows an
        // applicant to read appointments whose linked lead email equals the
        // authenticated email, so this avoids owner_id/profile_id mismatches.
        const { data: directApts, error: directAptErr } = await supabase
          .from('appointments')
          .select('id, lead_id, starts_at, ends_at, call_type, appointment_status, video_call_link, setter_id, join_clicked_at, call_status, booking_timezone, original_local_date, original_local_time')
          .in('appointment_status', ACTIVE_STATUSES)
          .gte('starts_at', minStartIso)
          .order('starts_at', { ascending: true })
          .limit(1);

        if (cancelled) return;

        if (!directAptErr && directApts && directApts.length > 0) {
          const apt = directApts[0] as AppointmentData;
          foundAppointment = apt;
          foundSetterId = apt.setter_id ?? null;
        } else if (directAptErr) {
          lookupError = directAptErr;
        }

        // Fallback path: resolve visible leads without PostgREST `.or(...)` so
        // email parsing/case issues cannot block a valid appointment lookup.
        const [{ data: emailLeads, error: emailLeadsErr }, { data: ownerLeads, error: ownerLeadsErr }] = await Promise.all([
          supabase
            .from('leads')
            .select('id, setter_id, owner_id, email')
            .eq('email', email)
            .order('updated_at', { ascending: false })
            .limit(10),
          supabase
            .from('leads')
            .select('id, setter_id, owner_id, email')
            .eq('owner_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(10),
        ]);

        if (cancelled) return;
        if (emailLeadsErr || ownerLeadsErr) lookupError = emailLeadsErr ?? ownerLeadsErr;

        const leadsById = new Map<string, { id: string; setter_id: string | null; owner_id: string | null; email: string | null }>();
        [...(emailLeads ?? []), ...(ownerLeads ?? [])].forEach((lead) => leadsById.set(lead.id, lead));
        const leads = Array.from(leadsById.values());

        if (!foundAppointment && leads.length > 0) {
          const leadIds = leads.map((l) => l.id);
          const { data: apts, error: aptErr } = await supabase
            .from('appointments')
            .select('id, lead_id, starts_at, ends_at, call_type, appointment_status, video_call_link, setter_id, join_clicked_at, call_status, booking_timezone, original_local_date, original_local_time')
            .in('lead_id', leadIds)
            .in('appointment_status', ACTIVE_STATUSES)
            .gte('starts_at', minStartIso)
            .order('starts_at', { ascending: true })
            .limit(1);

          if (cancelled) return;
          if (aptErr) lookupError = aptErr;

          if (apts && apts.length > 0) {
            const apt = apts[0] as AppointmentData & { lead_id: string };
            foundAppointment = apt;
            const matchingLead = leads.find((l) => l.id === apt.lead_id) ?? leads[0];
            foundSetterId = apt.setter_id || matchingLead?.setter_id || null;
          }
        }

        if (cancelled) return;
        if (!foundAppointment && lookupError) throw lookupError;
        setAppointment(foundAppointment);

        if (foundSetterId) {
          const { data: sp } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', foundSetterId)
            .maybeSingle();
          if (!cancelled && sp?.full_name) setSetterName(sp.full_name);
        }

        // eslint-disable-next-line no-console
        console.log('[ApplicantInterview] lookup', {
          user_email: email,
          user_id: user.id,
          leads_found: leads?.length ?? 0,
          appointment_found: !!foundAppointment,
        });
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error('[ApplicantInterview] load error', err);
        setLoadError(err instanceof Error ? err.message : 'unknown');
        setAppointment(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAppointment();
    return () => { cancelled = true; };
  }, [user, retryCount]);

  // Determine state
  const state: InterviewState = useMemo(() => {
    if (!appointment) return 'no_appointment';
    const start = new Date(appointment.starts_at);
    if (isPast(start) || appointment.appointment_status === 'completed' || appointment.appointment_status === 'no_show') return 'completed';
    const hoursUntil = differenceInHours(start, now);
    if (hoursUntil <= 24 && appointment.video_call_link) return 'starting_soon';
    if (!appointment.video_call_link) return 'no_link';
    return 'booked';
  }, [appointment, now]);

  // Countdown
  const countdown = useMemo(() => {
    if (!appointment || state !== 'starting_soon') return null;
    const start = new Date(appointment.starts_at);
    const totalMin = differenceInMinutes(start, now);
    if (totalMin <= 0) return null;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return { hours: h, minutes: m };
  }, [appointment, now, state]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 space-y-6">
        <Skeleton className="h-8 w-64" />
        <p className="text-sm text-muted-foreground">Dein Termin wird geladen…</p>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  // Real technical error vs. legitimate "no appointment" — keep them separate.
  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
                Dein Strategiegespräch
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Dein Termin konnte gerade nicht geladen werden.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setRetryCount((c) => c + 1)}
              >
                Erneut versuchen
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
                Du hast noch kein Strategiegespräch gebucht.
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Buche jetzt dein Strategiegespräch, damit wir prüfen können,
                ob du für den nächsten Schritt geeignet bist.
              </p>
              <Button asChild size="sm" className="mt-3">
                <Link to="/booking">Strategiegespräch buchen</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Timezone-aware display (single source of truth)
  const displayResult = formatAppointmentTime({
    starts_at: appointment.starts_at,
    ends_at: appointment.ends_at,
    booking_timezone: appointment.booking_timezone,
    original_local_date: appointment.original_local_date,
    original_local_time: appointment.original_local_time,
  });

  const calEvent = {
    title: 'Strategiegespräch – Ethical Closing',
    start: new Date(appointment.starts_at),
    end: new Date(appointment.ends_at),
    description: `Dein persönliches Strategiegespräch${setterName ? ` mit ${setterName}` : ''}.`,
    location: appointment.video_call_link || 'Online',
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          {state === 'completed' ? 'Dein Strategiegespräch' : 'Dein Strategiegespräch ist bestätigt'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {firstName ? `${firstName}, hier findest du Datum, Uhrzeit und deinen Zugangslink.` : 'Hier findest du Datum, Uhrzeit und deinen Zugangslink.'}
        </p>
      </div>

      {/* ── STATE B/C/D: Appointment exists (not completed) ── */}
      {state !== 'completed' && (
        <div className="space-y-6">
          {/* Confirmation banner */}
          {state === 'starting_soon' && countdown && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <Timer className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {firstName ? `${firstName}, dein Gespräch startet bald` : 'Dein Gespräch startet bald'}
                </p>
                <p className="text-lg font-bold text-primary">
                  {countdown.hours > 0 && `${countdown.hours} Stunde${countdown.hours > 1 ? 'n' : ''} `}
                  {countdown.minutes} Minute{countdown.minutes !== 1 ? 'n' : ''}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Bitte sei ein paar Minuten vorher bereit.</p>
              </div>
            </div>
          )}

          {/* Main card */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Status header */}
            <div className="border-b border-border bg-muted/30 px-6 py-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {firstName ? `${firstName}, dein Strategiegespräch ist bestätigt` : 'Dein Strategiegespräch ist bestätigt'}
                </p>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Details grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Datum</p>
                  <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    {displayResult.date}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Uhrzeit</p>
                  <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    {displayResult.startTime} Uhr
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Status</p>
                  <Badge variant="outline" className="border-primary/30 text-primary text-xs">
                    Bestätigt
                  </Badge>
                </div>
                {setterName && (
                  <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Ansprechpartner</p>
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      {setterName}
                    </p>
                  </div>
                )}
              </div>

              {/* CTA: Meeting link present */}
              {appointment.video_call_link && (
                <div className="space-y-2">
                  <Button
                    size="lg"
                    className="w-full gap-2 text-base"
                    onClick={async () => {
                      if (appointment.id) {
                        supabase.rpc('record_join_click', { p_appointment_id: appointment.id } as any).then(() => {});
                      }
                      window.open(appointment.video_call_link!, '_blank');
                    }}
                  >
                    <Video className="h-5 w-5" />
                    Zum Gesprächsraum
                    <ExternalLink className="h-4 w-4 ml-1" />
                  </Button>
                  <p className="text-[11px] text-muted-foreground/70 text-center">
                    Falls der Button nicht funktioniert:{' '}
                    <a
                      href={appointment.video_call_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground transition-colors"
                    >
                      Direktlink öffnen
                    </a>
                  </p>
                </div>
              )}

              {/* No link yet */}
              {!appointment.video_call_link && (
                <div className="rounded-lg border border-border bg-muted/10 px-5 py-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-foreground font-medium">
                      Dein Gespräch ist bestätigt.
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Der Zugangslink wird gerade vorbereitet und hier in Kürze angezeigt.
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-2">
                      Bei Rückfragen wende dich bitte an deinen Ansprechpartner.
                    </p>
                  </div>
                </div>
              )}

              {/* Calendar export */}
              {calEvent && (
                <div className="border-t border-border pt-4">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                    Zum Kalender hinzufügen
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => window.open(googleCalendarUrl(calEvent), '_blank')}>
                      <CalendarPlus className="h-3.5 w-3.5" /> Google
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => window.open(outlookCalendarUrl(calEvent), '_blank')}>
                      <ExternalLink className="h-3.5 w-3.5" /> Outlook
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => downloadICS(calEvent)}>
                      <Download className="h-3.5 w-3.5" /> .ics
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Preparation tips */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">So bereitest du dich vor</p>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                Sei pünktlich – am besten ein paar Minuten vorher bereit
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                Suche dir einen ruhigen Ort ohne Ablenkung
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                Halte dir 20–30 Minuten frei
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                Sei offen und klar in deinen Antworten
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* ── STATE E: Completed ── */}
      {state === 'completed' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-8 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {firstName ? `${firstName}, dein Strategiegespräch hat bereits stattgefunden` : 'Dein Strategiegespräch hat bereits stattgefunden'}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                Wir prüfen aktuell deinen nächsten Schritt. Du wirst benachrichtigt, sobald es weitergeht.
              </p>
            </div>
          </div>
          {/* ── BOOK — SECONDARY (Follow-up after call) ── */}
          <div className="rounded-xl border border-border bg-card/50 px-5 py-4">
            <div className="flex items-start gap-3">
              <BookOpen className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Empfehlung: Lies weiter</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Nutze die Wartezeit und vertiefe die wichtigsten Prinzipien für deinen Einstieg.
                </p>
                <a
                  href="/books/THE_SALES_SYSTEM.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent transition-colors hover:text-accent/80"
                >
                  Buch ansehen
                  <ExternalLink className="h-3 w-3 opacity-50" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BELOW: Book, Karriereweg, Earn, Mission — always visible ── */}

      {/* ── BOOK PLACEMENT — PRIMARY ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15 }}
        className="mt-12"
      >
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
          Optimale Vorbereitung
        </p>
        <p className="mt-3 font-serif text-lg leading-relaxed text-foreground">
          Bereite dich optimal vor
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground max-w-lg">
          Wenn du das Gespräch maximal für dich nutzen willst, lies dir vorab die wichtigsten Prinzipien durch.
        </p>
        <a
          href="/books/THE_SALES_SYSTEM.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent transition-colors hover:text-accent/80"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Buch ansehen
          <ExternalLink className="h-3 w-3 opacity-50" />
        </a>
        <p className="mt-1.5 text-[10px] text-muted-foreground/50">
          Kostenlos · optional · kein Pflichtmaterial
        </p>
      </motion.section>

      {/* ── 4. KARRIEREWEG ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="mt-12"
      >
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
          Dein Karriereweg
        </p>
        <p className="mt-3 font-serif text-lg leading-relaxed text-foreground">
          Du stehst am Anfang eines strukturierten Weges — mit echtem Training, Zertifizierung und Vermittlung.
        </p>
        <Link
          to="/members/path"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-colors hover:text-accent/80"
        >
          Karriereweg ansehen
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </motion.section>

      {/* ── 5. EARN WHILE LEARN ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="mt-12"
      >
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
          Erste Einnahmen
        </p>
        <p className="mt-3 font-serif text-lg leading-relaxed text-foreground">
          Du kannst bereits in den ersten Wochen mit echten Leads arbeiten und Einnahmen erzielen — parallel zu deiner Entwicklung.
        </p>
        <div className="mt-6 rounded-xl border border-border bg-card/50 px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">Wie Einkommen entsteht</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Dein Einkommen entsteht nicht durch Theorie — sondern durch echte Gespräche und Ergebnisse.
            Je besser deine Gespräche, desto höher dein Einkommen.
          </p>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border bg-card/30 px-3 py-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground">Setter</p>
            <p className="mt-1 text-xs font-medium text-foreground">Erste Einnahmen</p>
          </div>
          <div className="rounded-lg border border-accent/20 bg-accent/[0.03] px-3 py-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground">Jr. Closer</p>
            <p className="mt-1 text-xs font-medium text-foreground">3k–8k€</p>
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/[0.03] px-3 py-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground">Sr. Closer</p>
            <p className="mt-1 text-xs font-medium text-foreground">6k–12k€+</p>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground/60 text-center">pro Monat möglich</p>
      </motion.section>

      {/* ── 6. MISSION (dezent) ── */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        className="mt-14 mb-8 text-center"
      >
        <div className="mx-auto h-px w-12 bg-border mb-8" />
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground/60">
          Unsere Mission
        </p>
        <p className="mt-4 font-serif text-base leading-relaxed text-muted-foreground max-w-md mx-auto">
          Wir formen Menschen, die Verantwortung übernehmen — für ihr Leben, ihr Einkommen und ihren Einfluss.
        </p>
        <p className="mt-4 text-xs text-muted-foreground/50">
          Das ist kein Kurs. Das ist ein Weg.
        </p>
      </motion.section>
    </div>
  );
}
