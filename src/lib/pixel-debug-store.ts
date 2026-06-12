/**
 * Pixel Debug Store — keeps a rolling log of canonical Meta Pixel events.
 *
 * Events are pushed directly by trackPixelEvent() (the canonical funnel layer).
 * This avoids fragile window.fbq monkey-patching and covers every SPA event.
 *
 * Activated via  ?pixel_debug=1  in the URL or by calling enablePixelDebug()
 * from the console. Persists for the tab via sessionStorage.
 */

export interface PixelDebugEntry {
  id: string;
  ts: number;
  iso: string;
  route: string;
  canonicalEvent: string;
  metaEvent: string;
  params: Record<string, unknown>;
}

const MAX_ENTRIES = 100;
const STORAGE_KEY = "pixel_debug_enabled";

let entries: PixelDebugEntry[] = [];
let listeners: (() => void)[] = [];

function genId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function currentRoute(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname + window.location.search;
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function pushPixelDebugEvent(
  canonicalEvent: string,
  metaEvent: string,
  params: Record<string, unknown>
): void {
  if (!isPixelDebugEnabled()) return;
  entries.unshift({
    id: genId(),
    ts: Date.now(),
    iso: new Date().toISOString(),
    route: currentRoute(),
    canonicalEvent,
    metaEvent,
    params: { ...params },
  });
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(0, MAX_ENTRIES);
  }
  notify();
}

export function isPixelDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("pixel_debug") === "1") {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
      return true;
    }
    if (params.get("pixel_debug") === "0") {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return false;
    }
    return window.sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function enablePixelDebug(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function disablePixelDebug(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getPixelDebugEntries(): readonly PixelDebugEntry[] {
  return entries;
}

export function subscribePixelDebug(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export function clearPixelDebugEntries(): void {
  entries = [];
  notify();
}
