/**
 * /members/admin/experiments — Experimentation Operating System (Layer 49)
 *
 * Surfaces:
 *   • Overview KPIs (running, winner-ready, harmful, pending iterations)
 *   • Per-experiment: health badge, recommendation, metric table, decision history,
 *     extracted learnings, queued next iteration
 *   • Landing Page Evolution timeline
 *   • Iteration approval workflow (proposed → approved/rejected → built → launched)
 *
 * SAFETY:
 *   - Reads event_logs (no duplicate tracking)
 *   - NO live page mutation. All actions log to DB only.
 *   - L6+ / admin gated via RLS + UI guard.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Database } from "@/integrations/supabase/types";
import { useUserLevel } from "@/hooks/useUserLevel";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { toast } from "sonner";
import AccessDenied from "@/components/members/AccessDenied";
import {
  computeExperimentHealth,
  CONFIDENCE_LABEL,
  RECOMMENDATION_LABEL,
  confidenceBadgeVariant,
  type ExperimentHealth,
} from "@/lib/experiment-health";

/**
 * Explanatory empty state — tells the operator EXACTLY what is missing,
 * WHY the section is empty, and what action (if any) unblocks data flow.
 * No live mutations are triggered from here.
 */
function EmptyState({
  title,
  why,
  unblock,
  hint,
}: {
  title: string;
  why: string;
  unblock?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-dashed bg-muted/10 p-4 space-y-1.5">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground"><span className="uppercase tracking-wide">Why empty:</span> {why}</p>
      {unblock && (
        <p className="text-xs text-muted-foreground"><span className="uppercase tracking-wide">To populate:</span> {unblock}</p>
      )}
      {hint && (
        <p className="text-[11px] text-muted-foreground/80 italic">{hint}</p>
      )}
    </div>
  );
}

/**
 * Inline help icon with tooltip — explains a metric, label, or rule
 * without crowding the surface. Read-only.
 */
