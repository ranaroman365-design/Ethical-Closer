/**
 * haptic.ts — Cross-platform haptic feedback utility.
 *
 * On Android / Chrome: uses navigator.vibrate().
 * On iOS / Safari (where vibrate is absent): plays a tiny AudioContext
 * "click" impulse for tactile audio feedback and returns a CSS class
 * token that callers can apply for a brief visual pulse.
 *
 * Usage:
 *   import { haptic } from '@/lib/haptic';
 *   haptic.light();   // subtle tap
 *   haptic.medium();  // standard confirmation
 *   haptic.heavy();   // strong action (e.g. confirm drop)
 */

const CAN_VIBRATE =
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (audioCtx) return audioCtx;
  try {
    const Ctx =
      window.AudioContext ??
      (window as any).webkitAudioContext;
    if (Ctx) {
      audioCtx = new Ctx();
      return audioCtx;
    }
  } catch {
    // AudioContext not available
  }
  return null;
}

/**
 * Play a short click/tick sound as haptic substitute.
 * Duration in ms maps to perceived intensity.
 */
function audioTick(durationMs: number) {
  const ctx = getAudioCtx();
  if (!ctx) return;

  // Resume if suspended (iOS autoplay policy)
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  // Very short, quiet click — not musical, just tactile
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(200 + durationMs * 4, ctx.currentTime);
  gain.gain.setValueAtTime(0.03, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    ctx.currentTime + durationMs / 1000
  );

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + durationMs / 1000);
}

/**
 * Apply a brief CSS pulse animation on the target element (visual fallback).
 * Intensity maps to scale amount: light→1.03, medium→1.06, heavy→1.10.
 */
function visualPulse(el: Element | null, intensity: "light" | "medium" | "heavy") {
  if (!el || !(el instanceof HTMLElement)) return;
  const cls =
    intensity === "heavy"
      ? "haptic-pulse-heavy"
      : intensity === "medium"
        ? "haptic-pulse-medium"
        : "haptic-pulse-light";
  el.classList.remove("haptic-pulse-light", "haptic-pulse-medium", "haptic-pulse-heavy");
  // Force reflow so re-adding the same class restarts the animation
  void el.offsetWidth;
  el.classList.add(cls);
  const onEnd = () => {
    el.classList.remove(cls);
    el.removeEventListener("animationend", onEnd);
  };
  el.addEventListener("animationend", onEnd, { once: true });
}

function vibrate(ms: number, el?: Element | null) {
  if (CAN_VIBRATE) {
    navigator.vibrate(ms);
  } else {
    audioTick(ms);
    // Visual pulse fallback for iOS/Safari
    const intensity = ms >= 40 ? "heavy" : ms >= 25 ? "medium" : "light";
    visualPulse(el ?? document.activeElement, intensity);
  }
}

export const haptic = {
  /** Subtle tap — swipe threshold, hover confirm, drawer close */
  light: (el?: Element | null) => vibrate(15, el),

  /** Standard — button press, swipe complete, long-press trigger */
  medium: (el?: Element | null) => vibrate(30, el),

  /** Strong — confirm action, drag complete */
  heavy: (el?: Element | null) => vibrate(50, el),

  /** Raw ms — only use when the presets don't fit */
  raw: (ms: number, el?: Element | null) => vibrate(ms, el),

  /** Whether the device supports real vibration */
  canVibrate: CAN_VIBRATE,
} as const;
