import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { X, User, Phone, Mail, Calendar, Clock, ArrowRight, FileText, History, MailCheck, MailWarning, MailX } from 'lucide-react';
import { cn, formatK } from '@/lib/utils';

export interface LeadRecord {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string;
  stage: string;
  lead_level: string;
  created_at: string;
  updated_at: string;
  setter_id: string | null;
  closer_id: string | null;
  owner_id: string | null;
  setter_notes: string | null;
  closer_notes: string | null;
  appointment_date: string | null;
  deal_value: number | null;
  contact_count: number;
  first_action_at: string | null;
  last_action_at: string | null;
  qualification_checklist: Record<string, boolean> | null;
  quiz_score: number | null;
  quiz_result: string | null;
  quiz_attempt_count?: number | null;
  last_quiz_completed_at?: string | null;
  qualification_bucket?: string | null;
  timer_expires_at: string | null;
}

interface HistoryEntry {
  id: string;
  previous_stage: string;
  new_stage: string;
  changed_by: string;
  created_at: string;
  reason: string | null;
}

interface ProfileMap {
  [id: string]: string;
}

const STAGE_LABELS: Record<string, string> = {
  new: 'Neu',
  backlog: 'Backlog',
  recycled: 'Recycelt',
  assigned_setter: 'Setter zugewiesen',
  setter_attempting: 'Kontakt versucht',
  booked: 'Termin gebucht (neu)',
  setter_no_response: 'Keine Antwort',
  setter_qualified: 'Qualifiziert',
  setter_booked: 'Closer Call gebucht',
  ready_for_closer: 'Bereit für Closer',
  assigned_closer: 'Closer zugewiesen',
  closer_in_progress: 'In Bearbeitung',
  offer_made: 'Angebot gemacht',
  follow_up: 'Follow-Up',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
  no_show: 'No Show',
  disqualified: 'Disqualifiziert',
};

const LEVEL_STYLES: Record<string, string> = {
  L0: 'bg-muted text-muted-foreground',
  L1: 'bg-primary/15 text-primary border-primary/30',
};

interface Props {
  lead: LeadRecord;
  onClose: () => void;
  profiles?: ProfileMap;
}

interface QuizSubmission {
  final_segment: string;
  commitment_level: string | null;
  primary_pain: string | null;
  desired_outcome: string | null;
  quiz_score: number | null;
  funnel_source: string;
  answers_json: any[];
}

const SEGMENT_LABELS: Record<string, string> = {
  lifestyle: '🟡 Lifestyle',
  income: '🔴 Income',
  identity: '🟣 Identity',
};

const COMMITMENT_LABELS: Record<string, string> = {
  lifestyle: 'Schaut erstmal',
  income: 'Prüft ernsthaft',
  identity: 'Handelt direkt',
};

interface EmailDelivery {
  delivery_status: string | null;
  delivery_resolved_at: string | null;
  last_template_name: string | null;
  last_error_message: string | null;
  last_event_at: string | null;
}

