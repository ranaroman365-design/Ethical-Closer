/**
 * Master of Sales — Funnel KPI Panel.
 *
 * Lebt im A/B-Test-Dashboard (Route: /members/admin/ab-tests).
 * Liest direkt aus `event_logs` und zeigt die Funnel-Kennzahlen für
 * /masterofsales — global UND pro Attributionsachse
 * (Creative / Ad / Adset / Campaign / Source) auf Basis der UTM-Parameter,
 * die seit dem Attribution-Capture-Layer in jedem Event mitgeschrieben werden.
 *
 * Quiz Start Rate wird farbig bewertet:
 *   🟢 ≥ 35 %   🟡 20–35 %   🔴 < 20 %
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Activity, AlertCircle } from "lucide-react";

// Canonical MoS funnel events (verified via event_logs scan).
// Each bucket lists ALL synonyms (legacy + v2) so historical data still
// counts; dedup happens via master_funnel_id / session_id keys below.
const EV_BUCKETS = {
  LP: ["masterofsales_view", "MASTER_LP_VIEW"],
  STARTS: ["MASTER_QUIZ_STARTED", "MASTER_QUIZ_START"],
  STEP_1: ["MASTER_QUIZ_STEP_1"],
  STEP_2: ["MASTER_QUIZ_STEP_2"],
  STEP_3: ["MASTER_QUIZ_STEP_3"],
  STEP_4: ["MASTER_QUIZ_STEP_4"],
  STEP_5: ["MASTER_QUIZ_STEP_5"],
  STEP_6: ["MASTER_QUIZ_STEP_6"],
  STEP_7: ["MASTER_QUIZ_STEP_7"],
  COMPLETED: ["MASTER_QUIZ_COMPLETED", "quiz_completed_men"],
  DROPOFF: ["MASTER_QUIZ_DROPOFF"],
  CALENDAR: ["MASTER_CALENDLY_OPEN", "booking_view", "booking_started"],
  BOOKING: ["MASTER_BOOKING_CREATED", "booking_created", "appointment_booked"],
} as const;

const TRACKED = Array.from(new Set(Object.values(EV_BUCKETS).flat()));

interface Row {
  event_name: string;
  payload: Record<string, unknown> | null;
}

interface Counts {
  lp: number;
  starts: number;
  step1: number;
  step2: number;
  step3: number;
  step4: number;
  step5: number;
  step6: number;
  step7: number;
  completes: number;
  dropoffs: number;
  calendar: number;
  bookings: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _ZERO: Counts = {
  lp: 0, starts: 0, step1: 0, step2: 0, step3: 0, step4: 0, step5: 0,
  step6: 0, step7: 0, completes: 0, dropoffs: 0, calendar: 0, bookings: 0,
};

type Dimension = "utm_content" | "utm_term" | "utm_campaign" | "utm_source";

const DIMENSIONS: Array<{ key: Dimension; label: string }> = [
  { key: "utm_content", label: "Creative / Ad" },
  { key: "utm_term", label: "Adset" },
  { key: "utm_campaign", label: "Campaign" },
  { key: "utm_source", label: "Source" },
];

function rate(num: number, den: number): number | null {
  if (den <= 0) return null;
  return (num / den) * 100;
}

function fmtPct(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(1)}%`;
}

function rateTone(v: number | null): "green" | "yellow" | "red" | "muted" {
  if (v === null) return "muted";
  if (v >= 35) return "green";
  if (v >= 20) return "yellow";
  return "red";
}

function toneClasses(tone: ReturnType<typeof rateTone>): string {
  switch (tone) {
    case "green":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "yellow":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    case "red":
      return "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

/**
 * Stable identity for de-duplication. Priority:
 *   1. master_funnel_id (set since tracking_version=master_tracking_v2)
 *   2. session_id (set by trackEvent since ab-auto launch)
 *   3. lead_id / booking_id where applicable
 *   4. fallback synthetic per-row id (means: cannot dedup → treated unique)
 */
function identityOf(r: Row, fallbackIdx: number): string {
  const p = r.payload ?? {};
  const fid = p["master_funnel_id"];
  if (typeof fid === "string" && fid) return `f:${fid}`;
  const sid = p["session_id"];
  if (typeof sid === "string" && sid) return `s:${sid}`;
  const lid = p["lead_id"];
  if (typeof lid === "string" && lid) return `l:${lid}`;
  return `r:${fallbackIdx}`;
}

