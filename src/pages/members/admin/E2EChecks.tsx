import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Loader2, Play, CheckCircle2, XCircle, AlertTriangle, RefreshCw, ChevronRight, Save, Settings } from "lucide-react";
import { toast } from "sonner";

type Threshold = {
  key: string;
  value: number;
  description: string;
  unit: string;
};

type CheckResult = {
  name: string;
  category: "charge" | "user" | "email" | "appointment" | "pipeline";
  passed: boolean;
  severity: "critical" | "warning" | "info";
  detail: string;
  metric?: number | string;
};

type Report = {
  id: string;
  created_at: string;
  overall_score: number;
  checks_passed: number;
  checks_failed: number;
  checks_total: number;
  status: string;
  details: CheckResult[];
};

const CATEGORY_LABEL: Record<CheckResult["category"], string> = {
  charge: "Charge",
  user: "User",
  email: "E-Mail",
  appointment: "Appointment",
  pipeline: "Pipeline",
};

/**
 * Static spec of each check's underlying query + parameters. Mirrors exactly
 * what `supabase/functions/run-e2e-checks/index.ts` runs. Keyed by the check's
 * `name` (verbatim from the edge function) so the drawer shows the real source
 * query for the metric stored in the report.
 *
 * If a check is added/renamed in the edge function, mirror it here.
 */
const CHECK_SPECS: Record<
  string,
  {
    table: string;
    sql: string;
    params: { name: string; value: string }[];
    threshold: string;
    metricMeaning: string;
  }
