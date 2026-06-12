/**
 * Canonical client-side A/B / multivariate framework.
 *
 * Phase 1 of the /apply optimization rollout:
 *  - Sticky bucketing per visitor (FNV-1a hash of visitor_id × experiment_id)
 *  - Weighted variants + holdout cells
 *  - Typed payloads per variant (so components stay declarative)
 *  - Exposure event fires once per session per experiment
 *  - Conversions are logged to `experiment_events` (DB) AND mirrored to
 *    the existing funnel-event pipeline so legacy dashboards keep working.
 *
 * Adding a new experiment = one entry in EXPERIMENTS + one `useExperiment(...)`
 * call (or `useExperimentPayload(...)` if you want typed copy/config).
 */
import { useEffect, useMemo, useCallback } from "react";
import { trackFunnelEvent } from "@/lib/track-event";
import { HOME_FUNNEL_ID } from "@/lib/home-tracking";
import { supabase } from "@/integrations/supabase/client";

const VISITOR_KEY = "ec_visitor_id_v1";
const VARIANT_PREFIX = "ec_exp_v1:";
const EXPOSURE_PREFIX = "ec_exp_exposed_v1:";
const ASSIGNED_PREFIX = "ec_exp_assigned_v1:";
const WEIGHTS_CACHE_KEY = "ec_exp_weights_v1";
const WEIGHTS_CACHE_TTL_MS = 60 * 60 * 1000; // 1h

// ---------------------------------------------------------------------------
// Live weights (Phase C — AI Auto-Optimization)
// ---------------------------------------------------------------------------
// Optimizer edge function writes recommended weights to `experiment_weights`.
// Client loads them once per session into sessionStorage; pickVariant uses
// them for new buckets. Existing cached buckets stay sticky. Holdouts are
// never reduced — the optimizer guarantees a fixed holdout share.

interface WeightsCache {
  ts: number;
  /** experiment_key -> cohort -> variant_id -> recommended_weight */
  byExperiment: Record<string, Record<string, Record<string, number>>>;
}

let weightsLoadInflight = false;

/**
 * Resolve the visitor's audience cohort for live-weight lookup. Mirrors
 * `getApplyAudience()` but kept inline to avoid a circular import. Falls back
 * to "default" outside the browser.
 */
const getCohortForWeights = (): string => {
  if (typeof window === "undefined") return "default";
  try {
    const raw = localStorage.getItem("ec_apply_audience_v1");
    if (!raw) return "default";
    const parsed = JSON.parse(raw) as { cohort?: string };
    return parsed?.cohort === "male_ambition" ? "male_ambition" : "default";
  } catch {
    return "default";
  }
};

