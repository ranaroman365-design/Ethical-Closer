/**
 * Communication Audit Panel — per event-type live status, template key, last send attempts.
 * Canon: Intelligence Control · Section 3 (Communication Intelligence)
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Mail,
  ShieldOff,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Canonical event types → template key mapping ──────────────────────────
const EVENT_TYPES: Array<{
  eventType: string;
  labelDe: string;
  labelEn: string;
  templateKey: string;
}> = [
  { eventType: "signup", labelDe: "Registrierung", labelEn: "Signup", templateKey: "signup" },
  { eventType: "applicant_access", labelDe: "Bewerber-Zugang", labelEn: "Applicant Access", templateKey: "applicant-access" },
  { eventType: "booking_confirmation", labelDe: "Buchungsbestätigung", labelEn: "Booking Confirmation", templateKey: "booking-confirmation" },
  { eventType: "setter_assigned", labelDe: "Setter zugewiesen", labelEn: "Setter Assigned", templateKey: "setter-assigned" },
  { eventType: "setter_reminder", labelDe: "Setter Reminder", labelEn: "Setter Reminder", templateKey: "setter-reminder" },
  { eventType: "lead_reminder", labelDe: "Lead Reminder (24h/3h)", labelEn: "Lead Reminder (24h/3h)", templateKey: "lead-reminder" },
  { eventType: "lead_reminder_10min", labelDe: "Lead Reminder (10 Min)", labelEn: "Lead Reminder (10 min)", templateKey: "lead-reminder-10min" },
  { eventType: "no_show_recovery", labelDe: "No-Show Recovery", labelEn: "No-Show Recovery", templateKey: "no-show-recovery" },
  { eventType: "sla_escalation", labelDe: "SLA Eskalation", labelEn: "SLA Escalation", templateKey: "sla-escalation" },
  { eventType: "e2e_critical_alert", labelDe: "Kritischer Alert", labelEn: "Critical Alert", templateKey: "e2e-critical-alert" },
  { eventType: "magic_link", labelDe: "Magic Link", labelEn: "Magic Link", templateKey: "magiclink" },
  { eventType: "recovery", labelDe: "Recovery", labelEn: "Recovery", templateKey: "recovery" },
  { eventType: "system", labelDe: "System", labelEn: "System", templateKey: "system" },
];

interface SendAttempt {
  id: string;
  status: string;
  recipient_email: string;
  error_message: string | null;
  created_at: string;
}

interface EventAudit {
  eventType: string;
  labelDe: string;
  labelEn: string;
  templateKey: string;
  totalSent: number;
  totalFailed: number;
  totalSuppressed: number;
  lastAttempts: SendAttempt[];
  health: "healthy" | "degraded" | "failing" | "inactive";
}

export default function CommunicationAuditPanel() {
  const { lang } = useLanguage();
  const t = (de: string, en: string) => (lang === "de" ? de : en);

  const [audits, setAudits] = useState<EventAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    // Fetch latest 500 deduplicated rows
    const { data: rows } = await supabase
      .from("email_send_log")
      .select("id,template_name,status,recipient_email,error_message,created_at,message_id")
      .order("created_at", { ascending: false })
      .limit(500);

    const all = (rows ?? []) as any[];

    // Deduplicate by message_id (latest per message_id)
    const seen = new Map<string, any>();
    for (const r of all) {
      const key = r.message_id ?? r.id;
      if (!seen.has(key)) seen.set(key, r);
    }
    const deduped = Array.from(seen.values());

    const result: EventAudit[] = EVENT_TYPES.map((et) => {
      const matching = deduped.filter((r) => r.template_name === et.templateKey);
      const sent = matching.filter((r) => r.status === "sent").length;
      const failed = matching.filter((r) => ["dlq", "failed"].includes(r.status)).length;
      const suppressed = matching.filter((r) => r.status === "suppressed").length;
      const total = matching.length;

      let health: EventAudit["health"] = "inactive";
      if (total > 0) {
        const failRate = (failed / total) * 100;
        health = failRate > 50 ? "failing" : failRate > 10 ? "degraded" : "healthy";
      }

      return {
        ...et,
        totalSent: sent,
        totalFailed: failed,
        totalSuppressed: suppressed,
        lastAttempts: matching.slice(0, 5).map((r) => ({
          id: r.id,
          status: r.status,
          recipient_email: r.recipient_email,
          error_message: r.error_message,
          created_at: r.created_at,
        })),
        health,
      };
    });

    setAudits(result);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const healthIcon = (h: EventAudit["health"]) => {
    switch (h) {
      case "healthy": return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
      case "degraded": return <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />;
      case "failing": return <XCircle className="h-3.5 w-3.5 text-rose-400" />;
      case "inactive": return <Clock className="h-3.5 w-3.5 text-[color:var(--ci-fg-dim)]" />;
    }
  };

  const healthBadge = (h: EventAudit["health"]) => {
    const cls = {
      healthy: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
      degraded: "border-amber-400/30 bg-amber-400/10 text-amber-300",
      failing: "border-rose-400/30 bg-rose-400/10 text-rose-300",
      inactive: "border-white/10 bg-white/5 text-[color:var(--ci-fg-dim)]",
    }[h];
    const label = {
      healthy: t("Healthy", "Healthy"),
      degraded: t("Degraded", "Degraded"),
      failing: t("Failing", "Failing"),
      inactive: t("Inaktiv", "Inactive"),
    }[h];
    return <Badge variant="outline" className={`text-[10px] ${cls}`}>{label}</Badge>;
  };

  const statusBadge = (status: string) => {
    const cls = {
      sent: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
      dlq: "border-rose-400/30 bg-rose-400/10 text-rose-300",
      failed: "border-rose-400/30 bg-rose-400/10 text-rose-300",
      suppressed: "border-amber-400/30 bg-amber-400/10 text-amber-300",
      pending: "border-white/10 bg-white/5 text-[color:var(--ci-fg-dim)]",
    }[status] ?? "border-white/10 bg-white/5 text-[color:var(--ci-fg-dim)]";
    return <Badge variant="outline" className={`text-[9px] ${cls}`}>{status}</Badge>;
  };

  if (loading) {
    return (
      <Card className="ci-card p-6 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[color:var(--ci-fg-muted)]" />
      </Card>
    );
  }

  const activeCount = audits.filter((a) => a.health !== "inactive").length;
  const failingCount = audits.filter((a) => a.health === "failing").length;

  return (
    <Card className="ci-card overflow-hidden mt-3">
      <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-[color:var(--ci-fg-muted)]" />
          <span className="text-[10px] uppercase tracking-wider text-[color:var(--ci-fg-dim)]">
            {t("Kommunikations-Audit", "Communication Audit")} · {activeCount} {t("aktiv", "active")}
          </span>
          {failingCount > 0 && (
            <Badge className="border-rose-400/30 bg-rose-400/10 text-rose-300 text-[9px]">
              {failingCount} failing
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={load}
          className="h-6 w-6 p-0 text-[color:var(--ci-fg-muted)] hover:text-[color:var(--ci-fg)]"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      <div className="divide-y divide-white/5">
        {audits.map((a) => (
          <div key={a.eventType}>
            {/* Main row */}
            <button
              onClick={() => setExpandedEvent(expandedEvent === a.eventType ? null : a.eventType)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
            >
              {healthIcon(a.health)}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm text-[color:var(--ci-fg)]">
                  <span className="font-medium">
                    {lang === "de" ? a.labelDe : a.labelEn}
                  </span>
                  <code className="text-[10px] font-mono text-[color:var(--ci-fg-dim)] bg-white/5 px-1.5 py-0.5 rounded">
                    {a.templateKey}
                  </code>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[10px] text-[color:var(--ci-fg-muted)]">
                  <span className="text-emerald-400">{a.totalSent} sent</span>
                  {a.totalFailed > 0 && <span className="text-rose-400">{a.totalFailed} failed</span>}
                  {a.totalSuppressed > 0 && <span className="text-amber-400">{a.totalSuppressed} suppressed</span>}
                </div>
              </div>
              {healthBadge(a.health)}
            </button>

            {/* Expanded: last attempts */}
            {expandedEvent === a.eventType && a.lastAttempts.length > 0 && (
              <div className="bg-white/[0.01] border-t border-white/5">
                <div className="px-4 py-1.5">
                  <span className="text-[9px] uppercase tracking-wider text-[color:var(--ci-fg-dim)]">
                    {t("Letzte Versandversuche", "Last Send Attempts")}
                  </span>
                </div>
                <div className="divide-y divide-white/[0.03]">
                  {a.lastAttempts.map((att) => (
                    <div key={att.id} className="flex items-center gap-3 px-4 py-2 text-xs">
                      {statusBadge(att.status)}
                      <span className="flex-1 truncate text-[color:var(--ci-fg-muted)]">
                        {att.recipient_email}
                      </span>
                      {att.error_message && (
                        <span className="max-w-[200px] truncate text-rose-400 text-[10px]" title={att.error_message}>
                          <ShieldOff className="inline h-3 w-3 mr-0.5" />
                          {att.error_message}
                        </span>
                      )}
                      <span className="text-[10px] text-[color:var(--ci-fg-dim)] tabular-nums whitespace-nowrap">
                        {new Date(att.created_at).toLocaleString("de-DE", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
                {a.lastAttempts.length === 0 && (
                  <div className="px-4 py-3 text-center text-[11px] text-[color:var(--ci-fg-dim)]">
                    {t("Keine Versandversuche.", "No send attempts.")}
                  </div>
                )}
              </div>
            )}

            {expandedEvent === a.eventType && a.lastAttempts.length === 0 && (
              <div className="bg-white/[0.01] border-t border-white/5 px-4 py-3 text-center text-[11px] text-[color:var(--ci-fg-dim)]">
                {t("Noch keine Versandversuche für diesen Event-Typ.", "No send attempts for this event type yet.")}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
