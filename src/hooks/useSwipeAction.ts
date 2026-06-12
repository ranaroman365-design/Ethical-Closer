/**
 * useSwipeAction — detects a horizontal swipe gesture on touch devices.
 *
 * Returns touch handlers to attach to an element.
 * Calls `onSwipe` when a left-swipe exceeding the threshold is detected.
 * Provides `offsetX` for visual slide feedback during the gesture.
 */
import { useCallback, useRef, useState } from "react";
import { haptic } from "@/lib/haptic";

const SWIPE_THRESHOLD_PX = 60;
const MAX_Y_DRIFT_PX = 30;

export function useSwipeAction(onSwipe: () => void) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const swiped = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY };
    swiped.current = false;
    setOffsetX(0);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startRef.current || swiped.current) return;
    const t = e.touches[0];
    const dx = t.clientX - startRef.current.x;
    const dy = Math.abs(t.clientY - startRef.current.y);

    // If vertical drift is too large, cancel swipe detection
    if (dy > MAX_Y_DRIFT_PX) {
      startRef.current = null;
      setOffsetX(0);
      return;
    }

    // Only track left-swipes (negative dx)
    if (dx < 0) {
      setOffsetX(Math.max(dx, -120)); // cap visual shift
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (startRef.current && offsetX <= -SWIPE_THRESHOLD_PX && !swiped.current) {
      swiped.current = true;
      haptic.medium();
      onSwipe();
    }
    startRef.current = null;
    setOffsetX(0);
  }, [offsetX, onSwipe]);

  const onTouchCancel = useCallback(() => {
    startRef.current = null;
    setOffsetX(0);
  }, []);

  return { offsetX, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
}
