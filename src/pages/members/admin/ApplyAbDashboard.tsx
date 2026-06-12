import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, RefreshCcw, TrendingUp } from "lucide-react";

interface ABRow {
  variant: string;
  assigned: number;
  cta_clicks: number;
  bookings: number;
  ctr: number;
  booking_rate: number;
  ctr_ci_low: number;
  ctr_ci_high: number;
  booking_ci_low: number;
  booking_ci_high: number;
  z_ctr_vs_other: number | null;
  z_booking_vs_other: number | null;
}

interface ReassignmentRow {
  test_key: string;
  day: string; // ISO date
  reassignments: number;
  fresh_assignments: number;
  legacy_migrations: number;
}

interface ReassignedEventRow {
  test_key: string;
  day: string;
  reassign_events: number;
  distinct_sessions: number;
  variant_changes: number;
  avg_expired_after_days: number | null;
}

const REASSIGNMENT_TTL_DAYS = 30;

const TEST_KEY = "social_proof_v1";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// Two-tailed p from |z| using a fast erf approximation (Abramowitz & Stegun 7.1.26).
const pFromZ = (z: number | null): number | null => {
  if (z === null || !isFinite(z)) return null;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return Math.max(0, Math.min(1, 1 - erf));
};

const sigBadge = (z: number | null) => {
  const p = pFromZ(z);
  if (p === null) return <Badge variant="outline">n/a</Badge>;
  if (p < 0.05) return <Badge className="bg-signal text-signal-foreground">Signifikant · p={p.toFixed(3)}</Badge>;
  if (p < 0.10) return <Badge variant="secondary">Tendenz · p={p.toFixed(3)}</Badge>;
  return <Badge variant="outline">n.s. · p={p.toFixed(3)}</Badge>;
};

