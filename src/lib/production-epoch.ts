/**
 * Production KPI Epoch — Client-side helper
 *
 * Provides the canonical production_kpi_start_at timestamp
 * so frontend queries can apply the same epoch filter used by
 * the backend truth views and RPCs.
 *
 * The epoch is fetched once from system_config and cached in memory.
 * All KPI-relevant frontend queries should use this as a floor.
 *
 * Usage:
 *   const epoch = await getProductionEpoch();
 *   // Use in .gte('created_at', epoch) filters
 */
import { supabase } from "@/integrations/supabase/client";

const FALLBACK_EPOCH = "2026-05-08T08:00:00Z";
let cachedEpoch: string | null = null;

/**
 * Returns the production KPI epoch as an ISO timestamp string.
 * Cached after first fetch. Falls back to hardcoded value if DB unavailable.
 */
export async function getProductionEpoch(): Promise<string> {
  if (cachedEpoch) return cachedEpoch;

  try {
    const { data, error } = await supabase
      .from("system_config")
      .select("config_value")
      .eq("config_key", "production_kpi_start_at")
      .limit(1)
      .maybeSingle();

    if (!error && data?.config_value) {
      // config_value is JSONB — the value is a quoted string
      const raw = typeof data.config_value === "string"
        ? data.config_value
        : JSON.parse(JSON.stringify(data.config_value));
      cachedEpoch = typeof raw === "string" ? raw : FALLBACK_EPOCH;
      return cachedEpoch;
    }
  } catch {
    // Silent fallback
  }

  cachedEpoch = FALLBACK_EPOCH;
  return cachedEpoch;
}

/**
 * Synchronous access — returns cached epoch or fallback.
 * Call getProductionEpoch() first to prime the cache.
 */
export function getProductionEpochSync(): string {
  return cachedEpoch ?? FALLBACK_EPOCH;
}

/**
 * Invalidate the cache (e.g. after admin changes the epoch).
 */
export function invalidateProductionEpoch(): void {
  cachedEpoch = null;
}

/**
 * FALLBACK_EPOCH exported for tests and constants.
 */
export { FALLBACK_EPOCH };