const readWeightsCache = (): WeightsCache | null => {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(WEIGHTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeightsCache;
    if (!parsed?.ts || Date.now() - parsed.ts > WEIGHTS_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeWeightsCache = (cache: WeightsCache) => {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(WEIGHTS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
};

const ensureWeightsLoaded = () => {
  if (typeof window === "undefined") return;
  if (readWeightsCache()) return;
  if (weightsLoadInflight) return;
  weightsLoadInflight = true;
  // Load weights for ALL audience cohorts in one read; client filters by
  // current cohort at lookup time. Optimizer guarantees holdout protection.
  void supabase
    .from("experiment_weights")
    .select("experiment_key, variant_id, recommended_weight, audience_cohort")
    .then(({ data }) => {
      weightsLoadInflight = false;
      if (!data) return;
      const byExperiment: Record<string, Record<string, Record<string, number>>> = {};
      for (const r of data as Array<{ experiment_key: string; variant_id: string; recommended_weight: number; audience_cohort: string }>) {
        const cohort = r.audience_cohort || "default";
        byExperiment[r.experiment_key] ??= {};
        byExperiment[r.experiment_key][cohort] ??= {};
        byExperiment[r.experiment_key][cohort][r.variant_id] = Number(r.recommended_weight);
      }
      writeWeightsCache({ ts: Date.now(), byExperiment });
    }, () => { weightsLoadInflight = false; });
};

const liveWeightsFor = (expId: string): Record<string, number> | null => {
  const cache = readWeightsCache();
  const cohort = getCohortForWeights();
  return cache?.byExperiment?.[expId]?.[cohort]
    ?? cache?.byExperiment?.[expId]?.default
    ?? null;
};


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExperimentVariantDef<V extends string = string> {
  id: V;
  /** Relative weight (defaults to 1). Sum across variants is normalized. */
  weight?: number;
  /** If true, this bucket sees the control / no-change experience. Tracked separately. */
  holdout?: boolean;
}

export interface ExperimentDef<V extends string = string> {
  /** Stable experiment key used in events and storage. */
  id: string;
  /** Variants — first entry is treated as control if no holdout is declared. */
  variants: readonly (V | ExperimentVariantDef<V>)[];
}

// ---------------------------------------------------------------------------
// Experiment registry
// ---------------------------------------------------------------------------

export const EXPERIMENTS = {
  /**
   * Legacy CTA-ladder vs. legacy direct-route test (kept for backward compat).
   */
  LADDER_VS_ROUTE: {
    id: "ladder_vs_route_v1",
    variants: ["control", "ladder"] as const,
  },

  /**
   * /apply Hero — Primary CTA copy.
   * 3 soft-entry frames + 1 perspective/curiosity frame (Phase B emotional)
   * + 10% holdout on legacy "Qualifikations-Check".
   * Existing buckets are sticky — adding `schritt_ansehen` only affects
   * new visitors.
   */
  APPLY_PRIMARY_CTA: {
    id: "apply_primary_cta_v1",
    variants: [
      { id: "karriere_check", weight: 22 },
      { id: "potenzial_pruefen", weight: 24 },
      { id: "mehr_erfahren", weight: 22 },
      { id: "schritt_ansehen", weight: 22 },
      { id: "control", weight: 10, holdout: true },
    ] as const,
  } as ExperimentDef<ApplyPrimaryCtaVariant>,

  /**
   * /apply Hero — Headline framing.
   * Phase A: 6 aspirational frames + holdout. Phase B (emotional):
   * `alltag_aendern` (perspective/everyday-change) and `zugehoerigkeit`
   * (community/belonging) — no career-hype, no income hint. Existing
   * buckets stay sticky; only new visitors enter the new cells.
   */
  APPLY_HERO_HEADLINE: {
    id: "apply_hero_headline_v1",
    variants: [
      { id: "identity", weight: 12 },
      { id: "ambition", weight: 12 },
      { id: "more_possible", weight: 12 },
      { id: "modern_skills", weight: 12 },
      { id: "next_step", weight: 12 },
      { id: "more_direction", weight: 12 },
      { id: "alltag_aendern", weight: 14 },
      { id: "zugehoerigkeit", weight: 6 },
      { id: "control", weight: 8, holdout: true },
    ] as const,
  } as ExperimentDef<ApplyHeroHeadlineVariant>,

  /**
   * /apply — Money/Income framing in below-the-fold sections.
   * Reduced (no concrete amounts above-the-fold) vs. removed (zero income claims).
   */
  APPLY_MONEY_FRAMING: {
    id: "apply_money_framing_v1",
    variants: [
      { id: "reduced", weight: 50 },
      { id: "removed", weight: 40 },
      { id: "control", weight: 10, holdout: true },
    ] as const,
  } as ExperimentDef<ApplyMoneyFramingVariant>,


  /**
   * /apply Hero — Male / Ambition cohort headline (only loaded when
   * `getApplyAudience() === "male_ambition"`). 5 ambition/future framings
   * + 10% holdout (= legacy default headline). No emotional-pain hooks,
   * no high-ticket / closer language.
   */
  APPLY_HERO_HEADLINE_MALE: {
    id: "apply_hero_headline_male_v1",
    variants: [
      { id: "more_possible", weight: 22 },
      { id: "more_freedom", weight: 22 },
      { id: "modern_skills", weight: 22 },
      { id: "next_step", weight: 22 },
      { id: "control", weight: 12, holdout: true },
    ] as const,
  } as ExperimentDef<ApplyHeroHeadlineMaleVariant>,

  /**
   * /apply Hero — Male / Ambition cohort primary CTA. Tests progress /
   * potential / direction framings against legacy "Qualifikations-Check".
   */
  APPLY_PRIMARY_CTA_MALE: {
    id: "apply_primary_cta_male_v1",
    variants: [
      { id: "potenzial_pruefen", weight: 22 },
      { id: "mehr_erfahren", weight: 22 },
      { id: "karriere_check", weight: 22 },
      { id: "naechster_schritt", weight: 22 },
      { id: "control", weight: 12, holdout: true },
    ] as const,
  } as ExperimentDef<ApplyPrimaryCtaMaleVariant>,
} satisfies Record<string, ExperimentDef>;

export type LadderVsRouteVariant = "control" | "ladder";
export type ApplyPrimaryCtaVariant = "karriere_check" | "potenzial_pruefen" | "mehr_erfahren" | "schritt_ansehen" | "control";
export type ApplyHeroHeadlineVariant =
  | "identity" | "ambition"
  | "more_possible" | "modern_skills" | "next_step" | "more_direction"
  | "alltag_aendern" | "zugehoerigkeit"
  | "control";

export type ApplyMoneyFramingVariant = "reduced" | "removed" | "control";
export type ApplyHeroHeadlineMaleVariant =
  | "more_possible" | "more_freedom" | "modern_skills" | "next_step" | "control";
export type ApplyPrimaryCtaMaleVariant =
  | "potenzial_pruefen" | "mehr_erfahren" | "karriere_check" | "naechster_schritt" | "control";

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const isBrowser = () => typeof window !== "undefined";

const normalizeVariants = <V extends string>(
  exp: ExperimentDef<V>,
): ExperimentVariantDef<V>[] =>
  exp.variants.map((v) =>
    typeof v === "string" ? { id: v, weight: 1 } : { weight: 1, ...v },
  );

const getVisitorId = (): string => {
  if (!isBrowser()) return "ssr";
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
};

const hashToUnit = (input: string): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
};

const pickVariant = <V extends string>(
  variants: ExperimentVariantDef<V>[],
  unit: number,
): ExperimentVariantDef<V> => {
  const total = variants.reduce((a, v) => a + (v.weight ?? 1), 0);
  let acc = 0;
  for (const v of variants) {
    acc += (v.weight ?? 1) / total;
    if (unit < acc) return v;
  }
  return variants[variants.length - 1];
};

const readCachedVariant = <V extends string>(
  exp: ExperimentDef<V>,
  validIds: V[],
): V | null => {
  if (!isBrowser()) return null;
  try {
    const cached = localStorage.getItem(VARIANT_PREFIX + exp.id);
    if (cached && validIds.includes(cached as V)) return cached as V;
  } catch { /* ignore */ }
  return null;
};

const cacheVariant = (expId: string, variant: string) => {
  if (!isBrowser()) return;
  try { localStorage.setItem(VARIANT_PREFIX + expId, variant); } catch { /* ignore */ }
};

/** Best-effort logging to experiment_events (fire & forget). */
const logEvent = (
  expId: string,
  variantId: string,
  eventType: "assigned" | "exposed" | "converted",
  isHoldout: boolean,
  meta: Record<string, unknown> = {},
) => {
  if (!isBrowser()) return;
  try {
    void supabase.from("experiment_events").insert([{
      experiment_key: expId,
      variant_id: variantId,
      event_type: eventType,
      visitor_id: getVisitorId(),
      session_id: typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem("ec_session_id_v1")
        : null,
      is_holdout: isHoldout,
      conversion_event: typeof meta.conversion_event === "string" ? meta.conversion_event : null,
      metadata: meta as never,
    }]);
  } catch { /* never throw from analytics */ }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ResolvedVariant<V extends string> {
  id: V;
  isHoldout: boolean;
}

/**
 * Pure resolver — safe in event handlers / route guards. No exposure event.
 * Logs an `assigned` row to experiment_events the FIRST time a visitor lands
 * in the bucket (deduped via localStorage).
 */
export const resolveVariantFull = <V extends string>(
  exp: ExperimentDef<V>,
): ResolvedVariant<V> => {
  // Phase C: trigger background load of live weights (no-op if cached/SSR).
  ensureWeightsLoaded();

  const variants = normalizeVariants(exp);
  const validIds = variants.map((v) => v.id);

  const cached = readCachedVariant(exp, validIds);
  if (cached) {
    const def = variants.find((v) => v.id === cached)!;
    return { id: cached, isHoldout: !!def.holdout };
  }

  // Phase C: apply live recommended weights from experiment_weights when
  // available. Holdouts always keep their registry weight (the optimizer
  // also enforces this server-side, but defense in depth).
  const liveWeights = liveWeightsFor(exp.id);
  const effectiveVariants: ExperimentVariantDef<V>[] = liveWeights
    ? variants.map((v) =>
        v.holdout
          ? v
          : { ...v, weight: Math.max(0.001, liveWeights[v.id] ?? v.weight ?? 1) },
      )
    : variants;

  const visitorId = getVisitorId();
  const unit = hashToUnit(`${visitorId}:${exp.id}`);
  const chosen = pickVariant(effectiveVariants, unit);
  cacheVariant(exp.id, chosen.id);

  // First-assignment log (deduped)
  if (isBrowser()) {
    try {
      const flag = ASSIGNED_PREFIX + exp.id;
      if (!localStorage.getItem(flag)) {
        localStorage.setItem(flag, "1");
        logEvent(exp.id, chosen.id, "assigned", !!chosen.holdout);
      }
    } catch { /* ignore */ }
  }

  return { id: chosen.id, isHoldout: !!chosen.holdout };
};

/** Backward-compatible: returns just the variant id. */
export const resolveVariant = <V extends string>(exp: ExperimentDef<V>): V =>
  resolveVariantFull(exp).id;

/**
 * Fires `experiment_exposure` exactly once per session per experiment.
 * Safe to call multiple times — internal session guard dedupes.
 */
export const trackExposure = (expId: string, variant: string, isHoldout = false) => {
  if (!isBrowser()) return;
  const key = EXPOSURE_PREFIX + expId;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch { /* ignore */ }

  trackFunnelEvent("experiment_exposure", {
    funnel: HOME_FUNNEL_ID,
    experiment_id: expId,
    variant,
    holdout: isHoldout,
    visitor_id: getVisitorId(),
  });
  logEvent(expId, variant, "exposed", isHoldout);
};

/**
 * Fire a conversion for an experiment. Multiple conversions per experiment
 * are allowed (e.g. quiz_started AND quiz_completed) and disambiguated via
 * `conversion_event`.
 */
export const trackExperimentConversion = (
  expId: string,
  conversionEvent: string,
  meta: Record<string, unknown> = {},
) => {
  if (!isBrowser()) return;
  const validIds = (() => {
    const def = (Object.values(EXPERIMENTS) as ExperimentDef[]).find((e) => e.id === expId);
    return def ? normalizeVariants(def).map((v) => v.id) : [];
  })();
  let variant: string | null = null;
  let isHoldout = false;
  try {
    const cached = localStorage.getItem(VARIANT_PREFIX + expId);
    if (cached && (validIds.length === 0 || validIds.includes(cached))) {
      variant = cached;
      const def = (Object.values(EXPERIMENTS) as ExperimentDef[]).find((e) => e.id === expId);
      if (def) {
        const v = normalizeVariants(def).find((x) => x.id === cached);
        isHoldout = !!v?.holdout;
      }
    }
  } catch { /* ignore */ }
  if (!variant) return; // never assigned → nothing to attribute
  trackFunnelEvent("experiment_conversion", {
    funnel: HOME_FUNNEL_ID,
    experiment_id: expId,
    variant,
    holdout: isHoldout,
    conversion_event: conversionEvent,
    ...meta,
  });
  logEvent(expId, variant, "converted", isHoldout, { conversion_event: conversionEvent, ...meta });
};

// ---------------------------------------------------------------------------
// React hooks
// ---------------------------------------------------------------------------

/**
 * Resolves the variant deterministically and fires exposure on mount.
 * Returns just the variant id (backward compatible).
 */
export const useExperiment = <V extends string>(exp: ExperimentDef<V>): V => {
  const { id, isHoldout } = useMemo(() => resolveVariantFull(exp), [exp]);
  useEffect(() => {
    trackExposure(exp.id, id, isHoldout);
  }, [exp.id, id, isHoldout]);
  return id;
};

/**
 * Variant + typed payload + per-variant convert helper.
 * `payloadMap` is the source of truth for variant copy/config — keeps
 * components declarative.
 *
 * Usage:
 *   const { variant, payload, convert } = useExperimentPayload(
 *     EXPERIMENTS.APPLY_PRIMARY_CTA,
 *     {
 *       karriere_check:    { label: "Karriere-Check starten" },
 *       potenzial_pruefen: { label: "Potenzial prüfen" },
 *       mehr_erfahren:     { label: "Mehr erfahren" },
 *       control:           { label: "Bewerbung starten" },
 *     },
 *   );
 */
export const useExperimentPayload = <V extends string, P>(
  exp: ExperimentDef<V>,
  payloadMap: Record<V, P>,
): { variant: V; isHoldout: boolean; payload: P; convert: (event: string, meta?: Record<string, unknown>) => void } => {
  const resolved = useMemo(() => resolveVariantFull(exp), [exp]);
  useEffect(() => {
    trackExposure(exp.id, resolved.id, resolved.isHoldout);
  }, [exp.id, resolved.id, resolved.isHoldout]);

  const convert = useCallback(
    (event: string, meta: Record<string, unknown> = {}) =>
      trackExperimentConversion(exp.id, event, meta),
    [exp.id],
  );

  return {
    variant: resolved.id,
    isHoldout: resolved.isHoldout,
    payload: payloadMap[resolved.id],
    convert,
  };
};
