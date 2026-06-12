// Canonical Winner Engine — funnel-result-weighted A/B rollup
// ────────────────────────────────────────────────────────────────────────────
// Reads the last 14 days of funnel events from `event_logs`, parses the
// `ab_slots` payload (auto-attached by trackEvent → src/lib/track-event.ts),
// computes a weighted business score per (slot, variant), then updates
// `ab_slot_weights` with stepped traffic reweighting + auto-pause.
//
// Optimization metric is NEVER CTR/clicks. Conversions are weighted:
//   booking        → 12
//   hql/qualified  →  8
//   lead           →  4
//   quiz_completed →  2
//   quiz_started   →  1
//
// Reweighting steps (sticky front-end buckets aren't touched — only NEW
// sessions feel the new weights):
//   - Insufficient sample (< 100 exposures OR < 10 leads OR < 3 bookings
//     across all variants in a slot) → keep 50/50 (weight = 1 for all).
//   - Significant winner (Wilson lower bound margin × 1.2) → 60/40, 70/30,
//     80/20. Loser floor = 20 % to keep learning. Never 100/0.
//   - Crash (loser variant –40 % business rate vs. best at ≥ 50 leads or
//     ≥ 5 bookings) → paused = true, weight = 0.
//
// Trigger: cron (1×/h) or manual POST. Returns JSON summary.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface FunnelEventRow {
  event_name: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

// ─── Event → weight map (funnel results only, no CTR) ──────────────────────
const CONVERSION_WEIGHTS: Record<string, number> = {
  // Booking (top-tier)
  booking_created: 12,
  booking_completed: 12,
  // High-quality lead
  qualified: 8,
  // Lead
  lead_capture_submitted: 4,
  application_submitted: 4,
  not_qualified: 4,
  // Quiz completion
  quiz_completed: 2,
  quiz_completed_men: 2,
  quiz_completed_women: 2,
  MASTER_QUIZ_COMPLETED: 2,
  APPLY_QUIZ_COMPLETED: 2,
  // Quiz started (lowest priority)
  quiz_started: 1,
  MASTER_QUIZ_STARTED: 1,
  APPLY_QUIZ_STARTED: 1,
};

// Canonical exposure event = `experiment_exposure` (emitted by trackVariantExposure
// for every active A/B slot, carries the full ab_slots payload). Legacy view-events
// are kept for back-compat but they generally don't carry ab_slots.
const EXPOSURE_EVENTS = new Set([
  "experiment_exposure",
  "masterofsales_view",
  "mos_section_view",
  "funnel_view",
  "apply_view",
  "quiz_view",
]);

// Per-bucket counter type
interface BucketStats {
  exposures: number;
  quiz_started: number;
  quiz_completed: number;
  leads: number;
  hql: number;
  bookings: number;
  weighted_score: number; // sum(weight * count)
}

function emptyBucket(): BucketStats {
  return {
    exposures: 0,
    quiz_started: 0,
    quiz_completed: 0,
    leads: 0,
    hql: 0,
    bookings: 0,
    weighted_score: 0,
  };
}

// Wilson score interval lower bound (95 %). Defensive against
// success > total (can happen during historical attribution backfill
// where conversion-event ab_slots reference variants that had no
// exposure rows yet); clamps p to [0,1] and guards NaN/Infinity.
function wilsonLower(success: number, total: number): number {
  if (!Number.isFinite(success) || !Number.isFinite(total) || total <= 0) return 0;
  const s = Math.max(0, Math.min(success, total));
  const z = 1.96;
  const p = s / total;
  const denom = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const inside = (p * (1 - p) + (z * z) / (4 * total)) / total;
  const margin = z * Math.sqrt(Math.max(0, inside));
  const out = (center - margin) / denom;
  return Number.isFinite(out) ? Math.max(0, Math.min(1, out)) : 0;
}

function safeNum(n: unknown, fallback = 0): number {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}


