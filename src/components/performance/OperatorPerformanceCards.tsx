/**
 * Operator Performance Cards — revenue unit overview with deep drilldown
 * Revenue truth from payment_links. Full chain: Unit→Member→Lead→Appointment→Call→Payment→Commission
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import KpiReconciliationButton from "./KpiReconciliationButton";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageContext";
import { useOptionalPerformanceFilters } from "@/contexts/PerformanceFiltersContext";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import LoadingTimeoutFallback from "@/components/ui/LoadingTimeoutFallback";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  ChevronRight, Loader2, Users, ArrowLeft, Phone, Calendar,
  DollarSign, AlertTriangle, CreditCard, BadgeCheck, FileText
} from "lucide-react";

const T = {
  bg: "#F8F5F0", card: "#FFFFFF", border: "#E8E2D9", ink: "#1A1A1A",
  secondary: "#6A6A6A", muted: "#9A9590", gold: "#C6A96B", goldLight: "#F5F0E6",
  danger: "#B04A3A", dangerLight: "#FDF2F0", success: "#7A9E7E", successLight: "#F2F7F3",
  amber: "#D97706", amberLight: "#FEF3C7",
} as const;

interface UnitPerf {
  unit_id: string; unit_name: string; funnel_path: string;
  operator_name: string; operator_id: string | null; team_size: number;
  total_leads: number; total_appointments: number; total_shows: number;
  total_closes: number; total_revenue: number; close_rate: number; show_rate: number;
  is_setup_pending: boolean;
}

interface DrillMember {
  member_id: string; team_role: string; full_name: string;
  email: string; level: number; leads_count: number;
  appointments_count: number; calls_count: number; revenue: number;
  commissions_total: number;
}

interface DrillLead {
  id: string; name: string; source: string; stage: string;
  created_at: string; deal_value: number | null;
  source_funnel: string | null; owner_id: string | null;
  setter_id: string | null; closer_id: string | null;
  booking_status: string | null; outcome: string | null;
  payment_status: string | null; no_show_flag: boolean | null;
  closed_at: string | null;
}

interface DrillAppointment {
  id: string; lead_id: string; starts_at: string;
  appointment_status: string; setter_id: string | null;
  closer_id: string | null; assigned_operator_id: string | null;
  attendance_flag: boolean | null; call_started_at: string | null;
  completed_at: string | null; outcome: string | null;
}

interface DrillCall {
  id: string; user_id: string; result: string | null;
  revenue: number | null; closed_at: string | null;
  created_at: string; lead_id: string | null;
  appointment_id: string | null; payment_link_id: string | null;
}

interface DrillPayment {
  id: string; lead_id: string | null; closer_id: string | null;
  amount: number; status: string; paid_at: string | null;
  refunded_at: string | null; disputed_at: string | null;
  created_at: string; call_id: string | null; appointment_id: string | null;
}

interface DrillCommission {
  id: string; call_id: string | null; user_id: string;
  role: string; amount: number; payout_status: string | null;
  eligible_at: string | null; paid_at: string | null; created_at: string;
}

interface DrillData {
  unit: any;
  members: DrillMember[];
  recent_leads: DrillLead[];
  recent_appointments: DrillAppointment[];
  recent_calls: DrillCall[];
  recent_payments: DrillPayment[];
  recent_commissions: DrillCommission[];
}

const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(Math.round(n || 0));
const fmtEur = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`;
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("de-DE") : "—";
const fmtDateTime = (d: string) => d ? new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

const ROLE_ORDER: Record<string, number> = { operator: 0, closer: 1, setter: 2, opener: 3 };

type DrillTab = "overview" | "leads" | "appointments" | "calls" | "payments" | "commissions";

export default function OperatorPerformanceCards() {
  const { lang } = useLanguage();
  const t = (de: string, en: string) => (lang === "de" ? de : en);
  const shellFilters = useOptionalPerformanceFilters();

  const [units, setUnits] = useState<UnitPerf[]>([]);
  const [loading, setLoading] = useState(true);
  const { timedOut } = useLoadingTimeout(loading);
  const [drillUnit, setDrillUnit] = useState<UnitPerf | null>(null);
  const [drillData, setDrillData] = useState<DrillData | null>(null);
  const [drillTab, setDrillTab] = useState<DrillTab>("overview");
  const [selectedMember, setSelectedMember] = useState<DrillMember | null>(null);
  const [loadingDrill, setLoadingDrill] = useState(false);

  const rangeDays = useMemo(() => {
    if (!shellFilters) return 30;
    const r = shellFilters.filters.range;
    return r === "7d" ? 7 : r === "90d" ? 90 : 30;
  }, [shellFilters?.filters.range]);

  const loadUnits = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_operator_unit_performance", { p_range_days: rangeDays });
      if (error) console.error("[OperatorPerf] error", error);
      else setUnits((data as unknown as UnitPerf[]) ?? []);
    } catch (e) { console.error("[OperatorPerf] failed", e); }
    finally { setLoading(false); }
  }, [rangeDays]);

  useEffect(() => { loadUnits(); }, [loadUnits]);

  const openDrill = useCallback(async (unit: UnitPerf) => {
    setDrillUnit(unit);
    setDrillTab("overview");
    setSelectedMember(null);
    setLoadingDrill(true);
    try {
      const { data, error } = await supabase.rpc("get_unit_drilldown", {
        p_unit_id: unit.unit_id, p_range_days: rangeDays,
      });
      if (error) { console.error("[OperatorPerf] drilldown error", error); setDrillData(null); }
      else {
        const d = data as unknown as DrillData;
        if (d?.members) d.members.sort((a, b) => (ROLE_ORDER[a.team_role] ?? 9) - (ROLE_ORDER[b.team_role] ?? 9));
        setDrillData(d);
      }
    } catch (e) { console.error("[OperatorPerf] drilldown failed", e); }
    finally { setLoadingDrill(false); }
  }, [rangeDays]);

  // Separate active units from setup-pending
  const activeUnits = units.filter(u => !u.is_setup_pending);
  const pendingUnits = units.filter(u => u.is_setup_pending);

  if (loading) {
    if (timedOut) return <LoadingTimeoutFallback onRetry={loadUnits} />;
    return (
      <div className="flex items-center gap-2 py-6 text-[13px]" style={{ color: T.muted }}>
        <Loader2 className="h-4 w-4 animate-spin" /> {t("Lade Operator Units…", "Loading Operator Units…")}
      </div>
    );
  }

  if (!units.length) {
    return (
      <section className="rounded-2xl p-8 text-center" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <Users className="h-10 w-10 mx-auto mb-3" style={{ color: T.border }} />
        <h3 className="text-[15px] font-medium mb-1" style={{ color: T.ink }}>
          {t("Keine Operator Units gefunden", "No Operator Units found")}
        </h3>
        <p className="text-[12px] max-w-md mx-auto" style={{ color: T.muted }}>
          {t(
            "Im gewählten Zeitraum wurden keine aktiven Units erkannt. Prüfe die Teamzuweisungen oder wähle einen anderen Zeitraum.",
            "No active units detected for the selected period. Check team assignments or pick a different range."
          )}
        </p>
      </section>
    );
  }

  const TABS: { key: DrillTab; label: string; icon: any; count?: number }[] = [
    { key: "overview", label: t("Übersicht", "Overview"), icon: Users },
    { key: "leads", label: "Leads", icon: FileText, count: drillData?.recent_leads?.length },
    { key: "appointments", label: t("Termine", "Appointments"), icon: Calendar, count: drillData?.recent_appointments?.length },
    { key: "calls", label: "Calls", icon: Phone, count: drillData?.recent_calls?.length },
    { key: "payments", label: "Payments", icon: CreditCard, count: drillData?.recent_payments?.length },
    { key: "commissions", label: "Commissions", icon: BadgeCheck, count: drillData?.recent_commissions?.length },
  ];

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-medium tracking-[-0.01em]" style={{ color: T.ink }}>
          {t("Operator Performance", "Operator Performance")}
        </h2>
        <div className="flex items-center gap-3">
          <KpiReconciliationButton rangeDays={rangeDays} />
          <span className="text-[11px]" style={{ color: T.muted }}>
            {activeUnits.length} {t("aktive Units", "active units")} · {rangeDays}d
          </span>
        </div>
      </div>

      {/* Active Units */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {activeUnits.map((u) => (
          <UnitCard key={u.unit_id} u={u} onClick={() => openDrill(u)} t={t} />
        ))}
      </div>

      {/* Setup Pending Units */}
      {pendingUnits.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: T.amber }}>
            <AlertTriangle className="h-3 w-3" /> {t("Setup ausstehend", "Setup Pending")}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {pendingUnits.map((u) => (
              <div
                key={u.unit_id}
                onClick={() => openDrill(u)}
                className="rounded-2xl p-5 cursor-pointer transition-all hover:shadow-md opacity-70"
                style={{ background: T.amberLight, border: `1px solid ${T.amber}40` }}
              >
                <div className="text-[14px] font-medium" style={{ color: T.ink }}>{u.unit_name}</div>
                <div className="text-[11px] mt-0.5" style={{ color: T.muted }}>{u.funnel_path}</div>
                <div
                  className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-lg inline-block mt-3 font-medium"
                  style={{ background: T.amberLight, color: T.amber }}
                >
                  {t("Operator zuweisen", "Assign Operator")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drilldown Sheet */}
      <Sheet open={drillUnit !== null} onOpenChange={(o) => { if (!o) { setDrillUnit(null); setDrillData(null); setSelectedMember(null); } }}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl overflow-y-auto p-0"
          style={{ background: T.bg, borderLeft: `1px solid ${T.border}` }}
        >
          {drillUnit && (
            <div className="px-6 py-8 space-y-6">
              {/* Header */}
              <div>
                <div className="text-[11px] uppercase tracking-wider" style={{ color: T.muted }}>Operator Unit</div>
                <h2 className="text-[24px] font-light mt-1" style={{ fontFamily: "'Cormorant Garamond', serif", color: T.ink }}>
                  {drillUnit.unit_name}
                </h2>
                <div className="text-[12px] mt-1" style={{ color: T.secondary }}>
                  {t("Funnel", "Funnel")}: {drillUnit.funnel_path} · {t("Operator", "Operator")}: {drillUnit.operator_name}
                  {drillUnit.is_setup_pending && (
                    <span className="ml-2 text-[10px] uppercase font-medium px-1.5 py-0.5 rounded" style={{ background: T.amberLight, color: T.amber }}>
                      Setup Pending
                    </span>
                  )}
                </div>
              </div>

              {/* Tab Bar */}
              <div className="flex gap-1 overflow-x-auto pb-1">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => { setDrillTab(tab.key); if (tab.key !== "overview") setSelectedMember(null); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all"
                    style={{
                      background: drillTab === tab.key ? T.gold + "20" : "transparent",
                      color: drillTab === tab.key ? T.gold : T.muted,
                      border: `1px solid ${drillTab === tab.key ? T.gold + "40" : "transparent"}`,
                    }}
                  >
                    <tab.icon className="h-3 w-3" />
                    {tab.label}
                    {tab.count !== undefined && <span className="text-[9px] opacity-60">({tab.count})</span>}
                  </button>
                ))}
              </div>

              {loadingDrill ? (
                <div className="flex items-center gap-2 text-[12px] py-8" style={{ color: T.muted }}>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                </div>
              ) : drillTab === "overview" ? (
                <>
                  {/* KPI Summary */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { l: "Leads", v: fmt(drillUnit.total_leads) },
                      { l: "Appointments", v: fmt(drillUnit.total_appointments) },
                      { l: "Shows", v: fmt(drillUnit.total_shows) },
                      { l: "Closes", v: fmt(drillUnit.total_closes) },
                      { l: "Revenue", v: fmtEur(drillUnit.total_revenue) },
                      { l: "Team", v: String(drillUnit.team_size) },
                    ].map((s) => (
                      <div key={s.l} className="rounded-xl px-3 py-2.5" style={{ background: T.card, border: `1px solid ${T.border}` }}>
                        <div className="text-[10px] uppercase tracking-wider" style={{ color: T.muted }}>{s.l}</div>
                        <div className="text-[14px] font-semibold tabular-nums mt-0.5" style={{ color: T.ink }}>{s.v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Team Members */}
                  {selectedMember ? (
                    <>
                      <button onClick={() => setSelectedMember(null)} className="flex items-center gap-1 text-[12px] hover:underline" style={{ color: T.gold }}>
                        <ArrowLeft className="h-3.5 w-3.5" /> {t("Zurück", "Back")}
                      </button>
                      <MemberDetail member={selectedMember} t={t} />
                    </>
                  ) : (
                    <div>
                      <div className="text-[11px] uppercase tracking-wider mb-3" style={{ color: T.muted }}>
                        {t("Team-Mitglieder", "Team Members")}
                      </div>
                      {!drillData?.members?.length ? (
                        <div className="text-[12px]" style={{ color: T.muted }}>{t("Keine Mitglieder zugewiesen", "No members assigned")}</div>
                      ) : (
                        <div className="space-y-1.5">
                          {drillData.members.map((m) => (
                            <div
                              key={m.member_id}
                              onClick={() => setSelectedMember(m)}
                              className="flex items-center justify-between px-4 py-2.5 rounded-xl cursor-pointer hover:shadow-sm transition-all"
                              style={{ background: T.card, border: `1px solid ${T.border}` }}
                            >
                              <div>
                                <div className="text-[13px] font-medium" style={{ color: T.ink }}>{m.full_name}</div>
                                <div className="text-[11px]" style={{ color: T.muted }}>L{m.level} · {m.team_role}</div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <div className="text-[11px] tabular-nums" style={{ color: T.ink }}>{fmtEur(m.revenue)}</div>
                                  <div className="text-[10px]" style={{ color: T.muted }}>
                                    {m.leads_count} Leads · {m.calls_count} Calls · {fmtEur(m.commissions_total)} Com.
                                  </div>
                                </div>
                                <ChevronRight className="h-3.5 w-3.5" style={{ color: T.border }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : drillTab === "leads" ? (
                <LeadsTab leads={drillData?.recent_leads ?? []} t={t} />
              ) : drillTab === "appointments" ? (
                <AppointmentsTab appointments={drillData?.recent_appointments ?? []} t={t} />
              ) : drillTab === "calls" ? (
                <CallsTab calls={drillData?.recent_calls ?? []} t={t} />
              ) : drillTab === "payments" ? (
                <PaymentsTab payments={drillData?.recent_payments ?? []} t={t} />
              ) : drillTab === "commissions" ? (
                <CommissionsTab commissions={drillData?.recent_commissions ?? []} t={t} />
              ) : null}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

/* ── Sub-components ── */

function UnitCard({ u, onClick, t }: { u: UnitPerf; onClick: () => void; t: (de: string, en: string) => string }) {
  const hasData = u.total_leads > 0 || u.total_appointments > 0;
  return (
    <div
      onClick={onClick}
      className="rounded-2xl p-5 cursor-pointer transition-all hover:shadow-md"
      style={{ background: T.card, border: `1px solid ${T.border}` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[14px] font-medium" style={{ color: T.ink }}>{u.unit_name}</div>
          <div className="text-[11px] mt-0.5" style={{ color: T.muted }}>{u.funnel_path}</div>
        </div>
        <div className="flex items-center gap-1 text-[11px]" style={{ color: T.secondary }}>
          <Users className="h-3.5 w-3.5" /> {u.team_size}
        </div>
      </div>
      <div
        className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-lg inline-block mb-3 font-medium"
        style={{ background: T.goldLight, color: T.gold }}
      >
        {u.operator_name}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <KpiMini label="Leads" value={hasData ? fmt(u.total_leads) : "—"} />
        <KpiMini label="Appointments" value={hasData ? fmt(u.total_appointments) : "—"} />
        <KpiMini label="Shows" value={hasData ? fmt(u.total_shows) : "—"} />
        <KpiMini label="Closes" value={hasData ? fmt(u.total_closes) : "—"} />
        <KpiMini label="Close Rate" value={hasData ? fmtPct(u.close_rate) : "—"} />
        <KpiMini label="Revenue" value={hasData ? fmtEur(u.total_revenue) : "—"} highlight />
      </div>
      <div className="flex justify-end mt-3">
        <ChevronRight className="h-4 w-4" style={{ color: T.border }} />
      </div>
    </div>
  );
}

function MemberDetail({ member, t }: { member: DrillMember; t: (de: string, en: string) => string }) {
  return (
    <>
      <div>
        <h2 className="text-[20px] font-light" style={{ fontFamily: "'Cormorant Garamond', serif", color: T.ink }}>
          {member.full_name}
        </h2>
        <div className="text-[12px] mt-1" style={{ color: T.secondary }}>
          L{member.level} · {member.team_role} · {member.email}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { l: "Leads", v: fmt(member.leads_count), icon: Users },
          { l: t("Termine", "Appointments"), v: fmt(member.appointments_count), icon: Calendar },
          { l: "Calls", v: fmt(member.calls_count), icon: Phone },
          { l: "Revenue", v: fmtEur(member.revenue), icon: DollarSign },
          { l: "Commissions", v: fmtEur(member.commissions_total), icon: BadgeCheck },
        ].map((s) => (
          <div key={s.l} className="rounded-xl px-4 py-3" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-1.5 mb-1">
              <s.icon className="h-3 w-3" style={{ color: T.muted }} />
              <span className="text-[10px] uppercase tracking-wider" style={{ color: T.muted }}>{s.l}</span>
            </div>
            <div className="text-[16px] font-semibold tabular-nums" style={{ color: T.ink }}>{s.v}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function LeadsTab({ leads, t }: { leads: DrillLead[]; t: (de: string, en: string) => string }) {
  if (!leads.length) return <EmptyState label={t("Keine Leads", "No leads")} />;
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: T.muted }}>
        Leads ({leads.length})
      </div>
      {leads.map((l) => (
        <div key={l.id} className="rounded-xl px-4 py-3" style={{ background: T.card, border: `1px solid ${T.border}` }}>
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-medium" style={{ color: T.ink }}>{l.name || "—"}</div>
            {l.deal_value ? <span className="text-[12px] font-medium tabular-nums" style={{ color: T.gold }}>{fmtEur(l.deal_value)}</span> : null}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[10px]" style={{ color: T.muted }}>
            <span>Source: {l.source || "—"}</span>
            <span>Funnel: {l.source_funnel || "—"}</span>
            <span>Stage: {l.stage || "—"}</span>
            <span>Booking: {l.booking_status || "—"}</span>
            <span>Outcome: {l.outcome || "—"}</span>
            <span>Payment: {l.payment_status || "—"}</span>
            {l.no_show_flag && <span style={{ color: T.danger }}>No-Show</span>}
            <span>{fmtDate(l.created_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AppointmentsTab({ appointments, t }: { appointments: DrillAppointment[]; t: (de: string, en: string) => string }) {
  if (!appointments.length) return <EmptyState label={t("Keine Termine", "No appointments")} />;
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: T.muted }}>
        {t("Termine", "Appointments")} ({appointments.length})
      </div>
      {appointments.map((a) => (
        <div key={a.id} className="rounded-xl px-4 py-3" style={{ background: T.card, border: `1px solid ${T.border}` }}>
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium tabular-nums" style={{ color: T.ink }}>{fmtDateTime(a.starts_at)}</span>
            <StatusBadge status={a.appointment_status} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[10px]" style={{ color: T.muted }}>
            <span>Outcome: {a.outcome || "—"}</span>
            <span>Show: {a.attendance_flag === true ? "✓" : a.attendance_flag === false ? "✗" : "—"}</span>
            {a.call_started_at && <span>Call: {fmtDateTime(a.call_started_at)}</span>}
            {a.completed_at && <span>Completed: {fmtDateTime(a.completed_at)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function CallsTab({ calls, t }: { calls: DrillCall[]; t: (de: string, en: string) => string }) {
  if (!calls.length) return <EmptyState label={t("Keine Calls", "No calls")} />;
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: T.muted }}>
        Calls ({calls.length})
      </div>
      {calls.map((c) => (
        <div key={c.id} className="rounded-xl px-4 py-3" style={{ background: T.card, border: `1px solid ${T.border}` }}>
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium tabular-nums" style={{ color: T.ink }}>{fmtDateTime(c.created_at)}</span>
            <StatusBadge status={c.result || "pending"} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[10px]" style={{ color: T.muted }}>
            {c.revenue ? <span style={{ color: T.gold }}>Revenue: {fmtEur(c.revenue)}</span> : null}
            {c.closed_at && <span>Closed: {fmtDateTime(c.closed_at)}</span>}
            {c.payment_link_id && <span>Payment Link: ✓</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function PaymentsTab({ payments, t }: { payments: DrillPayment[]; t: (de: string, en: string) => string }) {
  if (!payments.length) return <EmptyState label={t("Keine Payments", "No payments")} />;
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: T.muted }}>
        Payments ({payments.length})
      </div>
      {payments.map((p) => (
        <div key={p.id} className="rounded-xl px-4 py-3" style={{ background: T.card, border: `1px solid ${T.border}` }}>
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-semibold tabular-nums" style={{ color: T.ink }}>{fmtEur(p.amount / 100)}</span>
            <StatusBadge status={p.status} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[10px]" style={{ color: T.muted }}>
            <span>Created: {fmtDateTime(p.created_at)}</span>
            {p.paid_at && <span style={{ color: T.success }}>Paid: {fmtDateTime(p.paid_at)}</span>}
            {p.refunded_at && <span style={{ color: T.danger }}>Refunded: {fmtDateTime(p.refunded_at)}</span>}
            {p.disputed_at && <span style={{ color: T.danger }}>Disputed: {fmtDateTime(p.disputed_at)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function CommissionsTab({ commissions, t }: { commissions: DrillCommission[]; t: (de: string, en: string) => string }) {
  if (!commissions.length) return <EmptyState label={t("Keine Commissions", "No commissions")} />;
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: T.muted }}>
        Commissions ({commissions.length})
      </div>
      {commissions.map((c) => (
        <div key={c.id} className="rounded-xl px-4 py-3" style={{ background: T.card, border: `1px solid ${T.border}` }}>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[13px] font-semibold tabular-nums" style={{ color: T.gold }}>{fmtEur(c.amount)}</span>
              <span className="text-[10px] ml-2" style={{ color: T.muted }}>{c.role}</span>
            </div>
            <StatusBadge status={c.payout_status || "pending"} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[10px]" style={{ color: T.muted }}>
            <span>Created: {fmtDateTime(c.created_at)}</span>
            {c.eligible_at && <span>Eligible: {fmtDate(c.eligible_at)}</span>}
            {c.paid_at && <span style={{ color: T.success }}>Paid: {fmtDate(c.paid_at)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isGood = ["paid", "completed", "closed", "approved"].includes(status);
  const isBad = ["no_show", "cancelled", "expired", "refunded", "disputed", "reversed"].includes(status);
  const bg = isGood ? T.successLight : isBad ? T.dangerLight : T.goldLight;
  const color = isGood ? T.success : isBad ? T.danger : T.amber;
  return (
    <span className="text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded" style={{ background: bg, color }}>
      {status}
    </span>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="text-[12px] py-8 text-center" style={{ color: T.muted }}>{label}</div>;
}

function KpiMini({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: T.muted }}>{label}</div>
      <div className="text-[13px] tabular-nums font-medium" style={{ color: highlight ? T.gold : T.ink }}>{value}</div>
    </div>
  );
}
