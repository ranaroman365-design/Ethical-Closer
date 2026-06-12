import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/i18n/LanguageContext";
import { useCommunicationMonitor } from "@/hooks/useCommunicationMonitor";
import { Loader2, AlertTriangle, CheckCircle2, Mail, RefreshCw, Play } from "lucide-react";

export default function CommunicationMonitorPanel() {
  const { isAdmin } = useAuth();
  const { lang } = useLanguage();
  const t = (de: string, en: string) => (lang === "de" ? de : en);
  const { report, dryRun, loading, error, fetchReport, fetchDryRun } = useCommunicationMonitor();

  useEffect(() => {
    if (isAdmin) fetchReport();
  }, [isAdmin, fetchReport]);

  if (!isAdmin) return null;

  const totalDuplicates = report
    ? report.duplicate_emails.length + report.duplicate_reminders.length + report.duplicate_noshow_recovery.length
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          {t("Kommunikations-Monitor", "Communication Monitor")}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={fetchReport}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg border border-border/40 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 inline mr-1 ${loading ? "animate-spin" : ""}`} />
            {t("Aktualisieren", "Refresh")}
          </button>
          <button
            onClick={fetchDryRun}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg border border-border/40 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <Play className="h-3 w-3 inline mr-1" />
            {t("Dry-Run", "Dry-Run")}
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Report */}
      {report && !loading && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard
              label={t("Doppelte Emails", "Duplicate Emails")}
              value={report.duplicate_emails.length}
              tone={report.duplicate_emails.length > 0 ? "warn" : "ok"}
            />
            <StatCard
              label={t("Doppelte Reminder", "Duplicate Reminders")}
              value={report.duplicate_reminders.length}
              tone={report.duplicate_reminders.length > 0 ? "warn" : "ok"}
            />
            <StatCard
              label={t("Doppelte No-Show", "Duplicate No-Show")}
              value={report.duplicate_noshow_recovery.length}
              tone={report.duplicate_noshow_recovery.length > 0 ? "warn" : "ok"}
            />
            <StatCard
              label={t("Fehlgeschlagen", "Failed")}
              value={report.failed_sends}
              tone={report.failed_sends > 0 ? "warn" : "ok"}
            />
            <StatCard
              label={t("Retries", "Retries")}
              value={report.retries}
              tone="ok"
            />
            <StatCard
              label={t("Übersprungen (Dedup)", "Skipped (Dedup)")}
              value={report.skipped_duplicates}
              tone="ok"
            />
          </div>

          {/* Status banner */}
          {totalDuplicates === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
              <CheckCircle2 className="h-4 w-4" />
              {t("Keine Duplikate in 24h — System sauber.", "No duplicates in 24h — system clean.")}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {t(`${totalDuplicates} Duplikate erkannt — Admin Alert erstellt.`, `${totalDuplicates} duplicates detected — admin alert created.`)}
            </div>
          )}

          {/* Duplicate details */}
          {report.duplicate_emails.length > 0 && (
            <DetailSection title={t("Doppelte Emails", "Duplicate Emails")}>
              {report.duplicate_emails.map((d, i) => (
                <div key={i} className="flex justify-between text-xs py-1 border-b border-border/10">
                  <span className="text-foreground font-mono truncate max-w-[60%]">
                    {d.template_name} → {d.recipient_email}
                  </span>
                  <span className="text-destructive font-semibold">{d.count}×</span>
                </div>
              ))}
            </DetailSection>
          )}

          {report.duplicate_reminders.length > 0 && (
            <DetailSection title={t("Doppelte Reminder", "Duplicate Reminders")}>
              {report.duplicate_reminders.map((d, i) => (
                <div key={i} className="flex justify-between text-xs py-1 border-b border-border/10">
                  <span className="text-foreground font-mono truncate max-w-[60%]">
                    {d.stage} — {d.appointment_id?.slice(0, 8)}
                  </span>
                  <span className="text-destructive font-semibold">{d.count}×</span>
                </div>
              ))}
            </DetailSection>
          )}
        </>
      )}

      {/* Dry-Run Results */}
      {dryRun && !loading && (
        <div className="rounded-xl border border-border/40 bg-card p-4 space-y-3">
          <h3 className="text-xs font-semibold text-foreground">
            {t("Dry-Run Ergebnis", "Dry-Run Result")}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <div className="p-2 rounded-lg bg-primary/5 text-center">
              <div className="font-semibold text-primary text-lg">{dryRun.would_send}</div>
              <div className="text-muted-foreground">would_send</div>
            </div>
            <div className="p-2 rounded-lg bg-muted text-center">
              <div className="font-semibold text-foreground text-lg">{dryRun.skipped_duplicate}</div>
              <div className="text-muted-foreground">skipped_duplicate</div>
            </div>
            <div className="p-2 rounded-lg bg-muted text-center">
              <div className="font-semibold text-foreground text-lg">{dryRun.skipped_outside_window}</div>
              <div className="text-muted-foreground">skipped_outside_window</div>
            </div>
            <div className="p-2 rounded-lg bg-muted text-center">
              <div className="font-semibold text-foreground text-lg">{dryRun.skipped_no_consent}</div>
              <div className="text-muted-foreground">skipped_no_consent</div>
            </div>
            <div className="p-2 rounded-lg bg-muted text-center">
              <div className="font-semibold text-foreground text-lg">{dryRun.skipped_no_contact}</div>
              <div className="text-muted-foreground">skipped_no_contact</div>
            </div>
          </div>
          {dryRun.details.length > 0 && (
            <div className="max-h-40 overflow-y-auto text-[11px] font-mono text-muted-foreground space-y-0.5">
              {dryRun.details.map((d, i) => (
                <div key={i}>
                  {d.action} — {d.template} — {d.appointment_id?.slice(0, 8)} {d.reason ? `(${d.reason})` : ""}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" }) {
  return (
    <div className="rounded-lg border border-border/40 bg-card p-3 text-center">
      <div className={`text-lg font-semibold ${tone === "warn" ? "text-destructive" : "text-foreground"}`}>
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card p-4">
      <h3 className="text-xs font-semibold text-foreground mb-2">{title}</h3>
      <div className="max-h-32 overflow-y-auto">{children}</div>
    </div>
  );
}
