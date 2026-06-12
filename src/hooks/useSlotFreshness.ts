/**
 * useSlotFreshness — Shared staleness guard for slot pickers.
 *
 * Provides:
 * - Auto-refresh on a configurable interval (default 45s)
 * - Refetch on tab re-focus (visibilitychange)
 * - Staleness tracking (fetchedAt timestamp, isStale flag)
 * - A subtle UI-ready "last refreshed" label
 */
import { useEffect, useRef, useCallback, useState } from "react";

const DEFAULT_INTERVAL_MS = 45_000;
const STALE_THRESHOLD_MS = 90_000;

interface SlotFreshnessOptions {
  /** Async function that reloads slot data */
  refetch: () => Promise<void>;
  /** Auto-refresh interval in ms (default 45 000) */
  intervalMs?: number;
  /** Threshold after which data is considered stale (default 90 000) */
  staleAfterMs?: number;
  /** Disable auto-refresh (e.g. after slot selected) */
  paused?: boolean;
}

export function useSlotFreshness({
  refetch,
  intervalMs = DEFAULT_INTERVAL_MS,
  staleAfterMs = STALE_THRESHOLD_MS,
  paused = false,
}: SlotFreshnessOptions) {
  const [fetchedAt, setFetchedAt] = useState<number>(Date.now());
  const [isStale, setIsStale] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doRefresh = useCallback(async () => {
    try {
      await refetch();
      setFetchedAt(Date.now());
      setIsStale(false);
    } catch {
      // Keep existing data, mark as stale
      setIsStale(true);
    }
  }, [refetch]);

  // Mark data as fresh after initial load
  const markFresh = useCallback(() => {
    setFetchedAt(Date.now());
    setIsStale(false);
  }, []);

  // Auto-refresh interval
  useEffect(() => {
    if (paused) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      doRefresh();
    }, intervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [doRefresh, intervalMs, paused]);

  // Staleness checker (runs every 10s)
  useEffect(() => {
    const check = setInterval(() => {
      const age = Date.now() - fetchedAt;
      setIsStale(age > staleAfterMs);
    }, 10_000);
    return () => clearInterval(check);
  }, [fetchedAt, staleAfterMs]);

  // Refetch on tab re-focus
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !paused) {
        const age = Date.now() - fetchedAt;
        if (age > intervalMs * 0.5) {
          doRefresh();
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [doRefresh, fetchedAt, intervalMs, paused]);

  return { fetchedAt, isStale, markFresh, doRefresh };
}