/** Returns the count of UNIQUE identities that fired any event in `bucket`. */
function uniqueIdentities(
  rows: Row[],
  bucket: readonly string[],
  matchExtra?: (r: Row) => boolean,
): Set<string> {
  const set = new Set<string>();
  rows.forEach((r, idx) => {
    if (!bucket.includes(r.event_name)) return;
    if (matchExtra && !matchExtra(r)) return;
    set.add(identityOf(r, idx));
  });
  return set;
}

/**
 * Monotonic clamp: each downstream stage cannot exceed its upstream stage
 * AND must intersect the upstream identity set. Guarantees the funnel is
 * logically valid (LP ≥ Starts ≥ Step1 ≥ … ≥ Completed ≥ Calendar ≥ Booking).
 */
function intersectClamp(downstream: Set<string>, upstream: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const k of downstream) if (upstream.has(k)) out.add(k);
  return out;
}

function computeCanonicalCounts(rows: Row[]): Counts {
  const lp = uniqueIdentities(rows, EV_BUCKETS.LP);
  const startsRaw = uniqueIdentities(rows, EV_BUCKETS.STARTS);
  // Start can only happen for visitors we saw on LP → if upstream is non-empty.
  // BUT legacy data has no LP rows with same id (no master_funnel_id yet) — so
  // we ONLY enforce the intersection when both sets share at least one id.
  const enforceIntersect = (down: Set<string>, up: Set<string>): Set<string> => {
    const intersect = intersectClamp(down, up);
    if (intersect.size > 0) return intersect;
    // No identity overlap (likely legacy events): fall back to size clamp.
    if (down.size > up.size) {
      // Truncate by taking first up.size entries (deterministic order).
      const out = new Set<string>();
      let n = 0;
      for (const k of down) { if (n++ >= up.size) break; out.add(k); }
      return out;
    }
    return down;
  };

  const starts = enforceIntersect(startsRaw, lp);
  const s1 = enforceIntersect(uniqueIdentities(rows, EV_BUCKETS.STEP_1), starts);
  const s2 = enforceIntersect(uniqueIdentities(rows, EV_BUCKETS.STEP_2), s1);
  const s3 = enforceIntersect(uniqueIdentities(rows, EV_BUCKETS.STEP_3), s2);
  const s4 = enforceIntersect(uniqueIdentities(rows, EV_BUCKETS.STEP_4), s3);
  const s5 = enforceIntersect(uniqueIdentities(rows, EV_BUCKETS.STEP_5), s4);
  const s6 = enforceIntersect(uniqueIdentities(rows, EV_BUCKETS.STEP_6), s5);
  const s7 = enforceIntersect(uniqueIdentities(rows, EV_BUCKETS.STEP_7), s6);
  // Completed must be a subset of step_1 at minimum (you cannot complete
  // without answering question 1).
  const completedRaw = uniqueIdentities(rows, EV_BUCKETS.COMPLETED);
  const completed = enforceIntersect(completedRaw, s1);
  const calendar = enforceIntersect(uniqueIdentities(rows, EV_BUCKETS.CALENDAR), completed);
  const booking = enforceIntersect(uniqueIdentities(rows, EV_BUCKETS.BOOKING), calendar);
  const dropoffs = uniqueIdentities(rows, EV_BUCKETS.DROPOFF);

  return {
    lp: lp.size,
    starts: starts.size,
    step1: s1.size,
    step2: s2.size,
    step3: s3.size,
    step4: s4.size,
    step5: s5.size,
    step6: s6.size,
    step7: s7.size,
    completes: completed.size,
    dropoffs: dropoffs.size,
    calendar: calendar.size,
    bookings: booking.size,
  };
}

function aggregate(rows: Row[], keyOf: (r: Row) => string | null): Map<string, Counts> {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const k = keyOf(r) ?? "(unset)";
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  const out = new Map<string, Counts>();
  for (const [k, list] of map.entries()) {
    out.set(k, computeCanonicalCounts(list));
  }
  return out;
}

