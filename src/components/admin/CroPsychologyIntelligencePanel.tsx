/**
 * CRO Psychology Intelligence Panel — Phase 8.
 * ------------------------------------------------------
 * READ-ONLY. Aggregates event_logs per (test, variant), maps each
 * variant onto a psychological driver, and correlates drivers with
 * CTR / QL / Booking / Show / Won / Revenue. Surfaces winning and
 * losing psychological patterns. No writes, no allocation changes.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, TrendingUp, TrendingDown, Sparkles } from "lucide-react";
import {
  PSYCH_LABELS_DE,
  type VariantKpiRow,
  type DriverMetric,
  type PsychDriver,
  rollupByDriver,
  computeDriverLifts,
  bestPatternPerSurface,
  derivePsychology,
} from "@/lib/cro/psychology-intelligence";

interface LogRow {
  event_name: string;
  payload: Record<string, unknown> | null;
}

const isOneOf = (ev: string, list: readonly string[]) => list.includes(ev);

export default function CroPsychologyIntelligencePanel() {
  const [rows, setRows] = useState<VariantKpiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinceDays, setSinceDays] = useState(30);
  const [aov, setAov] = useState(4400);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(
        Date.now() - sinceDays * 24 * 60 * 60 * 1000
      ).toISOString();
      const { data, error: qErr } = await supabase
        .from("event_logs")
        .select("event_name, payload")
        .gte("created_at", since)
        .limit(50000);
      if (qErr) throw qErr;

      const bucket = new Map<
        string,
        {
          test_name: string;
          variant: string;
          pv: number;
          ctr: number;
          leads: number;
          ql: number;
          book: number;
          show: number;
          won: number;
        }
      >();
      for (const row of (data ?? []) as LogRow[]) {
        const p = row.payload ?? {};
        const test = typeof p.ab_test_name === "string" ? p.ab_test_name : null;
        const variant = typeof p.ab_variant === "string" ? p.ab_variant : null;
        if (!test || !variant) continue;
        const key = `${test}|${variant}`;
        const b =
          bucket.get(key) ??
          {
            test_name: test,
            variant,
            pv: 0,
            ctr: 0,
            leads: 0,
            ql: 0,
            book: 0,
            show: 0,
            won: 0,
          };
        const ev = row.event_name;
        if (ev === "PageView") b.pv += 1;
        if (ev === "ApplyCtaClick") b.ctr += 1;
        if (ev === "Lead") b.leads += 1;
        if (isOneOf(ev, ["HighQualityLead", "qualified", "setter_qualified"]))
          b.ql += 1;
        if (isOneOf(ev, ["BookingCreated", "Schedule"])) b.book += 1;
        if (isOneOf(ev, ["showed", "appointment_showed"])) b.show += 1;
        if (isOneOf(ev, ["closed_won", "deal_won"])) b.won += 1;
        bucket.set(key, b);
      }

      const out: VariantKpiRow[] = [];
      for (const [, b] of bucket.entries()) {
        const pv = Math.max(1, b.pv);
        out.push({
          test_name: b.test_name,
          variant: b.variant,
          pageviews: b.pv,
          ctr: b.ctr / pv,
          qualified_lead_rate: b.ql / pv,
          booking_rate: b.book / pv,
          show_up_rate: b.book > 0 ? b.show / b.book : 0,
          closed_won_rate: b.won / pv,
          revenue: b.won * aov,
        });
      }
      setRows(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinceDays, aov]);

  const driverRollups = useMemo(() => rollupByDriver(rows), [rows]);

  const winnersQL = useMemo(
    () => computeDriverLifts(driverRollups, "qualified_lead_rate").slice(0, 3),
    [driverRollups]
  );
  const winnersBook = useMemo(
    () => computeDriverLifts(driverRollups, "booking_rate").slice(0, 3),
    [driverRollups]
  );
  const winnersRev = useMemo(
    () => computeDriverLifts(driverRollups, "revenue").slice(0, 3),
    [driverRollups]
  );
  const losersRev = useMemo(
    () => [...computeDriverLifts(driverRollups, "revenue")].reverse().slice(0, 3),
    [driverRollups]
  );

  const patternsCTA = useMemo(
    () => bestPatternPerSurface(rows, "booking_rate"),
    [rows]
  );
  const patternsRev = useMemo(
    () => bestPatternPerSurface(rows, "revenue"),
    [rows]
  );

  const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const fmtLift = (n: number) =>
    `${n >= 0 ? "+" : ""}${(n * 100).toFixed(0)}%`;
  const fmtEur = (n: number) =>
    n.toLocaleString("de-DE", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    });

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <div>
            <div className="font-medium text-lg">Psychology Intelligence</div>
            <div className="text-xs text-muted-foreground">
              Warum Varianten gewinnen — Treiber, Intensität, Commitment, Risiko. Read-only.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">AOV €</label>
          <input
            type="number"
            value={aov}
            onChange={(e) => setAov(Number(e.target.value) || 0)}
            className="w-24 px-2 py-1 text-sm border border-border rounded-md bg-background"
          />
          {[14, 30, 60].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={sinceDays === d ? "default" : "outline"}
              onClick={() => setSinceDays(d)}
            >
              {d}d
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            Aktualisieren
          </Button>
        </div>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {/* Driver winners */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DriverCard
          title="Top Driver — Qualified Leads"
          rows={winnersQL.map((l) => ({
            label: PSYCH_LABELS_DE[l.driver],
            value: fmtPct(l.value),
            lift: fmtLift(l.lift_pct),
            positive: l.lift_pct >= 0,
          }))}
        />
        <DriverCard
          title="Top Driver — Bookings"
          rows={winnersBook.map((l) => ({
            label: PSYCH_LABELS_DE[l.driver],
            value: fmtPct(l.value),
            lift: fmtLift(l.lift_pct),
            positive: l.lift_pct >= 0,
          }))}
        />
        <DriverCard
          title="Top Driver — Revenue"
          rows={winnersRev.map((l) => ({
            label: PSYCH_LABELS_DE[l.driver],
            value: fmtEur(l.value),
            lift: fmtLift(l.lift_pct),
            positive: l.lift_pct >= 0,
          }))}
        />
      </div>

      {/* Losers */}
      {losersRev.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-amber-500" />
            <div className="text-sm font-medium">Verlierende Driver (Revenue)</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {losersRev.map((l) => (
              <Badge key={l.driver} variant="outline" className="font-normal">
                {PSYCH_LABELS_DE[l.driver]} · {fmtEur(l.value)} ({fmtLift(l.lift_pct)})
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Best pattern per surface */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SurfaceCard
          title="Beste Surface-Psychologie (Bookings)"
          patterns={patternsCTA.map((p) => ({
            surface: p.surface,
            label: p.best_driver ? PSYCH_LABELS_DE[p.best_driver] : "—",
            value: fmtPct(p.best_metric_value),
          }))}
        />
        <SurfaceCard
          title="Beste Surface-Psychologie (Revenue)"
          patterns={patternsRev.map((p) => ({
            surface: p.surface,
            label: p.best_driver ? PSYCH_LABELS_DE[p.best_driver] : "—",
            value: fmtEur(p.best_metric_value),
          }))}
        />
      </div>

      {/* Per-driver rollup table */}
      <div className="border border-border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-2">Driver</th>
              <th className="text-right p-2">Variants</th>
              <th className="text-right p-2">PV</th>
              <th className="text-right p-2">CTR</th>
              <th className="text-right p-2">Qual-Lead %</th>
              <th className="text-right p-2">Booking %</th>
              <th className="text-right p-2">Show-Up %</th>
              <th className="text-right p-2">Closed %</th>
              <th className="text-right p-2">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {driverRollups.length === 0 && (
              <tr>
                <td colSpan={9} className="p-4 text-center text-muted-foreground text-xs">
                  Keine Driver-Daten — stelle sicher, dass Varianten in
                  <code className="mx-1 px-1 bg-muted rounded">VARIANT_PSYCHOLOGY</code>
                  (oder Theme-Map) gemappt sind.
                </td>
              </tr>
            )}
            {driverRollups.map((r) => (
              <tr key={r.driver} className="border-t border-border/40">
                <td className="p-2 font-medium">{PSYCH_LABELS_DE[r.driver]}</td>
                <td className="p-2 text-right font-mono">{r.variants}</td>
                <td className="p-2 text-right font-mono">{r.pageviews}</td>
                <td className="p-2 text-right font-mono">{fmtPct(r.ctr)}</td>
                <td className="p-2 text-right font-mono">{fmtPct(r.qualified_lead_rate)}</td>
                <td className="p-2 text-right font-mono">{fmtPct(r.booking_rate)}</td>
                <td className="p-2 text-right font-mono">{fmtPct(r.show_up_rate)}</td>
                <td className="p-2 text-right font-mono">{fmtPct(r.closed_won_rate)}</td>
                <td className="p-2 text-right font-mono">{fmtEur(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Variant attribute matrix */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-medium">Varianten-Attribute</div>
        </div>
        <div className="border border-border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-2">Experiment</th>
                <th className="text-left p-2">Variant</th>
                <th className="text-left p-2">Dominant</th>
                <th className="text-left p-2">Secondary</th>
                <th className="text-right p-2">Intensität</th>
                <th className="text-right p-2">Commitment</th>
                <th className="text-right p-2">Risiko</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = derivePsychology(r.test_name, r.variant);
                if (!p) return null;
                return (
                  <tr key={`${r.test_name}|${r.variant}`} className="border-t border-border/40">
                    <td className="p-2">{r.test_name}</td>
                    <td className="p-2 font-mono">{r.variant}</td>
                    <td className="p-2">{PSYCH_LABELS_DE[p.dominant]}</td>
                    <td className="p-2 text-muted-foreground">
                      {p.secondary ? PSYCH_LABELS_DE[p.secondary] : "—"}
                    </td>
                    <td className="p-2 text-right font-mono">{p.intensity}/5</td>
                    <td className="p-2 text-right font-mono">{p.commitment}/5</td>
                    <td className="p-2 text-right font-mono">{p.risk}/5</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-muted-foreground flex items-start gap-2">
        <TrendingUp className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Backlog priorisiert künftige Experimente nach Top-Drivern (Revenue &gt; Bookings &gt; Qualified Leads). Allocation, Funnel und CRM bleiben unverändert.
        </span>
      </div>
    </Card>
  );
}

function DriverCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; lift: string; positive: boolean }[];
}) {
  return (
    <div className="border border-border rounded-md p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <TrendingUp className="h-4 w-4 text-emerald-500" />
        {title}
      </div>
      {rows.length === 0 && (
        <div className="text-xs text-muted-foreground">Noch keine Daten.</div>
      )}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{r.label}</span>
          <span className="font-mono">
            {r.value}{" "}
            <span className={r.positive ? "text-emerald-600" : "text-destructive"}>
              {r.lift}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function SurfaceCard({
  title,
  patterns,
}: {
  title: string;
  patterns: { surface: string; label: string; value: string }[];
}) {
  return (
    <div className="border border-border rounded-md p-4 space-y-2">
      <div className="text-sm font-medium">{title}</div>
      {patterns.length === 0 && (
        <div className="text-xs text-muted-foreground">Noch keine Daten.</div>
      )}
      {patterns.map((p, i) => (
        <div key={i} className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground capitalize">{p.surface}</span>
          <span className="font-mono">
            {p.label} · {p.value}
          </span>
        </div>
      ))}
    </div>
  );
}
