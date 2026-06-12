/**
 * Lead Detail Panel — Full Conversion Control Center for a single lead.
 * Shows all 6 sections: Identity, Quiz, Appointments, Calls/Sales, Payments/Commissions, Notes.
 *
 * Uses single RPC `get_full_lead_context` — no fragmented client queries.
 *
 * Canon: Layer 47 · Revenue Engine · Visualization
 */
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  Loader2, Phone, Calendar, User, Clock,
  CheckCircle2, XCircle, AlertTriangle, MessageSquare, ArrowRight,
  Coins, FileText, ExternalLink, Copy, Video,
  Banknote, Star, Send, Share2, CalendarDays, RefreshCw, FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/LanguageContext";

import { useToast } from "@/hooks/use-toast";
import { createTrackedMeetingUrl, simulateMeetingLinkOpen, validateMeetingLink } from "@/lib/meeting-link-tracking";
import type { SimulationResult } from "@/lib/meeting-link-tracking";
import { CreateAppointmentModal } from "@/components/calendar/CreateAppointmentModal";
import { useAuth } from "@/hooks/useAuth";

// ─── Formatting ──────────────────────────────────────
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("de-DE") : "—";
const fmtDateTime = (d: string | null) => d ? new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtEur = (cents: number | null) => cents != null ? `€${(cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 })}` : "—";
const fmtEurRaw = (v: number | null) => v != null ? `€${Math.round(v).toLocaleString("de-DE")}` : "—";

// ─── Types ──────────────────────────────────────────
interface FullLeadContext {
  error?: string;
  identity: {
    id: string; name: string; email: string; phone: string;
    source: string; source_funnel: string | null; funnel_id: string | null;
    stage: string; lead_status: string | null; lead_level: string | null;
    created_at: string; updated_at: string;
    owner_name: string | null; owner_id: string | null;
    setter_name: string | null; setter_id: string | null;
    closer_name: string | null; closer_id: string | null;
    unit_id: string | null; unit_name: string | null;
    referrer_user_id: string | null;
    priority_flag: boolean; has_booking: boolean; booking_status: string | null;
  };
  quiz: {
    quiz_score: number | null; quiz_result: string | null; quiz_funnel_source: string | null;
    quiz_answers: any; lead_score: number | null; lead_quality: string | null; scored_at: string | null;
    qualification_score: number | null; qualification_bucket: string | null; qualification_path: string | null;
    setter_budget_readiness: string | null; setter_decision_readiness: string | null;
    setter_problem_clarity: string | null; setter_recommendation: string | null;
    setter_qualification_score: number | null;
  };
  appointments: Array<{
    id: string; starts_at: string; ends_at: string | null; appointment_status: string;
    call_type: string | null; attendance_flag: boolean | null; late_flag: boolean | null;
    outcome: string | null; qualification_result: string | null;
    setter_id: string | null; closer_id: string | null; assigned_operator_id: string | null;
    current_owner_id: string | null; current_owner_role: string | null;
    setter_name: string | null; closer_name: string | null;
    video_call_link: string | null; booking_source: string | null;
    meeting_id: string | null; lead_id: string | null;
    pricing_tier: string | null; priority_price: number | null;
    rescheduled_from_id: string | null; rescheduled_to_id: string | null; rescheduled_at: string | null;
    no_show_detected_at: string | null; call_started_at: string | null; completed_at: string | null;
    setter_notes: string | null; created_at: string;
  }>;
  calls: Array<{
    id: string; created_at: string; result: string | null;
    objection_type: string | null; revenue: number | null; deal_size: number | null;
    duration: number | null; user_id: string | null; closer_name: string | null;
    payment_link_id: string | null; appointment_id: string | null;
    call_type: string | null; status: string | null;
  }>;
  payments: Array<{
    id: string; amount: number | null; currency: string | null; status: string;
    deal_type: string | null; payment_type: string | null; offer_title: string | null;
    payment_url: string | null; created_at: string; sent_at: string | null;
    opened_at: string | null; paid_at: string | null; expires_at: string | null;
    refunded_at: string | null; closer_id: string | null; closer_name: string | null;
    net_amount: number | null; stripe_fee: number | null;
  }>;
  commissions: Array<{
    id: string; user_id: string; user_name: string | null; role: string;
    amount: number; source_type: string | null; payout_status: string | null;
    created_at: string; eligible_at: string | null; paid_at: string | null;
  }>;
  touchpoints: Array<{
    id: string; event_key: string; channel: string | null;
    template_key: string | null; status: string | null;
    dispatched_at: string | null; outcome: string | null; fallback_used: boolean | null;
  }>;
  revenue: {
    outcome: string | null; close_reason: string | null; deal_value: number | null;
    payment_status: string | null; closed_at: string | null; follow_up_date: string | null;
  };
  notes: {
    setter_notes: string | null; closer_notes: string | null;
    setter_call_outcome: string | null; setter_recommendation: string | null;
  };
}

