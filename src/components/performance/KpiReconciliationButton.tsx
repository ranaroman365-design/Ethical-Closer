/**
 * KPI Reconciliation Button — compares Operator Control KPIs against Revenue Dashboard
 * and highlights discrepancies between payment_links truth and calls-based aggregation.
 */
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageContext";
import { toast } from "sonner";
import { ShieldCheck, AlertTriangle, Loader2, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const T = {
  ink: "#1A1A1A", muted: "#9A9590", gold: "#C6A96B",
  danger: "#B04A3A", dangerLight: "#FDF2F0",
  success: "#7A9E7E", successLight: "#F2F7F3",
  card: "#FFFFFF", border: "#E8E2D9",
} as const;

interface Discrepancy {
  metric: string;
  operatorValue: number;
  revenueValue: number;
  delta: number;
  deltaPct: number;
  severity: "ok" | "warn" | "error";
}

const fmtEur = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`;

export default function KpiReconciliationButton({ rangeDays = 30 }: { rangeDays?: number }) {
  const { lang } = useLanguage();
  const t = (de: string, en: string) => (lang === "de" ? de : en);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Discrepancy[] | null>(null);
  const [open, setOpen] = useState(false);

  const runReconciliation = useCallback(async () => {
    setLoading(true);
    setOpen(true);
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - rangeDays);
      const cutoffStr = cutoff.toISOString();

      // Source 1: Operator Unit Performance (payment_links truth)
      const { data: opUnits, error: opErr } = await supabase.rpc(
        "get_operator_unit_performance",
        { p_range_days: rangeDays }
      );
      if (opErr) throw opErr;

      const units = (opUnits as any[]) || [];
      const opRevenue = units.reduce((s, u) => s + (u.total_revenue || 0), 0);
      const opLeads = units.reduce((s, u) => s + (u.total_leads || 0), 0);
      const opAppointments = units.reduce((s, u) => s + (u.total_appointments || 0), 0);
      const opShows = units.reduce((s, u) => s + (u.total_shows || 0), 0);
      const opCloses = units.reduce((s, u) => s + (u.total_closes || 0), 0);

      // Source 2: Direct table queries (Revenue Dashboard style)
      const [leadsRes, callsRes, paymentsRes] = await Promise.all([
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .gte("created_at", cutoffStr)
          .or("is_test,exclude_from_kpis")
          .is("is_test", false),
        supabase
          .from("calls")
          .select("id, result, revenue, deal_size, showed_at, closed_at, booked_at")
          .gte("created_at", cutoffStr),
        supabase
          .from("payment_links")
          .select("id, amount, status, paid_at")
          .eq("status", "paid")
          .gte("paid_at", cutoffStr),
      ]);

      // Leads — use real_leads count from RPC vs direct
      const { count: directLeads } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .gte("created_at", cutoffStr);

      const calls = callsRes.data || [];
      const payments = paymentsRes.data || [];

      const directRevenue = payments.reduce((s, p) => s + (p.amount || 0), 0);
      const directShows = calls.filter(c => c.showed_at).length;
      const directCloses = calls.filter(c => c.closed_at && c.result === "won").length;
      const directAppointments = calls.filter(c => c.booked_at).length;

      // Compare
      const checks: Discrepancy[] = [];
      const compare = (metric: string, opVal: number, revVal: number, isEur = false) => {
        const delta = opVal - revVal;
        const deltaPct = revVal > 0 ? (delta / revVal) * 100 : opVal > 0 ? 100 : 0;
        const absPct = Math.abs(deltaPct);
        checks.push({
          metric,
          operatorValue: opVal,
          revenueValue: revVal,
          delta,
          deltaPct,
          severity: absPct < 1 ? "ok" : absPct < 10 ? "warn" : "error",
        });
      };

      compare("Revenue (€)", opRevenue, directRevenue, true);
      compare("Leads", opLeads, directLeads || 0);
      compare("Appointments", opAppointments, directAppointments);
      compare("Shows", opShows, directShows);
      compare("Closes", opCloses, directCloses);

      // Close Rate
      const opCloseRate = opShows > 0 ? (opCloses / opShows) * 100 : 0;
      const directCloseRate = directShows > 0 ? (directCloses / directShows) * 100 : 0;
      compare("Close Rate (%)", opCloseRate, directCloseRate);

      // Show Rate
      const opShowRate = opAppointments > 0 ? (opShows / opAppointments) * 100 : 0;
      const directShowRate = directAppointments > 0 ? (directShows / directAppointments) * 100 : 0;
      compare("Show Rate (%)", opShowRate, directShowRate);

      setResult(checks);

      const errors = checks.filter(c => c.severity === "error").length;
      const warns = checks.filter(c => c.severity === "warn").length;
      if (errors > 0) {
        toast.error(t(
          `${errors} kritische Abweichung${errors > 1 ? "en" : ""} gefunden`,
          `${errors} critical discrepanc${errors > 1 ? "ies" : "y"} found`
        ));
      } else if (warns > 0) {
        toast.warning(t(
          `${warns} leichte Abweichung${warns > 1 ? "en" : ""}`,
          `${warns} minor discrepanc${warns > 1 ? "ies" : "y"}`
        ));
      } else {
        toast.success(t("Alle KPIs stimmen überein ✓", "All KPIs match ✓"));
      }
    } catch (e: any) {
      console.error("[KPI Reconciliation]", e);
      toast.error(t("Abgleich fehlgeschlagen", "Reconciliation failed"));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [rangeDays, lang]);

  const hasErrors = result?.some(r => r.severity === "error");
  const hasWarns = result?.some(r => r.severity === "warn");
  const allOk = result && !hasErrors && !hasWarns;

  return (
    <div className="relative inline-block">
      <Button
        variant="outline"
        size="sm"
        onClick={runReconciliation}
        disabled={loading}
        className="text-[11px] gap-1.5 h-7 rounded-lg border"
        style={{
          borderColor: T.border,
          color: hasErrors ? T.danger : hasWarns ? T.gold : T.muted,
        }}
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : hasErrors ? (
          <AlertTriangle className="h-3 w-3" />
        ) : allOk ? (
          <CheckCircle2 className="h-3 w-3" />
        ) : (
          <ShieldCheck className="h-3 w-3" />
        )}
        {t("KPI-Abgleich", "KPI Check")}
      </Button>

      {open && result && (
        <div
          className="absolute right-0 top-full mt-2 z-50 w-[420px] rounded-2xl shadow-xl overflow-hidden"
          style={{ background: T.card, border: `1px solid ${T.border}` }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{
              background: hasErrors ? T.dangerLight : hasWarns ? "#FEF3C7" : T.successLight,
              borderBottom: `1px solid ${T.border}`,
            }}
          >
            <div className="flex items-center gap-2">
              {hasErrors ? (
                <AlertTriangle className="h-4 w-4" style={{ color: T.danger }} />
              ) : allOk ? (
                <CheckCircle2 className="h-4 w-4" style={{ color: T.success }} />
              ) : (
                <AlertTriangle className="h-4 w-4" style={{ color: T.gold }} />
              )}
              <span className="text-[13px] font-medium" style={{ color: T.ink }}>
                {t("KPI-Abgleich", "KPI Reconciliation")} · {rangeDays}d
              </span>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-black/5">
              <X className="h-3.5 w-3.5" style={{ color: T.muted }} />
            </button>
          </div>

          {/* Table */}
          <div className="px-4 py-3 space-y-0">
            <div className="grid grid-cols-[1fr_80px_80px_70px] gap-1 text-[10px] uppercase tracking-wider pb-2"
              style={{ color: T.muted, borderBottom: `1px solid ${T.border}` }}
            >
              <span>{t("Metrik", "Metric")}</span>
              <span className="text-right">{t("Operator", "Operator")}</span>
              <span className="text-right">{t("Revenue", "Revenue")}</span>
              <span className="text-right">{t("Δ", "Δ")}</span>
            </div>

            {result.map((r) => {
              const isRate = r.metric.includes("Rate") || r.metric.includes("%");
              const isEur = r.metric.includes("€") || r.metric.includes("Revenue");
              const formatVal = (v: number) =>
                isEur ? fmtEur(v) : isRate ? fmtPct(v) : Math.round(v).toLocaleString("de-DE");

              return (
                <div
                  key={r.metric}
                  className="grid grid-cols-[1fr_80px_80px_70px] gap-1 py-2 items-center"
                  style={{ borderBottom: `1px solid ${T.border}20` }}
                >
                  <div className="flex items-center gap-1.5">
                    <div
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        background: r.severity === "ok" ? T.success
                          : r.severity === "warn" ? T.gold : T.danger,
                      }}
                    />
                    <span className="text-[12px]" style={{ color: T.ink }}>{r.metric}</span>
                  </div>
                  <span className="text-[12px] text-right font-mono" style={{ color: T.ink }}>
                    {formatVal(r.operatorValue)}
                  </span>
                  <span className="text-[12px] text-right font-mono" style={{ color: T.ink }}>
                    {formatVal(r.revenueValue)}
                  </span>
                  <span
                    className="text-[11px] text-right font-mono font-medium"
                    style={{
                      color: r.severity === "ok" ? T.success
                        : r.severity === "warn" ? T.gold : T.danger,
                    }}
                  >
                    {r.deltaPct >= 0 ? "+" : ""}{r.deltaPct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 text-[10px]" style={{ color: T.muted, borderTop: `1px solid ${T.border}` }}>
            {t(
              "Operator = payment_links (SoT) · Revenue = calls + direkte Abfragen",
              "Operator = payment_links (SoT) · Revenue = calls + direct queries"
            )}
          </div>
        </div>
      )}
    </div>
  );
}