export default function ApplyAbDashboard() {
  const [rows, setRows] = useState<ABRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reassignRows, setReassignRows] = useState<ReassignmentRow[] | null>(null);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassignedEvents, setReassignedEvents] = useState<ReassignedEventRow[] | null>(null);

  useEffect(() => {
    document.title = "Apply A/B · Auswertung";
    let cancelled = false;
    (async () => {
      const [main, reassign, reassignedEv] = await Promise.all([
        supabase.rpc("get_apply_ab_results" as never, { p_test_key: TEST_KEY } as never),
        supabase.rpc("get_ab_reassignment_stats" as never, { p_days: REASSIGNMENT_TTL_DAYS } as never),
        supabase.rpc("get_ab_reassigned_events" as never, { p_days: REASSIGNMENT_TTL_DAYS } as never),
      ]);
      if (cancelled) return;

      if (main.error) {
        setError(main.error.message);
        setRows([]);
      } else {
        setRows((main.data as unknown as ABRow[]) ?? []);
      }

      if (reassign.error) {
        setReassignError(reassign.error.message);
        setReassignRows([]);
      } else {
        setReassignRows((reassign.data as unknown as ReassignmentRow[]) ?? []);
      }

      if (reassignedEv.error) {
        setReassignedEvents([]);
      } else {
        setReassignedEvents((reassignedEv.data as unknown as ReassignedEventRow[]) ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalAssigned = (rows ?? []).reduce((s, r) => s + Number(r.assigned), 0);
  const variantA = rows?.find((r) => r.variant === "A");
  const variantB = rows?.find((r) => r.variant === "B");

  const ctrLift =
    variantA && variantB && variantA.ctr > 0
      ? ((variantB.ctr - variantA.ctr) / variantA.ctr) * 100
      : null;
  const bookingLift =
    variantA && variantB && variantA.booking_rate > 0
      ? ((variantB.booking_rate - variantA.booking_rate) / variantA.booking_rate) * 100
      : null;

  // Reassignments: aggregate per test_key + last-seen day so we can prove
  // *when* a re-roll happened (assignedAt) and *how many* hit the 30d TTL.
  const reassignSummary = useMemo(() => {
    if (!reassignRows) return null;
    const byTest = new Map<
      string,
      {
        test_key: string;
        reassignments: number;
        fresh: number;
        legacy: number;
        last_reassign_day: string | null;
        days: ReassignmentRow[];
      }
    >();
    for (const r of reassignRows) {
      const cur = byTest.get(r.test_key) ?? {
        test_key: r.test_key,
        reassignments: 0,
        fresh: 0,
        legacy: 0,
        last_reassign_day: null,
        days: [],
      };
      cur.reassignments += Number(r.reassignments);
      cur.fresh += Number(r.fresh_assignments);
      cur.legacy += Number(r.legacy_migrations);
      if (Number(r.reassignments) > 0) {
        if (!cur.last_reassign_day || r.day > cur.last_reassign_day) {
          cur.last_reassign_day = r.day;
        }
      }
      cur.days.push(r);
      byTest.set(r.test_key, cur);
    }
    return Array.from(byTest.values()).sort((a, b) => b.reassignments - a.reassignments);
  }, [reassignRows]);

  const reassignTotals = useMemo(() => {
    if (!reassignSummary) return { reassign: 0, fresh: 0, legacy: 0 };
    return reassignSummary.reduce(
      (acc, r) => ({
        reassign: acc.reassign + r.reassignments,
        fresh: acc.fresh + r.fresh,
        legacy: acc.legacy + r.legacy,
      }),
      { reassign: 0, fresh: 0, legacy: 0 },
    );
  }, [reassignSummary]);

  // Index dedicated `ab_reassigned` events by test_key for the table.
  const reassignedByTest = useMemo(() => {
    if (!reassignedEvents) return new Map<string, { events: number; sessions: number; changes: number; avgAge: number | null }>();
    const m = new Map<string, { events: number; sessions: number; changes: number; avgAge: number | null; ageWeight: number }>();
    for (const r of reassignedEvents) {
      const cur = m.get(r.test_key) ?? { events: 0, sessions: 0, changes: 0, avgAge: null, ageWeight: 0 };
      cur.events += Number(r.reassign_events);
      cur.sessions += Number(r.distinct_sessions);
      cur.changes += Number(r.variant_changes);
      const age = r.avg_expired_after_days == null ? null : Number(r.avg_expired_after_days);
      if (age != null) {
        const prevTotal = (cur.avgAge ?? 0) * cur.ageWeight;
        cur.ageWeight += Number(r.reassign_events);
        cur.avgAge = cur.ageWeight > 0 ? (prevTotal + age * Number(r.reassign_events)) / cur.ageWeight : age;
      }
      m.set(r.test_key, cur);
    }
    return m;
  }, [reassignedEvents]);

  return (
    <main className="container mx-auto max-w-5xl px-4 py-8 md:py-12">
      <header className="mb-8">
        <p className="font-sans text-xs uppercase tracking-widest text-muted-foreground">
          Apply Funnel · A/B Auswertung
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-foreground md:text-4xl">
          Social-Proof Variante A vs. B
        </h1>
        <p className="mt-2 font-sans text-sm text-muted-foreground">
          Test-Key: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{TEST_KEY}</code> · Wilson-95%-CI · Two-Proportion Z-Test
        </p>
      </header>

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Fehler beim Laden</p>
            <p className="mt-1 text-xs opacity-80">{error}</p>
          </div>
        </div>
      )}

      {!rows ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : totalAssigned === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-serif text-lg text-foreground">Noch keine Zuweisungen erfasst.</p>
            <p className="mt-2 font-sans text-sm text-muted-foreground">
              Sobald Besucher die /apply-Seite öffnen, werden A/B-Buckets gespeichert und hier sichtbar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <SummaryStat label="Zugewiesene Nutzer" value={totalAssigned.toLocaleString()} />
            <SummaryStat
              label="CTR-Lift B vs. A"
              value={ctrLift === null ? "—" : `${ctrLift > 0 ? "+" : ""}${ctrLift.toFixed(1)}%`}
              accent={ctrLift !== null && ctrLift > 0}
            />
            <SummaryStat
              label="Booking-Lift B vs. A"
              value={bookingLift === null ? "—" : `${bookingLift > 0 ? "+" : ""}${bookingLift.toFixed(1)}%`}
              accent={bookingLift !== null && bookingLift > 0}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {rows.map((r) => {
              const isHoldout = r.variant === "H";
              return (
              <Card key={r.variant} className={isHoldout ? "border-dashed border-muted-foreground/40" : undefined}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-serif text-xl">
                      {isHoldout ? "Holdout (H)" : `Variante ${r.variant}`}
                    </CardTitle>
                    <Badge variant="outline">{Number(r.assigned).toLocaleString()} Nutzer</Badge>
                  </div>
                  {isHoldout && (
                    <p className="mt-1 font-sans text-[11px] text-muted-foreground">
                      Original-Copy · Baseline ohne Test-Treatment
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-5">
                  <Metric
                    label="CTR (CTA-Klick)"
                    rate={Number(r.ctr)}
                    ciLow={Number(r.ctr_ci_low)}
                    ciHigh={Number(r.ctr_ci_high)}
                    numerator={Number(r.cta_clicks)}
                    denominator={Number(r.assigned)}
                    sig={sigBadge(r.z_ctr_vs_other)}
                  />
                  <Metric
                    label="Booking-Rate"
                    rate={Number(r.booking_rate)}
                    ciLow={Number(r.booking_ci_low)}
                    ciHigh={Number(r.booking_ci_high)}
                    numerator={Number(r.bookings)}
                    denominator={Number(r.assigned)}
                    sig={sigBadge(r.z_booking_vs_other)}
                  />
                </CardContent>
              </Card>
              );
            })}
          </div>

          <p className="mt-6 font-sans text-[11px] text-muted-foreground">
            Konfidenz = Wilson-Score 95%. Signifikanz aus Two-Proportion Z-Test (zweiseitig).
            Bookings werden via E-Mail dem ursprünglichen Bucket zugeordnet.
            Empfehlung: Mindestens 200 Zuweisungen pro Variante vor Entscheidungs-Take.
          </p>
        </>
      )}

      {/* ─────────────  Sub-Test: Sticky-Hint Auswertung  ───────────── */}
      <section className="mt-10">
        <Link
          to="/members/admin/apply-ab/sticky-hint"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm transition hover:bg-muted"
        >
          <span className="font-medium text-foreground">Sticky-Hint A/B</span>
          <span className="text-muted-foreground">— Impressions, Klicks, CTR pro Variante</span>
          <span className="ml-auto text-muted-foreground">→</span>
        </Link>
      </section>

      {/* ─────────────  Reassignment / TTL Insight  ───────────── */}
      <section className="mt-12">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="font-sans text-xs uppercase tracking-widest text-muted-foreground">
              Bucket-Hygiene · letzte {REASSIGNMENT_TTL_DAYS} Tage
            </p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-foreground">
              Reassignments &amp; TTL-Refreshs
            </h2>
            <p className="mt-1 font-sans text-sm text-muted-foreground">
              Beweis, wann das 30d-TTL abgelaufen ist und ein Bucket neu gewürfelt wurde
              (<code className="rounded bg-muted px-1 py-0.5 text-[10px]">reassigned: true</code>),
              plus einmalige Migrationen aus dem alten Plain-Schema.
            </p>
          </div>
        </div>

        {reassignError && (
          <div className="mb-4 flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{reassignError}</p>
          </div>
        )}

        {!reassignSummary ? (
          <Skeleton className="h-48 w-full" />
        ) : reassignSummary.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center font-sans text-sm text-muted-foreground">
              Keine Bucket-Events in den letzten {REASSIGNMENT_TTL_DAYS} Tagen erfasst.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-4 grid gap-4 sm:grid-cols-3">
              <SummaryStat
                label={`Reassignments · ${REASSIGNMENT_TTL_DAYS}d`}
                value={reassignTotals.reassign.toLocaleString()}
                accent={reassignTotals.reassign > 0}
              />
              <SummaryStat
                label="Frische Zuweisungen"
                value={reassignTotals.fresh.toLocaleString()}
              />
              <SummaryStat
                label="Legacy-Migrationen"
                value={reassignTotals.legacy.toLocaleString()}
              />
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-sans text-sm">
                    <thead className="border-b border-border/60 bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5">Test</th>
                        <th className="px-4 py-2.5 text-right">Reassignments</th>
                        <th className="px-4 py-2.5 text-right">Sessions (eindeutig)</th>
                        <th className="px-4 py-2.5 text-right">Variant gewechselt</th>
                        <th className="px-4 py-2.5 text-right">Ø Bucket-Alter (d)</th>
                        <th className="px-4 py-2.5 text-right">Frisch</th>
                        <th className="px-4 py-2.5 text-right">Legacy-Migrationen</th>
                        <th className="px-4 py-2.5">Letzter Reassign</th>
                        <th className="px-4 py-2.5 text-right">Reroll-Quote</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reassignSummary.map((r) => {
                        const total = r.reassignments + r.fresh;
                        const rate = total > 0 ? r.reassignments / total : 0;
                        const dedicated = reassignedByTest.get(r.test_key);
                        return (
                          <tr key={r.test_key} className="border-b border-border/40 last:border-0">
                            <td className="px-4 py-3">
                              <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                                {r.test_key}
                              </code>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              <span className="inline-flex items-center gap-1.5">
                                {r.reassignments > 0 && (
                                  <RefreshCcw className="h-3 w-3 text-signal" aria-hidden />
                                )}
                                {r.reassignments.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                              {dedicated ? dedicated.sessions.toLocaleString() : "—"}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                              {dedicated
                                ? `${dedicated.changes.toLocaleString()}${
                                    dedicated.events > 0
                                      ? ` (${((dedicated.changes / dedicated.events) * 100).toFixed(0)}%)`
                                      : ""
                                  }`
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                              {dedicated && dedicated.avgAge != null ? dedicated.avgAge.toFixed(1) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                              {r.fresh.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                              {r.legacy.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {r.last_reassign_day
                                ? new Date(r.last_reassign_day).toLocaleDateString("de-DE", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {total === 0 ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <Badge
                                  variant={rate > 0.05 ? "default" : "outline"}
                                  className={rate > 0.05 ? "bg-signal text-signal-foreground" : ""}
                                >
                                  {(rate * 100).toFixed(1)}%
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <p className="mt-3 font-sans text-[11px] text-muted-foreground">
              Reassignment = der Bucket war im Storage gespeichert, aber älter als{" "}
              {REASSIGNMENT_TTL_DAYS} Tage (TTL abgelaufen) und wurde neu gewürfelt.
              Hohe Reroll-Quote (&gt; 5 %) deutet auf wiederkehrende Besucher außerhalb des Test-Fensters hin —
              für die Test-Power kann das die Variantenstabilität reduzieren.
            </p>
          </>
        )}
      </section>
    </main>
  );
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="font-sans text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p
          className={`mt-1 font-serif text-2xl font-semibold ${
            accent ? "text-signal" : "text-foreground"
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  rate,
  ciLow,
  ciHigh,
  numerator,
  denominator,
  sig,
}: {
  label: string;
  rate: number;
  ciLow: number;
  ciHigh: number;
  numerator: number;
  denominator: number;
  sig: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="font-sans text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {sig}
      </div>
      <div className="mt-1.5 flex items-baseline gap-3">
        <p className="font-serif text-3xl font-semibold tabular-nums text-foreground">
          {pct(rate)}
        </p>
        <p className="font-sans text-xs text-muted-foreground">
          <TrendingUp className="mr-1 inline h-3 w-3" />
          95% CI {pct(ciLow)} – {pct(ciHigh)}
        </p>
      </div>
      <p className="mt-1 font-sans text-[11px] text-muted-foreground">
        {numerator.toLocaleString()} / {denominator.toLocaleString()} Nutzer
      </p>
    </div>
  );
}
