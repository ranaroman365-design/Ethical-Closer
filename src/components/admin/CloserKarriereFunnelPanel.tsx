/**
 * CloserKarriereFunnelPanel — read-only step funnel for /closer-karriere.
 *
 * 11-step funnel, deduped by session_id (or master_funnel_id / lead_id).
 * Pulls only from `event_logs`. No writes. No schema changes.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, TrendingDown } from "lucide-react";

interface EventRow {
  event_name: string;
  payload: Record<string, unknown> | null;
}

const STEPS: { key: string; label: string; events: string[] }[] = [
  { key: "lp_view", label: "LP View", events: ["closer_karriere_view"] },
  { key: "cta", label: "CTA Click", events: ["closer_karriere_cta_click", "closer_karriere_sticky_cta_click"] },
  { key: "form_view", label: "Form View", events: ["closer_karriere_form_view"] },
  { key: "form_submit", label: "Form Submit", events: ["closer_karriere_form_submit"] },
  { key: "sb_offer_view", label: "Salesbook Offer View", events: ["closer_karriere_salesbook_offer_view"] },
  { key: "sb_offer_yes", label: "Salesbook Yes", events: ["closer_karriere_salesbook_offer_yes"] },
  { key: "wa_click", label: "WhatsApp Click", events: ["closer_karriere_salesbook_whatsapp_click"] },
  { key: "thankyou", label: "Thank You View", events: ["closer_karriere_thankyou_view"] },
  {
    key: "quiz_start",
    label: "Quiz Start",
    events: ["quiz_started", "QUIZ_STARTED", "QuizStarted", "APPLY_QUIZ_STARTED"],
  },
  {
    key: "quiz_complete",
    label: "Quiz Complete",
    events: ["quiz_completed", "QUIZ_COMPLETED", "QuizCompleted", "APPLY_QUIZ_COMPLETED"],
  },
  {
    key: "booking",
    label: "Booking",
    events: ["appointment_booked", "public_booking_created", "BookingCreated", "booking_created", "booked"],
  },
];

const ALL_EVENTS = Array.from(new Set(STEPS.flatMap((s) => s.events)));

function fmt(n: number) {
  return n.toLocaleString("de-DE");
}
function pct(n: number) {
  return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : "—";
}

function identityOf(r: EventRow): string {
  const p = (r.payload ?? {}) as Record<string, unknown>;
  const fid = p.master_funnel_id;
  if (typeof fid === "string" && fid) return `f:${fid}`;
  const sid = p.session_id;
  if (typeof sid === "string" && sid) return `s:${sid}`;
  const lid = p.lead_id;
  if (typeof lid === "string" && lid) return `l:${lid}`;
  return "__unattributed__";
}

export default function CloserKarriereFunnelPanel() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinceDays, setSinceDays] = useState(14);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();
      const PAGE = 1000;
      const HARD_CAP = 200_000;
      const acc: EventRow[] = [];
      for (let from = 0; from < HARD_CAP; from += PAGE) {
        const { data, error: qErr } = await supabase
          .from("event_logs")
          .select("event_name, payload")
          .gte("created_at", since)
          .in("event_name", ALL_EVENTS)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (qErr) throw qErr;
        const batch = (data ?? []) as EventRow[];
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

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinceDays]);

  const stepData = useMemo(() => {
    // For downstream steps (quiz/booking) we restrict the identity space to
    // sessions that ALSO produced a closer_karriere_* event, so we don't
    // mix /masterofsales or /apply traffic into the Closer-Karriere funnel.
    const ckSessions = new Set<string>();
    for (const r of rows) {
      if (typeof r.event_name === "string" && r.event_name.startsWith("closer_karriere_")) {
        ckSessions.add(identityOf(r));
      }
    }

    const isDownstream = (key: string) =>
      key === "quiz_start" || key === "quiz_complete" || key === "booking";

    const rawIds: Set<string>[] = STEPS.map((step) => {
      const ids = new Set<string>();
      for (const r of rows) {
        if (!step.events.includes(r.event_name)) continue;
        const id = identityOf(r);
        if (isDownstream(step.key) && !ckSessions.has(id)) continue;
        ids.add(id);
      }
      return ids;
    });

    // Monotonic clamp via intersection (downstream ⊆ upstream).
    const clamped: Set<string>[] = [];
    rawIds.forEach((down, i) => {
      if (i === 0) return clamped.push(down);
      const up = clamped[i - 1];
      const inter = new Set<string>();
      for (const k of down) if (up.has(k)) inter.add(k);
      if (inter.size > 0) clamped.push(inter);
      else if (down.size > up.size) {
        const out = new Set<string>();
        let n = 0;
        for (const k of down) {
          if (n++ >= up.size) break;
          out.add(k);
        }
        clamped.push(out);
      } else clamped.push(down);
    });

    return STEPS.map((s, i) => {
      const eventCount = rows.filter((r) => s.events.includes(r.event_name)).length;
      const sessions = clamped[i].size;
      const unattributed = clamped[i].has("__unattributed__") ? 1 : 0;
      return { ...s, eventCount, sessions, unattributed };
    });
  }, [rows]);

  const lp = stepData[0]?.sessions ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <TrendingDown className="h-4 w-4 text-primary" />
            Closer Karriere Funnel
          </h2>
          <p className="text-xs text-muted-foreground">
            <code className="text-[10px]">/closer-karriere</code> — pro Schritt deduped via
            session_id · downstream nur Sessions, die auch ein closer_karriere_* Event hatten.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30, 90].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={sinceDays === d ? "default" : "outline"}
              onClick={() => setSinceDays(d)}
            >
              {d}d
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-1 h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Aktualisieren
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40 p-3 text-sm text-destructive">{error}</Card>
      )}

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Schritt</th>
              <th className="px-4 py-2 text-left">Event(s)</th>
              <th className="px-4 py-2 text-right">Events</th>
              <th className="px-4 py-2 text-right">Sessions</th>
              <th className="px-4 py-2 text-right">Conv. vs LP</th>
              <th className="px-4 py-2 text-right">Drop-Off vs Vorstufe</th>
              <th className="px-4 py-2 text-right">Δ vs Vorstufe</th>
              <th className="px-4 py-2">Verlauf</th>
            </tr>
          </thead>
          <tbody>
            {stepData.map((s, i) => {
              const prev = i > 0 ? stepData[i - 1].sessions : s.sessions;
              const convVsLp = lp > 0 ? s.sessions / lp : 0;
              const drop = prev > 0 ? Math.max(0, (prev - s.sessions) / prev) : 0;
              const delta = s.sessions - prev;
              const width = lp > 0 ? Math.max(2, (s.sessions / lp) * 100) : 0;
              const ampel =
                i === 0
                  ? ""
                  : drop > 0.6
                  ? "text-rose-600"
                  : drop > 0.35
                  ? "text-amber-600"
                  : "text-emerald-600";
              return (
                <tr key={s.key} className="border-t border-border/40">
                  <td className="px-4 py-2 align-top font-medium">
                    <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                    {s.label}
                    {s.unattributed > 0 && (
                      <Badge variant="outline" className="ml-2 text-[9px]">unattributed</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 align-top">
                    <code className="break-all text-[10px] text-muted-foreground" title={s.events.join(" · ")}>
                      {s.events.length <= 2
                        ? s.events.join(" · ")
                        : `${s.events.slice(0, 2).join(" · ")} +${s.events.length - 2}`}
                    </code>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-muted-foreground">
                    {fmt(s.eventCount)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-semibold">
                    {fmt(s.sessions)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{pct(convVsLp)}</td>
                  <td className={`px-4 py-2 text-right font-mono ${ampel}`}>
                    {i === 0 ? "—" : pct(drop)}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono ${ampel}`}>
                    {i === 0 ? "—" : (delta >= 0 ? "+" : "") + fmt(delta)}
                  </td>
                  <td className="px-4 py-2">
                    <div className="h-2 w-full rounded bg-muted">
                      <div
                        className="h-2 rounded bg-primary/70"
                        style={{ width: `${Math.min(100, width)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
