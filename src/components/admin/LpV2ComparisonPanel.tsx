/**
 * LpV2ComparisonPanel — read-only LP V1 vs LP V2 comparison.
 *
 * Reads `ab_slot_weights WHERE slot = 'home_hero_lp'`. Both variants
 * (lp_v1 = control, lp_v2 = treatment) are populated automatically by the
 * existing `ab-winner-rollup` edge function, which already implements the
 * requested business-weighted reward (Booking ×12 · HQL ×8 · Lead ×4 ·
 * QC ×2 · QS ×1) and Wilson lower-bound confidence. No custom math here —
 * we just present the numbers the rollup already produces.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trophy } from "lucide-react";

interface SlotRow {
  variant: string;
  weight: number;
  paused: boolean;
  is_winner: boolean;
  exposures: number;
  quiz_started_count: number;
  quiz_completed_count: number;
  lead_count: number;
  hql_count: number;
  booking_count: number;
  score: number;
  wilson_lower: number;
  confidence: number;
  confidence_level: string;
}

const SLOT = "home_hero_lp";
const LABELS: Record<string, string> = {
  lp_v1: "LP V1 · Control",
  lp_v2: "LP V2 · Diagnose",
};

function pct(n: number, d: number): string {
  return d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";
}

function fmt(n: number): string {
  return (n ?? 0).toLocaleString();
}

export default function LpV2ComparisonPanel() {
  const [rows, setRows] = useState<SlotRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("ab_slot_weights")
        .select(
          "variant, weight, paused, is_winner, exposures, quiz_started_count, quiz_completed_count, lead_count, hql_count, booking_count, score, wilson_lower, confidence, confidence_level",
        )
        .eq("slot", SLOT);
      if (data) setRows(data as SlotRow[]);
      setLoading(false);
    })();
  }, []);

  const variants = ["lp_v1", "lp_v2"]
    .map((k) => rows.find((r) => r.variant === k))
    .filter(Boolean) as SlotRow[];

  // Lift % winner vs control on business score (Wilson lower)
  const control = rows.find((r) => r.variant === "lp_v1");
  const treatment = rows.find((r) => r.variant === "lp_v2");
  const lift =
    control && treatment && control.wilson_lower > 0
      ? ((treatment.wilson_lower - control.wilson_lower) / control.wilson_lower) * 100
      : null;
  const winProb =
    rows.length > 0
      ? Math.max(...rows.map((r) => Number(r.weight) || 0))
      : 0;

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="font-serif text-lg">LP V1 vs LP V2</CardTitle>
            <CardDescription className="text-xs">
              Sticky-Bucket pro Session · Reward via Booking ×12 · HQL ×8 · Lead ×4 · QC ×2 · QS ×1 ·
              Wilson 95 % · Exploration Floor ≥ 5 %
            </CardDescription>
          </div>
          {lift !== null && (
            <Badge variant={lift >= 0 ? "default" : "destructive"} className="shrink-0">
              Lift {lift >= 0 ? "+" : ""}
              {lift.toFixed(1)}%
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {loading ? (
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : variants.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            Noch keine Daten · slot <code>{SLOT}</code> wartet auf erste Sessions.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {variants.map((v) => {
              const allocPct = (Number(v.weight) || 0) * 100;
              return (
                <div
                  key={v.variant}
                  className={`rounded-md border p-3 ${
                    v.is_winner ? "border-emerald-500/50 bg-emerald-50/30 dark:bg-emerald-950/10" : "border-border"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate font-mono text-sm font-semibold">
                        {LABELS[v.variant] ?? v.variant}
                      </span>
                      {v.is_winner && <Trophy className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                      {v.paused && <Badge variant="outline" className="text-[10px]">PAUSED</Badge>}
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {allocPct.toFixed(1)}% traffic
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <Metric label="LP Views" v={fmt(v.exposures)} />
                    <Metric label="Quiz Starts" v={fmt(v.quiz_started_count)} />
                    <Metric label="QS Rate" v={pct(v.quiz_started_count, v.exposures)} />
                    <Metric label="Completions" v={fmt(v.quiz_completed_count)} />
                    <Metric label="Comp Rate" v={pct(v.quiz_completed_count, v.quiz_started_count)} />
                    <Metric label="Leads" v={fmt(v.lead_count)} />
                    <Metric label="HQL" v={fmt(v.hql_count)} />
                    <Metric label="Bookings" v={fmt(v.booking_count)} />
                  </div>

                  <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-2 text-[11px]">
                    <span className="text-muted-foreground">
                      Reward · <span className="font-mono text-foreground">{(v.score ?? 0).toFixed(3)}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Conf · <span className="font-mono text-foreground">{((v.confidence ?? 0) * 100).toFixed(0)}%</span>{" "}
                      <span className="text-muted-foreground/70">({v.confidence_level || "—"})</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!loading && rows.length > 0 && (
          <p className="mt-3 text-[10px] text-muted-foreground">
            Win-Probability (Top-Variante) · <span className="font-mono">{(winProb * 100).toFixed(1)}%</span>
            {" · "}
            Optimierungsziel: nicht meiste Traffic, sondern meiste qualifizierte Bookings.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, v }: { label: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium tabular-nums">{v}</span>
    </div>
  );
}
