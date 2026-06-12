/**
 * Apply Funnel Debug Overlay
 *
 * Activated by appending `?debug=ab` to /apply (sticky for the tab via sessionStorage).
 * - Shows the loaded A/B variant as a floating badge (top-right).
 * - Streams every funnel event fired via `trackFunnelEvent` into:
 *     1. console (collapsed group, prefixed `[apply-debug]`)
 *     2. an in-page event log panel
 *
 * Purely diagnostic: no styling overrides, no business logic, no event mutation.
 */
import { useEffect, useMemo, useState } from "react";
import { getApplyAbVariant, APPLY_AB_TEST_KEY, type ApplyAbVariant } from "@/lib/apply-ab-test";
import { PLAYBOOK_AB_TEST_KEY } from "@/lib/playbook-ab-test";
import { inspectAbBucket, formatDuration, type AbInspectResult } from "@/lib/ab-debug";

const TRACKED_TESTS: Array<{ testKey: string; label: string }> = [
  { testKey: APPLY_AB_TEST_KEY, label: "Apply Social Proof" },
  { testKey: PLAYBOOK_AB_TEST_KEY, label: "Playbook Microcopy" },
  { testKey: "apply_sticky_hint_v1", label: "Sticky CTA Hint" },
];

const STORAGE_KEY = "apply_debug_mode_v1";

interface LoggedEvent {
  ts: string;
  eventName: string;
  ab_variant?: string;
  ab_test?: string;
  payload: Record<string, unknown>;
}

function isDebugActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("debug") === "ab") {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
      return true;
    }
    if (params.get("debug") === "off") {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return false;
    }
    return window.sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export default function ApplyDebugOverlay() {
  const [active, setActive] = useState(false);
  const [variant, setVariant] = useState<ApplyAbVariant>("A");
  const [events, setEvents] = useState<LoggedEvent[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [inspectTick, setInspectTick] = useState(0);

  useEffect(() => {
    if (!isDebugActive()) return;
    setActive(true);
    setVariant(getApplyAbVariant());

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { eventName: string; category: string; metadata?: Record<string, unknown> }
        | undefined;
      if (!detail) return;
      if (detail.category !== "funnel") return;

      const meta = detail.metadata ?? {};
      const entry: LoggedEvent = {
        ts: new Date().toLocaleTimeString(),
        eventName: detail.eventName,
        ab_variant: typeof meta.ab_variant === "string" ? meta.ab_variant : undefined,
        ab_test: typeof meta.ab_test === "string" ? meta.ab_test : undefined,
        payload: meta,
      };

      // Console — collapsed group for inspection
      // eslint-disable-next-line no-console
      console.groupCollapsed(
        `%c[apply-debug] %c${entry.eventName}%c ${entry.ab_variant ? `· ab=${entry.ab_variant}` : ""}`,
        "color:#a855f7;font-weight:600",
        "color:inherit;font-weight:600",
        "color:#888",
      );
      // eslint-disable-next-line no-console
      console.log("payload:", meta);
      // eslint-disable-next-line no-console
      console.groupEnd();

      setEvents((prev) => [entry, ...prev].slice(0, 30));
    };

    window.addEventListener("lovable:track", handler);
    return () => window.removeEventListener("lovable:track", handler);
  }, []);

  // Tick the storage inspector so the remaining-TTL counter updates live.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setInspectTick((t) => t + 1), 5000);
    return () => window.clearInterval(id);
  }, [active]);

  const inspections = useMemo<AbInspectResult[]>(() => {
    if (!active) return [];
    return TRACKED_TESTS.map((t) => inspectAbBucket(t.testKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, inspectTick]);

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-x-2 bottom-2 z-[120] flex flex-col items-end gap-2 md:inset-auto md:right-4 md:top-4 md:bottom-auto md:max-w-sm">
      {/* Variant badge */}
      <div className="pointer-events-auto rounded-full border border-primary/40 bg-background/95 px-3 py-1.5 text-[11px] font-mono shadow-lg backdrop-blur">
        <span className="text-muted-foreground">A/B</span>{" "}
        <span className="font-semibold text-primary">Variante {variant}</span>{" "}
        <span className="text-muted-foreground">· {APPLY_AB_TEST_KEY}</span>
      </div>

      {/* Storage inspector — variant + assignedAt + remaining TTL + reassign flag */}
      <div className="pointer-events-auto w-full rounded-md border border-border/60 bg-background/95 text-[11px] shadow-xl backdrop-blur md:w-80">
        <div className="flex items-center justify-between border-b border-border/40 px-3 py-2 font-mono text-muted-foreground">
          <span>Bucket-Storage</span>
          {inspections[0] && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
              {inspections[0].backend === "cookie" ? "cookie · 30d" : "localStorage"}
            </span>
          )}
        </div>
        <ul className="divide-y divide-border/30">
          {inspections.map((r) => {
            const test = TRACKED_TESTS.find((t) => t.testKey === r.testKey);
            const assignedLabel =
              r.assignedAt != null
                ? new Date(r.assignedAt).toLocaleString("de-DE", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—";
            const ttlLow =
              !r.expired && r.remainingMs != null && r.remainingMs < 24 * 60 * 60 * 1000;
            return (
              <li key={r.testKey} className="px-3 py-2 font-mono">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-foreground">
                    {test?.label ?? r.testKey}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                      r.variant
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {r.variant ?? "—"}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                  <span>assignedAt:</span>
                  <span className="text-foreground/80">{assignedLabel}</span>
                  <span>Alter:</span>
                  <span className="text-foreground/80">{formatDuration(r.ageMs)}</span>
                  <span>TTL übrig:</span>
                  <span
                    className={
                      r.expired
                        ? "text-destructive"
                        : ttlLow
                          ? "text-signal"
                          : "text-foreground/80"
                    }
                  >
                    {r.expired ? "abgelaufen" : formatDuration(r.remainingMs)}
                  </span>
                </div>
                {r.reassignedThisSession && (
                  <div className="mt-1.5 rounded bg-signal/10 px-2 py-1 text-[10px] text-signal">
                    Neu zugewiesen in dieser Session
                    {r.fromVariant && r.variant ? (
                      <>
                        : <code>{r.fromVariant}</code> → <code>{r.variant}</code>
                      </>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Event log panel */}
      <div className="pointer-events-auto w-full rounded-md border border-border/60 bg-background/95 text-[11px] shadow-xl backdrop-blur md:w-80">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full items-center justify-between border-b border-border/40 px-3 py-2 font-mono text-foreground hover:bg-muted/40"
        >
          <span>
            <span className="text-muted-foreground">events</span>{" "}
            <span className="font-semibold">{events.length}</span>
          </span>
          <span className="text-muted-foreground">{collapsed ? "▸" : "▾"}</span>
        </button>
        {!collapsed && (
          <div className="max-h-64 overflow-y-auto">
            {events.length === 0 ? (
              <p className="px-3 py-3 font-mono text-muted-foreground">
                Warte auf Funnel-Events…
              </p>
            ) : (
              <ul className="divide-y divide-border/30">
                {events.map((e, i) => (
                  <li key={`${e.ts}-${i}`} className="px-3 py-2 font-mono">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-foreground">{e.eventName}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{e.ts}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
                      {e.ab_variant && (
                        <span>
                          ab_variant=<span className="text-primary">{e.ab_variant}</span>
                        </span>
                      )}
                      {e.ab_test && <span>ab_test={e.ab_test}</span>}
                      {typeof e.payload.section === "string" && <span>section={String(e.payload.section)}</span>}
                      {typeof e.payload.variant === "string" && <span>variant={String(e.payload.variant)}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="border-t border-border/40 px-3 py-1.5 text-[10px] text-muted-foreground">
          Debug aktiv · ?debug=off zum Beenden
        </div>
      </div>
    </div>
  );
}
