// Confidence Engine — additive scoring layer for the Canonical Experiment Engine.
// ────────────────────────────────────────────────────────────────────────────
// Runs AFTER ab-winner-rollup. Does NOT modify weights, scores, or pause flags.
// Reads:
//   - ab_slot_weights (per-variant counters + winner flag)
//   - ab_attribution_audit (latest coverage)
//   - event_logs (last 14d, for daily variance series)
// Writes:
//   - ab_slot_weights.{confidence_*, winner_status, experiment_health,
//                      variance_indicator, coverage_impact, shift_allowed}
//   - ab_confidence_log (snapshot)
//   - ab_confidence_warnings (anomaly alerts)

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// ── Inlined confidence math (mirror of src/lib/confidence-engine.ts) ───────
type ConfidenceLevel = "very_low" | "low" | "medium" | "high" | "very_high";
type WinnerStatus = "none" | "potential" | "winner" | "confirmed";

const MIN_EXPOSURES_POTENTIAL = 100;
const MIN_EXPOSURES_WINNER = 400;
const MIN_LEADS_WINNER = 20;
const MIN_BOOKINGS_CONFIRMED = 5;
const MIN_CONFIDENCE_FOR_SHIFT = 90;
const MIN_COVERAGE_FOR_SHIFT = 0.95;
const MIN_CONFIDENCE_FOR_CONFIRMED = 95;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

function levelFromScore(score: number): ConfidenceLevel {
  if (score >= 96) return "very_high";
  if (score >= 86) return "high";
  if (score >= 71) return "medium";
  if (score >= 51) return "low";
  return "very_low";
}

function wilsonLower(succ: number, n: number): number {
  if (n <= 0) return 0;
  const z = 1.96;
  const p = succ / n;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return Math.max(0, (center - margin) / denom);
}

function rateVariance(rates: number[]): number {
  if (!rates || rates.length < 2) return 0;
  const mean = rates.reduce((s, r) => s + r, 0) / rates.length;
  if (mean <= 0) return 0;
  const variance = rates.reduce((s, r) => s + (r - mean) ** 2, 0) / rates.length;
  return Math.min(1, Math.sqrt(variance) / mean);
}

interface WeightRow {
  slot: string;
  variant: string;
  weight: number;
  paused: boolean;
  is_winner: boolean;
  exposures: number;
  quiz_started_count: number;
  quiz_completed_count: number;
  lead_count: number;
  hql_count: number;
  booking_count: number;
  showup_count?: number;
  score: number;
}

interface VariantStats {
  variant: string;
  exposures: number;
  leads: number;
  bookings: number;
  is_winner: boolean;
  score: number;
  daily_lead_rates: number[];
}

