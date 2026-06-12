import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cacheSlotWeights } from "@/lib/ab-multivariant";

const SIX_HOURS = 6 * 60 * 60 * 1000;
const FETCH_TS_KEY = "ab_slot_weights_last_fetch_v1";

/**
 * Pollt `ab_slot_weights` höchstens alle 6h pro Browser und schreibt das
 * Ergebnis in den LocalStorage-Cache des Multivariant-Layers. Neue Sessions
 * benutzen diese Gewichte beim ersten Bucketing — bestehende Buckets bleiben
 * sticky, damit Conversion-Metriken nicht zerrissen werden.
 */
export function useAbWeights(slots: string[]): void {
  useEffect(() => {
    if (typeof window === "undefined" || slots.length === 0) return;

    let cancelled = false;
    const last = (() => {
      try {
        const raw = window.localStorage.getItem(FETCH_TS_KEY);
        return raw ? Number(raw) || 0 : 0;
      } catch {
        return 0;
      }
    })();
    if (Date.now() - last < SIX_HOURS) return;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("ab_slot_weights")
          .select("slot,variant,weight")
          .in("slot", slots);
        if (cancelled || error || !data) return;
        cacheSlotWeights(data as Array<{ slot: string; variant: string; weight: number | null }>);
        try {
          window.localStorage.setItem(FETCH_TS_KEY, String(Date.now()));
        } catch {
          /* ignore */
        }
      } catch {
        /* never throw */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slots.join("|")]);
}
