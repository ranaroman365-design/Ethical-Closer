import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, ArrowRight, RotateCcw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";
import { Link } from "react-router-dom";

interface FeedRow {
  change_id: string;
  module: string;
  change_type: string;
  reason: string;
  created_at: string;
  changed_by_kind: string;
  reversible: boolean;
  before_metric: Record<string, unknown> | null;
  after_metric: Record<string, unknown> | null;
  expected_impact: string | null;
}

function pickNum(m: Record<string, unknown> | null | undefined): { label: string; value: number } | null {
  if (!m) return null;
  const preferred = ["conversion", "conversion_rate", "reply_rate", "show_rate", "close_rate", "bookings", "revenue"];
  for (const k of preferred) if (typeof m[k] === "number") return { label: k.replace(/_/g, " "), value: m[k] as number };
  const first = Object.entries(m).find(([, v]) => typeof v === "number");
  return first ? { label: first[0].replace(/_/g, " "), value: first[1] as number } : null;
}

function isPercentLike(label: string) {
  return /rate|conversion|show|close|reply|ctr/i.test(label);
}

function fmt(label: string, v: number) {
  return isPercentLike(label) ? `${v.toFixed(1)}%` : v.toLocaleString();
}

export function LiveChangeFeed({ funnelKey }: { funnelKey?: string | null }) {
  const { lang } = useLanguage();
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void load();
    // Realtime subscribe
    const ch = supabase
      .channel("audit_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "change_audit_log" },
        () => { void load(); },
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(ch);
    };

    async function load() {
      setLoading(true);
      let q = supabase
        .from("change_audit_log")
        .select("change_id,module,change_type,reason,created_at,changed_by_kind,reversible,before_metric,after_metric,expected_impact")
        .order("created_at", { ascending: false })
        .limit(8);
      if (funnelKey) q = q.eq("scope_id", funnelKey);
      const { data } = await q;
      if (active && data) setRows(data as any);
      if (active) setLoading(false);
    }
  }, [funnelKey]);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-xs font-bold uppercase tracking-[0.14em]">
            {lang === "de" ? "Live Change Feed" : "Live Change Feed"}
          </h2>
        </div>
        <Button asChild size="sm" variant="ghost" className="gap-1">
          <Link to="/members/dashboard/audit-center">
            {lang === "de" ? "Alle Änderungen" : "All changes"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      {loading && rows.length === 0 ? (
        <div className="text-xs text-muted-foreground py-6 text-center">
          {lang === "de" ? "Lade…" : "Loading…"}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-muted-foreground py-6 text-center border border-dashed rounded-xl">
          {lang === "de" ? "Noch keine Änderungen erfasst." : "No changes recorded yet."}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => <FeedItem key={r.change_id} row={r} />)}
        </div>
      )}
    </Card>
  );
}

function FeedItem({ row }: { row: FeedRow }) {
  const before = useMemo(() => pickNum(row.before_metric), [row.before_metric]);
  const after = useMemo(() => pickNum(row.after_metric), [row.after_metric]);
  const delta = useMemo(() => {
    if (!before || !after || before.label !== after.label) return null;
    const diff = after.value - before.value;
    const pct = before.value === 0 ? null : (diff / Math.abs(before.value)) * 100;
    return { diff, pct };
  }, [before, after]);

  const tone =
    delta && delta.diff > 0 ? "text-emerald-600 dark:text-emerald-400" :
    delta && delta.diff < 0 ? "text-rose-600 dark:text-rose-400" :
    "text-muted-foreground";

  const icon =
    delta && delta.diff > 0 ? <TrendingUp className="h-3.5 w-3.5" /> :
    delta && delta.diff < 0 ? <TrendingDown className="h-3.5 w-3.5" /> :
    <Minus className="h-3.5 w-3.5" />;

  return (
    <div className="rounded-xl border border-border p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="font-mono text-[10px]">#{row.change_id.slice(0, 8)}</Badge>
        <Badge variant="outline" className="text-xs">{row.module.replace(/_/g, " ")}</Badge>
        <Badge className="text-xs">{row.change_type}</Badge>
        <Badge variant="secondary" className="text-xs">{row.changed_by_kind}</Badge>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {new Date(row.created_at).toLocaleString()}
        </span>
      </div>
      <p className="text-sm">{row.reason}</p>
      {(before || after || row.expected_impact) && (
        <div className="flex items-center gap-3 text-xs flex-wrap">
          {before && <span className="text-muted-foreground">Before: <span className="text-foreground font-medium">{fmt(before.label, before.value)}</span></span>}
          {after && <span className="text-muted-foreground">After: <span className="text-foreground font-medium">{fmt(after.label, after.value)}</span></span>}
          {delta && (
            <span className={`flex items-center gap-1 font-medium ${tone}`}>
              {icon}
              {delta.diff > 0 ? "+" : ""}{isPercentLike(before?.label ?? "") ? `${delta.diff.toFixed(1)}pp` : delta.diff.toLocaleString()}
              {delta.pct !== null && <span className="opacity-80">({delta.pct > 0 ? "+" : ""}{delta.pct.toFixed(1)}%)</span>}
            </span>
          )}
          {row.expected_impact && !delta && <span className="text-muted-foreground italic">{row.expected_impact}</span>}
          <Button asChild size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs gap-1">
            <Link to="/members/dashboard/audit-center">
              {row.reversible && <RotateCcw className="h-3 w-3" />}
              Details
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