function parseSlots(meta: Record<string, unknown> | null): Array<[string, string]> {
  if (!meta) return [];
  const raw = meta.ab_slots;
  if (typeof raw !== "string" || raw.length === 0) return [];
  const out: Array<[string, string]> = [];
  for (const pair of raw.split(",")) {
    const idx = pair.indexOf(":");
    if (idx <= 0) continue;
    const slot = pair.slice(0, idx).trim();
    const variant = pair.slice(idx + 1).trim();
    if (slot && variant) out.push([slot, variant]);
  }
  return out;
}

function classifyEvent(name: string): {
  isExposure: boolean;
  conversionWeight: number;
  bucketField: keyof BucketStats | null;
} {
  if (EXPOSURE_EVENTS.has(name)) {
    return { isExposure: true, conversionWeight: 0, bucketField: null };
  }
  const weight = CONVERSION_WEIGHTS[name];
  if (typeof weight !== "number") {
    return { isExposure: false, conversionWeight: 0, bucketField: null };
  }
  // Map weight tier → counter field
  let field: keyof BucketStats;
  if (weight === 12) field = "bookings";
  else if (weight === 8) field = "hql";
  else if (weight === 4) field = "leads";
  else if (weight === 2) field = "quiz_completed";
  else field = "quiz_started";
  return { isExposure: false, conversionWeight: weight, bucketField: field };
}