function scoreVariant(v: VariantStats, peers: VariantStats[], coverage: number) {
  const reasons: string[] = [];

  const exposureScore = Math.min(35, (v.exposures / MIN_EXPOSURES_WINNER) * 35);
  if (v.exposures < MIN_EXPOSURES_POTENTIAL) reasons.push(`Nur ${v.exposures} Exposures`);
  else if (v.exposures >= MIN_EXPOSURES_WINNER) reasons.push("Hohes Exposure-Volumen");

  const leadScore = Math.min(15, (v.leads / MIN_LEADS_WINNER) * 15);
  const bookingScore = Math.min(15, (v.bookings / MIN_BOOKINGS_CONFIRMED) * 15);
  if (v.leads < MIN_LEADS_WINNER) reasons.push(`Lead-Daten knapp (${v.leads}/${MIN_LEADS_WINNER})`);
  else reasons.push("Lead-Daten ausreichend");
  if (v.bookings < MIN_BOOKINGS_CONFIRMED) reasons.push(`Booking-Daten knapp (${v.bookings})`);
  else reasons.push("Booking-Daten solide");

  const myLower = wilsonLower(v.leads, Math.max(1, v.exposures));
  const peerLowers = peers.filter((p) => p.variant !== v.variant)
    .map((p) => wilsonLower(p.leads, Math.max(1, p.exposures)));
  const bestPeer = peerLowers.length ? Math.max(...peerLowers) : 0;
  const separation = Math.max(0, myLower - bestPeer);
  const separationScore = Math.min(20, separation * 200);
  if (separation > 0.005) reasons.push("Wilson-Untergrenze schlägt Peers");

  const coverageScore = clamp(coverage * 15, 0, 15);
  const coverage_impact = Math.max(0, 1 - coverage);
  if (coverage < 0.9) reasons.push(`Attribution Coverage nur ${(coverage * 100).toFixed(0)}%`);

  const variance_indicator = rateVariance(v.daily_lead_rates);
  const variancePenalty = variance_indicator * 20;
  if (variance_indicator > 0.4) reasons.push("Hohe Schwankung der Conversion-Rate");

  let score = exposureScore + leadScore + bookingScore + separationScore + coverageScore - variancePenalty;
  score = clamp(score, 0, 100);
  const level = levelFromScore(score);

  const isLeader = v.is_winner || v.score === Math.max(...peers.map((p) => p.score));
  let winner_status: WinnerStatus = "none";
  if (isLeader) {
    if (score >= MIN_CONFIDENCE_FOR_CONFIRMED && v.bookings >= MIN_BOOKINGS_CONFIRMED &&
        v.leads >= MIN_LEADS_WINNER && coverage >= MIN_COVERAGE_FOR_SHIFT) {
      winner_status = "confirmed";
    } else if (score >= MIN_CONFIDENCE_FOR_SHIFT && v.leads >= MIN_LEADS_WINNER) {
      winner_status = "winner";
    } else if (v.exposures >= MIN_EXPOSURES_POTENTIAL && separation > 0) {
      winner_status = "potential";
    }
  }

  const shift_allowed = score >= MIN_CONFIDENCE_FOR_SHIFT &&
    coverage >= MIN_COVERAGE_FOR_SHIFT &&
    v.leads >= MIN_LEADS_WINNER &&
    v.exposures >= MIN_EXPOSURES_WINNER &&
    variance_indicator < 0.5;

  return {
    confidence_score: Math.round(score * 10) / 10,
    confidence_level: level,
    confidence_reason: reasons,
    winner_status,
    variance_indicator: Math.round(variance_indicator * 1000) / 1000,
    coverage_impact: Math.round(coverage_impact * 1000) / 1000,
    shift_allowed,
  };
}