> = {
  "Charges (7d) sind mit Stripe-PaymentIntent verknüpft": {
    table: "appointments",
    sql:
      "select id, payment_status, stripe_payment_intent_id, fastlane_amount_cents, created_at\n" +
      "from appointments\n" +
      "where payment_status = 'paid'\n" +
      "  and created_at >= now() - interval '7 days'\n" +
      "limit 50;\n\n" +
      "-- failed when: COUNT(paid) - COUNT(paid AND stripe_payment_intent_id IS NOT NULL) > 0",
    params: [
      { name: "payment_status", value: "paid" },
      { name: "since", value: "now() - 7 days" },
      { name: "limit", value: "50" },
    ],
    threshold: "0 paid charges without payment_intent",
    metricMeaning: "Total paid appointments in last 7 days",
  },
  "Stripe Webhook Idempotency aktiv": {
    table: "processed_events",
    sql:
      "select count(*) from processed_events\n" +
      "where event_key like 'stripe%'\n" +
      "  and processed_at >= now() - interval '7 days';",
    params: [
      { name: "event_key prefix", value: "stripe%" },
      { name: "since", value: "now() - 7 days" },
    ],
    threshold: "≥ 0 (info-only)",
    metricMeaning: "Distinct Stripe webhook events processed (idempotency keys)",
  },
  "Neue Profile (7d) erhalten user_roles-Eintrag": {
    table: "profiles ⨯ user_roles",
    sql:
      "with new_profiles as (\n" +
      "  select id, email, created_at from profiles\n" +
      "  where created_at >= now() - interval '7 days' limit 200\n" +
      ")\n" +
      "select count(*) from new_profiles p\n" +
      "where not exists (select 1 from user_roles ur where ur.user_id = p.id);",
    params: [
      { name: "since", value: "now() - 7 days" },
      { name: "limit", value: "200" },
    ],
    threshold: "0 profiles missing role",
    metricMeaning: "Total new profiles in last 7 days",
  },
  "Profile haben E-Mail (Auth-Sync funktioniert)": {
    table: "profiles",
    sql:
      "select count(*) from profiles\n" +
      "where created_at >= now() - interval '7 days'\n" +
      "  and email is null;",
    params: [
      { name: "since", value: "now() - 7 days" },
      { name: "field", value: "email IS NULL" },
    ],
    threshold: "0 profiles without email",
    metricMeaning: "Profiles missing email address",
  },
  "E-Mail Failure-Rate (24h) < 10%": {
    table: "email_send_log",
    sql:
      "select\n" +
      "  count(*) filter (where status in ('failed','dlq')) as failed,\n" +
      "  count(*) as total\n" +
      "from email_send_log\n" +
      "where created_at >= now() - interval '24 hours';",
    params: [
      { name: "since", value: "now() - 24 hours" },
      { name: "failure statuses", value: "failed, dlq" },
    ],
    threshold: "< 10% (warn ≥10%, critical ≥25%)",
    metricMeaning: "Failure rate in % (failed / total)",
  },
  "Delivery-Status wird via Webhook aufgelöst": {
    table: "email_send_log",
    sql:
      "select count(*) from email_send_log\n" +
      "where created_at >= now() - interval '7 days'\n" +
      "  and final_delivery_status in ('bounced','complained');",
    params: [
      { name: "since", value: "now() - 7 days" },
      { name: "statuses", value: "bounced, complained" },
    ],
    threshold: "≥ 0 (info-only)",
    metricMeaning: "Bounces + complaints registered via webhook",
  },
  "Keine E-Mails > 30min im Pending-Zustand": {
    table: "email_send_log",
    sql:
      "select count(*) from email_send_log\n" +
      "where status = 'pending'\n" +
      "  and created_at < now() - interval '30 minutes';",
    params: [
      { name: "status", value: "pending" },
      { name: "older than", value: "30 minutes" },
    ],
    threshold: "0 stuck (warn >0, critical >5)",
    metricMeaning: "Emails stuck in pending state > 30 min",
  },
  "Aktive zukünftige Termine vorhanden": {
    table: "appointments",
    sql:
      "select count(*) from appointments\n" +
      "where appointment_status in ('booked','confirmed')\n" +
      "  and starts_at > now();",
    params: [
      { name: "statuses", value: "booked, confirmed" },
      { name: "starts_at", value: "> now()" },
    ],
    threshold: "≥ 0 (info-only)",
    metricMeaning: "Future confirmed appointments",
  },
  "Keine abgelaufenen pending_payment-Reservierungen": {
    table: "appointments",
    sql:
      "select count(*) from appointments\n" +
      "where appointment_status = 'pending_payment'\n" +
      "  and reservation_expires_at < now();",
    params: [
      { name: "status", value: "pending_payment" },
      { name: "reservation_expires_at", value: "< now()" },
    ],
    threshold: "0 stuck (warn >0, critical >3)",
    metricMeaning: "Expired reservations not cleaned up by cron",
  },
  "Reminder-Events werden erzeugt (24h)": {
    table: "outbound_events",
    sql:
      "select count(*) from outbound_events\n" +
      "where event_name like 'reminder%'\n" +
      "  and created_at >= now() - interval '24 hours';",
    params: [
      { name: "event_name prefix", value: "reminder%" },
      { name: "since", value: "now() - 24 hours" },
    ],
    threshold: "≥ 0 (info-only)",
    metricMeaning: "Reminder outbound events created",
  },
  "Outbound-Events Failure-Rate (24h) gering": {
    table: "outbound_events",
    sql:
      "select count(*) from outbound_events\n" +
      "where status = 'failed'\n" +
      "  and created_at >= now() - interval '24 hours';",
    params: [
      { name: "status", value: "failed" },
      { name: "since", value: "now() - 24 hours" },
    ],
    threshold: "< 10 (warn ≥10, critical ≥25)",
    metricMeaning: "Failed outbound events in last 24 hours",
  },
  "Bezahlte Termine sind an Lead gebunden & nicht expired": {
    table: "appointments",
    sql:
      "select count(*) from appointments\n" +
      "where payment_status = 'paid'\n" +
      "  and created_at >= now() - interval '7 days'\n" +
      "  and (lead_id is null or appointment_status = 'expired');",
    params: [
      { name: "payment_status", value: "paid" },
      { name: "since", value: "now() - 7 days" },
      { name: "orphan condition", value: "lead_id IS NULL OR status='expired'" },
    ],
    threshold: "0 orphan/expired",
    metricMeaning: "Paid appointments that are orphan or expired",
  },
};

