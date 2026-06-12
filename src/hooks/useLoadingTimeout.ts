import { useState, useEffect, useRef } from 'react';
import { LOADING_TIMEOUT_MS } from '@/lib/schema-contract';

/**
 * Hook that prevents infinite loading states.
 * After LOADING_TIMEOUT_MS, sets `timedOut` to true so the UI can show an error.
 *
 * Uses schema contract. Do not query profiles.level or current_stage directly.
 */
export function useLoadingTimeout(isLoading: boolean, timeoutMs = LOADING_TIMEOUT_MS) {
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoading) {
      setTimedOut(false);
      timerRef.current = setTimeout(() => setTimedOut(true), timeoutMs);
    } else {
      setTimedOut(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isLoading, timeoutMs]);

  return { timedOut };
}
