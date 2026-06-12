/**
 * CAPI Debug Store — rolling log of server-side Meta CAPI events sent via
 * the `send-meta-event` edge function.
 *
 * Activated via the SAME flag as the Pixel debug panel (`?pixel_debug=1`),
 * so opening the Pixel Debug Panel shows both Browser-Pixel and CAPI events
 * side by side for dedup verification.
 */

import { isPixelDebugEnabled } from "./pixel-debug-store";

export interface CapiDebugEntry {
  id: string;
  ts: number;
  iso: string;
  event_name: string;
  event_id: string;
  /** "pending" until the edge function responds, then "ok" / "error". */
  status: "pending" | "ok" | "error";
  /** HTTP status from the edge function (200 on success). */
  http_status?: number;
  /** Meta's fbtrace_id — the unique server-event id you can search in
   *  Events Manager → Test Events / Diagnostics. */
  fbtrace_id?: string | null;
  /** Free-form error text if the call failed. */
  error?: string | null;
}

const MAX_ENTRIES = 100;
let entries: CapiDebugEntry[] = [];
let listeners: (() => void)[] = [];

function genId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function notify(): void {
  for (const fn of listeners) {
    try { fn(); } catch { /* ignore */ }
  }
}

/** Push a new "pending" CAPI entry; returns the id so the caller can patch it. */
export function pushCapiPending(event_name: string, event_id: string): string {
  if (!isPixelDebugEnabled()) return "";
  const id = genId();
  entries.unshift({
    id,
    ts: Date.now(),
    iso: new Date().toISOString(),
    event_name,
    event_id,
    status: "pending",
  });
  if (entries.length > MAX_ENTRIES) entries = entries.slice(0, MAX_ENTRIES);
  notify();
  return id;
}

/** Patch a pending CAPI entry with the response from the edge function. */
export function patchCapiResult(
  id: string,
  patch: Partial<Omit<CapiDebugEntry, "id" | "ts" | "iso" | "event_name" | "event_id">>
): void {
  if (!id) return;
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return;
  entries[idx] = { ...entries[idx], ...patch };
  notify();
}

export function getCapiDebugEntries(): readonly CapiDebugEntry[] {
  return entries;
}

export function subscribeCapiDebug(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export function clearCapiDebugEntries(): void {
  entries = [];
  notify();
}
