/**
 * Tracking Debug Overlay — only renders when `?debug_tracking=true` is present
 * in the URL. Lists every funnel event the browser fired in this session,
 * including the master_funnel_id, event_id, and dedup status. Used for
 * verifying that:
 *  - master_funnel_id is stable across navigation
 *  - MASTER_* events fire exactly 1×
 *  - event_id is identical between Pixel & CAPI dispatches
 *
 * No business data is collected or shown. Strictly local to the browser.
 */
import { useEffect, useState } from "react";
import {
  getMasterFunnelId,
  TRACKING_VERSION,
  readFiredMasterEvents,
} from "@/lib/master-funnel-id";
import { getAttributionSource } from "@/lib/attribution-source";

interface TrackEntry {
  ts: number;
  eventName: string;
  category?: string;
  eventId?: string | null;
  deduped?: boolean;
  metadata?: Record<string, unknown>;
}

function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("debug_tracking") === "true";
  } catch {
    return false;
  }
}

export default function TrackingDebugOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [entries, setEntries] = useState<TrackEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [funnelId, setFunnelId] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    if (!isDebugEnabled()) return;
    setEnabled(true);
    setFunnelId(getMasterFunnelId());
    setSource(getAttributionSource());

    // Periodic refresh: capture-on-read in getAttributionSource means the
    // value may appear shortly after mount (e.g. after FirstTouchBootstrap
    // useEffect runs). Cheap poll for the first few seconds — then events
    // keep it fresh.
    const interval = window.setInterval(() => {
      setSource(getAttributionSource());
      setFunnelId(getMasterFunnelId());
    }, 1000);

    const onTrack = (e: Event) => {
      const ce = e as CustomEvent<{
        eventName: string;
        category: string;
        eventId?: string | null;
        metadata?: Record<string, unknown>;
      }>;
      const d = ce.detail;
      if (!d) return;
      setEntries((prev) => [
        { ts: Date.now(), eventName: d.eventName, category: d.category, eventId: d.eventId ?? null, metadata: d.metadata },
        ...prev,
      ].slice(0, 200));
      setFunnelId(getMasterFunnelId());
      setSource(getAttributionSource());
    };
    const onDedup = (e: Event) => {
      const ce = e as CustomEvent<{ eventName: string; eventId: string }>;
      const d = ce.detail;
      if (!d) return;
      setEntries((prev) => [
        { ts: Date.now(), eventName: d.eventName, deduped: true, eventId: d.eventId },
        ...prev,
      ].slice(0, 200));
    };
    window.addEventListener("lovable:track", onTrack);
    window.addEventListener("lovable:track:deduped", onDedup);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("lovable:track", onTrack);
      window.removeEventListener("lovable:track:deduped", onDedup);
    };
  }, []);

  if (!enabled) return null;

  return (
    <div
      className="fixed bottom-3 right-3 z-[9999] max-w-md w-[28rem] rounded-lg border border-border bg-background/95 backdrop-blur-sm shadow-xl text-xs font-mono"
      style={{ maxHeight: "70vh" }}
    >
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex flex-col">
          <span className="font-semibold text-foreground">Tracking Debug</span>
          <span className="text-[10px] opacity-70">{TRACKING_VERSION}</span>
        </div>
        <div className="text-[10px] text-right opacity-80">
          <div>funnel_id: <span className="text-primary">{funnelId ?? "—"}</span></div>
          <div>source: <span className="text-primary">{source ?? "—"}</span></div>
          <div>fired: {readFiredMasterEvents().length}</div>
        </div>
      </div>
      {!collapsed && (
        <div className="overflow-auto" style={{ maxHeight: "calc(70vh - 60px)" }}>
          <table className="w-full">
            <thead className="sticky top-0 bg-background">
              <tr className="text-left text-[10px] uppercase opacity-60">
                <th className="px-2 py-1">t</th>
                <th className="px-2 py-1">event</th>
                <th className="px-2 py-1">event_id</th>
                <th className="px-2 py-1">status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} className="border-t border-border/40">
                  <td className="px-2 py-1 opacity-60">
                    {new Date(e.ts).toLocaleTimeString()}
                  </td>
                  <td className="px-2 py-1">{e.eventName}</td>
                  <td className="px-2 py-1 truncate max-w-[140px]" title={e.eventId ?? ""}>
                    {e.eventId ? e.eventId.slice(0, 18) + "…" : "—"}
                  </td>
                  <td className="px-2 py-1">
                    {e.deduped ? (
                      <span className="text-amber-500">DEDUPED</span>
                    ) : (
                      <span className="text-emerald-500">FIRED</span>
                    )}
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-3 text-center opacity-60">
                    Noch keine Events in dieser Session.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
