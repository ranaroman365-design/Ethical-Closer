/**
 * Sound Design Layer — premium, subtle, opt-in
 * --------------------------------------------
 * - Web Audio API (no asset weight)
 * - Tones < 120ms, no looping, no stacking
 * - 3 modes: "off" (default) · "minimal" · "full"
 * - Debounced (160ms global) so repeated triggers never stack
 * - Respects prefers-reduced-motion (treats as "off")
 *
 * Modes:
 *   off      → silent
 *   minimal  → success · error · bottleneck only (default user opt-in)
 *   full     → adds tap (primary CTA) + kpi-up
 */

export type SoundMode = "off" | "minimal" | "full";
export type SoundCue = "tap" | "success" | "bottleneck" | "kpi-up" | "error";

const STORAGE_KEY = "ci.sound.mode";
const DEFAULT_MODE: SoundMode = "off";
const DEBOUNCE_MS = 160;

// Which cues each mode permits
const MODE_ALLOW: Record<SoundMode, ReadonlySet<SoundCue>> = {
  off: new Set(),
  minimal: new Set(["success", "bottleneck", "error"]),
  full: new Set(["tap", "success", "bottleneck", "kpi-up", "error"]),
};

let ctx: AudioContext | null = null;
let lastFiredAt = 0;
let lastCue: SoundCue | null = null;
const listeners = new Set<(m: SoundMode) => void>();

function reducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function getSoundMode(): SoundMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  const v = window.localStorage.getItem(STORAGE_KEY) as SoundMode | null;
  if (v === "off" || v === "minimal" || v === "full") return v;
  return DEFAULT_MODE;
}

export function setSoundMode(mode: SoundMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, mode);
  listeners.forEach((fn) => fn(mode));
  // Warm the audio context on user-initiated change (satisfies autoplay policy)
  if (mode !== "off") ensureContext();
}

export function subscribeSoundMode(fn: (m: SoundMode) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

interface ToneSpec {
  /** start frequency Hz */
  freq: number;
  /** end frequency Hz (linear glide) */
  freqEnd?: number;
  /** total duration in seconds (≤0.12) */
  dur: number;
  /** peak gain (master ~0.12 at full = ~−18dB) */
  gain: number;
  type?: OscillatorType;
}

const CUE_SPECS: Record<SoundCue, ToneSpec> = {
  // Soft tap — Apple-style click (very short, mid freq)
  tap: { freq: 880, freqEnd: 720, dur: 0.04, gain: 0.06, type: "sine" },
  // Confirmation — gentle upward pair
  success: { freq: 660, freqEnd: 990, dur: 0.11, gain: 0.08, type: "sine" },
  // Bottleneck — single muted tone (NOT alarming)
  bottleneck: { freq: 360, freqEnd: 320, dur: 0.11, gain: 0.07, type: "triangle" },
  // KPI upward improvement
  "kpi-up": { freq: 740, freqEnd: 1100, dur: 0.10, gain: 0.06, type: "sine" },
  // Error — short muted, descending
  error: { freq: 320, freqEnd: 220, dur: 0.10, gain: 0.07, type: "triangle" },
};

/**
 * Play a UI cue. Silent unless user has opted in AND mode permits this cue.
 * Debounced globally (160ms) so spammy triggers never stack.
 */
export function playCue(cue: SoundCue): void {
  if (typeof window === "undefined") return;
  if (reducedMotion()) return;

  const mode = getSoundMode();
  if (!MODE_ALLOW[mode].has(cue)) return;

  const now = performance.now();
  if (now - lastFiredAt < DEBOUNCE_MS) return;
  // Block immediate re-fire of same cue (extra anti-stack guard)
  if (lastCue === cue && now - lastFiredAt < DEBOUNCE_MS * 2) return;

  const audio = ensureContext();
  if (!audio) return;
  if (audio.state === "suspended") {
    audio.resume().catch(() => {});
  }

  const spec = CUE_SPECS[cue];
  const t0 = audio.currentTime;
  const t1 = t0 + Math.min(spec.dur, 0.12);

  try {
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = spec.type ?? "sine";
    osc.frequency.setValueAtTime(spec.freq, t0);
    if (spec.freqEnd && spec.freqEnd !== spec.freq) {
      osc.frequency.linearRampToValueAtTime(spec.freqEnd, t1);
    }
    // Gentle envelope: fast attack (8ms), exp decay → silent
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(spec.gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(g).connect(audio.destination);
    osc.start(t0);
    osc.stop(t1 + 0.02);

    lastFiredAt = now;
    lastCue = cue;
  } catch {
    /* never throw from sound */
  }
}

export const SOUND_MODE_LABELS: Record<SoundMode, string> = {
  off: "Off",
  minimal: "Minimal",
  full: "Full",
};