export default function LeadDetailDrawer({ lead, onClose, profiles = {} }: Props) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [quizData, setQuizData] = useState<QuizSubmission | null>(null);
  const [emailDelivery, setEmailDelivery] = useState<EmailDelivery | null>(null);

  useEffect(() => {
    supabase
      .from('lead_transitions')
      .select('id, previous_stage, new_stage, changed_by, created_at, reason')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setHistory((data as HistoryEntry[]) ?? []);
        setLoadingHistory(false);
      });

    // Fetch linked quiz submission
    supabase
      .from('quiz_submissions')
      .select('final_segment, commitment_level, primary_pain, desired_outcome, quiz_score, funnel_source, answers_json')
      .eq('lead_id', lead.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setQuizData(data as any);
      });

    // Fetch latest email delivery status for this lead
    supabase
      .from('v_lead_email_delivery_status' as never)
      .select('delivery_status, delivery_resolved_at, last_template_name, last_error_message, last_event_at')
      .eq('lead_id', lead.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setEmailDelivery(data as EmailDelivery);
      });
  }, [lead.id]);

  const profileName = (id: string | null) => {
    if (!id) return '—';
    return profiles[id] || id.slice(0, 8) + '…';
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative h-full w-full max-w-lg overflow-y-auto bg-card shadow-2xl border-l border-border/30"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/30 bg-card px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">{lead.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge className={cn('text-[9px] font-semibold', LEVEL_STYLES[lead.lead_level] || LEVEL_STYLES.L0)}>
                  {lead.lead_level}
                </Badge>
                <Badge variant="outline" className="text-[9px]">
                  {STAGE_LABELS[lead.stage] || lead.stage}
                </Badge>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Tabs defaultValue="overview" className="px-5 py-4">
          {/* Quiz + Qualifikation tabs hidden to prevent cherry-picking by setters/closers.
              Backend tracking unchanged. Re-add the triggers later without changing data model. */}
          <TabsList className="mb-4 w-full grid grid-cols-3 h-8">
            <TabsTrigger value="overview" className="text-[10px]">Übersicht</TabsTrigger>
            <TabsTrigger value="notes" className="text-[10px]">Notizen</TabsTrigger>
            <TabsTrigger value="history" className="text-[10px]">Verlauf</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="space-y-4">
            <Section title="Kontakt">
              <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Name" value={lead.name} />
              {lead.email && <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label="E-Mail" value={lead.email} />}
              {lead.email && (
                <InfoRow
                  icon={<EmailDeliveryIcon status={emailDelivery?.delivery_status ?? null} />}
                  label="E-Mail Status"
                  value={<EmailDeliveryBadge delivery={emailDelivery} />}
                />
              )}
              {lead.phone && <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Telefon" value={lead.phone} />}
              <InfoRow icon={<FileText className="h-3.5 w-3.5" />} label="Quelle" value={lead.source} />
              <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="Erstellt" value={new Date(lead.created_at).toLocaleDateString('de-DE')} />
            </Section>

            <Section title="Pipeline">
              <InfoRow label="Level" value={
                <Badge className={cn('text-[9px]', LEVEL_STYLES[lead.lead_level] || LEVEL_STYLES.L0)}>
                  {lead.lead_level === 'L0' ? 'L0 · Applicant' : 'L1 · Customer'}
                </Badge>
              } />
              <InfoRow label="Status" value={STAGE_LABELS[lead.stage] || lead.stage} />
              <InfoRow label="Deal Value" value={lead.deal_value ? formatK(Number(lead.deal_value), '€') : '—'} />
            </Section>

            <Section title="Zuweisung">
              <InfoRow label="Setter" value={profileName(lead.setter_id)} />
              <InfoRow label="Closer" value={profileName(lead.closer_id)} />
              <InfoRow label="Owner" value={profileName(lead.owner_id)} />
            </Section>

            {/* Quiz / qualification section intentionally hidden in the lead drawer
                to prevent cherry-picking by setters/closers. Backend tracking unchanged.
                Re-introduce later by restoring this Section without changing the data model. */}

            <Section title="Termine">
              <InfoRow label="Termin gebucht" value={lead.appointment_date ? new Date(lead.appointment_date).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : 'Nein'} />
              <InfoRow label="Kontaktversuche" value={String(lead.contact_count)} />
            </Section>
          </TabsContent>

          {/* Quiz Data */}
          <TabsContent value="quiz" className="space-y-4">
            {quizData ? (
              <>
                <Section title="Segment & Funnel">
                  <InfoRow label="Segment" value={
                    <Badge className="text-[9px] font-semibold">
                      {SEGMENT_LABELS[quizData.final_segment] || quizData.final_segment}
                    </Badge>
                  } />
                  <InfoRow label="Funnel" value={quizData.funnel_source} />
                  <InfoRow label="Score" value={quizData.quiz_score ? `${quizData.quiz_score}/100` : '—'} />
                </Section>
                <Section title="Psychologisches Profil">
                  <InfoRow label="Commitment" value={
                    quizData.commitment_level
                      ? COMMITMENT_LABELS[quizData.commitment_level] || quizData.commitment_level
                      : '—'
                  } />
                  <InfoRow label="Primärer Pain" value={quizData.primary_pain || '—'} />
                  <InfoRow label="Desired Outcome" value={quizData.desired_outcome || '—'} />
                </Section>
                {quizData.answers_json && quizData.answers_json.length > 0 && (
                  <Section title="Antworten">
                    {(quizData.answers_json as any[]).map((a: any, i: number) => (
                      <InfoRow key={i} label={a.question_id || `Frage ${i + 1}`} value={a.answer} />
                    ))}
                  </Section>
                )}
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">Keine Quiz-Daten vorhanden.</p>
            )}
          </TabsContent>

          {/* Qualification */}
          <TabsContent value="qualification" className="space-y-3">
            <Section title="Qualifikations-Checkliste">
              {lead.qualification_checklist && Object.keys(lead.qualification_checklist).length > 0 ? (
                Object.entries(lead.qualification_checklist).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2 rounded-lg border border-border/30 p-2.5">
                    <div className={cn('h-2 w-2 rounded-full', val ? 'bg-primary' : 'bg-muted-foreground/30')} />
                    <span className="text-[11px] text-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                  </div>
                ))
              ) : (
                <p className="text-[11px] text-muted-foreground">Keine Qualifikationsdaten vorhanden.</p>
              )}
            </Section>
          </TabsContent>

          {/* Notes */}
          <TabsContent value="notes" className="space-y-4">
            <Section title="Setter Notizen">
              <p className="text-[11px] text-foreground/80 whitespace-pre-wrap">
                {lead.setter_notes || 'Keine Notizen.'}
              </p>
            </Section>
            <Section title="Closer Notizen">
              <p className="text-[11px] text-foreground/80 whitespace-pre-wrap">
                {lead.closer_notes || 'Keine Notizen.'}
              </p>
            </Section>
          </TabsContent>

          {/* History */}
          <TabsContent value="history" className="space-y-2">
            {loadingHistory ? (
              <p className="text-[11px] text-muted-foreground">Lade Verlauf…</p>
            ) : history.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Kein Verlauf vorhanden.</p>
            ) : (
              <div className="space-y-2">
                {history.map(entry => (
                  <div key={entry.id} className="flex items-start gap-3 rounded-lg border border-border/30 p-3">
                    <History className="mt-0.5 h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-muted-foreground">{STAGE_LABELS[entry.previous_stage] || entry.previous_stage}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
                        <span className="font-medium text-foreground">{STAGE_LABELS[entry.new_stage] || entry.new_stage}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[9px] text-muted-foreground">
                        <span>{new Date(entry.created_at).toLocaleString('de-DE')}</span>
                        <span>· {profileName(entry.changed_by)}</span>
                      </div>
                      {entry.reason && <p className="mt-1 text-[10px] text-muted-foreground">{entry.reason}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/20 px-3 py-2">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <span className="text-[11px] font-medium text-foreground">{value}</span>
    </div>
  );
}

// Maps the raw delivery_status from email_send_log to a human label, tone,
// and tooltip. Status values come from email_send_log.final_delivery_status
// (suppression webhook outcome) falling back to .status (last send attempt).
const DELIVERY_META: Record<string, { label: string; className: string; tone: 'ok' | 'warn' | 'fail' | 'idle' }> = {
  delivered:    { label: 'Zugestellt',     className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30', tone: 'ok' },
  sent:         { label: 'Gesendet',       className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30', tone: 'ok' },
  pending:      { label: 'In Warteschlange', className: 'bg-muted text-muted-foreground border-border', tone: 'idle' },
  bounced:      { label: 'Bounced',        className: 'bg-destructive/15 text-destructive border-destructive/30', tone: 'fail' },
  complained:   { label: 'Spam gemeldet',  className: 'bg-destructive/15 text-destructive border-destructive/30', tone: 'fail' },
  unsubscribed: { label: 'Abgemeldet',     className: 'bg-amber-500/15 text-amber-600 border-amber-500/30', tone: 'warn' },
  suppressed:   { label: 'Blockiert',      className: 'bg-amber-500/15 text-amber-600 border-amber-500/30', tone: 'warn' },
  failed:       { label: 'Fehlgeschlagen', className: 'bg-destructive/15 text-destructive border-destructive/30', tone: 'fail' },
  dlq:          { label: 'Dauerhaft fehlgeschlagen', className: 'bg-destructive/15 text-destructive border-destructive/30', tone: 'fail' },
};

function EmailDeliveryIcon({ status }: { status: string | null }) {
  const meta = status ? DELIVERY_META[status] : null;
  if (!meta || meta.tone === 'idle') return <Mail className="h-3.5 w-3.5" />;
  if (meta.tone === 'ok') return <MailCheck className="h-3.5 w-3.5 text-emerald-600" />;
  if (meta.tone === 'warn') return <MailWarning className="h-3.5 w-3.5 text-amber-600" />;
  return <MailX className="h-3.5 w-3.5 text-destructive" />;
}

function EmailDeliveryBadge({ delivery }: { delivery: { delivery_status: string | null; delivery_resolved_at: string | null; last_template_name: string | null; last_error_message: string | null; last_event_at: string | null } | null }) {
  if (!delivery || !delivery.delivery_status) {
    return <span className="text-muted-foreground">Keine Mail gesendet</span>;
  }
  const meta = DELIVERY_META[delivery.delivery_status] ?? {
    label: delivery.delivery_status,
    className: 'bg-muted text-muted-foreground border-border',
    tone: 'idle' as const,
  };
  const when = delivery.delivery_resolved_at ?? delivery.last_event_at;
  const tooltip = [
    delivery.last_template_name && `Template: ${delivery.last_template_name}`,
    when && `Zuletzt: ${new Date(when).toLocaleString('de-DE')}`,
    delivery.last_error_message && `Fehler: ${delivery.last_error_message}`,
  ].filter(Boolean).join(' • ');
  return (
    <Badge
      variant="outline"
      className={cn('text-[9px] font-semibold', meta.className)}
      title={tooltip || undefined}
    >
      {meta.label}
    </Badge>
  );
}