// ─── Reusable Components ──────────────────────────────
function Section({ title, icon: Icon, children, count }: {
  title: string; icon: typeof User; children: React.ReactNode; count?: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon size={13} />
        <span>{title}</span>
        {count !== undefined && (
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{count}</Badge>
        )}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (value == null || value === "" || value === "—" || value === false) return null;
  return (
    <div className="flex items-start justify-between text-sm py-1.5 border-b border-border/30 last:border-0">
      <span className="text-muted-foreground text-xs shrink-0">{label}</span>
      <span className={cn("text-right font-medium text-xs max-w-[65%] break-words", mono && "font-mono text-[10px]")}>
        {value === true ? "✓" : value}
      </span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center">
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function StatusBadge({ status, className }: { status: string | null; className?: string }) {
  if (!status) return null;
  const styles: Record<string, string> = {
    showed: "bg-emerald-100 text-emerald-800",
    completed: "bg-emerald-100 text-emerald-800",
    paid: "bg-emerald-100 text-emerald-800",
    won: "bg-emerald-100 text-emerald-800",
    closed: "bg-emerald-100 text-emerald-800",
    eligible: "bg-blue-100 text-blue-800",
    pending: "bg-amber-100 text-amber-800",
    sent: "bg-blue-100 text-blue-800",
    opened: "bg-blue-100 text-blue-800",
    no_show: "bg-red-100 text-red-800",
    cancelled: "bg-red-100 text-red-800",
    expired: "bg-red-100 text-red-800",
    lost: "bg-red-100 text-red-800",
    refunded: "bg-red-100 text-red-800",
    reversed: "bg-red-100 text-red-800",
    rescheduled: "bg-amber-100 text-amber-800",
  };
  return (
    <Badge className={cn("text-[10px]", styles[status] || "bg-muted/30 text-muted-foreground", className)}>
      {status}
    </Badge>
  );
}

// ─── Main Component ──────────────────────────────────
export default function LeadDetailPanel({ leadId }: { leadId: string }) {
  const { lang } = useLanguage();
  const t = (de: string, en: string) => lang === "de" ? de : en;
  const { toast } = useToast();
  const { profile, isAdmin } = useAuth();
  // Mirrors CreateAppointmentModal pool-mode permission: current_phase >= 3 or admin
  const callerLevel = (profile as any)?.current_phase ?? 0;
  const canSchedule = isAdmin || callerLevel >= 3;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FullLeadContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: result, error: rpcErr } = await supabase.rpc("get_full_lead_context" as any, { p_lead_id: leadId });
        if (rpcErr) throw rpcErr;
        const ctx = result as unknown as FullLeadContext;
        if (ctx?.error === "not_found") {
          setError(t("Lead nicht gefunden.", "Lead not found."));
          return;
        }
        if (ctx?.error === "forbidden") {
          setError(t("Kein Zugriff auf diesen Lead.", "No access to this lead."));
          return;
        }
        setData(ctx);
      } catch (e: any) {
        console.error("[LeadDetailPanel] load failed", e);
        setError(e?.message || t("Fehler beim Laden.", "Error loading."));
      } finally {
        setLoading(false);
      }
    })();
  }, [leadId, reloadKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="text-sm text-muted-foreground text-center max-w-xs">{error || t("Lead nicht gefunden.", "Lead not found.")}</p>
      </div>
    );
  }

  const { identity: id, quiz, appointments, calls, payments, commissions, touchpoints, revenue, notes } = data;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t("Kopiert", "Copied"), duration: 1500 });
  };

  const now = new Date();
  const CANCELLED_STATUSES = new Set(["cancelled", "canceled", "no_show", "rescheduled"]);
  const futureAppts = appointments.filter(a =>
    new Date(a.starts_at) > now && !CANCELLED_STATUSES.has((a.appointment_status || "").toLowerCase())
  );
  const pastAppts = appointments.filter(a => new Date(a.starts_at) <= now);
  const hasActiveAppointment = futureAppts.length > 0;
  const canBook = !!(id.email || id.phone) && !!id.name;

  return (
    <div className="space-y-6 pb-8">
      {/* ─── A. IDENTITY / BASISDATEN ─── */}
      <Section title={t("Basisdaten", "Lead Info")} icon={User}>
        <div className="rounded-xl border bg-card p-4 space-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-lg font-serif font-medium">{id.name || "—"}</div>
            <div className="flex gap-1">
              {id.priority_flag && <Badge className="bg-amber-500/15 text-amber-700 text-[9px]">Priority</Badge>}
              <StatusBadge status={id.stage} />
            </div>
          </div>
          <InfoRow label="E-Mail" value={id.email ? (
            <span className="flex items-center gap-1">
              {id.email}
              <button onClick={() => copyToClipboard(id.email)} className="opacity-50 hover:opacity-100"><Copy size={10} /></button>
            </span>
          ) : null} />
          <InfoRow label={t("Telefon", "Phone")} value={id.phone ? (
            <span className="flex items-center gap-1">
              {id.phone}
              <button onClick={() => copyToClipboard(id.phone)} className="opacity-50 hover:opacity-100"><Copy size={10} /></button>
            </span>
          ) : null} />
          <InfoRow label="Lead ID" value={id.id?.slice(0, 8)} mono />
          <InfoRow label="Source" value={id.source} />
          <InfoRow label="Funnel" value={id.source_funnel || id.funnel_id} />
          <InfoRow label="Level" value={id.lead_level} />
          <InfoRow label="Status" value={id.lead_status} />
          <InfoRow label={t("Erstellt", "Created")} value={fmtDateTime(id.created_at)} />
          <InfoRow label="Owner" value={id.owner_name} />
          <InfoRow label="Setter" value={id.setter_name} />
          <InfoRow label="Closer" value={id.closer_name} />
          <InfoRow label="Unit" value={id.unit_name} />
          <InfoRow label="Booking" value={id.booking_status || (id.has_booking ? "yes" : null)} />
          <InfoRow label="Referrer" value={id.referrer_user_id?.slice(0, 8)} mono />
        </div>
      </Section>

      {/* ─── B. QUIZ / QUALIFIKATION ─── */}
      <Section title={t("Quiz & Qualifikation", "Quiz & Qualification")} icon={Star}>
        {(quiz.quiz_score != null || quiz.lead_score != null || quiz.qualification_score != null) ? (
          <div className="rounded-xl border bg-card p-4 space-y-0.5">
            <InfoRow label="Quiz Score" value={quiz.quiz_score} />
            <InfoRow label="Quiz Result" value={quiz.quiz_result} />
            <InfoRow label="Lead Score" value={quiz.lead_score} />
            <InfoRow label={t("Qualität", "Quality")} value={quiz.lead_quality} />
            <InfoRow label={t("Qualifikation Score", "Qualification Score")} value={quiz.qualification_score} />
            <InfoRow label="Bucket" value={quiz.qualification_bucket} />
            <InfoRow label="Path" value={quiz.qualification_path} />
            <InfoRow label={t("Budget", "Budget")} value={quiz.setter_budget_readiness} />
            <InfoRow label={t("Entscheidung", "Decision")} value={quiz.setter_decision_readiness} />
            <InfoRow label={t("Problem-Klarheit", "Problem Clarity")} value={quiz.setter_problem_clarity} />
            <InfoRow label={t("Setter Score", "Setter Score")} value={quiz.setter_qualification_score} />
            <InfoRow label={t("Empfehlung", "Recommendation")} value={quiz.setter_recommendation} />
            {quiz.quiz_answers && (
              <details className="mt-2">
                <summary className="text-[10px] text-muted-foreground cursor-pointer">{t("Quiz-Antworten anzeigen", "Show quiz answers")}</summary>
                <pre className="mt-1 text-[9px] bg-muted/30 rounded p-2 overflow-x-auto max-h-40">
                  {JSON.stringify(quiz.quiz_answers, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ) : (
          <EmptyState message={t("Kein Quiz ausgefüllt.", "No quiz completed.")} />
        )}
      </Section>

      {/* ─── C. TERMINE ─── */}
      <Section title={t("Termine", "Appointments")} icon={Calendar} count={appointments.length}>
        {appointments.length === 0 ? (
          <EmptyState message={t("Keine Termine vorhanden.", "No appointments.")} />
        ) : (
          <div className="space-y-2">
            {futureAppts.length > 0 && (
              <div className="text-[10px] font-semibold uppercase text-muted-foreground">{t("Anstehend", "Upcoming")}</div>
            )}
            {futureAppts.map(a => <AppointmentCard key={a.id} a={a} t={t} leadPhone={data.identity.phone} leadEmail={data.identity.email} leadName={data.identity.name} />)}
            {pastAppts.length > 0 && (
              <div className="text-[10px] font-semibold uppercase text-muted-foreground mt-3">{t("Vergangen", "Past")}</div>
            )}
            {pastAppts.map(a => <AppointmentCard key={a.id} a={a} t={t} leadPhone={data.identity.phone} leadEmail={data.identity.email} leadName={data.identity.name} />)}
          </div>
        )}

        {/* "Termin vereinbaren" CTA — visible only when there's no active future appointment */}
        {!hasActiveAppointment && canSchedule && (
          <div className="mt-3 rounded-xl border border-dashed bg-muted/20 p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
            <div className="text-xs text-muted-foreground">
              {canBook
                ? t("Dieser Lead hat keinen aktiven Termin.", "This lead has no active appointment.")
                : t("Name & E-Mail oder Telefon fehlen, um zu terminieren.", "Name & email or phone are missing to book.")}
            </div>
            <Button
              size="sm"
              onClick={() => setBookingOpen(true)}
              disabled={!canBook}
              title={!canBook ? t("Pflichtdaten fehlen", "Required data missing") : undefined}
              className="gap-1.5"
            >
              <CalendarDays size={14} />
              {t("Termin vereinbaren", "Schedule appointment")}
            </Button>
          </div>
        )}
      </Section>

      {canSchedule && (
        <CreateAppointmentModal
          open={bookingOpen}
          onOpenChange={setBookingOpen}
          defaultLeadId={leadId}
          onCreated={() => {
            setBookingOpen(false);
            setReloadKey(k => k + 1);
          }}
        />
      )}


      {/* ─── D. TOUCHPOINTS / KOMMUNIKATION ─── */}
      <Section title={t("Kommunikation", "Communication")} icon={MessageSquare} count={touchpoints.length}>
        {touchpoints.length === 0 ? (
          <EmptyState message={t("Keine Nachrichten versendet.", "No messages sent.")} />
        ) : (
          <div className="space-y-1.5">
            {touchpoints.map(tp => (
              <div key={tp.id} className="rounded-lg border bg-card px-3 py-2 text-xs flex items-center gap-2">
                <Badge variant="outline" className="text-[9px] shrink-0">{tp.channel || "—"}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{tp.event_key}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {tp.template_key || "—"} · {fmtDateTime(tp.dispatched_at)}
                  </div>
                </div>
                <StatusBadge status={tp.status} />
                {tp.outcome && <StatusBadge status={tp.outcome} />}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ─── E. SALES / CALLS ─── */}
      <Section title={t("Calls & Closing", "Calls & Closing")} icon={Phone} count={calls.length}>
        {/* Revenue Summary */}
        <div className="rounded-xl border bg-card p-4 space-y-0.5">
          <InfoRow label="Outcome" value={revenue.outcome} />
          <InfoRow label={t("Grund", "Reason")} value={revenue.close_reason} />
          <InfoRow label="Deal Value" value={revenue.deal_value != null ? fmtEurRaw(revenue.deal_value) : null} />
          <InfoRow label={t("Zahlungsstatus", "Payment Status")} value={revenue.payment_status} />
          <InfoRow label={t("Abgeschlossen", "Closed at")} value={fmtDate(revenue.closed_at)} />
          <InfoRow label="Follow-up" value={fmtDate(revenue.follow_up_date)} />
        </div>

        {calls.length === 0 ? (
          <EmptyState message={t("Keine Calls vorhanden.", "No calls.")} />
        ) : (
          <div className="space-y-2 mt-2">
            {calls.map(c => (
              <div key={c.id} className="rounded-lg border bg-card p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{fmtDateTime(c.created_at)}</span>
                  <StatusBadge status={c.result} />
                </div>
                <div className="flex items-center gap-3 text-muted-foreground flex-wrap">
                  {c.closer_name && <span>Closer: {c.closer_name}</span>}
                  {c.objection_type && <span className="text-amber-700">Objection: {c.objection_type}</span>}
                  {(c.revenue ?? 0) > 0 && <span className="font-medium text-accent-foreground">€{Math.round(c.revenue!).toLocaleString("de-DE")}</span>}
                </div>
                {c.duration && (
                  <div className="text-[10px] text-muted-foreground mt-1">{Math.round(c.duration / 60)} min</div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ─── PAYMENTS ─── */}
      <Section title={t("Payment Links", "Payment Links")} icon={Banknote} count={payments.length}>
        {payments.length === 0 ? (
          <EmptyState message={t("Keine Payment Links vorhanden.", "No payment links.")} />
        ) : (
          <div className="space-y-2">
            {payments.map(pl => (
              <div key={pl.id} className="rounded-lg border bg-card p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{pl.offer_title || pl.deal_type || "Payment"}</span>
                  <StatusBadge status={pl.status} />
                </div>
                <div className="flex items-center gap-3 text-muted-foreground flex-wrap">
                  <span className="font-medium text-foreground">{fmtEur(pl.amount)}</span>
                  {pl.payment_type && <span>{pl.payment_type}</span>}
                  {pl.closer_name && <span>Closer: {pl.closer_name}</span>}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                  <span>{t("Erstellt", "Created")}: {fmtDateTime(pl.created_at)}</span>
                  {pl.sent_at && <span>{t("Gesendet", "Sent")}: {fmtDateTime(pl.sent_at)}</span>}
                  {pl.opened_at && <span>{t("Geöffnet", "Opened")}: {fmtDateTime(pl.opened_at)}</span>}
                  {pl.paid_at && <span className="text-emerald-700">{t("Bezahlt", "Paid")}: {fmtDateTime(pl.paid_at)}</span>}
                  {pl.refunded_at && <span className="text-destructive">{t("Erstattet", "Refunded")}: {fmtDateTime(pl.refunded_at)}</span>}
                </div>
                {pl.payment_url && (
                  <a href={pl.payment_url} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-primary flex items-center gap-1 hover:underline">
                    <ExternalLink size={10} /> {t("Link öffnen", "Open link")}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ─── COMMISSIONS ─── */}
      <Section title={t("Provisionen", "Commissions")} icon={Coins} count={commissions.length}>
        {commissions.length === 0 ? (
          <EmptyState message={t("Keine Provisionen vorhanden.", "No commissions.")} />
        ) : (
          <div className="space-y-1.5">
            {commissions.map(cm => (
              <div key={cm.id} className="rounded-lg border bg-card px-3 py-2 text-xs flex items-center justify-between">
                <div>
                  <div className="font-medium">{cm.user_name || cm.user_id?.slice(0, 8)}</div>
                  <div className="text-[10px] text-muted-foreground">{cm.role} · {fmtDate(cm.created_at)}</div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{fmtEur(cm.amount)}</div>
                  <StatusBadge status={cm.payout_status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ─── F. NOTES ─── */}
      <Section title={t("Notizen", "Notes")} icon={FileText}>
        {(!notes.setter_notes && !notes.closer_notes && !notes.setter_call_outcome) ? (
          <EmptyState message={t("Keine Notizen vorhanden.", "No notes.")} />
        ) : (
          <div className="rounded-xl border bg-card p-4 space-y-3">
            {notes.setter_notes && (
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Setter Notes</div>
                <p className="text-xs whitespace-pre-wrap">{notes.setter_notes}</p>
              </div>
            )}
            {notes.closer_notes && (
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Closer Notes</div>
                <p className="text-xs whitespace-pre-wrap">{notes.closer_notes}</p>
              </div>
            )}
            {notes.setter_call_outcome && (
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Setter Call Outcome</div>
                <p className="text-xs">{notes.setter_call_outcome}</p>
              </div>
            )}
            {notes.setter_recommendation && (
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">{t("Empfehlung", "Recommendation")}</div>
                <p className="text-xs">{notes.setter_recommendation}</p>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── Appointment Card Sub-Component ──────────────────
function AppointmentCard({ a, t, leadPhone, leadEmail, leadName }: {
  a: FullLeadContext["appointments"][number];
  t: (de: string, en: string) => string;
  leadPhone?: string | null;
  leadEmail?: string | null;
  leadName?: string | null;
}) {
  const isPast = new Date(a.starts_at) <= new Date();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<SimulationResult | null>(null);
  const [localLink, setLocalLink] = useState<string | null>(null);
  const [clicks, setClicks] = useState<Array<{ id: string; channel: string; clicked_at: string; user_agent: string | null }>>([]);
  const meetingLink = localLink || a.video_call_link || (a.meeting_id ? `https://zoom.us/j/${a.meeting_id}` : null);

  // Fetch click tracking data
  useEffect(() => {
    if (!a.id) return;
    supabase
      .from("meeting_link_clicks")
      .select("id, channel, clicked_at, user_agent")
      .eq("appointment_id", a.id)
      .order("clicked_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setClicks(data as any);
      });
  }, [a.id]);

  const handleRegenerateLink = useCallback(async () => {
    setRegenerating(true);
    try {
      const roomId = crypto.randomUUID();
      const newLink = `${window.location.origin}/call/${roomId}`;

      const { error: updateErr } = await supabase
        .from("appointments")
        .update({ video_call_link: newLink, meeting_id: roomId } as any)
        .eq("id", a.id);
      if (updateErr) throw updateErr;

      setLocalLink(newLink);
      toast({ title: t("Neuer Meeting-Link erstellt", "New meeting link created") });

      // Pre-send validation — block auto-send on hard errors
      const validation = validateMeetingLink(newLink);
      if (!validation.valid) {
        toast({
          title: t("Link erstellt, aber Versand blockiert — Link ungültig", "Link created but send blocked — invalid link"),
          description: validation.errors.join("; "),
          variant: "destructive",
        });
        console.error("[RegenerateLink] send blocked — validation errors:", validation.errors);
        setRegenerating(false);
        return;
      }
      if (validation.warnings.length > 0) {
        console.warn("[RegenerateLink] warnings (sending anyway):", validation.warnings);
      }

      // Auto-send the new link
      if (leadPhone || leadEmail) {
        const startTime = new Intl.DateTimeFormat("de-DE", {
          timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        }).format(new Date(a.starts_at));

        if (leadPhone) {
          const trackedPhone = createTrackedMeetingUrl({ meetingUrl: newLink, appointmentId: a.id, leadId: a.lead_id, channel: 'whatsapp' });
          const bodyPhone = `Hier ist dein neuer Zugangslink für den Termin am ${startTime}:\n\n${trackedPhone}\n\nBitte einige Minuten vorher öffnen.`;
          await supabase.functions.invoke("dispatch-communication", {
            body: {
              event_key: "pre_call_30m", lead_id: a.lead_id,
              recipient_phone: leadPhone,
              payload: { body: bodyPhone, text: bodyPhone, join_link: trackedPhone },
              force: true,
            },
          });
        }
        if (leadEmail) {
          const trackedEmail = createTrackedMeetingUrl({ meetingUrl: newLink, appointmentId: a.id, leadId: a.lead_id, channel: 'email' });
          const bodyEmail = `Hier ist dein neuer Zugangslink für den Termin am ${startTime}:\n\n${trackedEmail}\n\nBitte einige Minuten vorher öffnen.`;
          await supabase.functions.invoke("dispatch-communication", {
            body: {
              event_key: "booking_completed_email", lead_id: a.lead_id,
              recipient_email: leadEmail,
              payload: { body: bodyEmail, text: bodyEmail, join_link: trackedEmail, subject: `Neuer Videocall-Link für den ${startTime}` },
              force: true,
            },
          });
        }
        const channels = [leadPhone && "WhatsApp/SMS", leadEmail && "Email"].filter(Boolean).join(" + ");
        toast({ title: t(`Link erstellt & gesendet via ${channels}`, `Link created & sent via ${channels}`) });
      }
    } catch (e) {
      console.error("[RegenerateLink] failed:", e);
      toast({ title: t("Fehler beim Erstellen des Links", "Error creating link"), variant: "destructive" });
    } finally {
      setRegenerating(false);
    }
  }, [a.id, a.lead_id, a.starts_at, leadPhone, leadEmail, t, toast]);

  const handleCopyLink = useCallback(() => {
    if (!meetingLink) {
      toast({ title: t("Kein gültiger Meeting-Link vorhanden.", "No valid meeting link available."), variant: "destructive" });
      return;
    }
    navigator.clipboard.writeText(meetingLink);
    toast({ title: t("Link kopiert", "Link copied") });
  }, [meetingLink, t, toast]);

  const handleShareLink = useCallback(async () => {
    if (!meetingLink) {
      toast({ title: t("Kein gültiger Meeting-Link vorhanden.", "No valid meeting link available."), variant: "destructive" });
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: t("Videocall-Link", "Video Call Link"), url: meetingLink });
      } catch { /* user cancelled */ }
    } else {
      navigator.clipboard.writeText(meetingLink);
      toast({ title: t("Link kopiert", "Link copied") });
    }
  }, [meetingLink, t, toast]);

  const handleSendLink = useCallback(async () => {
    if (!meetingLink) {
      toast({ title: t("Kein gültiger Meeting-Link vorhanden.", "No valid meeting link available."), variant: "destructive" });
      return;
    }
    // Pre-send validation — block on hard errors
    const validation = validateMeetingLink(meetingLink);
    if (!validation.valid) {
      toast({
        title: t("Meeting-Link ungültig — Versand blockiert", "Meeting link invalid — send blocked"),
        description: validation.errors.join("; "),
        variant: "destructive",
      });
      console.error("[SendLink] blocked — validation errors:", validation.errors);
      return;
    }
    if (validation.warnings.length > 0) {
      console.warn("[SendLink] warnings (sending anyway):", validation.warnings);
    }
    if (!leadPhone && !leadEmail) {
      toast({ title: t("Keine Kontaktdaten vorhanden.", "No contact details available."), variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const startTime = new Intl.DateTimeFormat("de-DE", {
        timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      }).format(new Date(a.starts_at));

      // Send via dispatch-communication (WhatsApp preferred, SMS fallback) with tracked link
      if (leadPhone) {
        const trackedPhone = createTrackedMeetingUrl({ meetingUrl: meetingLink, appointmentId: a.id, leadId: a.lead_id, channel: 'whatsapp' });
        const bodyPhone = `Hier ist dein Zugangslink für den Termin am ${startTime}:\n\n${trackedPhone}\n\nBitte einige Minuten vorher öffnen.`;
        const { error: phoneErr } = await supabase.functions.invoke("dispatch-communication", {
          body: {
            event_key: "pre_call_30m",
            lead_id: a.lead_id,
            recipient_phone: leadPhone,
            payload: { body: bodyPhone, text: bodyPhone, join_link: trackedPhone },
            force: true,
          },
        });
        if (phoneErr) console.error("[SendLink] phone dispatch error:", phoneErr);
      }

      // Also send via email if available
      if (leadEmail) {
        const trackedEmail = createTrackedMeetingUrl({ meetingUrl: meetingLink, appointmentId: a.id, leadId: a.lead_id, channel: 'email' });
        const bodyEmail = `Hier ist dein Zugangslink für den Termin am ${startTime}:\n\n${trackedEmail}\n\nBitte einige Minuten vorher öffnen.`;
        const { error: emailErr } = await supabase.functions.invoke("dispatch-communication", {
          body: {
            event_key: "booking_completed_email",
            lead_id: a.lead_id,
            recipient_email: leadEmail,
            payload: {
              body: bodyEmail,
              text: bodyEmail,
              join_link: trackedEmail,
              subject: `Dein Videocall-Link für den ${startTime}`,
            },
            force: true,
          },
        });
        if (emailErr) console.error("[SendLink] email dispatch error:", emailErr);
      }

      const channels: string[] = [];
      if (leadPhone) channels.push("WhatsApp/SMS");
      if (leadEmail) channels.push("Email");
      toast({ title: t(`Link gesendet via ${channels.join(" + ")}`, `Link sent via ${channels.join(" + ")}`) });
    } catch (e) {
      console.error("[SendLink] failed:", e);
      toast({ title: t("Fehler beim Senden", "Send failed"), variant: "destructive" });
    } finally {
      setSending(false);
    }
  }, [meetingLink, leadPhone, leadEmail, a.starts_at, a.lead_id, t, toast]);

  const handleOpenCalendar = useCallback(() => {
    const start = new Date(a.starts_at);
    const end = a.ends_at ? new Date(a.ends_at) : new Date(start.getTime() + 30 * 60_000);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const title = encodeURIComponent(leadName ? `Call mit ${leadName}` : "Videocall");
    const loc = encodeURIComponent(meetingLink || "");
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&location=${loc}`;
    window.open(url, "_blank");
  }, [a.starts_at, a.ends_at, meetingLink, leadName]);

  const handleTestLink = useCallback(() => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = simulateMeetingLinkOpen({
        meetingUrl: meetingLink,
        appointmentId: a.id,
        leadId: a.lead_id,
        channel: 'manual',
      });

      setTestResult(result);

      // Console output for developers
      console.group('[Meeting-Link Simulation]');
      console.log('Raw URL:', meetingLink);
      console.log('Overall pass:', result.overallPass);
      console.table(result.safariChecks.map(c => ({ check: c.label, passed: c.passed, detail: c.detail })));
      console.table(result.trackingChain.steps.map(s => ({ step: s.step, ok: s.ok, detail: s.detail })));
      if (result.errors.length) console.error('Fehler:', result.errors);
      if (result.warnings.length) console.warn('Warnungen:', result.warnings);
      console.groupEnd();

      toast({
        title: result.overallPass
          ? t('✅ Simulation bestanden', '✅ Simulation passed')
          : t('⚠️ Simulation — Probleme erkannt', '⚠️ Simulation — issues found'),
        description: result.overallPass
          ? t('Safari-kompatibel · Tracking-Kette intakt', 'Safari-compatible · Tracking chain intact')
          : [
              ...result.safariChecks.filter(c => !c.passed).map(c => c.label),
              ...result.trackingChain.steps.filter(s => !s.ok).map(s => s.step),
            ].join(', '),
        variant: result.overallPass ? undefined : 'destructive',
      });
    } catch (e) {
      console.error('[TestLink] error:', e);
      toast({ title: t('Test fehlgeschlagen', 'Test failed'), variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  }, [meetingLink, a.id, a.lead_id, t, toast]);

  return (
    <div className={cn("rounded-lg border bg-card p-3 text-xs space-y-1.5", isPast && "opacity-80")}>
      <div className="flex items-center justify-between">
        <span className="font-medium">{fmtDateTime(a.starts_at)}</span>
        <div className="flex gap-1">
          {a.pricing_tier === "priority" && <Badge className="bg-amber-500/15 text-amber-700 text-[9px]">Priority</Badge>}
          <StatusBadge status={a.appointment_status} />
        </div>
      </div>
      <div className="flex items-center gap-3 text-muted-foreground flex-wrap">
        {a.setter_name && <span className="flex items-center gap-1"><User size={10} /> S: {a.setter_name}</span>}
        {a.closer_name && <span className="flex items-center gap-1"><Phone size={10} /> C: {a.closer_name}</span>}
        {a.call_type && <span>{a.call_type}</span>}
        {a.booking_source && <span>{a.booking_source}</span>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {a.attendance_flag === true && <span className="flex items-center gap-0.5 text-emerald-700"><CheckCircle2 size={11} /> {t("Erschienen", "Showed")}</span>}
        {(a.attendance_flag === false || a.appointment_status === "no_show") && <span className="flex items-center gap-0.5 text-destructive"><XCircle size={11} /> No-Show</span>}
        {a.late_flag && <span className="flex items-center gap-0.5 text-amber-600"><Clock size={11} /> {t("Verspätet", "Late")}</span>}
        {a.no_show_detected_at && <span className="text-[10px] text-destructive">{t("No-Show erkannt", "No-show detected")}: {fmtDateTime(a.no_show_detected_at)}</span>}
      </div>
      {a.rescheduled_from_id && (
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
          <ArrowRight size={10} /> {t("Verschoben von", "Rescheduled from")} {a.rescheduled_from_id.slice(0, 8)}
        </div>
      )}

      {/* ── Video Call Actions ── */}
      {meetingLink ? (
        <div className="space-y-1.5 mt-1.5 pt-1.5 border-t border-border/50">
          <a href={meetingLink} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 text-primary px-2.5 py-1.5 text-[11px] font-medium hover:bg-primary/20 transition-colors">
            <Video size={12} /> {t("Video Call starten", "Start Video Call")}
          </a>
          <div className="flex items-center gap-1 flex-wrap">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={handleCopyLink}>
              <Copy size={10} /> {t("Link kopieren", "Copy link")}
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={handleSendLink} disabled={sending}>
              {sending ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
              {t("Link senden", "Send link")}
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={handleShareLink}>
              <Share2 size={10} /> {t("Teilen", "Share")}
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={handleOpenCalendar}>
              <CalendarDays size={10} /> {t("Kalender", "Calendar")}
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={handleRegenerateLink} disabled={regenerating}>
              {regenerating ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
              {t("Neuer Link", "New link")}
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={handleTestLink} disabled={testing}>
              {testing ? <Loader2 size={10} className="animate-spin" /> : <FlaskConical size={10} />}
              {t("Link testen", "Test link")}
            </Button>
          </div>
          {/* ── Dry-Run Test Result ── */}
          {testResult && (
            <div className={cn(
              "rounded-md border px-2.5 py-2 text-[10px] space-y-1 mt-1",
              testResult.overallPass
                ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800"
                : "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
            )}>
              <div className="flex items-center gap-1.5 font-semibold">
                {testResult.overallPass
                  ? <><CheckCircle2 size={11} className="text-emerald-600" /> {t("Simulation bestanden", "Simulation passed")}</>
                  : <><AlertTriangle size={11} className="text-amber-600" /> {t("Probleme erkannt", "Issues found")}</>}
              </div>
              <div className="font-semibold text-[9px] uppercase tracking-wide text-muted-foreground mt-1">{t("Safari-Kompatibilität", "Safari Compatibility")}</div>
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-muted-foreground">
                {testResult.safariChecks.map((c, i) => (
                  <React.Fragment key={i}>
                    <span>{c.passed ? '✅' : '❌'} {c.label}:</span>
                    <span>{c.detail}</span>
                  </React.Fragment>
                ))}
              </div>
              <div className="font-semibold text-[9px] uppercase tracking-wide text-muted-foreground mt-1">{t("Tracking-Kette", "Tracking Chain")}</div>
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-muted-foreground">
                {testResult.trackingChain.steps.map((s, i) => (
                  <React.Fragment key={i}>
                    <span>{s.ok ? '✅' : '❌'} {s.step}:</span>
                    <span className="truncate">{s.detail}</span>
                  </React.Fragment>
                ))}
              </div>
              {testResult.errors.length > 0 && (
                <div className="text-destructive">{testResult.errors.map((e, i) => <div key={i}>❌ {e}</div>)}</div>
              )}
              {testResult.warnings.length > 0 && (
                <div className="text-amber-700 dark:text-amber-400">{testResult.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}</div>
              )}
              <button onClick={() => setTestResult(null)} className="text-[9px] text-muted-foreground hover:underline mt-0.5">
                {t("Schließen", "Close")}
              </button>
            </div>
          )}
        </div>
      ) : !isPast ? (
        <div className="space-y-1.5 mt-1.5 pt-1.5 border-t border-border/50">
          <div className="text-[10px] text-amber-600 flex items-center gap-1">
            <AlertTriangle size={10} /> {t("Kein Meeting-Link vorhanden.", "No meeting link available.")}
          </div>
          <Button variant="outline" size="sm" className="h-7 px-3 text-[11px] gap-1.5" onClick={handleRegenerateLink} disabled={regenerating}>
            {regenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {t("Link erstellen & senden", "Create & send link")}
          </Button>
        </div>
      ) : null}

      {/* ── Link Click Tracking ── */}
      {clicks.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-border/50">
          <div className="flex items-center gap-1.5 mb-1">
            <ExternalLink size={10} className="text-emerald-600" />
            <span className="text-[10px] font-semibold text-emerald-700">
              {t(`${clicks.length} Link-Klick${clicks.length > 1 ? 's' : ''}`, `${clicks.length} link click${clicks.length > 1 ? 's' : ''}`)}
            </span>
          </div>
          <div className="space-y-0.5">
            {clicks.slice(0, 5).map(click => {
              const isMobile = /mobile|iphone|android/i.test(click.user_agent || '');
              const channelLabel = click.channel === 'whatsapp' ? 'WhatsApp' : click.channel === 'email' ? 'E-Mail' : click.channel === 'sms' ? 'SMS' : click.channel;
              return (
                <div key={click.id} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-4">{channelLabel}</Badge>
                  <span>{fmtDateTime(click.clicked_at)}</span>
                  {isMobile && <span className="text-[8px]">📱</span>}
                </div>
              );
            })}
            {clicks.length > 5 && (
              <span className="text-[9px] text-muted-foreground">+{clicks.length - 5} {t("weitere", "more")}</span>
            )}
          </div>
        </div>
      )}

      {a.setter_notes && (
        <div className="text-[10px] text-muted-foreground bg-muted/20 rounded p-1.5 mt-1 line-clamp-2">{a.setter_notes}</div>
      )}
      {a.outcome && <InfoRow label="Outcome" value={a.outcome} />}
      {a.qualification_result && <InfoRow label={t("Qualifikation", "Qualification")} value={a.qualification_result} />}
    </div>
  );
}