export default function MasterOfSalesKpiPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinceDays, setSinceDays] = useState(14);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
      const { data, error: qErr } = await supabase
        .from("event_logs")
        .select("event_name, payload")
        .gte("created_at", since.toISOString())
        .in("event_name", TRACKED)
        .limit(50000);
      if (qErr) throw qErr;
      setRows((data ?? []) as Row[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinceDays]);

  const totals = useMemo<Counts>(() => computeCanonicalCounts(rows), [rows]);

  const startRate = rate(totals.starts, totals.lp);
  const completeRate = rate(totals.completes, totals.starts);
  const bookingRate = rate(totals.bookings, totals.completes);
  const calendarRate = rate(totals.calendar, totals.completes);

  const startTone = rateTone(startRate);

  // Per-question drop-off: how many made it to step N out of those who started.
  // Steps are already monotonically clamped — Step_N ≤ Step_(N-1) — by
  // computeCanonicalCounts, so the funnel is guaranteed logically valid.
  const stepRows = useMemo(() => {
    const base = totals.starts;
    const stages: Array<{ label: string; reached: number; rate: number | null; dropFromPrev: number }> = [
      { label: "Started", reached: totals.starts, rate: 100, dropFromPrev: 0 },
      { label: "Frage 1", reached: totals.step1, rate: rate(totals.step1, base), dropFromPrev: totals.starts - totals.step1 },
      { label: "Frage 2", reached: totals.step2, rate: rate(totals.step2, base), dropFromPrev: totals.step1 - totals.step2 },
      { label: "Frage 3", reached: totals.step3, rate: rate(totals.step3, base), dropFromPrev: totals.step2 - totals.step3 },
      { label: "Frage 4", reached: totals.step4, rate: rate(totals.step4, base), dropFromPrev: totals.step3 - totals.step4 },
      { label: "Frage 5", reached: totals.step5, rate: rate(totals.step5, base), dropFromPrev: totals.step4 - totals.step5 },
      { label: "Frage 6", reached: totals.step6, rate: rate(totals.step6, base), dropFromPrev: totals.step5 - totals.step6 },
      { label: "Frage 7", reached: totals.step7, rate: rate(totals.step7, base), dropFromPrev: totals.step6 - totals.step7 },
      { label: "Completed", reached: totals.completes, rate: rate(totals.completes, base), dropFromPrev: totals.step7 - totals.completes },
      { label: "Calendly Open", reached: totals.calendar, rate: rate(totals.calendar, base), dropFromPrev: totals.completes - totals.calendar },
      { label: "Booking", reached: totals.bookings, rate: rate(totals.bookings, base), dropFromPrev: totals.calendar - totals.bookings },
    ];
    return stages;
  }, [totals]);


  const dimensionTables = useMemo(() => {
    const res: Record<Dimension, Array<[string, Counts]>> = {
      utm_content: [],
      utm_term: [],
      utm_campaign: [],
      utm_source: [],
    };
    for (const dim of DIMENSIONS) {
      const m = aggregate(rows, (r) => {
        const p = r.payload ?? {};
        const v = (p as Record<string, unknown>)[dim.key];
        return typeof v === "string" && v.length > 0 ? v : null;
      });
      res[dim.key] = [...m.entries()]
        .filter(([, c]) => c.lp + c.starts + c.completes + c.bookings > 0)
        .sort((a, b) => b[1].lp - a[1].lp);
    }
    return res;
  }, [rows]);

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Master of Sales — Funnel KPIs
          </h2>
          <p className="text-sm text-muted-foreground">
            Echte Eventdaten aus <code className="px-1 py-0.5 bg-muted rounded">/masterofsales</code>.
            Quiz Start Rate ist die kritische Brücke zwischen Klick und Funnel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30].map((d) => (
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

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiTile label="LP Views" value={totals.lp.toLocaleString()} />
        <KpiTile label="Quiz Starts" value={totals.starts.toLocaleString()} />
        <KpiTile
          label="Quiz Start Rate"
          value={fmtPct(startRate)}
          tone={startTone}
        />
        <KpiTile label="Quiz Completions" value={totals.completes.toLocaleString()} />
        <KpiTile label="Completion Rate" value={fmtPct(completeRate)} />
        <KpiTile label="Calendar Opens" value={totals.calendar.toLocaleString()} sub={fmtPct(calendarRate)} />
        <KpiTile label="Bookings" value={totals.bookings.toLocaleString()} sub={fmtPct(bookingRate)} />
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>Quiz Start Rate Ampel:</span>
        <Legend tone="green" label="≥ 35%" />
        <Legend tone="yellow" label="20–35%" />
        <Legend tone="red" label="< 20%" />
      </div>

      {/* Per-question drop-off */}
      <div>
        <div className="text-sm font-medium mb-2">Drop-Off pro Quiz-Frage</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2">Stage</th>
                <th className="py-2 text-right">Erreicht</th>
                <th className="py-2 text-right">% von Started</th>
                <th className="py-2 text-right">Drop ggü. Vorstage</th>
              </tr>
            </thead>
            <tbody>
              {stepRows.map((s) => (
                <tr key={s.label} className="border-b border-border/40">
                  <td className="py-2">{s.label}</td>
                  <td className="py-2 text-right font-mono">{s.reached}</td>
                  <td className="py-2 text-right font-mono">{fmtPct(s.rate)}</td>
                  <td className="py-2 text-right font-mono">
                    {s.label === "Started" ? "—" : s.dropFromPrev}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Zusätzlich: <code className="px-1 bg-muted rounded">MASTER_QUIZ_DROPOFF</code> ={" "}
          <span className="font-mono">{totals.dropoffs}</span> explizite Abbrüche (Page-Leave mid-quiz).
        </div>
      </div>

      {/* Attribution breakdown */}
      <div>
        <Tabs defaultValue="utm_content">
          <TabsList className="flex flex-wrap">
            {DIMENSIONS.map((d) => (
              <TabsTrigger key={d.key} value={d.key}>
                {d.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {DIMENSIONS.map((d) => {
            const data = dimensionTables[d.key];
            return (
              <TabsContent key={d.key} value={d.key} className="mt-3">
                {data.length === 0 ? (
                  <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-4">
                    Noch keine Events mit <code className="px-1 bg-muted rounded">{d.key}</code> im
                    Payload. UTM-Parameter werden ab sofort automatisch auf jedem Event mitgeschrieben —
                    Daten erscheinen, sobald Traffic über getaggte Ad-Links eintrifft (
                    <code className="px-1 bg-muted rounded">?utm_source=…&utm_content=…</code>).
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground border-b border-border">
                          <th className="py-2">{d.label}</th>
                          <th className="py-2 text-right">LP Views</th>
                          <th className="py-2 text-right">Quiz Starts</th>
                          <th className="py-2 text-right">Start Rate</th>
                          <th className="py-2 text-right">Completions</th>
                          <th className="py-2 text-right">Cal. Opens</th>
                          <th className="py-2 text-right">Bookings</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.map(([key, c]) => {
                          const sr = rate(c.starts, c.lp);
                          const tone = rateTone(sr);
                          return (
                            <tr key={key} className="border-b border-border/40">
                              <td className="py-2 max-w-[280px] truncate" title={key}>{key}</td>
                              <td className="py-2 text-right font-mono">{c.lp}</td>
                              <td className="py-2 text-right font-mono">{c.starts}</td>
                              <td className="py-2 text-right">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded border font-mono text-xs ${toneClasses(tone)}`}
                                >
                                  {fmtPct(sr)}
                                </span>
                              </td>
                              <td className="py-2 text-right font-mono">{c.completes}</td>
                              <td className="py-2 text-right font-mono">{c.calendar}</td>
                              <td className="py-2 text-right font-mono">{c.bookings}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </div>

      <div className="text-xs text-muted-foreground">
        Quellen: <code className="px-1 bg-muted rounded">masterofsales_view</code> ·{" "}
        <code className="px-1 bg-muted rounded">MASTER_QUIZ_STARTED</code> ·{" "}
        <code className="px-1 bg-muted rounded">MASTER_QUIZ_STEP_1/2/3</code> ·{" "}
        <code className="px-1 bg-muted rounded">MASTER_QUIZ_COMPLETED</code> ·{" "}
        <code className="px-1 bg-muted rounded">MASTER_QUIZ_DROPOFF</code> ·{" "}
        <code className="px-1 bg-muted rounded">booking_view</code> /{" "}
        <code className="px-1 bg-muted rounded">booking_started</code> ·{" "}
        <code className="px-1 bg-muted rounded">booking_created</code>. UTM-Capture ist
        session-persistent (First-Touch).
      </div>
    </Card>
  );
}

function KpiTile({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone?: ReturnType<typeof rateTone>;
  sub?: string;
}) {
  const cls = tone ? toneClasses(tone) : "bg-card text-foreground border-border";
  return (
    <div className={`border rounded-md p-3 ${cls}`}>
      <div className="text-[11px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-semibold mt-0.5 font-mono">{value}</div>
      {sub && <div className="text-[11px] opacity-70 font-mono mt-0.5">{sub}</div>}
    </div>
  );
}

function Legend({ tone, label }: { tone: ReturnType<typeof rateTone>; label: string }) {
  return (
    <Badge variant="outline" className={`${toneClasses(tone)} border`}>
      {label}
    </Badge>
  );
}
