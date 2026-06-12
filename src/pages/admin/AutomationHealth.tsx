import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/i18n/LanguageContext";
import { Activity, AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de as deLocale } from "date-fns/locale";
import WebhookDlqPanel from "@/components/members/WebhookDlqPanel";
import CommunicationMonitorPanel from "@/components/admin/CommunicationMonitorPanel";

interface LogRow {
  id: string;
  job_name: string;
  status: string;
  metrics: Record<string, number> | null;
  error: string | null;
  ran_at: string;
}

interface EventCount {
  event_name: string;
  total: number;
  pending: number;
  failed: number;
}

export default function AutomationHealth() {
  const { isAdmin } = useAuth();
  const { lang } = useLanguage();
  const t = (de: string, en: string) => (lang === "de" ? de : en);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [counts, setCounts] = useState<EventCount[]>([]);
  const [endpointCount, setEndpointCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setLoading(true);
      const [logsRes, eventsRes, endpointsRes] = await Promise.all([
        supabase.from("automation_log").select("*").order("ran_at", { ascending: false }).limit(20),
        supabase.from("outbound_events").select("event_name, status").limit(1000),
        supabase.from("webhook_endpoints").select("id", { count: "exact", head: true }).eq("active", true),
      ]);
      setLogs((logsRes.data as LogRow[]) ?? []);
      setEndpointCount(endpointsRes.count ?? 0);

      // Aggregate event counts client-side
      const map = new Map<string, EventCount>();
      for (const e of (eventsRes.data as { event_name: string; status: string }[]) ?? []) {
        const c = map.get(e.event_name) ?? { event_name: e.event_name, total: 0, pending: 0, failed: 0 };
        c.total++;
        if (e.status === "pending" || e.status === "retrying") c.pending++;
        if (e.status === "dead" || e.status === "failed") c.failed++;
        map.set(e.event_name, c);
      }
      setCounts(Array.from(map.values()).sort((a, b) => b.total - a.total));
      setLoading(false);
    })();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">{t("Nur für Admins.", "Admins only.")}</p>
      </div>
    );
  }

  const lastRun = logs[0];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <header>
        <h1 className="font-serif text-3xl text-foreground flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          {t("Automatisierungs-Status", "Automation Health")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t(
            "Live-Übersicht über Scheduler, Events und Webhook-Versand.",
            "Live overview of scheduler, events and webhook delivery."
          )}
        </p>
      </header>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Top stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={<Clock className="h-4 w-4" />}
              label={t("Letzter Scheduler-Lauf", "Last scheduler run")}
              value={
                lastRun
                  ? formatDistanceToNow(new Date(lastRun.ran_at), {
                      addSuffix: true,
                      locale: lang === "de" ? deLocale : undefined,
                    })
                  : "—"
              }
              tone={lastRun?.status === "success" ? "ok" : "warn"}
            />
            <StatCard
              icon={<CheckCircle2 className="h-4 w-4" />}
              label={t("Aktive Webhook-Endpoints", "Active webhook endpoints")}
              value={String(endpointCount)}
              tone={endpointCount > 0 ? "ok" : "warn"}
            />
            <StatCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label={t("Fehlgeschlagene Events", "Failed events")}
              value={String(counts.reduce((s, c) => s + c.failed, 0))}
              tone={counts.some((c) => c.failed > 0) ? "warn" : "ok"}
            />
          </div>

          {/* Event matrix */}
          <section className="rounded-xl border border-border/40 bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">
              {t("Event-Übersicht", "Event overview")}
            </h2>
            {counts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("Noch keine Events emittiert.", "No events emitted yet.")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b border-border/30">
                      <th className="text-left py-2">Event</th>
                      <th className="text-right py-2">{t("Gesamt", "Total")}</th>
                      <th className="text-right py-2">{t("Ausstehend", "Pending")}</th>
                      <th className="text-right py-2">{t("Fehlgeschlagen", "Failed")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {counts.map((c) => (
                      <tr key={c.event_name} className="border-b border-border/10">
                        <td className="py-2 font-mono text-foreground">{c.event_name}</td>
                        <td className="py-2 text-right text-foreground">{c.total}</td>
                        <td className="py-2 text-right text-muted-foreground">{c.pending}</td>
                        <td className="py-2 text-right text-destructive">{c.failed || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Scheduler runs */}
          <section className="rounded-xl border border-border/40 bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">
              {t("Letzte Scheduler-Läufe", "Recent scheduler runs")}
            </h2>
            {logs.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("Noch keine Läufe — pg_cron Job aktivieren.", "No runs yet — enable the pg_cron job.")}
              </p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start justify-between gap-3 text-xs border-b border-border/10 pb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            log.status === "success" ? "bg-primary" : "bg-destructive"
                          }`}
                        />
                        <span className="text-foreground font-medium">{log.job_name}</span>
                        <span className="text-muted-foreground">
                          {formatDistanceToNow(new Date(log.ran_at), {
                            addSuffix: true,
                            locale: lang === "de" ? deLocale : undefined,
                          })}
                        </span>
                      </div>
                      {log.metrics && (
                        <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                          {Object.entries(log.metrics)
                            .map(([k, v]) => `${k}=${v}`)
                            .join("  ")}
                        </p>
                      )}
                      {log.error && (
                        <p className="text-[11px] text-destructive mt-1">{log.error}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Communication Monitor */}
          <section className="rounded-xl border border-border/40 bg-card p-5">
            <CommunicationMonitorPanel />
          </section>

          {/* DLQ panel */}
          <section className="rounded-xl border border-border/40 bg-card p-5">
            <WebhookDlqPanel />
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "ok" | "warn";
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <span className={tone === "ok" ? "text-primary" : "text-destructive"}>{icon}</span>
        {label}
      </div>
      <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
