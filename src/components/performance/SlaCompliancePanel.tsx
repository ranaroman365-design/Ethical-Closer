/**
 * SLA Compliance Panel
 * ====================
 * Canon: Layer 47 · Intelligence · SLA Tracking
 *
 * Shows SLA compliance %, breaches, overdue tasks, team SLA score, trends.
 * Pulls from get_sla_compliance RPC. No fake data.
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageContext";
import { useOptionalPerformanceFilters } from "@/contexts/PerformanceFiltersContext";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Clock, ShieldCheck, TrendingDown } from "lucide-react";

const T = {
  bg: "#F8F5F0", card: "#FFFFFF", border: "#E8E2D9", ink: "#1A1A1A",
  secondary: "#6A6A6A", muted: "#9A9590", gold: "#C6A96B", goldLight: "#F5F0E6",
  danger: "#B04A3A", dangerLight: "#FDF2F0", success: "#7A9E7E", successLight: "#F2F7F3",
  amber: "#D97706", amberLight: "#FEF3C7",
} as const;

interface SlaData {
  total: number;
  completed: number;
  breached: number;
  pending: number;
  compliance_pct: number;
  by_level: Array<{ level: number; total: number; completed: number; breached: number; compliance_pct: number }>;
  recent_breaches: Array<{
    id: string; user_id: string; user_name: string;
    event_type: string; rule_key: string; description: string;
    due_at: string; created_at: string;
  }>;
}

const LEVEL_LABELS: Record<number, string> = {
  1: "L1 Opener", 2: "L2 Setter", 3: "L3 Sr. Setter",
  4: "L4 Closer", 5: "L5 Mgr. Closer", 6: "L6 Operator", 7: "L7 Director",
};

export default function SlaCompliancePanel() {
  const { tx } = useLanguage();
  const ctx = useOptionalPerformanceFilters();
  const rangeMap: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
  const rangeDays = rangeMap[ctx?.filters?.range ?? "30d"] ?? 30;
  const unitId = (ctx?.filters?.operator && ctx.filters.operator !== "__all") ? ctx.filters.operator : null;

  const [data, setData] = useState<SlaData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: result, error } = await supabase.rpc("get_sla_compliance" as any, {
      p_unit_id: unitId,
      p_range_days: rangeDays,
    });
    if (!error && result) setData(result as unknown as SlaData);
    setLoading(false);
  }, [unitId, rangeDays]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="rounded-2xl p-6 animate-pulse" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="h-4 w-40 rounded" style={{ background: T.border }} />
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="h-4 w-4" style={{ color: T.gold }} />
          <h3 className="text-sm font-semibold" style={{ color: T.ink }}>SLA Compliance</h3>
        </div>
        <p className="text-xs" style={{ color: T.muted }}>
          {tx("Keine SLA-Events im gewählten Zeitraum.", "No SLA events in selected range.")}
        </p>
      </div>
    );
  }

  const compColor = data.compliance_pct >= 90 ? T.success : data.compliance_pct >= 70 ? T.amber : T.danger;

  return (
    <div className="rounded-2xl p-5" style={{ background: T.card, border: `1px solid ${T.border}` }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" style={{ color: T.gold }} />
          <h3 className="text-sm font-semibold tracking-tight" style={{ color: T.ink }}>SLA Compliance</h3>
        </div>
        <span className="text-2xl font-bold tabular-nums" style={{ color: compColor }}>
          {data.compliance_pct}%
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { icon: CheckCircle, label: tx("Erfüllt", "Completed"), value: data.completed, color: T.success, bg: T.successLight },
          { icon: AlertTriangle, label: tx("Verletzt", "Breached"), value: data.breached, color: T.danger, bg: T.dangerLight },
          { icon: Clock, label: tx("Offen", "Pending"), value: data.pending, color: T.amber, bg: T.amberLight },
        ].map((c) => (
          <div key={c.label} className="rounded-xl p-3 text-center" style={{ background: c.bg }}>
            <c.icon className="h-3.5 w-3.5 mx-auto mb-1" style={{ color: c.color }} />
            <div className="text-lg font-bold tabular-nums" style={{ color: c.color }}>{c.value}</div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: c.color }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* By Level Breakdown */}
      {data.by_level.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: T.muted }}>
            {tx("Nach Level", "By Level")}
          </div>
          <div className="space-y-1.5">
            {data.by_level.map((l) => {
              const lc = l.compliance_pct >= 90 ? T.success : l.compliance_pct >= 70 ? T.amber : T.danger;
              return (
                <div key={l.level} className="flex items-center justify-between text-xs rounded-lg px-3 py-1.5"
                  style={{ background: `${T.bg}` }}>
                  <span style={{ color: T.ink }}>{LEVEL_LABELS[l.level] || `L${l.level}`}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] tabular-nums" style={{ color: T.muted }}>
                      {l.completed}/{l.total}
                    </span>
                    <span className="font-semibold tabular-nums" style={{ color: lc }}>
                      {l.compliance_pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Breaches */}
      {data.recent_breaches.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingDown className="h-3 w-3" style={{ color: T.danger }} />
            <span className="text-[10px] uppercase tracking-wider" style={{ color: T.danger }}>
              {tx("Letzte Verletzungen", "Recent Breaches")}
            </span>
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {data.recent_breaches.slice(0, 8).map((b) => (
              <div key={b.id} className="flex items-start justify-between text-[11px] rounded-lg px-3 py-2"
                style={{ background: T.dangerLight }}>
                <div>
                  <span className="font-medium" style={{ color: T.ink }}>{b.user_name}</span>
                  <span className="mx-1" style={{ color: T.muted }}>·</span>
                  <span style={{ color: T.danger }}>{b.description}</span>
                </div>
                <Badge variant="destructive" className="text-[9px] px-1.5 py-0 ml-2 shrink-0">
                  {b.rule_key}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
