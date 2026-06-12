/**
 * Sticky-Hint A/B Dashboard
 *
 * Auswertung des `sticky_hint_v1`-Tests:
 * - `sticky_hint_impression` (gefeuert, sobald die Hint-Bubble auf mobile sichtbar wird)
 * - `sticky_hint_click`      (gefeuert beim Klick auf die mobile Sticky-CTA)
 *
 * Zeigt pro Variante (A / B) Impressionen, Klicks und CTR. Als kleine
 * Entscheidungshilfe zusätzlich Differenz vs. Baseline (A) und ein
 * "needs more data"-Badge bei < 100 Impressionen.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

interface Row {
  ab_variant: string;
  impressions: number;
  clicks: number;
  ctr_pct: number | null;
}

const WINDOWS: Array<{ days: number; label: string }> = [
  { days: 7, label: "7 Tage" },
  { days: 30, label: "30 Tage" },
  { days: 90, label: "90 Tage" },
];

const MIN_IMPRESSIONS_SIGNAL = 100;

export default function StickyHintAbDashboard() {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (d: number) => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc(
      "get_sticky_hint_ab_results" as never,
      { p_days: d } as never,
    );
    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows((data as unknown as Row[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    document.title = "Sticky-Hint A/B · Auswertung";
    load(days);
  }, [days]);

  // Index by variant for diff calc + lookup. A acts as baseline.
  const byVariant = useMemo(() => {
    const m = new Map<string, Row>();
    (rows ?? []).forEach((r) => m.set(r.ab_variant, r));
    return m;
  }, [rows]);

  const baseline = byVariant.get("A");

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/members/admin/apply-ab"
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-3 w-3" /> Apply A/B Übersicht
        </Link>

        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1
              className="text-3xl"
              style={{ fontFamily: "Cormorant Garamond, serif" }}
            >
              Sticky-Hint A/B
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Mobile Sticky-CTA Hint-Bubble · <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">sticky_hint_v1</code>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border p-0.5">
              {WINDOWS.map((w) => (
                <button
                  key={w.days}
                  onClick={() => setDays(w.days)}
                  className={`rounded px-3 py-1.5 text-xs transition ${
                    w.days === days
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => load(days)}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-muted"
              aria-label="Neu laden"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(["A", "B", "C"] as const).map((v) => {
            const row = byVariant.get(v);
            const ctr = row?.ctr_pct;
            const baselineCtr = baseline?.ctr_pct ?? null;
            const diff =
              v !== "A" && ctr != null && baselineCtr != null
                ? ctr - baselineCtr
                : null;
            const lowVolume = (row?.impressions ?? 0) < MIN_IMPRESSIONS_SIGNAL;
            return (
              <div
                key={v}
                className="rounded-xl border border-border bg-card p-6"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">Variante</div>
                  <Badge
                    variant="outline"
                    className="font-mono text-base"
                  >
                    {v}
                  </Badge>
                </div>

                <div className="mb-1 text-4xl font-medium tabular-nums">
                  {ctr != null ? `${ctr.toFixed(2)}%` : "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  CTR (Klick / Impression)
                </div>

                {diff != null && (
                  <div
                    className={`mt-2 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${
                      diff > 0
                        ? "bg-primary/10 text-primary"
                        : diff < 0
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {diff > 0 ? "+" : ""}
                    {diff.toFixed(2)} pp vs. A
                  </div>
                )}

                <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border/40 pt-4 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Impressionen</div>
                    <div className="mt-0.5 tabular-nums">
                      {(row?.impressions ?? 0).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Klicks</div>
                    <div className="mt-0.5 tabular-nums">
                      {(row?.clicks ?? 0).toLocaleString()}
                    </div>
                  </div>
                </div>

                {lowVolume && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    {`< ${MIN_IMPRESSIONS_SIGNAL} Impressionen — Ergebnis noch nicht aussagekräftig.`}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {!loading && rows && rows.length === 0 && !error && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Noch keine Sticky-Hint-Daten in den letzten {days} Tagen.
          </p>
        )}

        <p className="mt-6 text-[11px] text-muted-foreground">
          Quelle: <code>event_logs</code> (<code>sticky_hint_impression</code> + <code>sticky_hint_click</code>),
          gefiltert auf <code>ab_test = "sticky_hint_v1"</code>.
        </p>
      </div>
    </div>
  );
}
