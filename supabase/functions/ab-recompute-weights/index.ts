/**
 * ab-recompute-weights
 * --------------------------------------------------------------
 * Hourly cron job for the Auto A/B System.
 *
 * Phase A (per running experiment, allocator='thompson'):
 *   1. Pull all sessions allocated to each variant.
 *   2. Join `ab_allocations.session_id` to `event_logs.payload->>session_id`
 *      to compute trials (PageView / LP_view) and successes (primary_metric).
 *   3. Recompute Thompson Sampling weights and write back to ab_variants.weight.
 *
 * Phase B (winner gate, frequentist):
 *   If min_samples_per_variant reached AND two-proportion z-test on
 *   guardrail_metric (default booking_rate) returns p < alpha AND lift >= min_lift_pct,
 *   set experiment.status='won' + winner_variant_id, and freeze all variants
 *   (winner.weight=1, others=0).
 *
 * SAFE: only writes to `ab_variants.weight`, `ab_experiments.status/winner_variant_id`.
 * Never touches `event_logs`, `leads`, `appointments`, or any external integration.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Inlined statistics (Deno can't import client TS with @/ aliases).
function sampleGamma(shape: number): number {
  if (shape < 1) {
    const u = Math.random();
    return sampleGamma(shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number, v: number;
    do {
      const u1 = Math.random();
      const u2 = Math.random();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function sampleBeta(a: number, b: number) { const x = sampleGamma(a), y = sampleGamma(b); return x / (x + y); }
function phi(x: number) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}
function zTest(c: { trials: number; successes: number }, t: { trials: number; successes: number }) {
  const nC = c.trials, nT = t.trials;
  if (nC === 0 || nT === 0) return { pValue: 1, liftPct: 0, z: 0 };
  const pC = c.successes / nC, pT = t.successes / nT;
  const pPool = (c.successes + t.successes) / (nC + nT);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / nC + 1 / nT));
  if (!se) return { pValue: 1, liftPct: 0, z: 0 };
  const z = (pT - pC) / se;
  return { pValue: 2 * (1 - phi(Math.abs(z))), liftPct: pC > 0 ? ((pT - pC) / pC) * 100 : 0, z };
}
function thompson(stats: Array<{ id: string; trials: number; successes: number }>, draws = 5000, minWeight = 0.05) {
  if (stats.length <= 1) return Object.fromEntries(stats.map(s => [s.id, 1]));
  const wins: Record<string, number> = {};
  for (const s of stats) wins[s.id] = 0;
  for (let i = 0; i < draws; i++) {
    let bestId = stats[0].id, bestVal = -Infinity;
    for (const s of stats) {
      const v = sampleBeta(s.successes + 1, s.trials - s.successes + 1);
      if (v > bestVal) { bestVal = v; bestId = s.id; }
    }
    wins[bestId]++;
  }
  const floorTotal = minWeight * stats.length;
  const remaining = Math.max(0, 1 - floorTotal);
  const rawSum = Object.values(wins).reduce((a, b) => a + b, 0) || 1;
  const out: Record<string, number> = {};
  for (const s of stats) out[s.id] = minWeight + remaining * (wins[s.id] / rawSum);
  return out;
}

const METRIC_EVENTS: Record<string, string[]> = {
  quiz_start_rate: ["quiz_started", "QuizStarted"],
  quiz_completion_rate: ["quiz_completed", "QuizCompleted"],
  booking_rate: ["appointment_booked", "BookingCreated", "Schedule", "booking_created"],
  lead_rate: ["Lead", "lead_created"],
  qualified_lead_rate: ["HighQualityLead"],
};
const TRIAL_EVENTS = ["PageView", "lp_view", "apply_view", "masterofsales_view", "funnel_view", "quiz_view"];

// Composite reward (Conversion-gewichtet, additiv) — Phase-basiert.
// Hierarchy: Booking > Qualified > Lead > QuizCompletion > QuizStart. CTA-Click
// fließt NIE in den Reward (Guardrail-only).
//
// Phase 1 (Warmup): wenig Conversions vorhanden → mehr Frühsignale.
//   Reward = 0.30 QS + 0.25 QC + 0.15 Lead + 0.15 Qualified + 0.15 Booking
//
// Phase 2 (Conversion-gewichtet) — sobald eine Variante ≥30 Completions
//   ODER ≥10 Bookings hat.
//   Reward = 0.10 QS + 0.15 QC + 0.20 Lead + 0.25 Qualified + 0.30 Booking
const PHASE1_WEIGHTS = { qs: 0.30, qc: 0.25, ld: 0.15, ql: 0.15, bk: 0.15 } as const;
const PHASE2_WEIGHTS = { qs: 0.10, qc: 0.15, ld: 0.20, ql: 0.25, bk: 0.30 } as const;
const PHASE2_MIN_COMPLETIONS = 30;
const PHASE2_MIN_BOOKINGS = 10;
const COMPOSITE_MIN_TRIALS_CHANNEL = 30;
const EXPLORATION_FLOOR = 0.10; // ≥10% Traffic an jede Variante (Phase 3 Mindest-Exploration)
const CHANNELS = ["meta", "tiktok", "google", "retargeting", "organic", "referral", "direct", "other"] as const;
const DEVICES = ["mobile", "desktop"] as const;
type Channel = (typeof CHANNELS)[number];
type Device = (typeof DEVICES)[number];

type Phase = "phase1" | "phase2";
function pickPhase(stats: Array<{ quizComplete: number; booking: number }>): Phase {
  const phase2Ready = stats.some(
    (s) => s.quizComplete >= PHASE2_MIN_COMPLETIONS || s.booking >= PHASE2_MIN_BOOKINGS,
  );
  return phase2Ready ? "phase2" : "phase1";
}
function rewardFor(
  s: { trials: number; quizStart: number; quizComplete: number; lead: number; qualified: number; booking: number },
  phase: Phase,
): number {
  const w = phase === "phase2" ? PHASE2_WEIGHTS : PHASE1_WEIGHTS;
  const t = Math.max(1, s.trials);
  const rate =
    w.qs * (s.quizStart / t) +
    w.qc * (s.quizComplete / t) +
    w.ld * (s.lead / t) +
    w.ql * (s.qualified / t) +
    w.bk * (s.booking / t);
  return Math.max(0, Math.round(rate * s.trials));
}

function resolveChannel(a: { utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null }): Channel {
  const src = (a.utm_source ?? "").toLowerCase().trim();
  const med = (a.utm_medium ?? "").toLowerCase().trim();
  const cmp = (a.utm_campaign ?? "").toLowerCase().trim();
  if (!src && !med && !cmp) return "direct";
  if (med === "retargeting" || med === "remarketing" || cmp.includes("retarget") || src.endsWith("_rt")) return "retargeting";
  if (src.includes("facebook") || src.includes("instagram") || src === "meta" || src === "fb" || src === "ig") return "meta";
  if (src.includes("tiktok") || src === "tt") return "tiktok";
  if (src.includes("google") || src === "adwords" || src === "gads") return "google";
  if (med === "organic" || med === "seo") return "organic";
  if (med === "referral") return "referral";
  return "other";
}

function resolveDevice(userAgent?: string | null): Device {
  const ua = (userAgent ?? "").toLowerCase();
  return /mobi|android|iphone|ipod/.test(ua) ? "mobile" : "desktop";
}

interface RunResult {
  experimentKey: string;
  updated: number;
  winner?: string | null;
  rewardMode?: "primary" | "phase1" | "phase2";
  channelsComputed?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const { data: experiments, error: expErr } = await supabase
      .from("ab_experiments")
      .select("id, key, status, primary_metric, guardrail_metric, min_samples_per_variant, significance_alpha, min_lift_pct, allocator, winner_variant_id")
      .in("status", ["running"]);
    if (expErr) throw expErr;

    const results: RunResult[] = [];
    for (const exp of experiments ?? []) {
      const { data: variants } = await supabase
        .from("ab_variants")
        .select("id, key, is_control, is_active")
        .eq("experiment_id", exp.id)
        .eq("is_active", true);
      if (!variants || variants.length === 0) continue;

      const { data: allocs } = await supabase
        .from("ab_allocations")
        .select("session_id, variant_id, utm_source, utm_medium, utm_campaign, user_agent")
        .eq("experiment_id", exp.id)
        .limit(50000);
      if (!allocs || allocs.length === 0) continue;

      const sessionToVariant = new Map<string, string>();
      const sessionToChannel = new Map<string, Channel>();
      const sessionToDevice = new Map<string, Device>();
      for (const a of allocs) {
        sessionToVariant.set(a.session_id, a.variant_id);
        sessionToChannel.set(a.session_id, resolveChannel(a));
        sessionToDevice.set(a.session_id, resolveDevice(a.user_agent));
      }
      const sessionIds = Array.from(sessionToVariant.keys());

      const primaryEvents = METRIC_EVENTS[exp.primary_metric] ?? [];
      const guardrailEvents = exp.guardrail_metric ? METRIC_EVENTS[exp.guardrail_metric] ?? [] : [];
      // Composite-Pipeline benötigt zusätzlich quiz_start + quiz_completed + lead + qualified + booking Events.
      const compositeEvents = Array.from(new Set([
        ...METRIC_EVENTS.quiz_start_rate,
        ...METRIC_EVENTS.quiz_completion_rate,
        ...METRIC_EVENTS.lead_rate,
        ...METRIC_EVENTS.qualified_lead_rate,
        ...METRIC_EVENTS.booking_rate,
      ]));
      const allEvents = Array.from(new Set([
        ...TRIAL_EVENTS, ...primaryEvents, ...guardrailEvents, ...compositeEvents,
      ]));

      type Bucket = {
        trials: number; primary: number; guardrail: number;
        quizStart: number; quizComplete: number; lead: number; qualified: number; booking: number;
      };
      const newBucket = (): Bucket => ({
        trials: 0, primary: 0, guardrail: 0,
        quizStart: 0, quizComplete: 0, lead: 0, qualified: 0, booking: 0,
      });
      const stats = new Map<string, Bucket>();
      // Per-channel: key = `${variantId}|${channel}`
      const channelStats = new Map<string, Bucket>();
      // Per-device-channel: key = `${variantId}|${channel}:${device}`
      const deviceChannelStats = new Map<string, Bucket>();
      for (const v of variants) {
        stats.set(v.id, newBucket());
        for (const ch of CHANNELS) {
          channelStats.set(`${v.id}|${ch}`, newBucket());
          for (const dv of DEVICES) deviceChannelStats.set(`${v.id}|${ch}:${dv}`, newBucket());
        }
      }

      const CHUNK = 400;
      for (let i = 0; i < sessionIds.length; i += CHUNK) {
        const chunk = sessionIds.slice(i, i + CHUNK);
        const orFilter = chunk.map((s) => `payload->>session_id.eq.${s}`).join(",");
        const { data: events } = await supabase
          .from("event_logs")
          .select("event_name, payload")
          .in("event_name", allEvents)
          .or(orFilter)
          .limit(50000);
        for (const ev of events ?? []) {
          const sid = (ev.payload as { session_id?: string } | null)?.session_id;
          if (!sid) continue;
          const vId = sessionToVariant.get(sid);
          if (!vId) continue;
          const ch = (sessionToChannel.get(sid) ?? "other") as Channel;
          const dv = (sessionToDevice.get(sid) ?? "desktop") as Device;
          const bucket = stats.get(vId);
          const chBucket = channelStats.get(`${vId}|${ch}`);
          const dcBucket = deviceChannelStats.get(`${vId}|${ch}:${dv}`);
          if (!bucket || !chBucket || !dcBucket) continue;
          const apply = (b: Bucket) => {
            if (TRIAL_EVENTS.includes(ev.event_name)) b.trials++;
            if (primaryEvents.includes(ev.event_name)) b.primary++;
            if (guardrailEvents.includes(ev.event_name)) b.guardrail++;
            if (METRIC_EVENTS.quiz_start_rate.includes(ev.event_name)) b.quizStart++;
            if (METRIC_EVENTS.quiz_completion_rate.includes(ev.event_name)) b.quizComplete++;
            if (METRIC_EVENTS.lead_rate.includes(ev.event_name)) b.lead++;
            if (METRIC_EVENTS.qualified_lead_rate.includes(ev.event_name)) b.qualified++;
            if (METRIC_EVENTS.booking_rate.includes(ev.event_name)) b.booking++;
          };
          apply(bucket);
          apply(chBucket);
          apply(dcBucket);
        }
      }

      // Phase A — Thompson Sampling mit phasenbasiertem Composite-Reward.
      // Phase 1 (Warmup) 0.4/0.3/0.3 → Phase 2 0.2/0.3/0.5 sobald eine Variante
      // ≥30 Completions ODER ≥10 Bookings hat. Fallback auf primary_metric nur,
      // wenn überhaupt keine Trials existieren.
      let rewardMode: "primary" | "phase1" | "phase2" = "primary";
      let phaseDecision: Phase = "phase1";
      if (exp.allocator === "thompson") {
        const variantStats = variants.map((v) => stats.get(v.id)!);
        const anyTrials = variantStats.some((s) => s.trials > 0);
        if (!anyTrials) {
          rewardMode = "primary";
        } else {
          phaseDecision = pickPhase(variantStats);
          rewardMode = phaseDecision;
        }
        const thompsonStats = variants.map((v) => {
          const s = stats.get(v.id)!;
          const successes = rewardMode === "primary" ? s.primary : rewardFor(s, phaseDecision);
          return { id: v.id as string, trials: s.trials, successes };
        });
        const weights = thompson(thompsonStats, 5000, EXPLORATION_FLOOR);
        for (const v of variants) {
          const w = weights[v.id] ?? 0;
          await supabase.from("ab_variants").update({ weight: Number(w.toFixed(4)) }).eq("id", v.id);
        }
      }

      // Phase B — frequentist winner gate
      let winnerId: string | null = null;
      const control = variants.find((v) => v.is_control) ?? variants[0];
      const controlStats = stats.get(control.id);
      const minN = exp.min_samples_per_variant ?? 200;
      const alpha = Number(exp.significance_alpha ?? 0.05);
      const minLift = Number(exp.min_lift_pct ?? 10);

      if (controlStats && controlStats.trials >= minN) {
        for (const v of variants) {
          if (v.id === control.id) continue;
          const s = stats.get(v.id)!;
          if (s.trials < minN) continue;
          const useGuardrail = guardrailEvents.length > 0;
          const c = useGuardrail
            ? { trials: controlStats.trials, successes: controlStats.guardrail }
            : { trials: controlStats.trials, successes: controlStats.primary };
          const t = useGuardrail
            ? { trials: s.trials, successes: s.guardrail }
            : { trials: s.trials, successes: s.primary };
          const r = zTest(c, t);
          if (r.pValue < alpha && r.liftPct >= minLift) {
            winnerId = v.id;
            break;
          }
        }
      }

      if (winnerId) {
        await supabase
          .from("ab_experiments")
          .update({ status: "won", winner_variant_id: winnerId, last_recomputed_at: new Date().toISOString() })
          .eq("id", exp.id);
        // Freeze: winner=1, others=0
        for (const v of variants) {
          await supabase.from("ab_variants").update({ weight: v.id === winnerId ? 1 : 0 }).eq("id", v.id);
        }
      } else {
        await supabase
          .from("ab_experiments")
          .update({ last_recomputed_at: new Date().toISOString() })
          .eq("id", exp.id);
      }

      // -------- Per-Channel Allocator (additive) --------
      // Recompute Thompson weights for each (experiment, channel) bucket.
      // Writes to ab_channel_weights only. Global ab_variants.weight (above)
      // remains the fallback used when no per-channel weight exists for a
      // visitor's attribution bucket.
      let channelsComputed = 0;
      if (exp.allocator === "thompson" && !winnerId) {
        const nowIso = new Date().toISOString();
        for (const ch of CHANNELS) {
          const variantStats = variants.map((v) => {
            const b = channelStats.get(`${v.id}|${ch}`)!;
            return { v, b };
          });
          const totalTrials = variantStats.reduce((a, x) => a + x.b.trials, 0);
          if (totalTrials < CHANNELS.length) continue;

          // Channel-level Phase-Switch: gleiche Schwellen wie global, aber je Kanal.
          const chPhase: Phase = pickPhase(variantStats.map((x) => x.b));
          // Falls Kanal noch sehr klein → bleibe auf phase1 (Warmup).
          const chReady = variantStats.some((x) => x.b.trials >= COMPOSITE_MIN_TRIALS_CHANNEL);
          const chRewardMode: "primary" | "phase1" | "phase2" =
            chReady ? chPhase : (totalTrials > 0 ? "phase1" : "primary");
          const tStats = variantStats.map(({ v, b }) => {
            const successes = chRewardMode === "primary"
              ? b.primary
              : rewardFor(b, chRewardMode === "phase2" ? "phase2" : "phase1");
            return { id: v.id as string, trials: b.trials, successes };
          });
          const w = thompson(tStats, 3000, EXPLORATION_FLOOR);
          for (const { v, b } of variantStats) {
            const weight = Number((w[v.id] ?? 0).toFixed(4));
            const successesOut = chRewardMode === "primary"
              ? b.primary
              : rewardFor(b, chRewardMode === "phase2" ? "phase2" : "phase1");
            await supabase.from("ab_channel_weights").upsert({
              experiment_id: exp.id,
              variant_id: v.id,
              channel: ch,
              weight,
              trials: b.trials,
              successes: successesOut,
              win_probability: weight,
              reward_mode: chRewardMode,
              last_recomputed_at: nowIso,
            }, { onConflict: "experiment_id,variant_id,channel" });
          }
          channelsComputed++;
          await supabase.from("ab_decision_log").insert({
            experiment_id: exp.id,
            channel: ch,
            action: "recompute",
            reward_mode: chRewardMode,
            payload: {
              total_trials: totalTrials,
              reason: chRewardMode === "phase2"
                ? `phase2: ≥${PHASE2_MIN_COMPLETIONS} Completions oder ≥${PHASE2_MIN_BOOKINGS} Bookings erreicht`
                : chRewardMode === "phase1"
                  ? `phase1 warmup (0.4/0.3/0.3) bis ≥${PHASE2_MIN_COMPLETIONS} Completions oder ≥${PHASE2_MIN_BOOKINGS} Bookings`
                  : "primary metric fallback (keine Trials)",
              weights: Object.fromEntries(variantStats.map(({ v }) => [v.key, w[v.id] ?? 0])),
            },
          });
        }

        // -------- Per-Device-Channel Allocator (additive) --------
        // Same Thompson logic, but bucketed per (channel:device). Writes use
        // composite channel string "meta:mobile" etc. into the existing
        // ab_channel_weights.channel column (no schema change). Client hook
        // prefers device-channel weight, falls back to channel-only.
        let deviceBucketsComputed = 0;
        for (const ch of CHANNELS) {
          for (const dv of DEVICES) {
            const bucketKey = `${ch}:${dv}`;
            const variantStats = variants.map((v) => {
              const b = deviceChannelStats.get(`${v.id}|${bucketKey}`)!;
              return { v, b };
            });
            const totalTrials = variantStats.reduce((a, x) => a + x.b.trials, 0);
            // Higher floor because buckets are smaller (channel × device).
            if (totalTrials < CHANNELS.length * 2) continue;
            const chPhase: Phase = pickPhase(variantStats.map((x) => x.b));
            const chReady = variantStats.some((x) => x.b.trials >= COMPOSITE_MIN_TRIALS_CHANNEL);
            const mode: "primary" | "phase1" | "phase2" =
              chReady ? chPhase : (totalTrials > 0 ? "phase1" : "primary");
            const tStats = variantStats.map(({ v, b }) => ({
              id: v.id as string,
              trials: b.trials,
              successes: mode === "primary" ? b.primary : rewardFor(b, mode === "phase2" ? "phase2" : "phase1"),
            }));
            const w = thompson(tStats, 3000, EXPLORATION_FLOOR);
            for (const { v, b } of variantStats) {
              const weight = Number((w[v.id] ?? 0).toFixed(4));
              const successesOut = mode === "primary"
                ? b.primary
                : rewardFor(b, mode === "phase2" ? "phase2" : "phase1");
              await supabase.from("ab_channel_weights").upsert({
                experiment_id: exp.id,
                variant_id: v.id,
                channel: bucketKey,
                weight,
                trials: b.trials,
                successes: successesOut,
                win_probability: weight,
                reward_mode: mode,
                last_recomputed_at: nowIso,
              }, { onConflict: "experiment_id,variant_id,channel" });
            }
            deviceBucketsComputed++;
          }
        }
        if (deviceBucketsComputed > 0) {
          await supabase.from("ab_decision_log").insert({
            experiment_id: exp.id,
            channel: "device_split",
            action: "recompute",
            reward_mode: "phase1",
            payload: {
              device_buckets_computed: deviceBucketsComputed,
              reason: "per-(channel:device) thompson buckets recomputed",
            },
          });
        }
      }

      // Global decision log entry (always written when we touch this experiment).
      await supabase.from("ab_decision_log").insert({
        experiment_id: exp.id,
        channel: null,
        action: winnerId ? "freeze_winner" : "recompute",
        reward_mode: rewardMode,
        payload: {
          winner_variant_id: winnerId,
          variant_count: variants.length,
          channels_computed: channelsComputed,
          reason: winnerId
            ? `winner: p<${exp.significance_alpha ?? 0.05} & lift≥${exp.min_lift_pct ?? 10}%`
            : rewardMode === "phase2"
              ? `phase2 (Booking>Qualified>Lead>QC>QS) — 0.30 Bk + 0.25 Ql + 0.20 Ld + 0.15 QC + 0.10 QS`
              : rewardMode === "phase1"
                ? `phase1 warmup — 0.30 QS + 0.25 QC + 0.15 Ld + 0.15 Ql + 0.15 Bk`
                : "primary metric fallback (keine Trials)",
          exploration_floor: EXPLORATION_FLOOR,
          global_stats: Object.fromEntries(variants.map((v) => {
            const s = stats.get(v.id)!;
            return [v.key, {
              trials: s.trials, primary: s.primary, guardrail: s.guardrail,
              qs: s.quizStart, qc: s.quizComplete, ld: s.lead, ql: s.qualified, bk: s.booking,
            }];
          })),
        },
      });

      results.push({ experimentKey: exp.key, updated: variants.length, winner: winnerId, rewardMode, channelsComputed });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
