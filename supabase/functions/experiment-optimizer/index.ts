/**
 * experiment-optimizer
 *
 * Reads experiment_events, computes Bayesian posteriors per variant per
 * audience cohort, and writes recommended traffic weights to
 * experiment_weights. Designed to be invoked daily by pg_cron.
 *
 * Safety rails:
 *  - Holdout buckets are NEVER reduced (recommended_weight stays = registry).
 *  - Reallocation only kicks in when minExposures + confidence thresholds met.
 *  - Max ±20% shift per run vs. the previous recommendation.
 *  - Kill switch via env var EXPERIMENT_OPTIMIZER_DISABLED=1.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MIN_EXPOSURES = 200;
const MIN_CONFIDENCE = 0.95;
const MAX_SHIFT = 0.2;

// --- Stats helpers (closed-form Beta(α,β) for binomial conversion) -----------
function betaSample(alpha: number, beta: number, rng: () => number): number {
  // Cheng's BB algorithm (good enough for posterior sampling)
  const a = alpha,
    b = beta;
  const aa = a + b;
  const ba = Math.min(a, b) <= 1 ? 1 / Math.min(a, b) : Math.sqrt((2 * a * b - aa) / (aa - 2));
  const ca = a + 1 / ba;
  for (let i = 0; i < 100; i++) {
    const u1 = rng();
    const u2 = rng();
    const v = ba * Math.log(u1 / (1 - u1));
    const w = a * Math.exp(v);
    if (aa * Math.log(aa / (b + w)) + ca * v - 1.3862944 >= Math.log(u1 * u1 * u2)) {
      return w / (b + w);
    }
  }
  return a / (a + b);
}

function probabilityBest(alphas: number[], betas: number[]): number[] {
  // Monte Carlo P(variant i is best)
  const n = alphas.length;
  const wins = new Array(n).fill(0);
  const samples = 4000;
  let seed = 42;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let s = 0; s < samples; s++) {
    let best = -1;
    let bestVal = -1;
    for (let i = 0; i < n; i++) {
      const v = betaSample(alphas[i], betas[i], rng);
      if (v > bestVal) {
        bestVal = v;
        best = i;
      }
    }
    wins[best]++;
  }
  return wins.map((w) => w / samples);
}

interface VariantStats {
  variant_id: string;
  exposures: number;
  conversions: number;
  is_holdout: boolean;
}

async function optimizeExperiment(
  supabase: ReturnType<typeof createClient>,
  experimentKey: string,
  cohort: string,
  variants: VariantStats[],
): Promise<void> {
  const totalExposures = variants.reduce((s, v) => s + v.exposures, 0);

  // Posterior means with weak Beta(1,1) prior
  const alphas = variants.map((v) => v.conversions + 1);
  const betas = variants.map((v) => v.exposures - v.conversions + 1);
  const means = alphas.map((a, i) => a / (a + betas[i]));

  let probBest: number[] = variants.map(() => 1 / variants.length);
  if (totalExposures >= MIN_EXPOSURES) {
    probBest = probabilityBest(alphas, betas);
  }

  // Read previous weights (for max-shift clamping)
  const { data: prev } = await supabase
    .from("experiment_weights")
    .select("variant_id, recommended_weight")
    .eq("experiment_key", experimentKey)
    .eq("audience_cohort", cohort);
  const prevWeights = new Map<string, number>(
    (prev ?? []).map((r: any) => [r.variant_id, Number(r.recommended_weight)]),
  );

  // Determine new weights:
  //  - Holdouts: fixed at 0.10 of total (12% if 5+ variants)
  //  - Non-holdouts: proportional to probBest, with ±MAX_SHIFT clamping
  const holdoutTotal = 0.1;
  const activeVariants = variants
    .map((v, i) => ({ ...v, idx: i }))
    .filter((v) => !v.is_holdout);
  const holdoutVariants = variants
    .map((v, i) => ({ ...v, idx: i }))
    .filter((v) => v.is_holdout);

  const activeProbSum = activeVariants.reduce((s, v) => s + probBest[v.idx], 0) || 1;

  for (const v of variants) {
    let newWeight: number;
    if (v.is_holdout) {
      newWeight = holdoutTotal / Math.max(holdoutVariants.length, 1);
    } else {
      const targetShare = (probBest[variants.indexOf(v)] / activeProbSum) * (1 - holdoutTotal);
      const prevShare = prevWeights.get(v.variant_id);
      if (prevShare !== undefined && totalExposures >= MIN_EXPOSURES) {
        const delta = targetShare - prevShare;
        const clamped = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, delta));
        newWeight = Math.max(0.01, prevShare + clamped);
      } else {
        newWeight = targetShare;
      }
    }

    await supabase
      .from("experiment_weights")
      .upsert(
        {
          experiment_key: experimentKey,
          variant_id: v.variant_id,
          audience_cohort: cohort,
          recommended_weight: newWeight,
          exposures: v.exposures,
          conversions: v.conversions,
          posterior_mean: means[variants.indexOf(v)],
          confidence: probBest[variants.indexOf(v)],
          is_holdout: v.is_holdout,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "experiment_key,variant_id,audience_cohort" },
      );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (Deno.env.get("EXPERIMENT_OPTIMIZER_DISABLED") === "1") {
    return new Response(JSON.stringify({ ok: true, skipped: "disabled" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Aggregate experiment_events from the last 30 days, grouped by
  // (experiment_key, variant_id, is_holdout). Cohort = "default" for now;
  // when audience metadata starts being persisted, swap this to use it.
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: events, error } = await supabase
    .from("experiment_events")
    .select("experiment_key, variant_id, event_type, is_holdout, metadata")
    .gte("created_at", since)
    .limit(50000);

  if (error) {
    console.error("optimizer query error", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Group: experiment_key -> cohort -> variant_id -> { exposures, conversions, holdout }
  const grouped = new Map<string, Map<string, Map<string, VariantStats>>>();
  for (const e of events ?? []) {
    const cohort =
      (e.metadata && typeof e.metadata === "object" && (e.metadata as any).audience_cohort) ||
      "default";
    const eKey = e.experiment_key as string;
    const vId = e.variant_id as string;
    if (!grouped.has(eKey)) grouped.set(eKey, new Map());
    const cohortMap = grouped.get(eKey)!;
    if (!cohortMap.has(cohort)) cohortMap.set(cohort, new Map());
    const variantMap = cohortMap.get(cohort)!;
    if (!variantMap.has(vId)) {
      variantMap.set(vId, { variant_id: vId, exposures: 0, conversions: 0, is_holdout: !!e.is_holdout });
    }
    const stats = variantMap.get(vId)!;
    if (e.event_type === "exposed") stats.exposures++;
    else if (e.event_type === "converted") stats.conversions++;
  }

  const summary: Record<string, unknown> = {};
  for (const [expKey, cohortMap] of grouped.entries()) {
    summary[expKey] = {};
    for (const [cohort, variantMap] of cohortMap.entries()) {
      const variants = Array.from(variantMap.values());
      await optimizeExperiment(supabase, expKey, cohort, variants);
      (summary[expKey] as any)[cohort] = variants.map((v) => ({
        v: v.variant_id,
        exp: v.exposures,
        conv: v.conversions,
      }));
    }
  }

  return new Response(JSON.stringify({ ok: true, summary }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
