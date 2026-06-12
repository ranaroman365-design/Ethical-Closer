/**
 * useCopyVariant — additive, Control-safe copy/order selector.
 * --------------------------------------------------------------
 * Thin wrapper around `useAutoAbVariant` for CRO copy/layout tests.
 *
 * Guarantees:
 *  1. **Control-first**: while loading, on error, or when `CRO_ENABLED=false`,
 *     returns the caller's `controlValue` verbatim. First paint never differs
 *     from the pre-test build.
 *  2. **Type-safe payload lookup**: read one specific key from the variant's
 *     `payload` JSON (e.g. `headline`, `label`, `order`); falls back to
 *     Control if the key is missing or wrong type.
 *  3. **Never throws**. Network/DB failures degrade to Control silently.
 *
 * Usage:
 *   const headline = useCopyVariant(
 *     "hero_copy_v1",
 *     "Für Coaches, die wachsen wollen …",   // control text
 *     "headline",
 *   );
 */
import { useAutoAbVariant } from "@/lib/ab-auto/useAutoAbVariant";
import { CRO_ENABLED, type CroExperimentKey } from "./config";

export function useCopyVariant<T extends string>(
  experimentKey: CroExperimentKey,
  controlValue: T,
  payloadKey: string = "value",
): T {
  // Hook must be called unconditionally; the gate is applied to the result.
  const { variant, loading } = useAutoAbVariant(experimentKey);
  if (!CRO_ENABLED) return controlValue;
  if (loading || !variant) return controlValue;
  const raw = (variant.payload as Record<string, unknown>)?.[payloadKey];
  return typeof raw === "string" && raw.length > 0 ? (raw as T) : controlValue;
}

/**
 * Convenience: returns the bare variant key ("A" | "B" | "control") for
 * layout-toggle tests that don't carry copy in payload.
 */
export function useVariantKey(
  experimentKey: CroExperimentKey,
  controlKey: string = "A",
): string {
  const { variant, loading } = useAutoAbVariant(experimentKey);
  if (!CRO_ENABLED || loading || !variant) return controlKey;
  return variant.key || controlKey;
}