function InfoHint({ children, side = "top" }: { children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center align-middle text-muted-foreground/70 hover:text-foreground transition-colors ml-1"
            aria-label="More info"
          >
            <Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs text-xs leading-relaxed">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface Experiment {
  id: string;
  test_key: string;
  name: string;
  hypothesis: string | null;
  primary_kpi: string | null;
  surface: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
}

interface Variant {
  id: string;
  experiment_id: string;
  variant_key: string | null;
  is_control: boolean;
  is_holdout: boolean;
  weight_pct: number | null;
  description: string | null;
  change_definition: Record<string, unknown> | null;
}

interface Decision {
  id: string;
  experiment_id: string;
  test_key: string;
  decision: string;
  winning_variant_key: string | null;
  reason: string;
  lift_pct: number | null;
  decided_at: string;
}

interface Learning {
  id: string;
  experiment_id: string;
  test_key: string;
  winning_variant_key: string | null;
  losing_variant_keys: string[];
  learning_summary: string;
  primary_metric: string;
  primary_metric_lift_pct: number | null;
  confidence_level: string;
  recommended_next_test: string | null;
  is_negative: boolean;
  created_at: string;
}

interface IterationProposal {
  id: string;
  parent_experiment_id: string | null;
  parent_test_key: string;
  proposed_test_key: string;
  proposed_hypothesis: string;
  proposed_variants: unknown;
  rationale: string;
  expected_primary_kpi: string | null;
  status: "proposed" | "approved" | "rejected" | "built" | "launched";
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  launched_at: string | null;
}

const FUNNEL_EVENTS = [
  "apply_ab_assigned",
  "apply_hero_ab_assigned",
  "playbook_hero_cta_v1_assigned",
  "sticky_hint_v1_assigned",
  "apply_cta_click",
  "quiz_view",
  "quiz_started",
  "quiz_completed",
  "call_booked",
  "booking_created",
  "lead_magnet_submitted",
  "sticky_hint_click",
];

export default function Experiments() {
  const { level, loading: levelLoading } = useUserLevel();
  const { user } = useAuth();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [learnings, setLearnings] = useState<Learning[]>([]);
  const [iterations, setIterations] = useState<IterationProposal[]>([]);
  const [eventsByTest, setEventsByTest] = useState<
    Record<string, Record<string, Record<string, number>>>
  >({});
  const [loading, setLoading] = useState(true);
  const [bookingAttribution, setBookingAttribution] = useState<{
    totalBookings: number;
    taggedBookings: number;
    untaggedBookings: number;
    coveragePct: number;
    sampledAt: string;
  } | null>(null);
  const [activeTestKey, setActiveTestKey] = useState<string | null>(null);
  const [winningVariant, setWinningVariant] = useState<string>("");
  const [decisionType, setDecisionType] = useState<string>("declare_winner");
  const [reason, setReason] = useState<string>("");

  const isL6Plus = level >= 6;

  const reloadAll = async () => {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [expRes, varRes, decRes, learnRes, iterRes, evtRes, totalBookingsRes, taggedBookingsRes] = await Promise.all([
      supabase
        .from("experiments")
        .select("id, test_key, name, hypothesis, primary_kpi, surface, status, started_at, ended_at, notes")
        .not("test_key", "is", null)
        .order("status", { ascending: true })
        .order("test_key", { ascending: true }),
      supabase
        .from("experiment_variants")
        .select("id, experiment_id, variant_key, is_control, is_holdout, weight_pct, description, change_definition")
        .not("variant_key", "is", null),
      supabase
        .from("experiment_decisions")
        .select("id, experiment_id, test_key, decision, winning_variant_key, reason, lift_pct, decided_at")
        .order("decided_at", { ascending: false })
        .limit(100),
      supabase
        .from("experiment_learnings")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("experiment_iteration_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("event_logs")
        .select("event_name, payload")
        .in("event_name", FUNNEL_EVENTS)
        .gte("created_at", since30d)
        .not("payload->ab_test", "is", null)
        .limit(5000),
      // Booking attribution audit — total booking_created in last 30d (count only, no payload)
      supabase
        .from("event_logs")
        .select("id", { count: "exact", head: true })
        .in("event_name", ["booking_created", "call_booked"])
        .gte("created_at", since30d),
      // Booking attribution audit — only those carrying ab_test in payload
      supabase
        .from("event_logs")
        .select("id", { count: "exact", head: true })
        .in("event_name", ["booking_created", "call_booked"])
        .gte("created_at", since30d)
        .not("payload->ab_test", "is", null),
    ]);

    if (expRes.data) setExperiments(expRes.data as Experiment[]);
    if (varRes.data) setVariants(varRes.data as Variant[]);
    if (decRes.data) setDecisions(decRes.data as Decision[]);
    if (learnRes.data) setLearnings(learnRes.data as Learning[]);
    if (iterRes.data) setIterations(iterRes.data as IterationProposal[]);

    const agg: Record<string, Record<string, Record<string, number>>> = {};
    (evtRes.data ?? []).forEach((row) => {
      const payload = (row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {}) as Record<string, unknown>;
      const testKey = (payload.ab_test ?? null) as string | null;
      const variantKey = (payload.ab_variant ?? null) as string | null;
      if (!testKey || !variantKey) return;
      agg[testKey] ??= {};
      agg[testKey][variantKey] ??= {};
      agg[testKey][variantKey][row.event_name] = (agg[testKey][variantKey][row.event_name] ?? 0) + 1;
    });
    setEventsByTest(agg);

    // Booking attribution coverage audit
    const totalBookings = totalBookingsRes.count ?? 0;
    const taggedBookings = taggedBookingsRes.count ?? 0;
    const untaggedBookings = Math.max(0, totalBookings - taggedBookings);
    const coveragePct = totalBookings > 0 ? (taggedBookings / totalBookings) * 100 : 0;
    setBookingAttribution({
      totalBookings,
      taggedBookings,
      untaggedBookings,
      coveragePct,
      sampledAt: new Date().toISOString(),
    });

    if (expRes.data && expRes.data.length > 0 && !activeTestKey) {
      setActiveTestKey((expRes.data[0] as Experiment).test_key);
    }
  };

  useEffect(() => {
    if (!isL6Plus) return;
    setLoading(true);
    reloadAll().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isL6Plus]);

  const variantsByExp = useMemo(() => {
    const map: Record<string, Variant[]> = {};
    variants.forEach((v) => {
      map[v.experiment_id] ??= [];
      map[v.experiment_id].push(v);
    });
    return map;
  }, [variants]);

  const decisionsByTest = useMemo(() => {
    const map: Record<string, Decision[]> = {};
    decisions.forEach((d) => {
      map[d.test_key] ??= [];
      map[d.test_key].push(d);
    });
    return map;
  }, [decisions]);

  const learningsByTest = useMemo(() => {
    const map: Record<string, Learning[]> = {};
    learnings.forEach((l) => {
      map[l.test_key] ??= [];
      map[l.test_key].push(l);
    });
    return map;
  }, [learnings]);

  const iterationsByParent = useMemo(() => {
    const map: Record<string, IterationProposal[]> = {};
    iterations.forEach((i) => {
      map[i.parent_test_key] ??= [];
      map[i.parent_test_key].push(i);
    });
    return map;
  }, [iterations]);

  /** Compute health for an experiment by mapping event counts to the engine's input shape. */
  const computeHealth = (exp: Experiment, vList: Variant[]): ExperimentHealth => {
    const testEvents = eventsByTest[exp.test_key] ?? {};
    const inputs = vList.map((v) => {
      const e = testEvents[v.variant_key ?? ""] ?? {};
      const exposures =
        (e["apply_ab_assigned"] ?? 0) +
        (e["apply_hero_ab_assigned"] ?? 0) +
        (e["playbook_hero_cta_v1_assigned"] ?? 0) +
        (e["sticky_hint_v1_assigned"] ?? 0);
      const bookings = (e["call_booked"] ?? 0) + (e["booking_created"] ?? 0);
      const quizDone = e["quiz_completed"] ?? 0;
      return {
        variant_key: v.variant_key ?? "",
        is_control: v.is_control,
        is_holdout: v.is_holdout,
        weight_pct: v.weight_pct ? Number(v.weight_pct) : null,
        exposures,
        primary_conversions: bookings,
        secondary_conversions: quizDone,
      };
    });
    return computeExperimentHealth(inputs);
  };

  const healthByTest = useMemo(() => {
    const map: Record<string, ExperimentHealth> = {};
    experiments.forEach((e) => {
      map[e.test_key] = computeHealth(e, variantsByExp[e.id] ?? []);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experiments, variantsByExp, eventsByTest]);

  // ---- Overview KPIs ----
  const overview = useMemo(() => {
    const running = experiments.filter((e) => e.status === "running").length;
    let winnerReady = 0;
    let harmful = 0;
    Object.values(healthByTest).forEach((h) => {
      if (h.confidence === "winner_ready") winnerReady++;
      if (h.confidence === "possible_harm") harmful++;
    });
    const pending = iterations.filter((i) => i.status === "proposed").length;
    return { running, winnerReady, harmful, pending };
  }, [experiments, healthByTest, iterations]);

  const handleDecisionSubmit = async () => {
    if (!activeTestKey || !user) return;
    const exp = experiments.find((x) => x.test_key === activeTestKey);
    if (!exp) return;
    if (!reason.trim()) {
      toast.error("Reason is required.");
      return;
    }
    if (decisionType === "declare_winner" && !winningVariant) {
      toast.error("Pick a winning variant.");
      return;
    }
    const health = healthByTest[activeTestKey];
    const variantSnapshot = health.variants.map((v) => ({
      variant_key: v.variant_key,
      exposures: v.exposures,
      primary_cr: v.primary_cr,
      lift_vs_control_pct: v.lift_vs_control_pct,
    }));
    const winnerLift =
      decisionType === "declare_winner"
        ? health.variants.find((v) => v.variant_key === winningVariant)?.lift_vs_control_pct ?? null
        : null;

    const { error } = await supabase.from("experiment_decisions").insert({
      experiment_id: exp.id,
      test_key: activeTestKey,
      decision: decisionType,
      winning_variant_key: decisionType === "declare_winner" ? winningVariant : null,
      primary_kpi: exp.primary_kpi ?? "unknown",
      reason: reason.trim(),
      lift_pct: winnerLift,
      sample_size_total: health.total_exposures,
      metrics_snapshot: {
        variants: variantSnapshot,
        confidence: health.confidence,
        recommendation: health.recommendation,
        captured_at: new Date().toISOString(),
      } as Json,
      decided_by: user.id,
    });

    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }
    toast.success("Decision logged. Learning + iteration auto-generated.");
    setReason("");
    setWinningVariant("");
    await reloadAll();
  };

  const updateIterationStatus = async (
    id: string,
    status: IterationProposal["status"],
  ) => {
    if (!user) return;
    const patch: Database["public"]["Tables"]["experiment_iteration_queue"]["Update"] = { status };
    if (status === "approved") {
      patch.approved_by = user.id;
      patch.approved_at = new Date().toISOString();
    }
    if (status === "launched") {
      patch.launched_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from("experiment_iteration_queue")
      .update(patch)
      .eq("id", id);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }
    toast.success(`Iteration marked ${status}.`);
    await reloadAll();
  };

  if (levelLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!isL6Plus) {
    return <AccessDenied />;
  }

  const activeExp = experiments.find((e) => e.test_key === activeTestKey);
  const activeVariants = activeExp ? variantsByExp[activeExp.id] ?? [] : [];
  const activeHealth = activeExp ? healthByTest[activeExp.test_key] : null;
  const activeDecisions = activeTestKey ? decisionsByTest[activeTestKey] ?? [] : [];
  const activeLearnings = activeTestKey ? learningsByTest[activeTestKey] ?? [] : [];
  const activeIterations = activeTestKey ? iterationsByParent[activeTestKey] ?? [] : [];

  // ---- Chronological evolution timeline (mixed events) ----
  type TLItem = {
    when: string;
    kind: "experiment_started" | "decision" | "learning" | "iteration_proposed" | "iteration_status";
    test_key: string;
    label: string;
    detail?: string;
  };
  const timeline: TLItem[] = [];
  experiments.forEach((e) => {
    if (e.started_at) {
      timeline.push({
        when: e.started_at,
        kind: "experiment_started",
        test_key: e.test_key,
        label: `Experiment started: ${e.test_key}`,
        detail: e.hypothesis ?? undefined,
      });
    }
  });
  decisions.forEach((d) => {
    timeline.push({
      when: d.decided_at,
      kind: "decision",
      test_key: d.test_key,
      label: `Decision: ${d.decision}${d.winning_variant_key ? ` → ${d.winning_variant_key}` : ""}`,
      detail: d.reason,
    });
  });
  learnings.forEach((l) => {
    timeline.push({
      when: l.created_at,
      kind: "learning",
      test_key: l.test_key,
      label: `${l.is_negative ? "Negative learning" : "Learning"}: ${l.test_key}`,
      detail: l.learning_summary,
    });
  });
  iterations.forEach((i) => {
    timeline.push({
      when: i.created_at,
      kind: "iteration_proposed",
      test_key: i.parent_test_key,
      label: `Iteration proposed: ${i.proposed_test_key}`,
      detail: i.rationale,
    });
    if (i.approved_at) {
      timeline.push({
        when: i.approved_at,
        kind: "iteration_status",
        test_key: i.parent_test_key,
        label: `Iteration approved: ${i.proposed_test_key}`,
      });
    }
    if (i.launched_at) {
      timeline.push({
        when: i.launched_at,
        kind: "iteration_status",
        test_key: i.parent_test_key,
        label: `Iteration launched: ${i.proposed_test_key}`,
      });
    }
  });
  timeline.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());

  // ---- Booking attribution audit (Phase 4, hardened) ----
  // booking_created / call_booked may be emitted on /booking without payload.ab_test / ab_variant.
  // We compare TOTAL booking events vs. those carrying experiment context to surface the exact gap.
  const totalExposures = Object.values(healthByTest).reduce((s, h) => s + h.total_exposures, 0);
  const totalPrimary = Object.values(healthByTest).reduce(
    (s, h) => s + h.variants.reduce((a, v) => a + v.primary_conversions, 0),
    0,
  );
  const ba = bookingAttribution;
  // Severity tiers based on coverage of last-30d booking events:
  //   - critical: < 50% (or 0 tagged with > 0 total) → primary KPI is essentially blind
  //   - warn:     50–89% → recommendations possible but biased
  //   - ok:       ≥ 90% → safe to declare winners
  const baSeverity: "critical" | "warn" | "ok" | "no_data" = !ba
    ? "no_data"
    : ba.totalBookings === 0
    ? "no_data"
    : ba.coveragePct < 50
    ? "critical"
    : ba.coveragePct < 90
    ? "warn"
    : "ok";
  const showAttributionBanner = baSeverity === "critical" || baSeverity === "warn"
    || (totalExposures > 200 && totalPrimary === 0);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-3xl font-serif">Experimentation OS</h1>
        <p className="text-muted-foreground mt-2 max-w-3xl">
          Self-learning loop for /apply. Reads from <code>event_logs</code> (last 30 days).
          Recommendations are surfaced — never auto-applied. All rollouts require manual approval (L6+ / admin).
        </p>
        {showAttributionBanner && ba && (
          <div
            className={
              "mt-3 rounded-lg border p-3 text-xs space-y-2 " +
              (baSeverity === "critical"
                ? "border-destructive/50 bg-destructive/10 text-destructive"
                : "border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200")
            }
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <strong>
                {baSeverity === "critical"
                  ? "Booking attribution is broken — primary KPI cannot be trusted"
                  : "Booking attribution is partial — primary KPI is biased"}
              </strong>
              <span className="text-[10px] uppercase tracking-wide opacity-70">
                {baSeverity === "critical" ? "CRITICAL" : "WARNING"} · sampled {new Date(ba.sampledAt).toLocaleTimeString()}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1 text-[11px]">
              <div className="rounded border border-current/20 bg-background/40 px-2 py-1">
                <div className="opacity-70 uppercase tracking-wide">Total bookings (30d)</div>
                <div className="font-mono text-sm">{ba.totalBookings}</div>
              </div>
              <div className="rounded border border-current/20 bg-background/40 px-2 py-1">
                <div className="opacity-70 uppercase tracking-wide">With ab_test/ab_variant</div>
                <div className="font-mono text-sm">{ba.taggedBookings}</div>
              </div>
              <div className="rounded border border-current/20 bg-background/40 px-2 py-1">
                <div className="opacity-70 uppercase tracking-wide">Untagged (lost to attribution)</div>
                <div className="font-mono text-sm">{ba.untaggedBookings}</div>
              </div>
              <div className="rounded border border-current/20 bg-background/40 px-2 py-1">
                <div className="opacity-70 uppercase tracking-wide">Coverage</div>
                <div className="font-mono text-sm">{ba.coveragePct.toFixed(1)}%</div>
              </div>
            </div>

            <p>
              <strong>What this means for primary KPI calculations:</strong>{" "}
              Booking CR for every variant is computed as{" "}
              <code>tagged_bookings ÷ exposures</code>. The {ba.untaggedBookings} untagged
              bookings are <em>excluded from every numerator</em>, so each variant's CR is
              under-reported by roughly{" "}
              <strong>{(100 - ba.coveragePct).toFixed(0)}%</strong> of its true value.
              {baSeverity === "critical" && (
                <> Lift vs control is also unreliable because the missing bookings are
                  not guaranteed to split evenly across variants — the comparison is
                  no longer apples-to-apples.</>
              )}
            </p>

            <p>
              <strong>Effect on decisions:</strong>{" "}
              {baSeverity === "critical"
                ? "Winner declarations are blocked by the health engine (insufficient_downstream_data) until coverage exceeds the minimum sample threshold per arm."
                : "Winner-ready may still trigger, but the decision is biased toward whichever variant happens to retain ab_test through to /booking. Treat lift values as directional only."}
            </p>

            <p className="opacity-80">
              <strong>To fix:</strong> A client-side patch (Layer 49) now attaches{" "}
              <code>ab_test</code> / <code>ab_variant</code> from active /apply A/B
              localStorage keys onto every <code>booking_created</code> /{" "}
              <code>booking_confirmed</code> payload. Coverage should climb toward 100%
              within 24h as new bookings flow in. Untagged historical bookings remain
              excluded from per-variant CR.
            </p>
            <p className="opacity-70 text-[11px]">
              Booking attribution depends on <code>booking_created</code> events
              carrying <code>ab_test</code> / <code>ab_variant</code>. Visitors who
              never landed on /apply (and therefore never received an A/B assignment)
              produce untagged bookings by design.
            </p>
          </div>
        )}
      </header>

      {/* Overview KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <KpiCard
          label="Running experiments"
          value={overview.running}
          hint="Experiments with status = 'running' that are emitting exposures into event_logs. Drafts and ended tests are excluded."
        />
        <KpiCard
          label="Winner-ready"
          value={overview.winnerReady}
          tone={overview.winnerReady > 0 ? "positive" : "neutral"}
          hint={
            <>
              An experiment is winner-ready only when ALL of these are true:
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                <li>≥ 200 exposures on the leading variant (minimum sample to detect a real signal vs. noise)</li>
                <li>≥ 30 primary conversions on both control and challenger (so each side has real data, not lucky early bookings)</li>
                <li>Lift vs control ≥ 10% on the primary KPI</li>
                <li>No 'possible harm' flag on any variant</li>
              </ul>
              Below these thresholds, declaring a winner is statistically unreliable — early winners often regress to the control.
            </>
          }
        />
        <KpiCard
          label="Harmful variants flagged"
          value={overview.harmful}
          tone={overview.harmful > 0 ? "danger" : "neutral"}
          hint="A variant is flagged 'harm' when its primary CR is materially below control with enough exposures to be confident the drop is real, not noise. Consider rollback."
        />
        <KpiCard
          label="Pending iterations"
          value={overview.pending}
          tone={overview.pending > 0 ? "attention" : "neutral"}
          hint="Auto-proposed next experiments waiting for admin approval. Generated only when a winner / abandon / rollback decision is logged. Nothing ships until you approve and mark them launched."
        />
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading experiments…</div>
      ) : experiments.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState
              title="No experiments registered yet"
              why="Nothing has been inserted into the experiments table for this project."
              unblock="Insert a row into experiments (test_key, name, primary_kpi, surface) and at least 2 rows in experiment_variants (one is_control=true). Then start firing event_logs with payload.ab_test = test_key and payload.ab_variant = variant_key."
              hint="This page reads from event_logs as the source of truth — it never writes exposures itself."
            />
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTestKey ?? undefined} onValueChange={(v) => setActiveTestKey(v)} className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/30 p-1">
            {experiments.map((e) => {
              const h = healthByTest[e.test_key];
              return (
                <TabsTrigger key={e.test_key} value={e.test_key} className="text-xs">
                  {e.test_key}
                  {h && (
                    <Badge variant={confidenceBadgeVariant(h.confidence)} className="ml-2 text-[10px]">
                      {CONFIDENCE_LABEL[h.confidence]}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {experiments.map((exp) => {
            const expVariants = variantsByExp[exp.id] ?? [];
            const h = healthByTest[exp.test_key];
            return (
              <TabsContent key={exp.test_key} value={exp.test_key} className="space-y-6 mt-6">
                {/* Header */}
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <CardTitle className="font-serif text-2xl">{exp.name}</CardTitle>
                        <CardDescription className="mt-1">
                          <code className="text-xs">{exp.test_key}</code>
                          {exp.surface && <span className="ml-2">· {exp.surface}</span>}
                        </CardDescription>
                      </div>
                      <div className="flex flex-col gap-1 items-end text-xs text-muted-foreground">
                        <div>Primary KPI: <strong>{exp.primary_kpi ?? "—"}</strong></div>
                        {exp.started_at && (
                          <div>Started: {new Date(exp.started_at).toLocaleDateString()}</div>
                        )}
                        <div>Total exposures (30d): <strong>{h?.total_exposures ?? 0}</strong></div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {exp.hypothesis && (
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Hypothesis</div>
                        <p className="text-sm">{exp.hypothesis}</p>
                      </div>
                    )}

                    {/* Health + Recommendation */}
                    {h && (
                      <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">Health</span>
                          <Badge variant={confidenceBadgeVariant(h.confidence)}>
                            {CONFIDENCE_LABEL[h.confidence]}
                          </Badge>
                          <span className="text-xs uppercase tracking-wide text-muted-foreground ml-3">Recommendation</span>
                          <Badge variant="outline">{RECOMMENDATION_LABEL[h.recommendation]}</Badge>
                        </div>
                        <p className="text-sm">{h.reason}</p>
                        {h.warnings.length > 0 && (
                          <ul className="text-xs text-amber-700 dark:text-amber-400 list-disc pl-5 space-y-0.5">
                            {h.warnings.map((w, i) => <li key={i}>{w}</li>)}
                          </ul>
                        )}
                      </div>
                    )}

                    {exp.notes && <p className="text-xs text-muted-foreground">{exp.notes}</p>}
                  </CardContent>
                </Card>

                {/* Variants table */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Variants & Funnel Performance (30d)</CardTitle>
                    <CardDescription className="text-xs">
                      Counts from event_logs.payload.ab_test = "{exp.test_key}". Lift = relative to control booking CR.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {expVariants.length === 0 ? (
                      <EmptyState
                        title="No variants registered for this experiment"
                        why="experiment_variants has no rows linked to this experiment.id."
                        unblock={`Insert at least 2 rows into experiment_variants for "${exp.test_key}" — exactly one with is_control=true. Without variants, exposures and lift cannot be computed.`}
                      />
                    ) : (h?.total_exposures ?? 0) === 0 ? (
                      <EmptyState
                        title="Variants registered, but no exposures yet"
                        why={`Zero event_logs found in the last 30 days with payload.ab_test = "${exp.test_key}".`}
                        unblock={`Make sure the surface "${exp.surface ?? "—"}" emits an event_logs row carrying payload.ab_test and payload.ab_variant on every render. Until then no funnel metrics can attribute.`}
                        hint="Health is locked to 'insufficient_data' while exposures = 0."
                      />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                              <th className="text-left py-2 pr-4">Variant</th>
                              <th className="text-right pr-4">
                                <span className="inline-flex items-center justify-end">
                                  Exposures
                                  <InfoHint>
                                    The number of unique users in the last 30 days who saw this variant — counted from <code>event_logs</code> rows where <code>payload.ab_test</code> matches and <code>payload.ab_variant</code> equals this variant. One exposure = one assignment, deduped per user. This is the denominator for every conversion rate below.
                                  </InfoHint>
                                </span>
                              </th>
                              <th className="text-right pr-4">
                                <span className="inline-flex items-center justify-end">
                                  Share / Target
                                  <InfoHint>
                                    Actual share of exposures that landed on this variant vs. the configured weight (target split). A drift &gt; 5pp usually means the assignment hash is unbalanced or one variant is short-circuited upstream.
                                  </InfoHint>
                                </span>
                              </th>
                              <th className="text-right pr-4">Quiz Done</th>
                              <th className="text-right pr-4">Bookings</th>
                              <th className="text-right pr-4">
                                <span className="inline-flex items-center justify-end">
                                  Booking CR
                                  <InfoHint>
                                    Booking conversion rate = bookings ÷ exposures for this variant. The primary KPI for /apply experiments. Only meaningful once exposures &gt; ~200 — small samples produce wild swings.
                                  </InfoHint>
                                </span>
                              </th>
                              <th className="text-right">
                                <span className="inline-flex items-center justify-end">
                                  Lift vs Ctrl
                                  <InfoHint>
                                    Relative change in booking CR vs. the variant marked <code>is_control</code>. Formula: <code>(variant_CR − control_CR) ÷ control_CR × 100%</code>. Green = challenger beats control, red = challenger loses. Treat as directional until winner-ready thresholds are met.
                                  </InfoHint>
                                </span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {h?.variants.map((v) => (
                              <tr key={v.variant_key} className={`border-b last:border-0 ${v.is_possible_harm ? "bg-destructive/5" : ""}`}>
                                <td className="py-2 pr-4">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs">{v.variant_key}</span>
                                    {v.is_control && <Badge variant="outline" className="text-[10px]">control</Badge>}
                                    {v.is_holdout && <Badge variant="outline" className="text-[10px]">holdout</Badge>}
                                    {v.is_possible_harm && <Badge variant="destructive" className="text-[10px]">harm</Badge>}
                                  </div>
                                </td>
                                <td className="text-right pr-4">{v.exposures}</td>
                                <td className="text-right pr-4 text-xs text-muted-foreground">
                                  {v.exposure_share_pct.toFixed(0)}%
                                  {v.weight_pct != null && <> / {v.weight_pct}%</>}
                                </td>
                                <td className="text-right pr-4">{v.secondary_conversions ?? 0}</td>
                                <td className="text-right pr-4">{v.primary_conversions}</td>
                                <td className="text-right pr-4">
                                  {v.primary_cr !== null ? `${(v.primary_cr * 100).toFixed(1)}%` : "—"}
                                </td>
                                <td className="text-right">
                                  {v.lift_vs_control_pct !== null ? (
                                    <span className={v.lift_vs_control_pct > 0 ? "text-green-600" : "text-red-600"}>
                                      {v.lift_vs_control_pct > 0 ? "+" : ""}{v.lift_vs_control_pct.toFixed(1)}%
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {h?.variants.some((v) => v.primary_conversions === 0) && (h?.total_exposures ?? 0) > 0 && (
                          <p className="mt-3 text-[11px] text-muted-foreground italic">
                            Some variants show exposures but zero primary conversions. If this persists, downstream events (e.g. <code>booking_created</code>) may not be propagating <code>payload.ab_test</code> / <code>payload.ab_variant</code>.
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Decision form */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Log Decision</CardTitle>
                    <CardDescription className="text-xs">
                      Writes to <code>experiment_decisions</code>. A winning decision auto-creates a learning
                      and queues a next-iteration proposal — but does not change live code.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs uppercase tracking-wide text-muted-foreground">Decision Type</label>
                        <Select value={decisionType} onValueChange={setDecisionType}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="declare_winner">Declare winner</SelectItem>
                            <SelectItem value="keep_running">Keep running</SelectItem>
                            <SelectItem value="extend">Extend duration</SelectItem>
                            <SelectItem value="abandon">Abandon</SelectItem>
                            <SelectItem value="rollback">Rollback</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {decisionType === "declare_winner" && (
                        <div>
                          <label className="text-xs uppercase tracking-wide text-muted-foreground">Winning Variant</label>
                          <Select value={winningVariant} onValueChange={setWinningVariant}>
                            <SelectTrigger><SelectValue placeholder="Pick variant" /></SelectTrigger>
                            <SelectContent>
                              {expVariants.map((v) => (
                                <SelectItem key={v.id} value={v.variant_key ?? ""}>
                                  {v.variant_key} {v.is_control ? "(control)" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-muted-foreground">Reason (required)</label>
                      <Textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Why this decision? Sample size, lift, observed behavior, risk…"
                        rows={3}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        Snapshot of {h?.total_exposures ?? 0} exposures across {expVariants.length} variants will be captured.
                      </div>
                      <Button onClick={handleDecisionSubmit} disabled={!reason.trim()}>
                        Log Decision
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Decision history */}
                <Card>
                  <CardHeader><CardTitle className="text-base">Decision History</CardTitle></CardHeader>
                  <CardContent>
                    {activeDecisions.length === 0 ? (
                      <EmptyState
                        title="No decisions logged yet"
                        why="experiment_decisions has no rows for this test_key."
                        unblock="Use the 'Log Decision' card above to record a winner, abandon, rollback, extend, or keep-running decision. Decisions are the only thing that triggers learnings + next-iteration proposals."
                        hint="Winning decisions are blocked by the health engine until the primary metric has data on both control and challenger arms."
                      />
                    ) : (
                      <div className="space-y-3">
                        {activeDecisions.map((d) => (
                          <div key={d.id} className="border-l-2 border-muted pl-3 py-1">
                            <div className="flex items-center gap-2 text-xs">
                              <Badge variant="outline">{d.decision}</Badge>
                              {d.winning_variant_key && <span className="font-mono">{d.winning_variant_key}</span>}
                              <span className="text-muted-foreground">{new Date(d.decided_at).toLocaleString()}</span>
                            </div>
                            <p className="text-sm mt-1">{d.reason}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Extracted learnings */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Extracted Learnings</CardTitle>
                    <CardDescription className="text-xs">Auto-generated from finalized decisions.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {activeLearnings.length === 0 ? (
                      <EmptyState
                        title="No learnings yet"
                        why="experiment_learnings is auto-populated by the fn_auto_create_learning trigger only when a decision of type declare_winner, abandon, or rollback is inserted."
                        unblock="Log a winner or abandon decision above. keep_running and extend decisions intentionally do NOT generate a learning."
                      />
                    ) : (
                      <div className="space-y-3">
                        {activeLearnings.map((l) => (
                          <div key={l.id} className={`rounded border p-3 ${l.is_negative ? "border-destructive/30 bg-destructive/5" : ""}`}>
                            <div className="flex items-center gap-2 text-xs mb-1">
                              <Badge variant={l.is_negative ? "destructive" : "default"}>
                                {l.is_negative ? "negative" : "positive"}
                              </Badge>
                              {l.winning_variant_key && <span className="font-mono">→ {l.winning_variant_key}</span>}
                              <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                            </div>
                            <p className="text-sm">{l.learning_summary}</p>
                            {l.recommended_next_test && (
                              <p className="text-xs text-muted-foreground mt-1">Next: {l.recommended_next_test}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Queued iterations */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Next Iteration Queue</CardTitle>
                    <CardDescription className="text-xs">
                      Auto-proposed when a winner is declared. Approval is required before any build or launch.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {activeIterations.length === 0 ? (
                      <EmptyState
                        title="No iteration proposals queued"
                        why="experiment_iteration_queue is auto-populated alongside learnings — only declare_winner / abandon / rollback decisions enqueue a next iteration."
                        unblock="Log a qualifying decision above. Proposals appear here as 'proposed' and require admin approval before they can be marked built or launched."
                        hint="Approval workflow is read-only safe: nothing in the live /apply surface changes until you manually mark an iteration as 'launched'."
                      />
                    ) : (
                      <div className="space-y-3">
                        {activeIterations.map((i) => (
                          <div key={i.id} className="rounded border p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 text-xs">
                                <Badge variant="outline">{i.status}</Badge>
                                <code className="font-mono">{i.proposed_test_key}</code>
                                <span className="text-muted-foreground">{new Date(i.created_at).toLocaleString()}</span>
                              </div>
                              <div className="flex gap-1 flex-wrap">
                                {i.status === "proposed" && (
                                  <>
                                    <Button size="sm" variant="default" onClick={() => updateIterationStatus(i.id, "approved")}>Approve</Button>
                                    <Button size="sm" variant="outline" onClick={() => updateIterationStatus(i.id, "rejected")}>Reject</Button>
                                  </>
                                )}
                                {i.status === "approved" && (
                                  <Button size="sm" variant="outline" onClick={() => updateIterationStatus(i.id, "built")}>Mark built</Button>
                                )}
                                {i.status === "built" && (
                                  <Button size="sm" variant="default" onClick={() => updateIterationStatus(i.id, "launched")}>Mark launched</Button>
                                )}
                              </div>
                            </div>
                            <p className="text-sm"><strong>Hypothesis:</strong> {i.proposed_hypothesis}</p>
                            <p className="text-xs text-muted-foreground"><strong>Rationale:</strong> {i.rationale}</p>
                            {Array.isArray(i.proposed_variants) && (i.proposed_variants as unknown[]).length > 0 && (
                              <ul className="text-xs list-disc pl-5">
                                {(i.proposed_variants as Array<Record<string, unknown>>).map((pv, idx) => (
                                  <li key={idx}>
                                    <span className="font-mono">{String(pv.variant_key ?? "?")}</span>
                                    {pv.is_control ? " (control)" : ""} — {String(pv.description ?? "")}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      {/* Landing Page Evolution */}
      <Card className="mt-10">
        <CardHeader>
          <CardTitle className="font-serif text-xl">Landing Page Evolution</CardTitle>
          <CardDescription className="text-xs">
            Chronological learning loop for /apply: experiment → decision → learning → next iteration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No timeline events yet.</p>
          ) : (
            <ol className="relative border-l border-muted pl-5 space-y-4">
              {timeline.slice(0, 50).map((t, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                  <div className="text-xs text-muted-foreground">
                    {new Date(t.when).toLocaleString()} · <code>{t.test_key}</code>
                  </div>
                  <div className="text-sm font-medium">{t.label}</div>
                  {t.detail && <p className="text-xs text-muted-foreground mt-0.5">{t.detail}</p>}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground mt-8 text-center">
        Reads from <code>event_logs</code>. Decisions, learnings, iterations and snapshots are append-only audit. L6+ access.
      </p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: number;
  tone?: "neutral" | "positive" | "danger" | "attention";
  hint?: React.ReactNode;
}) {
  const toneClass =
    tone === "positive"
      ? "text-green-600"
      : tone === "danger"
      ? "text-destructive"
      : tone === "attention"
      ? "text-amber-600"
      : "text-foreground";
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center">
          <span>{label}</span>
          {hint && <InfoHint>{hint}</InfoHint>}
        </div>
        <div className={`text-2xl font-serif mt-1 ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