// ────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1. Latest coverage from audit layer
    const { data: audit } = await supabase
      .from("ab_attribution_audit")
      .select("coverage_pct")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const coverage = audit?.coverage_pct != null ? Number(audit.coverage_pct) / 100 : 0.5;

    // 2. All weight rows
    const { data: weights, error } = await supabase
      .from("ab_slot_weights")
      .select("*");
    if (error) throw error;

    // 3. Daily variance series (last 14d) from event_logs
    const since = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
    const { data: events } = await supabase
      .from("event_logs")
      .select("event_name,payload,created_at")
      .gte("created_at", since)
      .in("event_name", ["lead_capture_submitted", "application_submitted",
        "masterofsales_view", "apply_view", "quiz_view", "funnel_view", "mos_section_view"])
      .limit(50000);

    // Bucket events per slot:variant per day: { exposures, leads }
    const daily = new Map<string, Map<string, { exp: number; lead: number }>>();
    for (const ev of events ?? []) {
      const slots = String((ev.payload as Record<string, unknown>)?.ab_slots ?? "");
      if (!slots) continue;
      const day = (ev.created_at as string).slice(0, 10);
      const isLead = ev.event_name === "lead_capture_submitted" || ev.event_name === "application_submitted";
      for (const pair of slots.split(",")) {
        const idx = pair.indexOf(":");
        if (idx <= 0) continue;
        const key = pair.trim();
        const dayMap = daily.get(key) ?? new Map();
        const entry = dayMap.get(day) ?? { exp: 0, lead: 0 };
        if (isLead) entry.lead += 1; else entry.exp += 1;
        dayMap.set(day, entry);
        daily.set(key, dayMap);
      }
    }

    // 4. Group weight rows by slot
    const bySlot = new Map<string, WeightRow[]>();
    for (const w of (weights ?? []) as WeightRow[]) {
      const arr = bySlot.get(w.slot) ?? [];
      arr.push(w);
      bySlot.set(w.slot, arr);
    }

    const updates: Array<Record<string, unknown>> = [];
    const logRows: Array<Record<string, unknown>> = [];
    const warnings: Array<Record<string, unknown>> = [];
    let healthAggregate: { slot: string; health: number }[] = [];

    for (const [slot, rows] of bySlot) {
      const variants: VariantStats[] = rows.map((r) => {
        const dayMap = daily.get(`${slot}:${r.variant}`) ?? new Map();
        const rates: number[] = [];
        for (const { exp, lead } of dayMap.values()) {
          if (exp > 0) rates.push(lead / exp);
        }
        return {
          variant: r.variant,
          exposures: r.exposures ?? 0,
          leads: r.lead_count ?? 0,
          bookings: r.booking_count ?? 0,
          is_winner: !!r.is_winner,
          score: Number(r.score ?? 0),
          daily_lead_rates: rates,
        };
      });

      const results = variants.map((v) => ({
        variant: v.variant,
        ...scoreVariant(v, variants, coverage),
      }));

      // Experiment health
      const totalExp = variants.reduce((s, v) => s + v.exposures, 0);
      const totalLeads = variants.reduce((s, v) => s + v.leads, 0);
      const totalBookings = variants.reduce((s, v) => s + v.bookings, 0);
      const sample = clamp((totalExp / (MIN_EXPOSURES_WINNER * Math.max(1, variants.length))) * 100, 0, 100);
      const confAvg = results.reduce((s, r) => s + r.confidence_score, 0) / Math.max(1, results.length);
      const varAvg = results.reduce((s, r) => s + r.variance_indicator, 0) / Math.max(1, results.length);
      const stability = clamp((1 - varAvg) * 100, 0, 100);
      let health = coverage * 30 + (sample / 100) * 20 + (confAvg / 100) * 25 +
                   (stability / 100) * 15 + coverage * 10;
      if (totalLeads === 0) health = Math.min(health, 30);
      if (totalBookings === 0) health = Math.min(health, 60);
      health = Math.round(health * 10) / 10;
      healthAggregate.push({ slot, health });

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const c = results[i];
        const variantStats = variants[i];

        updates.push({
          slot: r.slot,
          variant: r.variant,
          confidence_score: c.confidence_score,
          confidence_level: c.confidence_level,
          confidence_reason: c.confidence_reason,
          last_confidence_update: new Date().toISOString(),
          winner_status: c.winner_status,
          experiment_health: health,
          variance_indicator: c.variance_indicator,
          coverage_impact: c.coverage_impact,
          shift_allowed: c.shift_allowed,
        });

        logRows.push({
          slot: r.slot,
          variant: r.variant,
          confidence_score: c.confidence_score,
          confidence_level: c.confidence_level,
          confidence_reason: c.confidence_reason,
          winner_status: c.winner_status,
          experiment_health: health,
          variance_indicator: c.variance_indicator,
          coverage_impact: c.coverage_impact,
          shift_allowed: c.shift_allowed,
          exposures: variantStats.exposures,
          leads: variantStats.leads,
          bookings: variantStats.bookings,
        });

        // ─── Auto-Audit warnings ─────────────────────────────────────────
        if (r.is_winner && c.confidence_score < 70) {
          warnings.push({
            slot: r.slot, variant: r.variant, kind: "winner_low_confidence",
            severity: "warning",
            message: `Winner ${r.variant} hat nur ${c.confidence_score} Confidence.`,
          });
        }
        if (r.weight > 0.5 && coverage < 0.9) {
          warnings.push({
            slot: r.slot, variant: r.variant, kind: "weight_shift_low_coverage",
            severity: "warning",
            message: `Weight ${(r.weight * 100).toFixed(0)}% bei Coverage ${(coverage * 100).toFixed(0)}%.`,
          });
        }
        if (c.winner_status === "confirmed" && variantStats.bookings < MIN_BOOKINGS_CONFIRMED) {
          warnings.push({
            slot: r.slot, variant: r.variant, kind: "confirmed_without_data",
            severity: "error",
            message: `Confirmed Winner ohne ausreichende Booking-Daten.`,
          });
        }
      }
    }

    // 5. Persist updates (per row — upsert via update on PK)
    for (const u of updates) {
      await supabase
        .from("ab_slot_weights")
        .update(u)
        .eq("slot", u.slot as string)
        .eq("variant", u.variant as string);
    }
    if (logRows.length) await supabase.from("ab_confidence_log").insert(logRows);
    if (warnings.length) await supabase.from("ab_confidence_warnings").insert(warnings);

    return new Response(JSON.stringify({
      ok: true,
      variants_scored: updates.length,
      warnings: warnings.length,
      coverage,
      slots: healthAggregate,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
