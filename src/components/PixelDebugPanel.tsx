import { useEffect, useState, useCallback } from "react";
import {
  isPixelDebugEnabled,
  getPixelDebugEntries,
  subscribePixelDebug,
  clearPixelDebugEntries,
  type PixelDebugEntry,
} from "@/lib/pixel-debug-store";
import {
  getCapiDebugEntries,
  subscribeCapiDebug,
  clearCapiDebugEntries,
  type CapiDebugEntry,
} from "@/lib/capi-debug-store";

function formatTime(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }) + `.${String(d.getMilliseconds()).padStart(3, "0")}`
  );
}

function formatParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([k]) => k !== "event_id");
  if (entries.length === 0) return "—";
  return entries
    .map(([k, v]) => {
      const sv = typeof v === "object" ? JSON.stringify(v) : String(v);
      return `${k}: ${sv.slice(0, 60)}${sv.length > 60 ? "…" : ""}`;
    })
    .join(" | ");
}

type Tab = "browser" | "capi";

export default function PixelDebugPanel() {
  const [visible, setVisible] = useState(false);
  const [tab, setTab] = useState<Tab>("browser");
  const [pixelEntries, setPixelEntries] = useState<readonly PixelDebugEntry[]>([]);
  const [capiEntries, setCapiEntries] = useState<readonly CapiDebugEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!isPixelDebugEnabled()) return;
    setPixelEntries(getPixelDebugEntries());
    setCapiEntries(getCapiDebugEntries());
    const off1 = subscribePixelDebug(() => setPixelEntries(getPixelDebugEntries()));
    const off2 = subscribeCapiDebug(() => setCapiEntries(getCapiDebugEntries()));
    return () => { off1(); off2(); };
  }, []);

  const handleClear = useCallback(() => {
    if (tab === "browser") clearPixelDebugEntries();
    else clearCapiDebugEntries();
  }, [tab]);

  if (!isPixelDebugEnabled()) return null;

  const totalCount = pixelEntries.length + capiEntries.length;
  const capiOk = capiEntries.filter((e) => e.status === "ok").length;
  const capiErr = capiEntries.filter((e) => e.status === "error").length;
  const capiPending = capiEntries.filter((e) => e.status === "pending").length;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] font-sans text-xs">
      {!visible ? (
        <button
          onClick={() => setVisible(true)}
          className="rounded-full bg-primary px-3 py-2 text-primary-foreground shadow-lg hover:opacity-90"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          Pixel Debug ({totalCount})
        </button>
      ) : (
        <div className="w-[30rem] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-background/95 p-4 shadow-2xl backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3
              className="text-sm font-semibold text-foreground"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              Meta Pixel Event Log
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClear}
                className="rounded bg-muted px-2 py-1 text-muted-foreground hover:bg-muted/80"
              >
                Clear
              </button>
              <button
                onClick={() => setVisible(false)}
                className="rounded bg-muted px-2 py-1 text-muted-foreground hover:bg-muted/80"
              >
                Hide
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-2 flex gap-1 border-b border-border">
            <button
              onClick={() => setTab("browser")}
              className={`px-2 py-1.5 text-xs font-medium transition-colors ${
                tab === "browser"
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Browser ({pixelEntries.length})
            </button>
            <button
              onClick={() => setTab("capi")}
              className={`px-2 py-1.5 text-xs font-medium transition-colors ${
                tab === "capi"
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              CAPI ({capiEntries.length})
              {capiErr > 0 && (
                <span className="ml-1 rounded bg-destructive/15 px-1 text-destructive">
                  {capiErr} err
                </span>
              )}
              {capiPending > 0 && (
                <span className="ml-1 rounded bg-amber-500/15 px-1 text-amber-600">
                  {capiPending}…
                </span>
              )}
              {capiOk > 0 && (
                <span className="ml-1 rounded bg-emerald-500/15 px-1 text-emerald-600">
                  {capiOk} ok
                </span>
              )}
            </button>
          </div>

          <div className="max-h-[20rem] overflow-y-auto space-y-2 pr-1">
            {tab === "browser" && pixelEntries.length === 0 && (
              <div className="py-4 text-center text-muted-foreground">
                No browser pixel events yet.
              </div>
            )}
            {tab === "capi" && capiEntries.length === 0 && (
              <div className="py-4 text-center text-muted-foreground">
                No CAPI events yet.
              </div>
            )}

            {tab === "browser" &&
              pixelEntries.map((e) => (
                <div
                  key={e.id}
                  className="rounded-lg border border-border bg-muted/40 p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                        {e.canonicalEvent}
                      </span>
                      <span className="font-semibold text-foreground">
                        {e.metaEvent}
                      </span>
                    </div>
                    <span className="shrink-0 text-muted-foreground">
                      {formatTime(e.ts)}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-muted-foreground">
                    {e.route}
                  </div>
                  <button
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                    className="mt-1 text-left text-muted-foreground hover:text-foreground"
                  >
                    {expanded === e.id
                      ? formatParams(e.params)
                      : formatParams(e.params).slice(0, 80) +
                        (Object.keys(e.params).filter((k) => k !== "event_id")
                          .length > 0
                          ? "…"
                          : "")}
                  </button>
                  {typeof e.params.event_id === "string" && (
                    <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground/70">
                      event_id: {e.params.event_id as string}
                    </div>
                  )}
                </div>
              ))}

            {tab === "capi" &&
              capiEntries.map((e) => {
                const badge =
                  e.status === "ok"
                    ? "bg-emerald-500/15 text-emerald-600"
                    : e.status === "error"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-amber-500/15 text-amber-600";
                const statusLabel =
                  e.status === "ok"
                    ? `${e.http_status ?? 200}`
                    : e.status === "error"
                    ? `ERR${e.http_status ? ` ${e.http_status}` : ""}`
                    : "…";
                return (
                  <div
                    key={e.id}
                    className="rounded-lg border border-border bg-muted/40 p-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`rounded px-1.5 py-0.5 font-medium ${badge}`}>
                          {statusLabel}
                        </span>
                        <span className="font-semibold text-foreground">
                          {e.event_name}
                        </span>
                      </div>
                      <span className="shrink-0 text-muted-foreground">
                        {formatTime(e.ts)}
                      </span>
                    </div>
                    <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground/70">
                      event_id: {e.event_id}
                    </div>
                    {e.fbtrace_id && (
                      <div className="mt-0.5 truncate font-mono text-[10px] text-emerald-700/80">
                        fbtrace_id: {e.fbtrace_id}
                      </div>
                    )}
                    {e.error && (
                      <div className="mt-1 text-destructive">{e.error}</div>
                    )}
                  </div>
                );
              })}
          </div>

          <div className="mt-2 text-right text-[10px] text-muted-foreground">
            Browser {pixelEntries.length} · CAPI {capiEntries.length} · max 100
            each
          </div>
        </div>
      )}
    </div>
  );
}
