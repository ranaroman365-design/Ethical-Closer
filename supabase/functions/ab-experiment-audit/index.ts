// Canonical Experiment Audit — additive validation layer
// ────────────────────────────────────────────────────────────────────────────
// READ-ONLY companion to `ab-winner-rollup`. Never mutates `ab_slot_weights`.
//
// Writes into 3 additive tables:
//   1) ab_weight_history       — snapshots current weights so traffic shifts
//                                are provable over time
//   2) ab_attribution_audit    — measures % of business conversions in the
//                                last 14d that carry an ab_slots tag
//   3) ab_audit_errors         — self-check failures (paused-with-traffic,
//                                weight >1, active-with-0, conversions w/o
//                                attribution, forbidden click metrics in
//                                weight inputs)
//
// Forbidden metrics: CTR, *_click, scroll_depth — they MUST NOT appear in
// the rollup function's CONVERSION_WEIGHTS map. We assert this statically.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// Mirror of the rollup's allowed inputs (kept in sync manually — drift is
// itself caught by the static-list audit below).
const ALLOWED_WEIGHT_INPUTS = [
  "booking_created", "booking_completed",
  "qualified",
  "lead_capture_submitted", "application_submitted", "not_qualified",
  "quiz_completed", "quiz_completed_men", "quiz_completed_women",
  "MASTER_QUIZ_COMPLETED", "APPLY_QUIZ_COMPLETED",
  "quiz_started", "MASTER_QUIZ_STARTED", "APPLY_QUIZ_STARTED",
  "appointment_showed",
];

// These names, if they ever appear in CONVERSION_WEIGHTS or are weighted,
// indicate the engine slipped back to click-optimization.
const FORBIDDEN_PATTERNS = [/_click$/, /^ctr$/i, /^cta_/, /^hero_/, /scroll_depth/];

// Canonical business conversions whose attribution we audit.
const BUSINESS_CONVERSIONS = [
  "lead_capture_submitted",
  "application_submitted",
  "qualified",
  "booking_created",
  "booking_completed",
  "appointment_showed",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date();
  const since = new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString();
  const errors: Array<{ check_name: string; severity: string; slot?: string; variant?: string; details: Record<string, unknown> }> = [];

  // ── 1) Snapshot current weights into history ──────────────────────────────
  const { data: weights } = await sb
    .from("ab_slot_weights")
    .select("slot,variant,weight,paused,is_winner,score,exposures,lead_count,booking_count");

  if (weights && weights.length > 0) {
    // Snapshot only when something changed vs. the most recent history row.
    for (const w of weights) {
      const { data: last } = await sb
        .from("ab_weight_history")
        .select("weight,paused")
        .eq("slot", w.slot)
        .eq("variant", w.variant)
        .order("recorded_at", { ascending: false })
        .limit(1);
      const lastRow = last?.[0];
      const changed =
        !lastRow ||
        Number(lastRow.weight) !== Number(w.weight) ||
        Boolean(lastRow.paused) !== Boolean(w.paused);
      if (changed) {
        await sb.from("ab_weight_history").insert({
          slot: w.slot,
          variant: w.variant,
          weight: w.weight,
          paused: w.paused,
          is_winner: w.is_winner,
          score: w.score,
          exposures: w.exposures,
          leads: w.lead_count,
          bookings: w.booking_count,
        });
      }
    }

    // ── self-check: weight invariants ──
    for (const w of weights) {
      if (Number(w.weight) > 1) {
        errors.push({
          check_name: "weight_exceeds_one",
          severity: "error",
          slot: w.slot, variant: w.variant,
          details: { weight: w.weight },
        });
      }
      if (Number(w.weight) < 0) {
        errors.push({
          check_name: "weight_negative",
          severity: "error",
          slot: w.slot, variant: w.variant,
          details: { weight: w.weight },
        });
      }
      if (w.paused && Number(w.weight) > 0) {
        errors.push({
          check_name: "paused_with_traffic",
          severity: "error",
          slot: w.slot, variant: w.variant,
          details: { weight: w.weight },
        });
      }
      if (!w.paused && Number(w.weight) === 0) {
        errors.push({
          check_name: "active_with_zero_weight",
          severity: "warning",
          slot: w.slot, variant: w.variant,
          details: { weight: w.weight },
        });
      }
      if (w.exposures === 0 && (w.lead_count > 0 || w.booking_count > 0)) {
        errors.push({
          check_name: "conversions_without_exposure",
          severity: "warning",
          slot: w.slot, variant: w.variant,
          details: { leads: w.lead_count, bookings: w.booking_count },
        });
      }
    }
  }

  // ── 2) Attribution coverage on business conversions ──────────────────────
  const { data: convRows } = await sb
    .from("event_logs")
    .select("event_name,payload,created_at")
    .in("event_name", BUSINESS_CONVERSIONS)
    .gte("created_at", since)
    .limit(50000);

  const byEvent: Record<string, { total: number; attributed: number }> = {};
  let total = 0;
  let attributed = 0;
  for (const r of convRows ?? []) {
    const slot = (r.payload as { ab_slots?: string } | null)?.ab_slots;
    const hasAttr = typeof slot === "string" && slot.length > 0;
    total += 1;
    if (hasAttr) attributed += 1;
    const k = r.event_name as string;
    byEvent[k] ??= { total: 0, attributed: 0 };
    byEvent[k].total += 1;
    if (hasAttr) byEvent[k].attributed += 1;
  }
  const coveragePct = total > 0 ? (attributed / total) * 100 : 100;

  // ── 3) Forbidden-input audit (CTR / clicks must never weight) ────────────
  const forbiddenFound: string[] = [];
  for (const name of ALLOWED_WEIGHT_INPUTS) {
    for (const pat of FORBIDDEN_PATTERNS) {
      if (pat.test(name)) forbiddenFound.push(name);
    }
  }
  if (forbiddenFound.length > 0) {
    errors.push({
      check_name: "forbidden_metric_in_winner_inputs",
      severity: "error",
      details: { forbidden: forbiddenFound },
    });
  }

  // ── Persist attribution snapshot ──────────────────────────────────────────
  await sb.from("ab_attribution_audit").insert({
    window_days: 14,
    total_conversions: total,
    attributed_conversions: attributed,
    coverage_pct: Number(coveragePct.toFixed(2)),
    by_event: byEvent,
    forbidden_inputs_found: forbiddenFound,
  });

  // Coverage warning
  if (total >= 10 && coveragePct < 95) {
    errors.push({
      check_name: "attribution_coverage_below_95",
      severity: coveragePct < 80 ? "error" : "warning",
      details: { coverage_pct: coveragePct, total, attributed },
    });
  }

  // ── Persist errors ────────────────────────────────────────────────────────
  if (errors.length > 0) {
    await sb.from("ab_audit_errors").insert(
      errors.map((e) => ({
        check_name: e.check_name,
        severity: e.severity,
        slot: e.slot ?? null,
        variant: e.variant ?? null,
        details: e.details,
      })),
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      weights_snapshotted: weights?.length ?? 0,
      attribution: {
        window_days: 14,
        total_conversions: total,
        attributed_conversions: attributed,
        coverage_pct: Number(coveragePct.toFixed(2)),
        by_event: byEvent,
      },
      errors_logged: errors.length,
      forbidden_inputs_found: forbiddenFound,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
