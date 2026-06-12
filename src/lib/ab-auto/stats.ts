/**
 * Auto A/B System – Statistical core
 * --------------------------------------------------------------
 * Pure functions, no side effects, no DOM, no Supabase. Used by:
 *  - `ab-recompute-weights` edge function (server, Deno)
 *  - `AutoAllocatorPanel` (client, browser)
 *
 * Thompson Sampling (Beta-Bernoulli) for the LP-level bandit.
 * Two-proportion Z-test for the booking-level winner gate.
 */

export interface VariantStat {
  variantId: string;
  /** Trials = LP Views attributable to this variant */
  trials: number;
  /** Successes = events of the primary metric (e.g. quiz_started) */
  successes: number;
}

/** Sample once from Beta(alpha, beta) using Marsaglia / Tsang via Gamma. */
function sampleGamma(shape: number): number {
  // Marsaglia & Tsang (2000) for shape >= 1; for shape < 1 use boost.
  if (shape < 1) {
    const u = Math.random();
    return sampleGamma(shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let x: number, v: number;
    do {
      const u1 = Math.random();
      const u2 = Math.random();
      // Box-Muller
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function sampleBeta(alpha: number, beta: number): number {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

/**
 * Thompson allocation: returns weights (sum = 1) by simulating N Monte-Carlo
 * draws of each variant's success rate from its Beta posterior and counting
 * how often each variant wins.
 *
 * Beta prior: alpha = successes + 1, beta = trials - successes + 1 (uniform).
 * Applies a floor of `minWeight` per active variant for exploration safety.
 */
export function thompsonWeights(
  stats: VariantStat[],
  opts: { draws?: number; minWeight?: number } = {},
): Record<string, number> {
  const draws = opts.draws ?? 5000;
  const minWeight = opts.minWeight ?? 0.05;
  const n = stats.length;
  if (n === 0) return {};
  if (n === 1) return { [stats[0].variantId]: 1 };

  const wins: Record<string, number> = {};
  for (const s of stats) wins[s.variantId] = 0;

  for (let i = 0; i < draws; i++) {
    let bestId = stats[0].variantId;
    let bestVal = -Infinity;
    for (const s of stats) {
      const a = Math.max(0, s.successes) + 1;
      const b = Math.max(0, s.trials - s.successes) + 1;
      const v = sampleBeta(a, b);
      if (v > bestVal) {
        bestVal = v;
        bestId = s.variantId;
      }
    }
    wins[bestId]++;
  }

  // Raw weights from win share
  const raw: Record<string, number> = {};
  for (const s of stats) raw[s.variantId] = wins[s.variantId] / draws;

  // Enforce floor for each active variant, then renormalize.
  const floorTotal = minWeight * n;
  const remaining = Math.max(0, 1 - floorTotal);
  const rawSum = Object.values(raw).reduce((acc, v) => acc + v, 0) || 1;
  const out: Record<string, number> = {};
  for (const s of stats) {
    const share = raw[s.variantId] / rawSum;
    out[s.variantId] = minWeight + remaining * share;
  }
  return out;
}

/** Standard normal CDF via Abramowitz & Stegun 26.2.17 — accuracy ~7.5e-8. */
function phi(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

export interface ZTestResult {
  /** Two-sided p-value */
  pValue: number;
  /** Relative lift of treatment over control: (pT - pC) / pC */
  liftPct: number;
  /** Absolute difference pT - pC */
  diff: number;
  /** Z statistic */
  z: number;
}

/**
 * Two-proportion Z-test (pooled variance), two-sided.
 * `control` and `treatment` are { trials, successes }.
 */
export function twoProportionZTest(
  control: { trials: number; successes: number },
  treatment: { trials: number; successes: number },
): ZTestResult {
  const nC = Math.max(0, control.trials);
  const nT = Math.max(0, treatment.trials);
  if (nC === 0 || nT === 0) return { pValue: 1, liftPct: 0, diff: 0, z: 0 };

  const pC = control.successes / nC;
  const pT = treatment.successes / nT;
  const pPool = (control.successes + treatment.successes) / (nC + nT);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / nC + 1 / nT));
  if (se === 0) return { pValue: 1, liftPct: 0, diff: pT - pC, z: 0 };
  const z = (pT - pC) / se;
  const pValue = 2 * (1 - phi(Math.abs(z)));
  const liftPct = pC > 0 ? ((pT - pC) / pC) * 100 : 0;
  return { pValue, liftPct, diff: pT - pC, z };
}
