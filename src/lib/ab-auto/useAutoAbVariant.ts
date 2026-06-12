/**
 * useAutoAbVariant(experimentKey)
 * --------------------------------------------------------------
 * Client hook for the additive auto A/B system. Pulls the active variants +
 * server-computed weights for `experimentKey` from Supabase, deterministically
 * assigns the visitor's session to one variant, persists the assignment in
 * `ab_allocations`, and returns the chosen variant.
 *
 *  - Strictly additive: returns `{ variant: null, loading: true }` until ready.
 *    Callers MUST render their existing control content during loading and on
 *    fallback so nothing visible breaks if the network/DB is unavailable.
 *  - One allocation per (experiment, session). Re-mounts read the same row.
 *  - Never throws. All errors fall back to "no override → control".
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getOrCreateSessionId } from "./session";
import { getAdAttribution, hasAdAttribution } from "@/lib/ad-attribution";
import { resolveAbChannel, resolveAbDevice, deviceChannelKey } from "./channel";

export interface AutoAbVariant {
  id: string;
  key: string;
  label: string;
  isControl: boolean;
  weight: number;
  payload: Record<string, unknown>;
}

interface State {
  loading: boolean;
  variant: AutoAbVariant | null;
  experimentId: string | null;
  experimentStatus: string | null;
  error: string | null;
}

function pickWeighted(variants: AutoAbVariant[], rand: number): AutoAbVariant {
  // Normalize weights — if all zero, equal split.
  const sum = variants.reduce((a, v) => a + Math.max(0, v.weight), 0);
  if (sum <= 0) return variants[Math.floor(rand * variants.length)] ?? variants[0];
  const r = rand * sum;
  let acc = 0;
  for (const v of variants) {
    acc += Math.max(0, v.weight);
    if (r <= acc) return v;
  }
  return variants[variants.length - 1];
}

// Deterministic 32-bit hash → [0, 1)
function hashTo01(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

export function useAutoAbVariant(experimentKey: string): State {
  const [state, setState] = useState<State>({
    loading: true,
    variant: null,
    experimentId: null,
    experimentStatus: null,
    error: null,
  });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        const sessionId = getOrCreateSessionId();

        const { data: exp, error: expErr } = await supabase
          .from("ab_experiments")
          .select("id, status, winner_variant_id")
          .eq("key", experimentKey)
          .maybeSingle();
        if (expErr || !exp) {
          setState({ loading: false, variant: null, experimentId: null, experimentStatus: null, error: expErr?.message ?? "no_experiment" });
          return;
        }

        const { data: variantRows, error: vErr } = await supabase
          .from("ab_variants")
          .select("id, key, label, is_control, weight, payload, is_active")
          .eq("experiment_id", exp.id)
          .eq("is_active", true);
        if (vErr || !variantRows || variantRows.length === 0) {
          setState({ loading: false, variant: null, experimentId: exp.id, experimentStatus: exp.status, error: vErr?.message ?? "no_variants" });
          return;
        }

        const variants: AutoAbVariant[] = variantRows.map((r) => ({
          id: r.id as string,
          key: r.key as string,
          label: r.label as string,
          isControl: Boolean(r.is_control),
          weight: Number(r.weight ?? 0),
          payload: (r.payload as Record<string, unknown>) ?? {},
        }));

        // Per-Channel weights (additive): prefer channel-specific weight if a
        // bucket has been computed for this visitor's channel. Falls back to
        // the global variant.weight when no per-channel row exists yet.
        const attribution = getAdAttribution();
        const channel = resolveAbChannel(
          hasAdAttribution(attribution)
            ? {
                utm_source: attribution.utm_source,
                utm_medium: attribution.utm_medium,
                utm_campaign: attribution.utm_campaign,
              }
            : null,
        );
        const device = resolveAbDevice();
        const deviceChannel = deviceChannelKey(channel, device);
        try {
          // Prefer (channel:device) bucket, fall back to channel-only.
          const { data: chRows } = await supabase
            .from("ab_channel_weights")
            .select("variant_id, weight, channel")
            .eq("experiment_id", exp.id)
            .in("channel", [deviceChannel, channel]);
          if (chRows && chRows.length > 0) {
            const deviceRows = chRows.filter((r) => r.channel === deviceChannel);
            const channelRows = chRows.filter((r) => r.channel === channel);
            const preferred = deviceRows.length > 0 ? deviceRows : channelRows;
            const byId = new Map(preferred.map((r) => [r.variant_id as string, Number(r.weight ?? 0)]));
            for (const v of variants) {
              const w = byId.get(v.id);
              if (typeof w === "number") v.weight = w;
            }
          }
        } catch {
          /* fallback to global weights */
        }

        // Existing allocation?
        const { data: existing } = await supabase
          .from("ab_allocations")
          .select("variant_id")
          .eq("experiment_id", exp.id)
          .eq("session_id", sessionId)
          .maybeSingle();

        let chosen: AutoAbVariant | undefined;
        if (existing?.variant_id) {
          chosen = variants.find((v) => v.id === existing.variant_id);
        }
        if (!chosen) {
          // Frozen winner short-circuit
          if (exp.status === "won" && exp.winner_variant_id) {
            chosen = variants.find((v) => v.id === exp.winner_variant_id) ?? variants[0];
          } else if (exp.status === "paused") {
            chosen = variants.find((v) => v.isControl) ?? variants[0];
          } else {
            const r = hashTo01(`${exp.id}:${sessionId}:${deviceChannel}`);
            chosen = pickWeighted(variants, r);
          }


          // Persist allocation (fire-and-forget for new ones).
          const attribution = getAdAttribution();
          const attr = hasAdAttribution(attribution) ? attribution : ({} as typeof attribution);
          try {
            await supabase.from("ab_allocations").insert({
              experiment_id: exp.id,
              variant_id: chosen.id,
              session_id: sessionId,
              utm_source: attr.utm_source ?? null,
              utm_medium: attr.utm_medium ?? null,
              utm_campaign: attr.utm_campaign ?? null,
              utm_term: attr.utm_term ?? null,
              utm_content: attr.utm_content ?? null,
              landing_path: typeof window !== "undefined" ? window.location.pathname : null,
              user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
            });
          } catch {
            /* duplicate or RLS — safe to ignore, the variant stays valid */
          }
        }

        setState({
          loading: false,
          variant: chosen ?? null,
          experimentId: exp.id,
          experimentStatus: exp.status,
          error: null,
        });
      } catch (e) {
        setState({
          loading: false,
          variant: null,
          experimentId: null,
          experimentStatus: null,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
  }, [experimentKey]);

  return state;
}
