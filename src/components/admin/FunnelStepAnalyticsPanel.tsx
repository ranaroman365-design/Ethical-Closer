/**
 * FunnelStepAnalyticsPanel
 * --------------------------------------------------------------
 * Per-step funnel with drop-off, conversion vs. step 1, and delta vs. previous step.
 *
 * 9 canonical steps (deduped via session_id):
 *   1. LP Views          (PageView | quiz_view | funnel_view)
 *   2. Quiz Starts       (quiz_started | QUIZ_STARTED)
 *   3. Frage 1           (quiz_answer where payload.question = 0)
 *   4. Frage 2           (quiz_answer where payload.question = 1)
 *   5. Frage 3           (quiz_answer where payload.question = 2)
 *   6. Frage 4           (quiz_answer where payload.question = 3)
 *   7. Quiz Completion   (quiz_completed | QuizCompleted | QUIZ_COMPLETED)
 *   8. Calendar Open     (booking_view | booking_soft_frame_view | calendar_added)
 *   9. Booking           (appointment_booked | public_booking_created | BookingCreated | Schedule)
 *
 * Filters (client-side, against payload.*): Campaign · Ad Set · Ad · Creative
 *   (utm_content) · LP-Variante (ab_variant / variant) · Zeitraum (7/14/30/90d).
 *
 * Pure read of `event_logs` — no writes, no impact on Quiz/Booking/Calendly/CRM.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, TrendingDown, RefreshCw } from "lucide-react";
import { getApplyQuestions } from "@/lib/apply-qualification";

interface EventRow {
  event_name: string;
  payload: {
    session_id?: string;
    question?: number;
    question_index?: number;
    question_number?: number;
    step?: number;
    utm_campaign?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_content?: string;
    utm_term?: string;
    ad_name?: string;
    adset_name?: string;
    creative_id?: string;
    ab_variant?: string;
    variant?: string;
    [k: string]: unknown;
  } | null;
}

type StepDef = {
  key: string;
  label: string;
  events: readonly string[];
  qFilter: number | null;
};

// Base steps without per-question buckets — those are generated dynamically
// from the actual quiz length (V1 live = 7; V2 = 9, opt-in only) and from observed STEP_N events
// in event_logs, so the dashboard adapts automatically if questions are added.
const BASE_PRE: StepDef[] = [
  { key: "lp_views", label: "LP Views",
    events: ["PageView", "quiz_view", "funnel_view", "masterofsales_view", "home_view", "apply_view"],
    qFilter: null },
  { key: "quiz_starts", label: "Quiz Starts",
    events: ["quiz_started", "quiz_started_men", "quiz_started_women",
             "QUIZ_STARTED", "QuizStarted",
             "MASTER_QUIZ_STARTED", "MASTER_QUIZ_START",
             "MASTEROFSALES_QUIZ_STARTED", "APPLY_QUIZ_STARTED"],
    qFilter: null },
];
const BASE_POST: StepDef[] = [
  { key: "completion", label: "Quiz Completion",
    events: ["quiz_completed", "quiz_completed_men", "quiz_completed_women",
             "QUIZ_COMPLETED", "QuizCompleted",
             "MASTER_QUIZ_COMPLETED", "APPLY_QUIZ_COMPLETED"], qFilter: null },
  { key: "calendar_open", label: "Calendly Open",
    events: ["booking_view", "booking_soft_frame_view", "calendar_added"], qFilter: null },
  { key: "booking", label: "Booking",
    events: ["appointment_booked", "public_booking_created", "BookingCreated",
             "Schedule", "booking_created", "booked"], qFilter: null },
];

function buildQuestionStep(n: number): StepDef {
  return {
    key: `q${n}`,
    label: `Frage ${n}`,
    events: ["quiz_answer", "booking_step_progress",
             `MASTER_QUIZ_STEP_${n}`, `APPLY_QUIZ_STEP_${n}`],
    qFilter: n,
  };
}

// Worst-case ceiling we ever pre-load events for (covers future expansions).
const MAX_QUESTIONS_CEILING = 12;
const QUESTION_EVENT_POOL = Array.from({ length: MAX_QUESTIONS_CEILING }, (_, i) => [
  `MASTER_QUIZ_STEP_${i + 1}`,
  `APPLY_QUIZ_STEP_${i + 1}`,
]).flat();

const ALL_EVENTS = Array.from(
  new Set([
    ...BASE_PRE.flatMap((s) => s.events),
    ...BASE_POST.flatMap((s) => s.events),
    "quiz_answer",
    "booking_step_progress",
    ...QUESTION_EVENT_POOL,
  ]),
);

type FilterKey = "utm_campaign" | "adset_name" | "ad_name" | "utm_content" | "ab_variant";
const ANY = "__any__";

export default function FunnelStepAnalyticsPanel() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinceDays, setSinceDays] = useState(14);
  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    utm_campaign: ANY,
    adset_name: ANY,
    ad_name: ANY,
    utm_content: ANY,
    ab_variant: ANY,
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
      // Paginate to bypass the implicit 1000-row PostgREST cap.
      const PAGE = 1000;
      const HARD_CAP = 200_000;
      const acc: EventRow[] = [];
      for (let from = 0; from < HARD_CAP; from += PAGE) {
        const { data, error: qErr } = await supabase
          .from("event_logs")
          .select("event_name, payload")
          .gte("created_at", since.toISOString())
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

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sinceDays]);

  // Build filter option lists from raw payloads (pre-filter).
  const options = useMemo(() => {
    const o: Record<FilterKey, Set<string>> = {
      utm_campaign: new Set(), adset_name: new Set(), ad_name: new Set(),
      utm_content: new Set(), ab_variant: new Set(),
    };
    for (const r of rows) {
      const p = r.payload ?? {};
      if (typeof p.utm_campaign === "string" && p.utm_campaign) o.utm_campaign.add(p.utm_campaign);
      if (typeof p.adset_name === "string" && p.adset_name) o.adset_name.add(p.adset_name);
      if (typeof p.ad_name === "string" && p.ad_name) o.ad_name.add(p.ad_name);
      if (typeof p.utm_content === "string" && p.utm_content) o.utm_content.add(p.utm_content);
      const v = (typeof p.ab_variant === "string" && p.ab_variant) || (typeof p.variant === "string" && p.variant) || "";
      if (v) o.ab_variant.add(v);
    }
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.from(v).sort()])) as Record<FilterKey, string[]>;
  }, [rows]);

  // Live quiz length is the SOURCE OF TRUTH for the number of Frage-steps.
  // We do NOT expand based on observed STEP_N events any more — stray
  // MASTER_QUIZ_STEP_8/9 from legacy MOS-only sessions would otherwise
  // inflate the dashboard to "Frage 1–10" although the real apply quiz
  // only has 7 questions. Source: getApplyQuestions(false).length.
  const dynamicSteps = useMemo<StepDef[]>(() => {
    let fromQuiz = 7;
    try { fromQuiz = getApplyQuestions(false).length; } catch { fromQuiz = 7; }
    const total = Math.min(MAX_QUESTIONS_CEILING, Math.max(1, fromQuiz));
    const qSteps = Array.from({ length: total }, (_, i) => buildQuestionStep(i + 1));
    return [...BASE_PRE, ...qSteps, ...BASE_POST];
  }, []);

  // Apply filters + dedupe per step by a stable IDENTITY (master_funnel_id →
  // session_id → lead_id → row-fallback). Then enforce MONOTONIC clamp so a
  // downstream stage can never be larger than its upstream stage (LP ≥ Start
  // ≥ Step_1 ≥ … ≥ Complete ≥ Calendly ≥ Booking). Without this the panel
  // could mathematically show e.g. Completion=45 / Step_1=38, which is the
  // exact bug master_tracking_v2 was designed to eliminate.
  const stepCounts = useMemo(() => {
    const matchesFilters = (p: EventRow["payload"]): boolean => {
      const pp = p ?? {};
      if (filters.utm_campaign !== ANY && pp.utm_campaign !== filters.utm_campaign) return false;
      if (filters.adset_name !== ANY && pp.adset_name !== filters.adset_name) return false;
      if (filters.ad_name !== ANY && pp.ad_name !== filters.ad_name) return false;
      if (filters.utm_content !== ANY && pp.utm_content !== filters.utm_content) return false;
      if (filters.ab_variant !== ANY) {
        const v = (typeof pp.ab_variant === "string" && pp.ab_variant) || (typeof pp.variant === "string" && pp.variant) || "";
        if (v !== filters.ab_variant) return false;
      }
      return true;
    };

    // Question/step matcher: handle payload.question (0- or 1-indexed),
    // payload.step (0- or 1-indexed), and event-name-encoded step (MASTER_QUIZ_STEP_N).
    const matchesQuestion = (r: EventRow, target: number): boolean => {
      const p = r.payload ?? {};
      const q = (p as any).question;
      const qi = (p as any).question_index;
      const qn = (p as any).question_number;
      const s = (p as any).step;
      const fromName = /_STEP_(\d+)$/.exec(r.event_name)?.[1];
      const candidates = new Set<number>();
      if (typeof q === "number") { candidates.add(q); candidates.add(q + 1); }
      if (typeof qi === "number") { candidates.add(qi + 1); }
      if (typeof qn === "number") { candidates.add(qn); }
      if (typeof s === "number") { candidates.add(s); candidates.add(s + 1); }
      if (fromName) candidates.add(Number(fromName));
      if (/_STEP_\d+$/.test(r.event_name)) return Number(fromName) === target;
      return candidates.has(target);
    };

    // Stable identity for dedup (priority: funnel_id > session_id > lead_id).
    // Rows that have NONE of these collapse into ONE "unknown" bucket
    // (NOT a per-row fallback). The per-row fallback was causing massive
    // inflation: e.g. ~5.5k anon LP-view rows where payload.lead_id is JSON
    // null produced ~5.5k distinct identities, pushing "LP Views" to 5240
    // while quiz_started (which has real session_id) stayed at 52.
    const identityOf = (r: EventRow): string | null => {
      const p = (r.payload ?? {}) as Record<string, unknown>;
      const fid = p.master_funnel_id;
      if (typeof fid === "string" && fid) return `f:${fid}`;
      const sid = p.session_id;
      if (typeof sid === "string" && sid) return `s:${sid}`;
      const lid = p.lead_id;
      if (typeof lid === "string" && lid) return `l:${lid}`;
      return null;
    };

    // 1) Per step: dedup by real identity; track event count + unidentified rows.
    const rawIdentities: Set<string>[] = [];
    const eventCounts: number[] = [];
    const unidentifiedCounts: number[] = [];
    dynamicSteps.forEach((step) => {
      const ids = new Set<string>();
      let evc = 0;
      let unid = 0;
      rows.forEach((r) => {
        if (!step.events.includes(r.event_name as never)) return;
        if (!matchesFilters(r.payload)) return;
        if (step.qFilter !== null && !matchesQuestion(r, step.qFilter)) return;
        evc++;
        const id = identityOf(r);
        if (id) ids.add(id);
        else unid++;
      });
      // Collapse all unidentified rows into ONE bucket so they remain
      // visible (≥1) without per-row inflation.
      if (unid > 0) ids.add("__unknown__");
      rawIdentities.push(ids);
      eventCounts.push(evc);
      unidentifiedCounts.push(unid);
    });

    // 2) Monotonic clamp by intersection (downstream ⊆ upstream).
    const clamped: Set<string>[] = [];
    for (let i = 0; i < rawIdentities.length; i++) {
      const down = rawIdentities[i];
      if (i === 0) { clamped.push(down); continue; }
      const up = clamped[i - 1];
      const intersect = new Set<string>();
      for (const k of down) if (up.has(k)) intersect.add(k);
      if (intersect.size > 0) {
        clamped.push(intersect);
      } else if (down.size > up.size) {
        const out = new Set<string>();
        let n = 0;
        for (const k of down) { if (n++ >= up.size) break; out.add(k); }
        clamped.push(out);
      } else {
        clamped.push(down);
      }
    }

    return dynamicSteps.map((step, i) => {
      const visitors = clamped[i].size;
      const eventCount = eventCounts[i];
      const unidentified = unidentifiedCounts[i];
      const sidCoverage = eventCount > 0 ? 1 - unidentified / eventCount : 1;
      return { ...step, visitors, eventCount, unidentified, sidCoverage };
    });
  }, [rows, filters, dynamicSteps]);


  const lpViews = stepCounts[0]?.visitors ?? 0;
  const fmtPct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : "—");

  const resetFilters = () => setFilters({
    utm_campaign: ANY, adset_name: ANY, ad_name: ANY, utm_content: ANY, ab_variant: ANY,
  });

  const setFilter = (k: FilterKey, v: string) => setFilters((s) => ({ ...s, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-primary" />
            Funnel-Step Analytics
          </h2>
          <p className="text-xs text-muted-foreground">
            Pro-Schritt-Drop-Off · dedupliziert per Session · gefiltert nach Campaign/AdSet/Ad/Creative/Variante.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30, 90].map((d) => (
            <Button key={d} size="sm" variant={sinceDays === d ? "default" : "outline"} onClick={() => setSinceDays(d)}>
              {d}d
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} /> Aktualisieren
          </Button>
        </div>
      </div>

      <Card className="p-3 flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {([
          ["utm_campaign", "Campaign"],
          ["adset_name", "Ad Set"],
          ["ad_name", "Ad"],
          ["utm_content", "Creative"],
          ["ab_variant", "LP Variante"],
        ] as Array<[FilterKey, string]>).map(([k, label]) => (
          <Select key={k} value={filters[k]} onValueChange={(v) => setFilter(k, v)}>
            <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder={label} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{label}: alle</SelectItem>
              {(options[k] ?? []).map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        <Button size="sm" variant="ghost" onClick={resetFilters}>Filter zurücksetzen</Button>
      </Card>

      {error && <Card className="p-3 border-destructive/40 text-sm text-destructive">{error}</Card>}

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2">Schritt</th>
              <th className="text-left px-4 py-2">Eventname(n)</th>
              <th className="text-right px-4 py-2">Events</th>
              <th className="text-right px-4 py-2">Sessions</th>
              <th className="text-right px-4 py-2">Conv. vs. LP</th>
              <th className="text-right px-4 py-2">Drop-Off vs. Vorstufe</th>
              <th className="text-right px-4 py-2">Δ vs. Vorstufe</th>
              <th className="px-4 py-2">Verlauf</th>
            </tr>
          </thead>
          <tbody>
            {stepCounts.map((s, i) => {
              const prev = i > 0 ? stepCounts[i - 1].visitors : s.visitors;
              const convVsLp = lpViews > 0 ? s.visitors / lpViews : 0;
              const dropOff = prev > 0 ? Math.max(0, (prev - s.visitors) / prev) : 0;
              const deltaAbs = s.visitors - prev;
              const widthPct = lpViews > 0 ? Math.max(2, (s.visitors / lpViews) * 100) : 0;
              const ampel =
                i === 0 ? "" :
                dropOff > 0.6 ? "text-rose-600" :
                dropOff > 0.35 ? "text-amber-600" : "text-emerald-600";
              const eventNames = s.events.join(" · ");
              return (
                <tr key={s.key} className="border-t border-border/40">
                  <td className="px-4 py-2 font-medium align-top">
                    <span className="text-muted-foreground mr-2">{i + 1}.</span>{s.label}
                    {s.sidCoverage < 0.5 && (
                      <Badge variant="outline" className="ml-2 text-[9px]" title={`Nur ${(s.sidCoverage * 100).toFixed(0)}% der Events haben eine Identität (funnel/session/lead). Rest wird zu 1 Unknown-Bucket gefasst statt pro Row gezählt.`}>
                        id {(s.sidCoverage * 100).toFixed(0)}%
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 align-top">
                    <code className="text-[10px] text-muted-foreground break-all" title={eventNames}>
                      {s.events.length <= 2 ? eventNames : `${s.events.slice(0, 2).join(" · ")} +${s.events.length - 2}`}
                    </code>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-muted-foreground" title="Anzahl Roh-Events (vor Dedup)">
                    {s.eventCount.toLocaleString("de-DE")}
                  </td>
                  <td className="px-4 py-2 text-right font-mono" title="Unique Sessions/Funnel-IDs (nach Dedup, monotonisch geklemmt)">
                    {s.visitors.toLocaleString("de-DE")}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{i === 0 ? "—" : fmtPct(convVsLp)}</td>
                  <td className={`px-4 py-2 text-right font-mono ${ampel}`}>{i === 0 ? "—" : fmtPct(dropOff)}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    {i === 0 ? "—" : (
                      <Badge variant={deltaAbs >= 0 ? "outline" : "secondary"} className={deltaAbs < 0 ? "text-rose-600" : ""}>
                        {deltaAbs > 0 ? "+" : ""}{deltaAbs.toLocaleString("de-DE")}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="h-2 bg-muted rounded overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${widthPct}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <PerAnswerBreakdown sinceDays={sinceDays} filters={filters} />

      <div className="text-[11px] text-muted-foreground">
        Ampel auf Drop-Off: 🟢 ≤35% · 🟡 35–60% · 🔴 &gt;60%. Sessions werden über
        <code className="px-1 bg-muted rounded mx-1">master_funnel_id › session_id › lead_id</code>
        dedupliziert; Events ohne Identität werden zu einem einzigen Unknown-Bucket gefasst
        (keine Pro-Row-Inflation mehr). Quiz-Frage-Steps gespiegelt an der Live-Quizlänge
        (<code>getApplyQuestions(false).length</code>) — keine stray STEP_8/9 mehr.
        Bestehende Quiz-, Booking-, Calendly- und CRM-Logik unverändert.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PerAnswerBreakdown — Antwortverteilung je Quizfrage (additiv, read-only).
// Quelle: event_logs.event_name='quiz_answer' (Fix B).
// ─────────────────────────────────────────────────────────────────────
type FiltersShape = {
  utm_campaign: string; adset_name: string; ad_name: string;
  utm_content: string; ab_variant: string;
};

function PerAnswerBreakdown({ sinceDays, filters }: { sinceDays: number; filters: FiltersShape }) {
  type AnsRow = {
    payload: {
      session_id?: string;
      question_index?: number;
      question_number?: number;
      question_text?: string;
      option_index?: number;
      option_label?: string;
      value?: number;
      utm_campaign?: string;
      adset_name?: string;
      ad_name?: string;
      utm_content?: string;
      ab_variant?: string;
    } | null;
  };
  type ConvRow = { payload: { session_id?: string; lead_quality?: string; bucket?: string } | null };
  const [rows, setRows] = useState<AnsRow[]>([]);
  const [bookingSessions, setBookingSessions] = useState<Set<string>>(new Set());
  const [hqSessions, setHqSessions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
      const PAGE = 1000;
      const HARD_CAP = 100_000;

      const loadPaged = async <T,>(eventNames: string[]): Promise<T[]> => {
        const acc: T[] = [];
        for (let from = 0; from < HARD_CAP; from += PAGE) {
          const { data, error } = await supabase
            .from("event_logs")
            .select("payload")
            .in("event_name", eventNames)
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .range(from, from + PAGE - 1);
          if (error) break;
          const batch = (data ?? []) as T[];
          acc.push(...batch);
          if (batch.length < PAGE) break;
        }
        return acc;
      };

      const [answers, bookings, completions] = await Promise.all([
        loadPaged<AnsRow>(["quiz_answer"]),
        loadPaged<ConvRow>([
          "appointment_booked", "public_booking_created", "BookingCreated",
          "Schedule", "booking_created", "booked",
        ]),
        loadPaged<ConvRow>([
          "quiz_completed", "quiz_completed_men", "quiz_completed_women",
          "QUIZ_COMPLETED", "QuizCompleted",
          "MASTER_QUIZ_COMPLETED", "APPLY_QUIZ_COMPLETED",
        ]),
      ]);

      const bk = new Set<string>();
      for (const r of bookings) {
        const sid = r.payload?.session_id;
        if (sid) bk.add(sid);
      }
      // High-Quality-Lead Proxy: Quiz-Completion mit bucket='high' oder lead_quality='A'.
      // (Solange CRM-Closed-Signal nicht zuverlässig per session_id joinbar ist,
      //  liefert dies das beste verfügbare Quality-Signal.)
      const hq = new Set<string>();
      for (const r of completions) {
        const sid = r.payload?.session_id;
        if (!sid) continue;
        const b = (r.payload?.bucket ?? "").toLowerCase();
        const q = (r.payload?.lead_quality ?? "").toUpperCase();
        if (b === "high" || q === "A") hq.add(sid);
      }
      if (!cancelled) {
        setRows(answers);
        setBookingSessions(bk);
        setHqSessions(hq);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sinceDays]);

  const ANY_LOCAL = "__any__";
  const grouped = useMemo(() => {
    type Opt = { count: number; value: number | null; bookSessions: Set<string>; hqSessions: Set<string>; sessions: Set<string> };
    const map = new Map<number, { text: string; total: number; opts: Map<string, Opt> }>();
    for (const r of rows) {
      const p = r.payload ?? {};
      if (filters.utm_campaign !== ANY_LOCAL && p.utm_campaign !== filters.utm_campaign) continue;
      if (filters.adset_name !== ANY_LOCAL && p.adset_name !== filters.adset_name) continue;
      if (filters.ad_name !== ANY_LOCAL && p.ad_name !== filters.ad_name) continue;
      if (filters.utm_content !== ANY_LOCAL && p.utm_content !== filters.utm_content) continue;
      if (filters.ab_variant !== ANY_LOCAL && p.ab_variant !== filters.ab_variant) continue;
      const qi = typeof p.question_index === "number" ? p.question_index
               : typeof p.question_number === "number" ? p.question_number - 1
               : -1;
      if (qi < 0) continue;
      const bucket = map.get(qi) ?? { text: p.question_text ?? `Frage ${qi + 1}`, total: 0, opts: new Map<string, Opt>() };
      bucket.text = p.question_text ?? bucket.text;
      bucket.total++;
      const label = p.option_label ?? `Option ${(p.option_index ?? 0) + 1}`;
      const cur = bucket.opts.get(label) ?? {
        count: 0,
        value: typeof p.value === "number" ? p.value : null,
        bookSessions: new Set<string>(),
        hqSessions: new Set<string>(),
        sessions: new Set<string>(),
      };
      cur.count++;
      const sid = p.session_id;
      if (sid) {
        cur.sessions.add(sid);
        if (bookingSessions.has(sid)) cur.bookSessions.add(sid);
        if (hqSessions.has(sid)) cur.hqSessions.add(sid);
      }
      bucket.opts.set(label, cur);
      map.set(qi, bucket);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [rows, filters, bookingSessions, hqSessions]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold">Antwort-Verteilung je Frage</h3>
          <p className="text-[11px] text-muted-foreground">
            Quelle: <code>quiz_answer</code> Events. Pro Option: Count · % · Booking-Rate · High-Quality-Rate
            (Quality = quiz_completed bucket=high / lead_quality=A; CRM-Closed wird ergänzt, sobald per session_id joinbar).
          </p>
        </div>
        {loading && <span className="text-xs text-muted-foreground">Lade…</span>}
      </div>
      {!loading && grouped.length === 0 && (
        <div className="text-xs text-muted-foreground">
          Noch keine <code>quiz_answer</code> Events im gewählten Zeitraum. Tracking läuft ab Deploy —
          erste Daten erscheinen, sobald Nutzer das Quiz beantworten.
        </div>
      )}
      {grouped.map(([qi, b]) => {
        const opts = Array.from(b.opts.entries()).sort((a, b) => b[1].count - a[1].count);
        return (
          <div key={qi} className="border-t border-border/40 pt-2">
            <div className="text-sm font-medium">
              Frage {qi + 1}: <span className="text-muted-foreground">{b.text}</span>
              <Badge variant="outline" className="ml-2 text-[10px]">n={b.total}</Badge>
            </div>
            <div className="mt-1 space-y-1">
              {opts.map(([label, opt]) => {
                const pct = b.total > 0 ? (opt.count / b.total) * 100 : 0;
                const sCount = opt.sessions.size;
                const bookRate = sCount > 0 ? (opt.bookSessions.size / sCount) * 100 : 0;
                const hqRate = sCount > 0 ? (opt.hqSessions.size / sCount) * 100 : 0;
                return (
                  <div key={label} className="flex items-center gap-2 text-xs">
                    <div className="flex-1 truncate">
                      {label}
                      {opt.value !== null && <span className="text-muted-foreground"> · score {opt.value}</span>}
                    </div>
                    <div className="w-32 h-2 bg-muted rounded overflow-hidden">
                      <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-20 text-right font-mono">{opt.count} · {pct.toFixed(1)}%</div>
                    <div className="w-24 text-right font-mono text-emerald-600" title="Booking-Rate (Sessions, die nach dieser Antwort gebucht haben / Sessions mit dieser Antwort)">
                      Bk {bookRate.toFixed(1)}%
                    </div>
                    <div className="w-24 text-right font-mono text-primary" title="High-Quality-Lead-Rate (bucket=high / lead_quality=A unter Sessions mit dieser Antwort)">
                      HQ {hqRate.toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </Card>
  );
}
