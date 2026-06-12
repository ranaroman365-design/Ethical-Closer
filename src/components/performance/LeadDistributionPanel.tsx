/**
 * Lead Distribution Intelligence Panel
 * Shows talent-score-based lead allocation per unit.
 * Visualises recommended vs actual share, highlights imbalances.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, TrendingUp, AlertTriangle, CheckCircle, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const T = {
  bg: "#F8F5F0", card: "#FFFFFF", border: "#E8E2D9", ink: "#1A1A1A",
  secondary: "#6A6A6A", muted: "#9A9590", gold: "#C6A96B", goldLight: "#F5F0E6",
  danger: "#B04A3A", dangerLight: "#FDF2F0", success: "#7A9E7E", successLight: "#F2F7F3",
  orange: "#C87E3A", orangeLight: "#FDF6EE",
} as const;

interface DistRow {
  unit_id: string;
  unit_name: string;
  funnel_path: string;
  member_id: string;
  member_name: string;
  team_role: string;
  talent_score: number;
  talent_category: string;
  current_lead_count: number;
  recommended_share_pct: number;
  actual_share_pct: number;
  delta_pct: number;
  status: "balanced" | "over_allocated" | "under_allocated";
}

interface Props {
  userId: string | undefined;
  t: (de: string, en: string) => string;
  lang: string;
}

const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`;

const STATUS_STYLE: Record<string, { color: string; bg: string; label: { de: string; en: string } }> = {
  balanced: { color: T.success, bg: T.successLight, label: { de: "Balanciert", en: "Balanced" } },
  over_allocated: { color: T.orange, bg: T.orangeLight, label: { de: "Über-Allokiert", en: "Over-Allocated" } },
  under_allocated: { color: T.danger, bg: T.dangerLight, label: { de: "Unter-Allokiert", en: "Under-Allocated" } },
};

const CATEGORY_STYLE: Record<string, { color: string; bg: string }> = {
  a_player: { color: T.gold, bg: T.goldLight },
  stable: { color: T.secondary, bg: "#F4F3F0" },
  risk: { color: T.orange, bg: T.orangeLight },
  critical: { color: T.danger, bg: T.dangerLight },
};

export default function LeadDistributionPanel({ userId, t, lang }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DistRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc("get_lead_distribution" as any, {
        p_user_id: userId,
      });
      if (err) {
        console.error("[LeadDist]", err);
        setError(err.message);
      } else {
        setRows((data as unknown as DistRow[]) ?? []);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: T.gold }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border p-6 text-center" style={{ borderColor: T.border, background: T.card }}>
        <AlertTriangle className="h-5 w-5 mx-auto mb-2" style={{ color: T.danger }} />
        <p className="text-sm" style={{ color: T.secondary }}>{error}</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border p-8 text-center" style={{ borderColor: T.border, background: T.card }}>
        <Users className="h-6 w-6 mx-auto mb-3" style={{ color: T.muted }} />
        <p className="text-sm font-medium" style={{ color: T.ink }}>{t("Keine Verteilungsdaten", "No distribution data")}</p>
        <p className="text-xs mt-1" style={{ color: T.muted }}>{t("Keine Units mit Team-Mitgliedern gefunden.", "No units with team members found.")}</p>
      </div>
    );
  }

  // Group by unit
  const units = new Map<string, { name: string; funnel: string; members: DistRow[] }>();
  for (const r of rows) {
    if (!units.has(r.unit_id)) {
      units.set(r.unit_id, { name: r.unit_name, funnel: r.funnel_path, members: [] });
    }
    units.get(r.unit_id)!.members.push(r);
  }

  // KPI summary
  const totalMembers = rows.length;
  const balanced = rows.filter(r => r.status === "balanced").length;
  const imbalanced = totalMembers - balanced;

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: t("Units", "Units"), value: units.size, icon: BarChart3 },
          { label: t("Mitglieder", "Members"), value: totalMembers, icon: Users },
          { label: t("Balanciert", "Balanced"), value: balanced, icon: CheckCircle, color: T.success },
          { label: t("Imbalanciert", "Imbalanced"), value: imbalanced, icon: AlertTriangle, color: imbalanced > 0 ? T.orange : T.muted },
        ].map((kpi, i) => (
          <div key={i} className="rounded-2xl border p-4" style={{ borderColor: T.border, background: T.card }}>
            <div className="flex items-center gap-2 mb-1">
              <kpi.icon className="h-3.5 w-3.5" style={{ color: kpi.color || T.muted }} />
              <span className="text-[11px] uppercase tracking-wider" style={{ color: T.secondary }}>{kpi.label}</span>
            </div>
            <span className="text-xl font-semibold" style={{ color: T.ink }}>{kpi.value}</span>
          </div>
        ))}
      </div>

      {/* Per-unit cards */}
      {Array.from(units.entries()).map(([unitId, unit]) => {
        const totalLeads = unit.members.reduce((a, m) => a + m.current_lead_count, 0);
        return (
          <div key={unitId} className="rounded-2xl border overflow-hidden" style={{ borderColor: T.border, background: T.card }}>
            {/* Unit header */}
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: T.border, background: T.bg }}>
              <div>
                <span className="text-sm font-semibold" style={{ color: T.ink }}>{unit.name}</span>
                <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full" style={{ background: T.goldLight, color: T.gold }}>{unit.funnel}</span>
              </div>
              <span className="text-xs" style={{ color: T.secondary }}>
                {totalLeads} {t("Leads (30d)", "Leads (30d)")} · {unit.members.length} {t("Mitglieder", "Members")}
              </span>
            </div>

            {/* Member rows */}
            <div className="divide-y" style={{ borderColor: T.border + "60" }}>
              {unit.members.map((m) => {
                const st = STATUS_STYLE[m.status] || STATUS_STYLE.balanced;
                const cat = CATEGORY_STYLE[m.talent_category] || CATEGORY_STYLE.risk;
                const barMax = Math.max(...unit.members.map(x => Math.max(x.recommended_share_pct, x.actual_share_pct)), 1);

                return (
                  <div key={m.member_id} className="px-5 py-3">
                    {/* Name + badges */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium" style={{ color: T.ink }}>{m.member_name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: cat.bg, color: cat.color }}>
                          {m.talent_category?.replace("_", " ")}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: st.bg, color: st.color }}>
                          {st.label[lang as "de" | "en"] ?? st.label.de}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px]" style={{ color: T.secondary }}>
                        <span>{t("Rolle", "Role")}: <span style={{ color: T.ink }}>{m.team_role}</span></span>
                        <span>{t("Score", "Score")}: <span className="font-semibold" style={{ color: m.talent_score >= 60 ? T.gold : T.orange }}>{m.talent_score.toFixed(0)}</span></span>
                        <span>{t("Leads", "Leads")}: <span style={{ color: T.ink }}>{m.current_lead_count}</span></span>
                      </div>
                    </div>

                    {/* Distribution bars */}
                    <div className="grid grid-cols-[100px_1fr_60px] items-center gap-2 text-[11px]">
                      <span style={{ color: T.secondary }}>{t("Empfohlen", "Recommended")}</span>
                      <div className="h-3 rounded-full overflow-hidden" style={{ background: T.bg }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min((m.recommended_share_pct / barMax) * 100, 100)}%`,
                            background: T.gold,
                          }}
                        />
                      </div>
                      <span className="text-right font-medium" style={{ color: T.gold }}>{fmtPct(m.recommended_share_pct)}</span>
                    </div>
                    <div className="grid grid-cols-[100px_1fr_60px] items-center gap-2 text-[11px] mt-1">
                      <span style={{ color: T.secondary }}>{t("Tatsächlich", "Actual")}</span>
                      <div className="h-3 rounded-full overflow-hidden" style={{ background: T.bg }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min((m.actual_share_pct / barMax) * 100, 100)}%`,
                            background: m.status === "balanced" ? T.success : m.status === "over_allocated" ? T.orange : T.danger,
                          }}
                        />
                      </div>
                      <span className="text-right font-medium" style={{ color: st.color }}>{fmtPct(m.actual_share_pct)}</span>
                    </div>

                    {/* Delta indicator */}
                    {Math.abs(m.delta_pct) >= 5 && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-[10px]" style={{ color: st.color }}>
                        <TrendingUp className="h-3 w-3" />
                        <span>
                          {m.delta_pct > 0
                            ? t(`${fmtPct(m.delta_pct)} unter Empfehlung`, `${fmtPct(m.delta_pct)} below recommendation`)
                            : t(`${fmtPct(Math.abs(m.delta_pct))} über Empfehlung`, `${fmtPct(Math.abs(m.delta_pct))} above recommendation`)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