// ─── Reweighting logic ─────────────────────────────────────────────────────
// Returns NEW weight (1.0 = full share, 0.2 = throttled floor, 0 = paused).
function reweightSlot(buckets: Array<{
  variant: string;
  stats: BucketStats;
  rate: number; // weighted score per exposure
  wilson: number;
}>): Array<{ variant: string; weight: number; paused: boolean; is_winner: boolean }> {
  const totalExposures = buckets.reduce((a, b) => a + b.stats.exposures, 0);
  const totalLeads = buckets.reduce((a, b) => a + b.stats.leads + b.stats.hql, 0);
  const totalBookings = buckets.reduce((a, b) => a + b.stats.bookings, 0);

  // Small sample protection — keep 50/50
  if (totalExposures < 100 || totalLeads < 10 || totalBookings < 3) {
    return buckets.map((b) => ({
      variant: b.variant,
      weight: 1.0,
      paused: false,
      is_winner: false,
    }));
  }

  const best = buckets.reduce((a, b) => (b.rate > a.rate ? b : a));
  const bestRate = best.rate;

  return buckets.map((b) => {
    // Crash detection — only fire when this variant has its OWN ≥ 50 leads
    // or ≥ 5 bookings, so we never pause on noise.
    const variantHasEnoughData =
      (b.stats.leads + b.stats.hql) >= 50 || b.stats.bookings >= 5;
    const isCrash =
      variantHasEnoughData && bestRate > 0 && b.rate / bestRate <= 0.6;

    if (isCrash && b.variant !== best.variant) {
      return { variant: b.variant, weight: 0, paused: true, is_winner: false };
    }

    if (b.variant === best.variant) {
      // Stepped winner promotion based on confidence (Wilson margin)
      const others = buckets.filter((x) => x.variant !== b.variant);
      const confidence =
        others.length > 0
          ? Math.max(...others.map((o) => (b.wilson > 0 ? b.wilson / Math.max(o.wilson, 0.0001) : 1)))
          : 1;
      let w = 1.0;
      if (confidence >= 1.5) w = 1.0; // → 80/20 (loser floor below)
      else if (confidence >= 1.3) w = 0.875; // → 70/30
      else if (confidence >= 1.2) w = 0.6; // → 60/40
      else w = 1.0; // not yet significant, keep equal
      return { variant: b.variant, weight: w, paused: false, is_winner: confidence >= 1.2 };
    }

    // Loser — never below 20 % floor (unless paused above)
    const others = buckets.filter((x) => x.variant !== best.variant);
    const confidence = b.wilson > 0
      ? best.wilson / Math.max(b.wilson, 0.0001)
      : 1;
    let w = 1.0;
    if (confidence >= 1.5) w = 0.25; // 80/20 → loser 0.25 vs 1.0
    else if (confidence >= 1.3) w = 0.375; // 70/30 → loser 0.375 vs 0.875
    else if (confidence >= 1.2) w = 0.4; // 60/40 → loser 0.4 vs 0.6
    // 20 % traffic floor (relative to total) — guaranteed at all settings.
    return {
      variant: b.variant,
      weight: Math.max(0.2, w * (others.length / buckets.length + 0.5)),
      paused: false,
      is_winner: false,
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // All event names we care about
  const allNames = Array.from(
    new Set([...Object.keys(CONVERSION_WEIGHTS), ...EXPOSURE_EVENTS]),
  );

  const { data: rows, error } = await sb
    .from("event_logs")
    .select("event_name, email, payload, created_at")
    .in("event_name", allNames)
    .gte("created_at", since)
    .limit(100000);

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  type Row = FunnelEventRow & { email: string | null };
  const allRows = (rows ?? []) as Row[];

  // ─── Build a visitor → exposed (slot,variant) pairs index from
  //     experiment_exposure rows. Each exposure carries either a full
  //     ab_slots string OR (experiment_id, variant) which we treat as a
  //     canonical single-slot exposure. This index lets us attribute every
  //     downstream conversion event by session_id / email / master_funnel_id
  //     even when the conversion event itself lacks ab_slots.
  const pairsBySession = new Map<string, Set<string>>();
  const pairsByEmail = new Map<string, Set<string>>();
  const pairsByMfi = new Map<string, Set<string>>();
  const addPair = (m: Map<string, Set<string>>, k: string | null | undefined, slot: string, variant: string) => {
    if (!k) return;
    let s = m.get(k);
    if (!s) { s = new Set(); m.set(k, s); }
    s.add(`${slot}\u0001${variant}`);
  };
  const exposureSlotsForRow = (row: Row): Array<[string, string]> => {
    const parsed = parseSlots(row.payload);
    if (parsed.length > 0) return parsed;
    if (row.event_name === "experiment_exposure" && row.payload) {
      const exp = row.payload.experiment_id;
      const variant = row.payload.variant;
      if (typeof exp === "string" && typeof variant === "string" && exp && variant) {
        return [[exp, variant]];
      }
    }
    return [];
  };
  for (const row of allRows) {
    if (row.event_name !== "experiment_exposure") continue;
    const pairs = exposureSlotsForRow(row);
    if (pairs.length === 0) continue;
    const sid = (row.payload?.session_id as string) ?? null;
    const mfi = (row.payload?.master_funnel_id as string) ?? null;
    const em = row.email ?? ((row.payload?.email as string) ?? null);
    for (const [slot, variant] of pairs) {
      addPair(pairsBySession, sid, slot, variant);
      addPair(pairsByEmail, em, slot, variant);
      addPair(pairsByMfi, mfi, slot, variant);
    }
  }

  const decodePair = (key: string): [string, string] => {
    const i = key.indexOf("\u0001");
    return [key.slice(0, i), key.slice(i + 1)];
  };
  const pairsForConversionRow = (row: Row): Array<[string, string]> => {
    // 1. Explicit ab_slots on event takes precedence.
    const direct = parseSlots(row.payload);
    if (direct.length > 0) return direct;
    // 2. Lookup via identifiers.
    const sid = (row.payload?.session_id as string) ?? null;
    const mfi = (row.payload?.master_funnel_id as string) ?? null;
    const em = row.email ?? ((row.payload?.email as string) ?? null);
    const merged = new Set<string>();
    const merge = (s?: Set<string>) => { if (s) for (const k of s) merged.add(k); };
    merge(pairsByMfi.get(mfi ?? ""));
    merge(pairsByEmail.get(em ?? ""));
    merge(pairsBySession.get(sid ?? ""));
    return Array.from(merged).map(decodePair);
  };

  // Aggregate per (slot, variant)
  const stats = new Map<string, Map<string, BucketStats>>();
  for (const row of allRows) {
    const c = classifyEvent(row.event_name);
    if (!c.isExposure && c.conversionWeight === 0) continue;
    const slots = c.isExposure ? exposureSlotsForRow(row) : pairsForConversionRow(row);
    for (const [slot, variant] of slots) {
      let inner = stats.get(slot);
      if (!inner) {
        inner = new Map();
        stats.set(slot, inner);
      }
      let b = inner.get(variant);
      if (!b) {
        b = emptyBucket();
        inner.set(variant, b);
      }
      if (c.isExposure) {
        b.exposures += 1;
      } else if (c.bucketField) {
        (b[c.bucketField] as number) += 1;
        b.weighted_score += c.conversionWeight;
      }
    }
  }


  const updates: Array<{
    slot: string;
    variant: string;
    weight: number;
    paused: boolean;
    is_winner: boolean;
    exposures: number;
    conversions: number;
    conversion_rate: number;
    wilson_lower: number;
    score: number;
    lead_count: number;
    booking_count: number;
    hql_count: number;
    quiz_completed_count: number;
    quiz_started_count: number;
  }> = [];

  for (const [slot, inner] of stats) {
    const bucketArr = Array.from(inner.entries()).map(([variant, b]) => {
      const exposures = Math.max(b.exposures, 1);
      // Use weighted_score / exposures as the optimization metric
      const rate = b.weighted_score / exposures;
      // Use bookings + HQL + leads as the "success" denominator for Wilson
      const success = b.bookings + b.hql + b.leads;
      const wilson = wilsonLower(success, exposures);
      return { variant, stats: b, rate, wilson };
    });

    if (bucketArr.length === 0) continue;

    const newWeights = reweightSlot(bucketArr);
    const weightMap = new Map(newWeights.map((w) => [w.variant, w]));

    for (const b of bucketArr) {
      const w = weightMap.get(b.variant)!;
      const totalConversions = b.stats.bookings + b.stats.hql + b.stats.leads +
        b.stats.quiz_completed + b.stats.quiz_started;
      updates.push({
        slot,
        variant: b.variant,
        weight: Math.max(0, Math.min(1, safeNum(w.weight, 1))),
        paused: !!w.paused,
        is_winner: !!w.is_winner,
        exposures: Math.max(0, Math.floor(safeNum(b.stats.exposures))),
        conversions: Math.max(0, Math.floor(safeNum(totalConversions))),
        conversion_rate: Math.max(0, safeNum(totalConversions / Math.max(b.stats.exposures, 1))),
        wilson_lower: Math.max(0, Math.min(1, safeNum(b.wilson))),
        score: Math.max(0, safeNum(b.rate)),
        lead_count: Math.max(0, Math.floor(safeNum(b.stats.leads))),
        booking_count: Math.max(0, Math.floor(safeNum(b.stats.bookings))),
        hql_count: Math.max(0, Math.floor(safeNum(b.stats.hql))),
        quiz_completed_count: Math.max(0, Math.floor(safeNum(b.stats.quiz_completed))),
        quiz_started_count: Math.max(0, Math.floor(safeNum(b.stats.quiz_started))),
      });
    }
  }

  if (updates.length > 0) {
    const { error: upErr } = await sb
      .from("ab_slot_weights")
      .upsert(
        updates.map((u) => ({ ...u, updated_at: new Date().toISOString() })),
        { onConflict: "slot,variant" },
      );
    if (upErr) {
      return new Response(
        JSON.stringify({ error: upErr.message, attempted: updates.length }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      slots: stats.size,
      variants_updated: updates.length,
      since,
      sample: updates.slice(0, 5),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
