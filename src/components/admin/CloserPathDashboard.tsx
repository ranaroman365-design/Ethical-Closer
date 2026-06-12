import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, RefreshCw, TrendingDown, BarChart3 } from "lucide-react";
import { CLOSERPATH_EVENTS, type CloserPathEvent } from "@/lib/track-closerpath";

type Counts = Record<CloserPathEvent, number>;

const EMPTY_COUNTS: Counts = CLOSERPATH_EVENTS.reduce((acc, k) => {
  acc[k] = 0;
  return acc;
}, {} as Counts);

interface StepKpi {
  key: string;
  label: string;
  numeratorEvent: CloserPathEvent;
  denominatorEvent: CloserPathEvent;
  benchmark: number; // expected conversion (0-1)
}

// LOCKED KPI definitions — one formula per step.
const KPIS: StepKpi[] = [
  { key: "lp_to_quiz",       label: "LP → Quiz",       numeratorEvent: "quiz_started",     denominatorEvent: "lp_view",          benchmark: 0.40 },
  { key: "quiz_to_lead",     label: "Quiz → Lead",     numeratorEvent: "lead_submitted",   denominatorEvent: "quiz_started",     benchmark: 0.65 },
  { key: "lead_to_booking",  label: "Lead → Booking",  numeratorEvent: "booking_viewed",   denominatorEvent: "lead_submitted",   benchmark: 0.50 },
  { key: "booking_to_show",  label: "Booking → Show",  numeratorEvent: "call_showed",      denominatorEvent: "booking_viewed",   benchmark: 0.60 },
  { key: "show_to_close",    label: "Show → Close",    numeratorEvent: "deal_won",         denominatorEvent: "call_showed",      benchmark: 0.30 },
];

function pct(n: number, d: number) {
  if (d === 0) return 0;
  return n / d;
}

function fmtPct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function rangeToSince(range: string): string {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 86400000).toISOString();
}

export default function CloserPathDashboard() {
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("30d");

  const fetchCounts = async () => {
    setLoading(true);
    const since = rangeToSince(range);

    const { data, error } = await supabase
      .from("funnel_events_v2")
      .select("event_type")
      .eq("event_source", "closerpath")
      .gte("created_at", since)
      .limit(10000);

    if (error) {
      console.warn("[closerpath dashboard] fetch failed:", error);
      setCounts(EMPTY_COUNTS);
      setLoading(false);
      return;
    }

    const next: Counts = { ...EMPTY_COUNTS };
    for (const row of data ?? []) {
      const ev = row.event_type as CloserPathEvent;
      if (ev in next) next[ev] = (next[ev] ?? 0) + 1;
    }
    setCounts(next);
    setLoading(false);
  };

  useEffect(() => { fetchCounts(); }, [range]);

  const kpiRows = useMemo(() => {
    return KPIS.map((k) => {
      const num = counts[k.numeratorEvent] ?? 0;
      const den = counts[k.denominatorEvent] ?? 0;
      const rate = pct(num, den);
      const delta = rate - k.benchmark;
      return { ...k, num, den, rate, delta };
    });
  }, [counts]);

  // Bottleneck = step with largest negative delta vs benchmark, requires sample.
  const bottleneck = useMemo(() => {
    const eligible = kpiRows.filter((r) => r.den >= 5 && r.delta < 0);
    if (eligible.length === 0) return null;
    return eligible.reduce((worst, r) => (r.delta < worst.delta ? r : worst));
  }, [kpiRows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          /closerpath — Funnel Performance
        </h1>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 Tage</SelectItem>
              <SelectItem value="30d">30 Tage</SelectItem>
              <SelectItem value="90d">90 Tage</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchCounts} className="h-8" disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Bottleneck banner */}
      {bottleneck ? (
        <Card className="p-4 border-destructive/40 bg-destructive/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm">Primary bottleneck: {bottleneck.label}</p>
                <Badge variant="destructive" className="text-[10px]">P0</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Conversion: <span className="font-mono font-semibold text-foreground">{fmtPct(bottleneck.rate)}</span>
                {" · "}Expected: <span className="font-mono">{fmtPct(bottleneck.benchmark)}</span>
                {" · "}Gap: <span className="font-mono text-destructive">{fmtPct(bottleneck.delta)}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {recommendationFor(bottleneck.key)}
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-4 border-border/40 bg-card">
          <div className="flex items-center gap-2 text-sm">
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              No bottleneck detected yet (need ≥ 5 events per step). Drive traffic to <code>/closerpath</code> and refresh.
            </span>
          </div>
        </Card>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpiRows.map((r) => {
          const positive = r.delta >= 0;
          return (
            <Card key={r.key} className="p-4 border-border/40">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{r.label}</p>
              <p className="text-2xl font-bold mt-1 font-mono">{r.den === 0 ? "—" : fmtPct(r.rate)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{r.num} / {r.den}</p>
              <p className={`text-[10px] mt-1 font-mono ${positive ? "text-emerald-500" : "text-destructive"}`}>
                {r.den === 0 ? " " : `${positive ? "+" : ""}${fmtPct(r.delta)} vs benchmark`}
              </p>
            </Card>
          );
        })}
      </div>

      {/* Funnel flow */}
      <Card className="p-5 border-border/40">
        <h3 className="font-display text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">
          Funnel Flow (last {range})
        </h3>
        <div className="space-y-2">
          {[
            { label: "LP Views",       value: counts.lp_view },
            { label: "Quiz Started",   value: counts.quiz_started },
            { label: "Quiz Completed", value: counts.quiz_completed },
            { label: "Lead Submitted", value: counts.lead_submitted },
            { label: "Result Viewed",  value: counts.result_viewed },
            { label: "Booking Viewed", value: counts.booking_viewed },
            { label: "Booking Done",   value: counts.booking_completed },
            { label: "Call Showed",    value: counts.call_showed },
            { label: "Deal Won",       value: counts.deal_won },
          ].map((step) => {
            const max = counts.lp_view || 1;
            const width = Math.max((step.value / max) * 100, 2);
            return (
              <div key={step.label} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-[140px] shrink-0 text-right">{step.label}</span>
                <div className="flex-1 h-6 bg-muted rounded overflow-hidden relative">
                  <div className="h-full bg-primary/70 rounded transition-all duration-500" style={{ width: `${width}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-foreground">
                    {step.value}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function recommendationFor(stepKey: string): string {
  switch (stepKey) {
    case "lp_to_quiz":
      return "Recommendation: strengthen the emotional hook in the hero (Lifestyle Layer 16).";
    case "quiz_to_lead":
      return "Recommendation: improve the perceived reward of completing the quiz before lead capture.";
    case "lead_to_booking":
      return "Recommendation: tighten the result page → booking transition (clarify next step).";
    case "booking_to_show":
      return "Recommendation: improve booking-page expectations and reminders.";
    case "show_to_close":
      return "Recommendation: review qualification quality and call structure.";
    default:
      return "Recommendation: investigate this step in detail.";
  }
}