export default function E2EChecks() {
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<Report[]>([]);
  const [latest, setLatest] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCheck, setActiveCheck] = useState<CheckResult | null>(null);
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingThresholds, setSavingThresholds] = useState(false);
  const [alertSettings, setAlertSettings] = useState<{ key: string; value: string; description: string }[]>([]);
  const [alertDraft, setAlertDraft] = useState<Record<string, string>>({});
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [testingAlert, setTestingAlert] = useState(false);

  const loadHistory = async () => {
    const { data } = await supabase
      .from("system_health_checks")
      .select("*")
      .eq("check_type", "e2e")
      .order("created_at", { ascending: false })
      .limit(20);
    const rows = (data ?? []) as unknown as Report[];
    setHistory(rows);
    if (rows.length > 0) setLatest(rows[0]);
    setLoading(false);
  };

  const loadThresholds = async () => {
    const { data, error } = await supabase
      .from("e2e_check_thresholds")
      .select("key, value, description, unit")
      .order("key");
    if (error) {
      console.warn("[e2e] threshold load failed:", error);
      return;
    }
    const rows = (data ?? []) as Threshold[];
    setThresholds(rows);
    setDraft(Object.fromEntries(rows.map((r) => [r.key, String(r.value)])));
  };

  const loadAlertSettings = async () => {
    const { data, error } = await supabase
      .from("e2e_alert_settings" as never)
      .select("key, value, description")
      .order("key");
    if (error) {
      console.warn("[e2e] alert settings load failed:", error);
      return;
    }
    const rows = (data ?? []) as { key: string; value: string; description: string }[];
    setAlertSettings(rows);
    setAlertDraft(Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""])));
  };

  useEffect(() => {
    loadHistory();
    loadThresholds();
    loadAlertSettings();
  }, []);

  const saveThresholds = async () => {
    setSavingThresholds(true);
    try {
      const updates = thresholds
        .map((t) => ({ key: t.key, raw: draft[t.key], current: t.value }))
        .filter((u) => u.raw !== undefined && u.raw !== String(u.current));

      const invalid = updates.find((u) => !Number.isFinite(Number(u.raw)));
      if (invalid) {
        toast.error(`Ungültiger Wert für ${invalid.key}`);
        return;
      }
      if (updates.length === 0) {
        toast.info("Keine Änderungen.");
        return;
      }
      for (const u of updates) {
        const { error } = await supabase
          .from("e2e_check_thresholds")
          .update({ value: Number(u.raw) })
          .eq("key", u.key);
        if (error) throw error;
      }
      toast.success(`${updates.length} Schwellenwert(e) gespeichert. Beim nächsten Run aktiv.`);
      await loadThresholds();
    } catch (e) {
      toast.error(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingThresholds(false);
    }
  };

  const saveAlertSettings = async () => {
    setSavingAlerts(true);
    try {
      const updates = alertSettings
        .map((s) => ({ key: s.key, raw: alertDraft[s.key] ?? "", current: s.value ?? "" }))
        .filter((u) => u.raw !== u.current);
      if (updates.length === 0) {
        toast.info("Keine Änderungen.");
        return;
      }
      // Validate email if provided
      const emailRow = updates.find((u) => u.key === "critical_alert_email");
      if (emailRow && emailRow.raw && !/^\S+@\S+\.\S+$/.test(emailRow.raw)) {
        toast.error("Ungültige E-Mail-Adresse.");
        return;
      }
      for (const u of updates) {
        const { error } = await supabase
          .from("e2e_alert_settings" as never)
          .update({ value: u.raw, updated_at: new Date().toISOString() } as never)
          .eq("key", u.key);
        if (error) throw error;
      }
      toast.success(`${updates.length} Alert-Einstellung(en) gespeichert.`);
      await loadAlertSettings();
    } catch (e) {
      toast.error(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingAlerts(false);
    }
  };

  const sendTestAlert = async () => {
    const recipient = (alertDraft.critical_alert_email ?? "").trim();
    if (!recipient || !/^\S+@\S+\.\S+$/.test(recipient)) {
      toast.error("Bitte zuerst gültige E-Mail-Adresse speichern.");
      return;
    }
    setTestingAlert(true);
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "e2e-critical-alert",
          recipientEmail: recipient,
          idempotencyKey: `e2e-test-${Date.now()}`,
          templateData: {
            score: 42,
            failedCritical: 2,
            failedWarning: 1,
            total: 18,
            failingChecks: [
              { name: "Test-Check (kein echter Fehler)", severity: "critical", detail: "Dies ist eine Test-Mail.", category: "test" },
            ],
            ranAt: new Date().toISOString(),
            dashboardUrl: window.location.href,
          },
        },
      });
      if (error) throw error;
      toast.success("Test-Mail versendet.");
    } catch (e) {
      toast.error(`Test fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTestingAlert(false);
    }
  };

  const runCheck = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("run-e2e-checks");
      if (error) throw error;
      toast.success(`E2E Check abgeschlossen — Score ${data.score}/100`);
      await loadHistory();
    } catch (e) {
      toast.error(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  };

  const statusColor = (status: string) =>
    status === "healthy" ? "bg-green-500/10 text-green-700 border-green-500/30"
    : status === "warning" ? "bg-amber-500/10 text-amber-700 border-amber-500/30"
    : "bg-red-500/10 text-red-700 border-red-500/30";

  const grouped = latest
    ? latest.details.reduce<Record<string, CheckResult[]>>((acc, c) => {
        (acc[c.category] ||= []).push(c);
        return acc;
      }, {})
    : {};

  const activeSpec = activeCheck ? CHECK_SPECS[activeCheck.name] : null;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">E2E Pipeline Checks</h1>
          <p className="text-muted-foreground">
            Charge → User → E-Mail → Appointment. Nach jedem Deploy laufen lassen.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadHistory} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" /> Reload
          </Button>
          <Button onClick={runCheck} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Check ausführen
          </Button>
        </div>
      </div>

      {latest && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Letzter Report</CardTitle>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={statusColor(latest.status)}>
                  {latest.status.toUpperCase()}
                </Badge>
                <span className="text-2xl font-bold">{latest.overall_score}/100</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {new Date(latest.created_at).toLocaleString("de-DE")} —{" "}
              {latest.checks_passed} von {latest.checks_total} OK
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                <h3 className="font-semibold mb-2">{CATEGORY_LABEL[cat as CheckResult["category"]]}</h3>
                <div className="space-y-2">
                  {items.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveCheck(c)}
                      className="w-full flex items-start gap-3 p-3 rounded-md border bg-card hover:bg-muted/50 transition-colors text-left"
                    >
                      {c.passed ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                      ) : c.severity === "critical" ? (
                        <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.detail}</div>
                      </div>
                      {c.metric !== undefined && (
                        <span className="text-xs font-mono text-muted-foreground self-center mr-1">
                          {c.metric}
                        </span>
                      )}
                      {!c.passed && (
                        <Badge variant="outline" className={
                          c.severity === "critical"
                            ? "bg-red-500/10 text-red-700 border-red-500/30"
                            : "bg-amber-500/10 text-amber-700 border-amber-500/30"
                        }>
                          {c.severity}
                        </Badge>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground self-center" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ─── Admin Schwellenwerte ─── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <CardTitle>Schwellenwerte</CardTitle>
            </div>
            <Button size="sm" onClick={saveThresholds} disabled={savingThresholds || thresholds.length === 0}>
              {savingThresholds ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Speichern
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Änderungen greifen ohne Deploy beim nächsten "Check ausführen". Werte sind admin-only.
          </p>
        </CardHeader>
        <CardContent>
          {thresholds.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Schwellenwerte verfügbar.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {thresholds.map((t) => {
                const dirty = draft[t.key] !== undefined && draft[t.key] !== String(t.value);
                return (
                  <div key={t.key} className="space-y-1 rounded-md border p-3 bg-card">
                    <Label htmlFor={`thr-${t.key}`} className="text-sm font-medium">
                      {t.description}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id={`thr-${t.key}`}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={draft[t.key] ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [t.key]: e.target.value }))}
                        className="font-mono"
                      />
                      <span className="text-xs text-muted-foreground w-16 shrink-0">{t.unit}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <code className="text-muted-foreground">{t.key}</code>
                      {dirty && <Badge variant="outline">geändert</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Critical Alerts ─── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <CardTitle>Critical Alerts (E-Mail)</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={sendTestAlert} disabled={testingAlert}>
                {testingAlert ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Test-Mail
              </Button>
              <Button size="sm" onClick={saveAlertSettings} disabled={savingAlerts || alertSettings.length === 0}>
                {savingAlerts ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Speichern
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Bei Run-Status <code>critical</code> wird automatisch eine Mail mit Score und Failing Checks versendet (Cooldown verhindert Spam).
          </p>
        </CardHeader>
        <CardContent>
          {alertSettings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Alert-Einstellungen verfügbar.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {alertSettings.map((s) => {
                const dirty = (alertDraft[s.key] ?? "") !== (s.value ?? "");
                const isEmail = s.key === "critical_alert_email";
                const isBool = s.key === "critical_alert_enabled";
                return (
                  <div key={s.key} className="space-y-1 rounded-md border p-3 bg-card">
                    <Label htmlFor={`alert-${s.key}`} className="text-sm font-medium">
                      {s.description}
                    </Label>
                    {isBool ? (
                      <select
                        id={`alert-${s.key}`}
                        value={alertDraft[s.key] ?? "true"}
                        onChange={(e) => setAlertDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                        className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                      >
                        <option value="true">Aktiviert</option>
                        <option value="false">Deaktiviert</option>
                      </select>
                    ) : (
                      <Input
                        id={`alert-${s.key}`}
                        type={isEmail ? "email" : "text"}
                        inputMode={isEmail ? "email" : "text"}
                        placeholder={isEmail ? "alerts@example.com" : ""}
                        value={alertDraft[s.key] ?? ""}
                        onChange={(e) => setAlertDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                        className="font-mono"
                      />
                    )}
                    <div className="flex items-center justify-between text-xs">
                      <code className="text-muted-foreground">{s.key}</code>
                      {dirty && <Badge variant="outline">geändert</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Verlauf (letzte 20 Runs)</CardTitle></CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Runs vorhanden.</p>
          ) : (
            <div className="space-y-1">
              {history.map(r => (
                <button
                  key={r.id}
                  onClick={() => setLatest(r)}
                  className="w-full flex items-center justify-between p-2 rounded hover:bg-muted text-left text-sm"
                >
                  <span>{new Date(r.created_at).toLocaleString("de-DE")}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{r.checks_passed}/{r.checks_total}</span>
                    <Badge variant="outline" className={statusColor(r.status)}>
                      {r.overall_score}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Detail Drawer ─── */}
      <Sheet open={!!activeCheck} onOpenChange={(open) => !open && setActiveCheck(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {activeCheck && (
            <>
              <SheetHeader>
                <div className="flex items-start gap-3">
                  {activeCheck.passed ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0 mt-1" />
                  ) : activeCheck.severity === "critical" ? (
                    <XCircle className="h-6 w-6 text-red-600 shrink-0 mt-1" />
                  ) : (
                    <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-1" />
                  )}
                  <div className="flex-1">
                    <SheetTitle className="text-left">{activeCheck.name}</SheetTitle>
                    <SheetDescription className="text-left mt-1">
                      Kategorie: {CATEGORY_LABEL[activeCheck.category]} · Severity: {activeCheck.severity}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-5 mt-6">
                {/* Result summary */}
                <section>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Ergebnis
                  </h4>
                  <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <Badge
                        variant="outline"
                        className={
                          activeCheck.passed
                            ? "bg-green-500/10 text-green-700 border-green-500/30"
                            : activeCheck.severity === "critical"
                              ? "bg-red-500/10 text-red-700 border-red-500/30"
                              : "bg-amber-500/10 text-amber-700 border-amber-500/30"
                        }
                      >
                        {activeCheck.passed ? "PASSED" : "FAILED"}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Detail</span>
                      <span className="text-right max-w-[60%]">{activeCheck.detail}</span>
                    </div>
                    {activeCheck.metric !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Metric</span>
                        <span className="font-mono">{String(activeCheck.metric)}</span>
                      </div>
                    )}
                    {activeSpec && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Bedeutung</span>
                          <span className="text-right max-w-[60%]">{activeSpec.metricMeaning}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Schwelle</span>
                          <span className="text-right max-w-[60%] font-mono text-xs">
                            {activeSpec.threshold}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </section>

                {/* Source query */}
                {activeSpec ? (
                  <>
                    <section>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Quelltabelle
                      </h4>
                      <code className="inline-block rounded bg-muted px-2 py-1 text-xs font-mono">
                        {activeSpec.table}
                      </code>
                    </section>

                    <section>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Parameter
                      </h4>
                      <div className="rounded-md border divide-y">
                        {activeSpec.params.map((p) => (
                          <div key={p.name} className="flex justify-between px-3 py-2 text-sm">
                            <span className="text-muted-foreground">{p.name}</span>
                            <span className="font-mono text-xs">{p.value}</span>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        SQL (äquivalent zur Edge-Function-Query)
                      </h4>
                      <pre className="rounded-md border bg-muted/40 p-3 text-xs font-mono overflow-x-auto whitespace-pre">
{activeSpec.sql}
                      </pre>
                    </section>
                  </>
                ) : (
                  <section>
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      Für diesen Check ist keine Query-Spezifikation hinterlegt.
                      Source: <code className="font-mono">supabase/functions/run-e2e-checks/index.ts</code>
                    </div>
                  </section>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
