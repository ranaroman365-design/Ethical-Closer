/**
 * useTouchDragDrop — Touch-based drag-and-drop for mobile devices.
 *
 * Provides long-press-to-drag with visual feedback (ghost element),
 * haptic vibration on supported devices, and drop zone detection.
 *
 * Works alongside HTML5 DnD (desktop) — both can coexist.
 */
import { useCallback, useRef, useState } from "react";
import { haptic } from "@/lib/haptic";

export interface TouchDragData {
  id: string;
  [key: string]: unknown;
}

export interface TouchDropZone {
  id: string;
  element: HTMLElement;
  label?: string;
}

const LONG_PRESS_MS = 400;
const DRAG_THRESHOLD_PX = 10;

export function useTouchDragDrop<T extends TouchDragData>({
  onDrop,
  getDropZones,
}: {
  onDrop: (data: T, zoneId: string) => void;
  getDropZones: () => TouchDropZone[];
}) {
  const [dragging, setDragging] = useState<T | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [activeZone, setActiveZone] = useState<string | null>(null);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragDataRef = useRef<T | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchStart = useCallback(
    (data: T) => (e: React.TouchEvent) => {
      const touch = e.touches[0];
      startPos.current = { x: touch.clientX, y: touch.clientY };
      dragDataRef.current = data;

      longPressTimer.current = setTimeout(() => {
        isDraggingRef.current = true;
        setDragging(data);
        setGhostPos({ x: touch.clientX, y: touch.clientY });
        haptic.heavy();
        // Prevent scroll while dragging
        document.body.style.overflow = "hidden";
        document.body.style.touchAction = "none";
      }, LONG_PRESS_MS);
    },
    []
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];

      // If haven't started dragging yet, check if we've moved too far (cancel long press)
      if (!isDraggingRef.current && startPos.current) {
        const dx = Math.abs(touch.clientX - startPos.current.x);
        const dy = Math.abs(touch.clientY - startPos.current.y);
        if (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) {
          clearTimer();
          return;
        }
      }

      if (!isDraggingRef.current) return;

      e.preventDefault();
      setGhostPos({ x: touch.clientX, y: touch.clientY });

      // Hit-test drop zones
      const zones = getDropZones();
      let found: string | null = null;
      for (const zone of zones) {
        const rect = zone.element.getBoundingClientRect();
        if (
          touch.clientX >= rect.left &&
          touch.clientX <= rect.right &&
          touch.clientY >= rect.top &&
          touch.clientY <= rect.bottom
        ) {
          found = zone.id;
          break;
        }
      }

      if (found !== activeZone) {
        setActiveZone(found);
        if (found) haptic.light();
      }
    },
    [activeZone, clearTimer, getDropZones]
  );

  const handleTouchEnd = useCallback(() => {
    clearTimer();

    if (isDraggingRef.current && dragDataRef.current && activeZone) {
      haptic.medium();
      onDrop(dragDataRef.current, activeZone);
    }

    // Reset all state
    isDraggingRef.current = false;
    dragDataRef.current = null;
    startPos.current = null;
    setDragging(null);
    setGhostPos(null);
    setActiveZone(null);
    document.body.style.overflow = "";
    document.body.style.touchAction = "";
  }, [activeZone, clearTimer, onDrop]);

  const handleTouchCancel = useCallback(() => {
    clearTimer();
    isDraggingRef.current = false;
    dragDataRef.current = null;
    startPos.current = null;
    setDragging(null);
    setGhostPos(null);
    setActiveZone(null);
    document.body.style.overflow = "";
    document.body.style.touchAction = "";
  }, [clearTimer]);

  return {
    dragging,
    ghostPos,
    activeZone,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  };
}
