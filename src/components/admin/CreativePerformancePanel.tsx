/**
 * CreativePerformancePanel — additive, read-only.
 * --------------------------------------------------------------
 * Aggregates `event_logs` by Creative (utm_content → utm_ad_name → utm_campaign
 * fallback) and shows the full coherence chain for each creative:
 *
 *   Creative → LP-Variante → Quiz-Variante → Completion · Calendly · Booking
 *
 * Strictly observational — no writes, no impact on Quiz / Booking / CRM /
 * GHL / Pixel. Mirrors the lens model used by `FunnelStepAnalyticsPanel`
 * (dedup per session_id) so numbers are directly comparable.
 *
 * Mount in admin tab; safe to remove without touching anything else.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Megaphone, RefreshCw } from "lucide-react";

interface Row {
  event_name: string;
  payload: {
    session_id?: string;
    utm_content?: string;
    ad_name?: string;
    utm_campaign?: string;
    utm_source?: string;
    ab_variant?: string;
    variant?: string;
    quiz_variant?: string;
    [k: string]: unknown;
  } | null;
}

const LP_EVENTS = ["PageView", "quiz_view", "funnel_view", "masterofsales_view", "home_view", "apply_view"];
const START_EVENTS = ["quiz_started", "QuizStarted", "QUIZ_STARTED",
  "MASTER_QUIZ_STARTED", "APPLY_QUIZ_STARTED", "MASTEROFSALES_QUIZ_STARTED"];
const COMPLETE_EVENTS = ["quiz_completed", "QuizCompleted", "QUIZ_COMPLETED",
  "MASTER_QUIZ_COMPLETED", "APPLY_QUIZ_COMPLETED"];
const CAL_EVENTS = ["booking_view", "booking_soft_frame_view", "calendar_added"];
const BOOK_EVENTS = ["appointment_booked", "public_booking_created",
  "BookingCreated", "Schedule", "booking_created", "booked"];

const ALL_EVENTS = Array.from(new Set([
  ...LP_EVENTS, ...START_EVENTS, ...COMPLETE_EVENTS, ...CAL_EVENTS, ...BOOK_EVENTS,
]));

interface CreativeAgg {
  creative: string;
  lpVariants: Set<string>;
  quizVariants: Set<string>;
  channels: Set<string>;
  lpViews: Set<string>;
  quizStarts: Set<string>;
  completions: Set<string>;
  calOpens: Set<string>;
  bookings: Set<string>;
}

function emptyAgg(name: string): CreativeAgg {
  return {
    creative: name,
    lpVariants: new Set(), quizVariants: new Set(), channels: new Set(),
    lpViews: new Set(), quizStarts: new Set(), completions: new Set(),
    calOpens: new Set(), bookings: new Set(),
  };
}

function resolveCreative(p: Row["payload"]): string {
  const pp = p ?? {};
  return (
    (typeof pp.utm_content === "string" && pp.utm_content) ||
    (typeof pp.ad_name === "string" && pp.ad_name) ||
    (typeof pp.utm_campaign === "string" && pp.utm_campaign) ||
    "(unattributed)"
  );
}

export default function CreativePerformancePanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinceDays, setSinceDays] = useState(14);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - sinceDays * 86_400_000);
      const PAGE = 1000;
      const HARD = 100_000;
      const acc: Row[] = [];
      for (let from = 0; from < HARD; from += PAGE) {
        const { data, error: qErr } = await supabase
          .from("event_logs")
          .select("event_name, payload")
          .gte("created_at", since.toISOString())
          .in("event_name", ALL_EVENTS)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (qErr) throw qErr;
        const batch = (data ?? []) as Row[];
        acc.push(...batch);
        if (batch.length < PAGE) break;
      }
      setRows(acc);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sinceDays]);

  const aggs = useMemo<CreativeAgg[]>(() => {
    const map = new Map<string, CreativeAgg>();
    const bump = (
      bucket: keyof Pick<CreativeAgg, "lpViews" | "quizStarts" | "completions" | "calOpens" | "bookings">,
      row: Row,
    ) => {
      const name = resolveCreative(row.payload);
      let a = map.get(name);
      if (!a) { a = emptyAgg(name); map.set(name, a); }
      const sid = row.payload?.session_id;
      if (sid && typeof sid === "string") a[bucket].add(sid);
      const p = row.payload ?? {};
      const lpVar = (typeof p.ab_variant === "string" && p.ab_variant) ||
                    (typeof p.variant === "string" && p.variant) || "";
      if (lpVar) a.lpVariants.add(lpVar);
      const qv = typeof p.quiz_variant === "string" ? p.quiz_variant : "";
      if (qv) a.quizVariants.add(qv);
      const ch = typeof p.utm_source === "string" ? p.utm_source : "";
      if (ch) a.channels.add(ch);
    };

    for (const r of rows) {
      if (LP_EVENTS.includes(r.event_name)) bump("lpViews", r);
      if (START_EVENTS.includes(r.event_name)) bump("quizStarts", r);
      if (COMPLETE_EVENTS.includes(r.event_name)) bump("completions", r);
      if (CAL_EVENTS.includes(r.event_name)) bump("calOpens", r);
      if (BOOK_EVENTS.includes(r.event_name)) bump("bookings", r);
    }
    return Array.from(map.values())
      .sort((a, b) => b.bookings.size - a.bookings.size || b.lpViews.size - a.lpViews.size);
  }, [rows]);

  const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          <div>
            <div className="font-medium">Per-Creative Performance</div>
            <div className="text-xs text-muted-foreground">
              Creative → LP-Variante → Quiz-Variante → Booking. Dedup pro session_id.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30, 90].map((d) => (
            <Button key={d} size="sm" variant={sinceDays === d ? "default" : "outline"}
                    onClick={() => setSinceDays(d)}>{d}d</Button>
          ))}
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="py-2">Creative</th>
              <th className="py-2">Channels</th>
              <th className="py-2">LP-Var.</th>
              <th className="py-2">Quiz-Var.</th>
              <th className="py-2 text-right">LP Views</th>
              <th className="py-2 text-right">Quiz Start</th>
              <th className="py-2 text-right">Completion</th>
              <th className="py-2 text-right">Calendar</th>
              <th className="py-2 text-right">Booking</th>
              <th className="py-2 text-right">Start %</th>
              <th className="py-2 text-right">Compl. %</th>
              <th className="py-2 text-right">Book %</th>
            </tr>
          </thead>
          <tbody>
            {aggs.length === 0 && !loading && (
              <tr><td colSpan={12} className="py-6 text-center text-muted-foreground">
                Keine Creative-Daten im Zeitraum.
              </td></tr>
            )}
            {aggs.map((a) => {
              const lp = a.lpViews.size;
              return (
                <tr key={a.creative} className="border-b border-border/40 align-top">
                  <td className="py-2 max-w-[200px] truncate" title={a.creative}>{a.creative}</td>
                  <td className="py-2">
                    {[...a.channels].slice(0, 3).map((c) =>
                      <Badge key={c} variant="outline" className="mr-1 text-[10px]">{c}</Badge>) || "—"}
                  </td>
                  <td className="py-2">
                    {[...a.lpVariants].slice(0, 3).map((v) =>
                      <Badge key={v} variant="secondary" className="mr-1 text-[10px]">{v}</Badge>)}
                  </td>
                  <td className="py-2">
                    {[...a.quizVariants].slice(0, 3).map((v) =>
                      <Badge key={v} variant="secondary" className="mr-1 text-[10px]">{v}</Badge>)}
                  </td>
                  <td className="py-2 text-right font-mono">{lp}</td>
                  <td className="py-2 text-right font-mono">{a.quizStarts.size}</td>
                  <td className="py-2 text-right font-mono">{a.completions.size}</td>
                  <td className="py-2 text-right font-mono">{a.calOpens.size}</td>
                  <td className="py-2 text-right font-mono font-semibold">{a.bookings.size}</td>
                  <td className="py-2 text-right text-muted-foreground font-mono">{pct(a.quizStarts.size, lp)}</td>
                  <td className="py-2 text-right text-muted-foreground font-mono">{pct(a.completions.size, lp)}</td>
                  <td className="py-2 text-right text-muted-foreground font-mono">{pct(a.bookings.size, lp)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-muted-foreground">
        Creative wird aus <code>utm_content</code> → <code>ad_name</code> → <code>utm_campaign</code> abgeleitet.
        Rein additiv — verändert keinerlei Quiz-, Booking-, CRM- oder Tracking-Logik.
      </div>
    </Card>
  );
}
