/**
 * Profit Center Panel
 * ===================
 * Canon: Layer 47 · Revenue Engine · Profit Center view
 *
 * Shows each operator unit as a profit center with Revenue, CPL, rates,
 * net contribution, SLA compliance, and status label.
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageContext";
import { useOptionalPerformanceFilters } from "@/contexts/PerformanceFiltersContext";
import { Badge } from "@/components/ui/badge";
import { Building2, TrendingUp, Users } from "lucide-react";
import { UNIT_STATUS_CONFIG, type UnitStatusLabel } from "@/lib/operator-profit-center-canon";

const T = {
  bg: "#F8F5F0", card: "#FFFFFF", border: "#E8E2D9", ink: "#1A1A1A",
  secondary: "#6A6A6A", muted: "#9A9590", gold: "#C6A96B", goldLight: "#F5F0E6",
  danger: "#B04A3A", success: "#7A9E7E",
} as const;

interface UnitSummary {
  unit_id: string; unit_name: string; funnel_path: string;
  operator_name: string; operator_id: string;
  budget_monthly: number; status_label: UnitStatusLabel;
  team_size: number; leads: number; bookings: number; shows: number;
  closes: number; revenue: number; commissions: number; sla_compliance: number;
}

function fmt(n: number, unit: string) {
  if (unit === '€') return `€${n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (unit === '%') return `${n.toFixed(1)}%`;
  return String(n);
}

export default function ProfitCenterPanel() {
  const { tx } = useLanguage();
  const ctx = useOptionalPerformanceFilters();
  const rangeMap: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
  const rangeDays = rangeMap[ctx?.filters?.range ?? "30d"] ?? 30;

  const [units, setUnits] = useState<UnitSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_profit_center_summary" as any, {
      p_range_days: rangeDays,
    });
    if (!error && data) setUnits(data as unknown as UnitSummary[]);
    setLoading(false);
  }, [rangeDays]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-2xl p-6 animate-pulse" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <div className="h-4 w-48 rounded" style={{ background: T.border }} />
          </div>
        ))}
      </div>
    );
  }

  if (units.length === 0) {
    return (
      <div className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="h-4 w-4" style={{ color: T.gold }} />
          <h3 className="text-sm font-semibold" style={{ color: T.ink }}>Profit Centers</h3>
        </div>
        <p className="text-xs" style={{ color: T.muted }}>
          {tx("Keine Units verfügbar.", "No units available.")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="h-4 w-4" style={{ color: T.gold }} />
        <h3 className="text-sm font-semibold tracking-tight" style={{ color: T.ink }}>Profit Centers</h3>
      </div>

      {units.map((u) => {
        const bookingRate = u.leads > 0 ? (u.bookings / u.leads) * 100 : 0;
        const showRate = u.bookings > 0 ? (u.shows / u.bookings) * 100 : 0;
        const closeRate = u.shows > 0 ? (u.closes / u.shows) * 100 : 0;
        const rpl = u.leads > 0 ? u.revenue / u.leads : 0;
        const rps = u.shows > 0 ? u.revenue / u.shows : 0;
        const cpl = u.leads > 0 && u.budget_monthly > 0 ? u.budget_monthly / u.leads : 0;
        const netContrib = u.revenue - u.commissions - u.budget_monthly;
        const statusCfg = UNIT_STATUS_CONFIG[u.status_label] || UNIT_STATUS_CONFIG.hold;

        const kpis = [
          { l: tx("Revenue", "Revenue"), v: fmt(u.revenue, '€') },
          { l: "CPL", v: cpl > 0 ? fmt(cpl, '€') : "–" },
          { l: tx("Booking Rate", "Booking Rate"), v: fmt(bookingRate, '%') },
          { l: tx("Show Rate", "Show Rate"), v: fmt(showRate, '%') },
          { l: tx("Close Rate", "Close Rate"), v: fmt(closeRate, '%') },
          { l: tx("Rev/Lead", "Rev/Lead"), v: fmt(rpl, '€') },
          { l: tx("Rev/Show", "Rev/Show"), v: fmt(rps, '€') },
          { l: tx("Commissions", "Commissions"), v: fmt(u.commissions, '€') },
          { l: tx("Nettobeitrag", "Net Contribution"), v: fmt(netContrib, '€'), color: netContrib >= 0 ? T.success : T.danger },
          { l: "SLA", v: fmt(u.sla_compliance, '%'), color: u.sla_compliance >= 90 ? T.success : u.sla_compliance >= 70 ? '#D97706' : T.danger },
        ];

        return (
          <div key={u.unit_id} className="rounded-2xl p-4" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            {/* Unit Header */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[13px] font-semibold" style={{ color: T.ink }}>{u.unit_name}</div>
                <div className="text-[11px]" style={{ color: T.muted }}>
                  {u.operator_name} · <Users className="h-3 w-3 inline" /> {u.team_size} · {u.funnel_path}
                </div>
              </div>
              <Badge
                className="text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider"
                style={{ background: `${statusCfg.color}15`, color: statusCfg.color, border: `1px solid ${statusCfg.color}30` }}
              >
                {statusCfg.label[tx("de", "en") === "de" ? "de" : "en"]}
              </Badge>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-5 gap-2">
              {kpis.map((k) => (
                <div key={k.l} className="text-center rounded-lg py-1.5 px-1" style={{ background: T.bg }}>
                  <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: T.muted }}>{k.l}</div>
                  <div className="text-xs font-semibold tabular-nums" style={{ color: (k as any).color || T.ink }}>{k.v}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
