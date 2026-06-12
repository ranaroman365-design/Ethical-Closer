/**
 * CRO Audience Intelligence Panel — Phase 7.
 * ------------------------------------------------------
 * READ-ONLY analytics. Aggregates event_logs by experiment
 * variant → message theme → revenue funnel. No writes, no
 * allocation changes, no schema changes.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, TrendingUp, TrendingDown, Brain } from "lucide-react";
import {
  EXPERIMENT_THEME_MAP,
  THEME_LABELS_DE,
  AUDIENCE_LABELS_DE,
  type MessageTheme,
  type VariantFunnelRow,
  rollupByTheme,
  computeThemeLifts,
  themesForVariant,
  classifyAudience,
  type AudienceSegment,
} from "@/lib/cro/audience-intelligence";

const FUNNEL_EVENTS = [
  "PageView",
  "Lead",
  "HighQualityLead",
  "qualified",
  "setter_qualified",
  "BookingCreated",
  "Schedule",
  "showed",
  "appointment_showed",
  "closed_won",
  "deal_won",
] as const;

interface LogRow {
  event_name: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

const isOneOf = (ev: string, list: readonly string[]) => list.includes(ev);

export default function CroAudienceIntelligencePanel() {
  const [rows, setRows] = useState<VariantFunnelRow[]>([]);
  const [audienceBreakdown, setAudienceBreakdown] = useState<
    Record<AudienceSegment, number>
  >({} as Record<AudienceSegment, number>);
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
        .select("event_name, payload, created_at")
        .gte("created_at", since)
        .limit(50000);
      if (qErr) throw qErr;

      // Bucket per (test_name, variant)
      const bucket = new Map<
        string,
        {
          test_name: string;
          variant: string;
          pv: number;
          leads: number;
          ql: number;
          book: number;
          show: number;
          won: number;
          sessions: Map<string, { booked: boolean; qualified: boolean }>;
        }
      >();

      // Audience classification per session
      const sessionSignals = new Map<
        string,
        { events: string[]; textFragments: string[]; channels: string[] }
      >();

      for (const row of (data ?? []) as LogRow[]) {
        const p = row.payload ?? {};
        const test = typeof p.ab_test_name === "string" ? p.ab_test_name : null;
        const variant = typeof p.ab_variant === "string" ? p.ab_variant : null;
        const sid = typeof p.session_id === "string" ? p.session_id : null;

        // Build session signals for audience classification (cheap text scan).
        if (sid) {
          const sig = sessionSignals.get(sid) ?? {
            events: [],
            textFragments: [],
            channels: [],
          };
          sig.events.push(row.event_name.toLowerCase());
          for (const v of Object.values(p)) {
            if (typeof v === "string") sig.textFragments.push(v.toLowerCase());
          }
          const ch = typeof p.utm_source === "string" ? p.utm_source : null;
          if (ch) sig.channels.push(ch.toLowerCase());
          sessionSignals.set(sid, sig);
        }

        if (!test || !variant) continue;
        const key = `${test}|${variant}`;
        const b =
          bucket.get(key) ??
          {
            test_name: test,
            variant,
            pv: 0,
            leads: 0,
            ql: 0,
            book: 0,
            show: 0,
            won: 0,
            sessions: new Map<
              string,
              { booked: boolean; qualified: boolean }
            >(),
          };
        const ev = row.event_name;
        if (ev === "PageView") b.pv += 1;
        if (ev === "Lead") b.leads += 1;
        if (isOneOf(ev, ["HighQualityLead", "qualified", "setter_qualified"]))
          b.ql += 1;
        if (isOneOf(ev, ["BookingCreated", "Schedule"])) {
          b.book += 1;
          if (sid) {
            const s = b.sessions.get(sid) ?? { booked: false, qualified: false };
            s.booked = true;
            b.sessions.set(sid, s);
          }
        }
        if (isOneOf(ev, ["showed", "appointment_showed"])) b.show += 1;
        if (isOneOf(ev, ["closed_won", "deal_won"])) b.won += 1;
        bucket.set(key, b);
      }

      const out: VariantFunnelRow[] = [];
      for (const [, b] of bucket.entries()) {
        out.push({
          test_name: b.test_name,
          variant: b.variant,
          themes: themesForVariant(b.test_name, b.variant),
          pageviews: b.pv,
          leads: b.leads,
          qualified_leads: b.ql,
          bookings: b.book,
          show_ups: b.show,
          closed_won: b.won,
          revenue: b.won * aov,
        });
      }
      setRows(out);

      // Audience breakdown
      const breakdown: Record<string, number> = {};
      for (const sig of sessionSignals.values()) {
        const seg = classifyAudience(sig);
        breakdown[seg] = (breakdown[seg] ?? 0) + 1;
      }
      setAudienceBreakdown(breakdown as Record<AudienceSegment, number>);
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

  const themeRollups = useMemo(() => rollupByTheme(rows), [rows]);
  const winnersQL = useMemo(
    () => computeThemeLifts(themeRollups, "qualified_lead_rate").slice(0, 3),
    [themeRollups]
  );
  const winnersBook = useMemo(
    () => computeThemeLifts(themeRollups, "booking_rate").slice(0, 3),
    [themeRollups]
  );
  const winnersRev = useMemo(
    () => computeThemeLifts(themeRollups, "revenue").slice(0, 3),
    [themeRollups]
  );
  const losersRev = useMemo(
    () =>
      [...computeThemeLifts(themeRollups, "revenue")]
        .reverse()
        .slice(0, 3),
    [themeRollups]
  );

  const audienceTotal = Object.values(audienceBreakdown).reduce(
    (s, n) => s + n,
    0
  );

  const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const fmtLift = (n: number) =>
    `${n >= 0 ? "+" : ""}${(n * 100).toFixed(0)}%`;
  const fmtEur = (n: number) =>
    n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <div>
            <div className="font-medium text-lg">Audience Intelligence</div>
            <div className="text-xs text-muted-foreground">
              Welche Psychologie × Botschaft erzeugt qualifizierte Leads, Buchungen, Umsatz. Read-only.
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

      {/* Audience breakdown */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-medium">Audience-Segmente (Sessions)</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(AUDIENCE_LABELS_DE) as AudienceSegment[]).map((seg) => {
            const n = audienceBreakdown[seg] ?? 0;
            const pct = audienceTotal > 0 ? (n / audienceTotal) * 100 : 0;
            return (
              <Badge key={seg} variant="outline" className="font-normal">
                {AUDIENCE_LABELS_DE[seg]} · {n} ({pct.toFixed(0)}%)
              </Badge>
            );
          })}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Klassifikation aus Quiz-Antworten, UTM-Tags und Page-Signalen — heuristisch.
        </div>
      </div>

      {/* Insight cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InsightCard
          title="Top Themes — Qualified Leads"
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          rows={winnersQL.map((l) => ({
            label: THEME_LABELS_DE[l.theme],
            value: fmtPct(l.value),
            lift: fmtLift(l.lift_pct),
            positive: l.lift_pct >= 0,
          }))}
        />
        <InsightCard
          title="Top Themes — Bookings"
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          rows={winnersBook.map((l) => ({
            label: THEME_LABELS_DE[l.theme],
            value: fmtPct(l.value),
            lift: fmtLift(l.lift_pct),
            positive: l.lift_pct >= 0,
          }))}
        />
        <InsightCard
          title="Top Themes — Revenue"
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          rows={winnersRev.map((l) => ({
            label: THEME_LABELS_DE[l.theme],
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
            <div className="text-sm font-medium">Schwächste Themes (Revenue)</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {losersRev.map((l) => (
              <Badge key={l.theme} variant="outline" className="font-normal">
                {THEME_LABELS_DE[l.theme]} · {fmtEur(l.value)} ({fmtLift(l.lift_pct)})
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Per-theme rollup table */}
      <div className="border border-border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-2">Theme</th>
              <th className="text-right p-2">Variants</th>
              <th className="text-right p-2">PV</th>
              <th className="text-right p-2">Qual-Lead %</th>
              <th className="text-right p-2">Booking %</th>
              <th className="text-right p-2">Show-Up %</th>
              <th className="text-right p-2">Closed %</th>
              <th className="text-right p-2">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {themeRollups.length === 0 && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-muted-foreground text-xs">
                  Keine Theme-Daten im Zeitraum. Stelle sicher, dass Experimente in
                  <code className="mx-1 px-1 bg-muted rounded">EXPERIMENT_THEME_MAP</code>
                  gemappt sind.
                </td>
              </tr>
            )}
            {themeRollups.map((r) => (
              <tr key={r.theme} className="border-t border-border/40">
                <td className="p-2 font-medium">{THEME_LABELS_DE[r.theme]}</td>
                <td className="p-2 text-right font-mono">{r.variants}</td>
                <td className="p-2 text-right font-mono">{r.pageviews}</td>
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

      <div className="text-xs text-muted-foreground">
        Backlog-Priorisierung nutzt die Top-Themes je KPI (Revenue &gt; Bookings &gt; Qualified Leads). Read-only — Allocation und Recompute-Logik bleiben unverändert.
        {EXPERIMENT_THEME_MAP.length === 0 && " ⚠ Keine Experimente gemappt."}
      </div>
    </Card>
  );
}

interface InsightRow {
  label: string;
  value: string;
  lift: string;
  positive: boolean;
}

function InsightCard({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  rows: InsightRow[];
}) {
  return (
    <div className="border border-border rounded-md p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
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
            <span
              className={
                r.positive ? "text-emerald-600" : "text-destructive"
              }
            >
              {r.lift}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
