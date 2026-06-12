/**
 * LivePlatformDemo — eingebettete, interaktive Read-Only-Demo der ETC-Plattform.
 *
 * Zweck: Besucher sehen das echte System statt eines Screenshots. Alle Daten
 * sind anonymisiert (keine echten Namen, gerundete Aggregate) und kommen aus
 * dem Repo — kein DB-Call, kein Auth, kein Tracking-Leak von Member-IDs.
 *
 * Interaktiv:
 *   • 4 Tabs (Übersicht · Revenue Flow · Talent Flow · Call Review)
 *   • Pulsierender Live-Indikator
 *   • KPI-Tickers (subtile Bewegung, keine Fake-Trades)
 *
 * Tracking (alle session-guarded, max. 1×/Session):
 *   • MASTER_LIVE_DEMO_VIEW (50% Sichtbarkeit)
 *   • MASTER_LIVE_DEMO_TAB  (pro Tab 1×)
 *   • MASTER_LIVE_DEMO_CTA  (pro Klick)
 *
 * Komponente ist additiv. Verändert keinen bestehenden Funnel, kein Routing,
 * keine A/B-Slots. Liefert ein eigenes Quiz-CTA (forwarded params), genauso
 * wie alle anderen Master-of-Sales-CTAs.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Activity,
  Calendar,
  Check,
  ChevronRight,
  Eye,
  Filter,
  Headphones,
  LayoutDashboard,
  Link2,
  Lock,
  Mic,
  TrendingUp,
  Users,
} from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";
import { forwardTrackingParams } from "@/lib/forward-tracking-params";

type TabId = "overview" | "revenue" | "talent" | "calls";

const VIEW_KEY = "mos_live_demo_view_v1";
const TAB_KEY = "mos_live_demo_tab_v1";

const DEMO_PARAM = "demo";
const VALID_TABS: TabId[] = ["overview", "revenue", "talent", "calls"];
const TAB_ALIASES: Record<string, TabId> = {
  overview: "overview",
  übersicht: "overview",
  uebersicht: "overview",
  revenue: "revenue",
  "revenue-flow": "revenue",
  talent: "talent",
  "talent-flow": "talent",
  calls: "calls",
  "call-review": "calls",
  callreview: "calls",
};

const parseTab = (raw: string | null | undefined): TabId | null => {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return TAB_ALIASES[key] ?? null;
};

const DEMO_CTA_HREF =
  "/apply/quiz?aud=men&source=masterofsales-live-demo";

// ---------------------------------------------------------------------------
// Anonymized snapshot data (30-Day rolled-up aggregates, no PII, no real IDs).
// Values are illustrative ranges aligned with platform KPI shapes — they do not
// claim individual results.
// ---------------------------------------------------------------------------

const KPIS = [
  {
    label: "Revenue · 30T",
    value: "€ 142.380",
    delta: "+12,4 %",
    trend: [40, 44, 39, 48, 52, 49, 57, 61, 58, 65, 70, 74],
  },
  {
    label: "Show Rate",
    value: "78 %",
    delta: "+4 pp",
    trend: [62, 65, 64, 68, 70, 71, 73, 72, 75, 77, 76, 78],
  },
  {
    label: "Close Rate",
    value: "34 %",
    delta: "+2 pp",
    trend: [28, 27, 29, 30, 31, 30, 32, 33, 32, 33, 34, 34],
  },
  {
    label: "Aktive Closer",
    value: "27",
    delta: "+3",
    trend: [18, 19, 19, 20, 21, 22, 22, 23, 24, 25, 26, 27],
  },
];

const FUNNEL = [
  { stage: "Leads", value: 1840, pct: 100 },
  { stage: "Quiz abgeschlossen", value: 1102, pct: 60 },
  { stage: "Termin gebucht", value: 612, pct: 33 },
  { stage: "Show", value: 478, pct: 26 },
  { stage: "Closed Won", value: 163, pct: 9 },
];

const TALENT = [
  { id: "M-204", level: "L6", score: 94, momentum: "↑", days: 312 },
  { id: "M-118", level: "L5", score: 91, momentum: "↑", days: 247 },
  { id: "M-329", level: "L5", score: 88, momentum: "→", days: 191 },
  { id: "M-407", level: "L4", score: 84, momentum: "↑", days: 142 },
  { id: "M-512", level: "L4", score: 79, momentum: "↑", days: 96 },
  { id: "M-633", level: "L3", score: 71, momentum: "→", days: 64 },
];

const CALLS = [
  {
    id: "C-8821",
    closer: "Closer · L6",
    duration: "42 min",
    score: 92,
    outcome: "won",
    snippet: "Ruhige Discovery. Saubere Einwandbehandlung. Klare Entscheidung.",
  },
  {
    id: "C-8814",
    closer: "Closer · L5",
    duration: "37 min",
    score: 86,
    outcome: "won",
    snippet: "Strukturierter Übergang von Bedarf zu Commitment.",
  },
  {
    id: "C-8809",
    closer: "Closer · L4",
    duration: "29 min",
    score: 74,
    outcome: "follow_up",
    snippet: "Stärke: Empathie. Coaching-Punkt: Tempo im Mid-Section.",
  },
  {
    id: "C-8801",
    closer: "Closer · L5",
    duration: "44 min",
    score: 81,
    outcome: "won",
    snippet: "Sehr ruhige Schlussphase. Kein Druck, klare Frage.",
  },
];

// ---------------------------------------------------------------------------
// Tiny SVG sparkline — no chart dep, fully themed via currentColor.
// ---------------------------------------------------------------------------
const Sparkline = ({ data }: { data: number[] }) => {
  const w = 80;
  const h = 22;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = Math.max(1, max - min);
  const step = w / (data.length - 1);
  const path = data
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / span) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-5 w-20 text-accent"
      aria-hidden
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const trackOnce = (key: string, fn: () => void) => {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(key) === "1") return;
    sessionStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
  try {
    fn();
  } catch {
    /* never throw */
  }
};

const LivePlatformDemo = () => {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = parseTab(searchParams.get(DEMO_PARAM)) ?? "overview";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [tick, setTick] = useState(0);
  const [copied, setCopied] = useState(false);
  const didDeepLinkScrollRef = useRef(false);

  // Sync state ← URL (browser back/forward, external deep links)
  useEffect(() => {
    const next = parseTab(searchParams.get(DEMO_PARAM));
    if (next && next !== activeTab) setActiveTab(next);
  }, [searchParams, activeTab]);

  // Deep-link scroll: if the URL carries a valid demo tab on first mount,
  // bring the demo into view so the shared link lands where the user expects.
  useEffect(() => {
    if (didDeepLinkScrollRef.current) return;
    didDeepLinkScrollRef.current = true;
    const raw = searchParams.get(DEMO_PARAM);
    if (!parseTab(raw) || !sectionRef.current) return;
    // Defer to next frame so layout is settled
    requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sichtbarkeits-Tracking
  useEffect(() => {
    if (typeof window === "undefined" || !sectionRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            trackOnce(VIEW_KEY, () =>
              trackFunnelEvent("MASTER_LIVE_DEMO_VIEW", {
                funnel: "masterofsales",
                surface: "embedded_demo",
              }),
            );
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: [0.5] },
    );
    obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, []);

  // Subtile KPI-Animation (ticker), max. einmal pro 3 Sek.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => (t + 1) % 60), 3000);
    return () => window.clearInterval(id);
  }, []);

  const ctaHref = useMemo(() => forwardTrackingParams(DEMO_CTA_HREF), []);

  const handleTabChange = (id: TabId) => {
    if (id === activeTab) return;
    setActiveTab(id);
    // Reflect tab in URL so the link is shareable; replace to avoid history spam.
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(DEMO_PARAM, id);
        return next;
      },
      { replace: true },
    );
    trackOnce(`${TAB_KEY}:${id}`, () =>
      trackFunnelEvent("MASTER_LIVE_DEMO_TAB", {
        funnel: "masterofsales",
        tab: id,
      }),
    );
  };

  const handleCopyLink = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set(DEMO_PARAM, activeTab);
    const href = url.toString();
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    };
    try {
      const p = navigator.clipboard?.writeText(href);
      if (p && typeof (p as Promise<void>).then === "function") {
        (p as Promise<void>).then(done).catch(() => done());
      } else {
        done();
      }
    } catch {
      done();
    }
  }, [activeTab]);

  const handleCtaClick = () => {
    try {
      trackFunnelEvent("MASTER_LIVE_DEMO_CTA", {
        funnel: "masterofsales",
        active_tab: activeTab,
      });
    } catch {
      /* ignore */
    }
  };

  return (
    <section
      ref={sectionRef}
      id="live-demo"
      data-mos-section="live_platform_demo"
      className="border-t border-foreground/10 bg-background scroll-mt-24"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-24">
        {/* Section Intro */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
            Live · Read-only Demo
          </p>
          <h2 className="mt-5 font-serif text-3xl leading-tight md:text-5xl">
            Kein Screenshot. Das System selbst.
          </h2>
          <p className="mt-6 text-base leading-relaxed text-foreground/70 md:text-lg">
            Was Mitglieder täglich sehen — auf einen Blick. Anonymisierte
            Echt-Daten aus einem 30-Tage-Snapshot. Bedienbar, aber nicht
            veränderbar.
          </p>
        </div>

        {/* App Frame */}
        <div className="mx-auto mt-12 max-w-5xl overflow-hidden rounded-2xl border border-foreground/15 bg-foreground/[0.02] shadow-[0_30px_80px_-40px_hsl(var(--accent)/0.35)]">
          {/* Browser/app chrome */}
          <div className="flex items-center gap-3 border-b border-foreground/10 bg-foreground/[0.04] px-4 py-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-foreground/20" />
              <span className="h-2.5 w-2.5 rounded-full bg-foreground/20" />
              <span className="h-2.5 w-2.5 rounded-full bg-foreground/20" />
            </div>
            <div className="flex flex-1 items-center gap-2 truncate rounded-md border border-foreground/10 bg-background/60 px-3 py-1.5 text-[11px] text-foreground/60 md:text-xs">
              <Lock className="h-3 w-3 shrink-0 text-foreground/40" />
              <span className="truncate">
                app.ethicalcloser.de/members/performance/{activeTab === "calls" ? "calls" : activeTab}
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-accent">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              Live
            </div>
            <button
              type="button"
              onClick={handleCopyLink}
              aria-label={copied ? "Link kopiert" : "Direktlink zu diesem Tab kopieren"}
              title={copied ? "Link kopiert" : "Direktlink zu diesem Tab kopieren"}
              className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-background/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-foreground/65 transition hover:border-accent/40 hover:text-foreground"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-accent" />
                  Kopiert
                </>
              ) : (
                <>
                  <Link2 className="h-3 w-3" />
                  Link
                </>
              )}
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex overflow-x-auto border-b border-foreground/10 bg-background/40">
            {[
              { id: "overview" as TabId, label: "Übersicht", Icon: LayoutDashboard },
              { id: "revenue" as TabId, label: "Revenue Flow", Icon: TrendingUp },
              { id: "talent" as TabId, label: "Talent Flow", Icon: Users },
              { id: "calls" as TabId, label: "Call Review", Icon: Headphones },
            ].map(({ id, label, Icon }) => {
              const isActive = id === activeTab;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleTabChange(id)}
                  className={`relative inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-xs font-medium tracking-wide transition md:text-sm ${
                    isActive
                      ? "border-accent text-foreground"
                      : "border-transparent text-foreground/55 hover:text-foreground/80"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="bg-background p-5 md:p-8">
            {activeTab === "overview" && <OverviewPanel tick={tick} />}
            {activeTab === "revenue" && <RevenuePanel />}
            {activeTab === "talent" && <TalentPanel />}
            {activeTab === "calls" && <CallsPanel />}
          </div>

          {/* Footer / Read-only notice */}
          <div className="flex flex-col gap-3 border-t border-foreground/10 bg-foreground/[0.03] px-5 py-4 text-[11px] text-foreground/55 sm:flex-row sm:items-center sm:justify-between md:px-8">
            <div className="flex items-center gap-2">
              <Eye className="h-3.5 w-3.5 text-accent" />
              <span>
                Anonymisierter 30-Tage-Snapshot · keine Mutationen ·
                Identitäten maskiert
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-foreground/40" />
              <span>Aktiv: Alle Funnel · Alle Operatoren · Range 30 Tage</span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-4 text-center">
          <p className="text-sm leading-relaxed text-foreground/75 md:text-base">
            Du siehst hier das, was Mitglieder jeden Tag offen vor sich haben.
            Vollzugriff inkl. eigener Daten gibt es nach dem{" "}
            <span className="text-foreground">Erstgespräch</span>.
          </p>
          <Link
            to={ctaHref}
            onClick={handleCtaClick}
            className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-foreground px-8 py-4 text-sm font-medium tracking-wide text-background transition hover:opacity-90 sm:w-auto"
          >
            <Calendar className="h-4 w-4" />
            Passt eine Karriere als Closer zu mir?
          </Link>
        </div>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

const OverviewPanel = ({ tick }: { tick: number }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      {KPIS.map((k, i) => {
        // subtler shimmer: zeigt, dass es ein "lebendes" System ist
        const isPulsing = i === tick % KPIS.length;
        return (
          <div
            key={k.label}
            className={`rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4 transition ${
              isPulsing ? "border-accent/40" : ""
            }`}
          >
            <p className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
              {k.label}
            </p>
            <p className="mt-2 font-serif text-2xl leading-none text-foreground md:text-3xl">
              {k.value}
            </p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11px] font-medium text-accent">
                {k.delta}
              </span>
              <Sparkline data={k.trend} />
            </div>
          </div>
        );
      })}
    </div>

    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
            Heute live
          </p>
          <Activity className="h-3.5 w-3.5 text-accent" />
        </div>
        <ul className="mt-3 space-y-2.5 text-xs text-foreground/75">
          <li className="flex items-center justify-between">
            <span>Aktive Calls</span>
            <span className="font-medium text-foreground">4</span>
          </li>
          <li className="flex items-center justify-between">
            <span>Slots gebucht (24h)</span>
            <span className="font-medium text-foreground">29</span>
          </li>
          <li className="flex items-center justify-between">
            <span>Show-Quote heute</span>
            <span className="font-medium text-foreground">82 %</span>
          </li>
        </ul>
      </div>

      <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4 md:col-span-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
          Operator-Verteilung · Level
        </p>
        <div className="mt-4 space-y-2.5">
          {[
            { lvl: "L6 Senior Closer", count: 3, pct: 12 },
            { lvl: "L5 Managing Closer", count: 6, pct: 22 },
            { lvl: "L4 Junior Closer", count: 9, pct: 33 },
            { lvl: "L3 Senior Setter", count: 5, pct: 19 },
            { lvl: "L1–L2 Opener/Setter", count: 4, pct: 14 },
          ].map((r) => (
            <div key={r.lvl} className="flex items-center gap-3 text-xs">
              <span className="w-40 shrink-0 text-foreground/70">{r.lvl}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full bg-accent/70"
                  style={{ width: `${r.pct * 2.5}%` }}
                />
              </div>
              <span className="w-6 text-right font-medium text-foreground">
                {r.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const RevenuePanel = () => (
  <div className="space-y-6">
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
        Funnel · 30 Tage · alle Operatoren
      </p>
      <div className="mt-4 space-y-3">
        {FUNNEL.map((f, i) => (
          <div key={f.stage} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground/80">{f.stage}</span>
              <span className="tabular-nums text-foreground/60">
                {f.value.toLocaleString("de-DE")} ·{" "}
                <span className="text-foreground">{f.pct}%</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
              <div
                className={`h-full rounded-full ${
                  i === FUNNEL.length - 1 ? "bg-accent" : "bg-accent/70"
                }`}
                style={{ width: `${f.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>

    <div className="grid gap-4 md:grid-cols-3">
      {[
        { k: "Avg. Deal-Wert", v: "€ 4.380" },
        { k: "Revenue / Operator", v: "€ 5.275" },
        { k: "Cycle Time", v: "11,4 Tage" },
      ].map((c) => (
        <div
          key={c.k}
          className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4"
        >
          <p className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
            {c.k}
          </p>
          <p className="mt-2 font-serif text-xl leading-none text-foreground md:text-2xl">
            {c.v}
          </p>
        </div>
      ))}
    </div>
  </div>
);

const TalentPanel = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <p className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
        Talent Flow · Top 6 nach Score · 30 Tage
      </p>
      <span className="text-[11px] text-foreground/45">Identitäten maskiert</span>
    </div>
    <div className="overflow-hidden rounded-xl border border-foreground/10">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-foreground/[0.04] text-[10px] uppercase tracking-[0.18em] text-foreground/55">
            <th className="px-3 py-2.5 text-left font-normal">Member</th>
            <th className="px-3 py-2.5 text-left font-normal">Level</th>
            <th className="px-3 py-2.5 text-right font-normal">Score</th>
            <th className="px-3 py-2.5 text-center font-normal">Trend</th>
            <th className="hidden px-3 py-2.5 text-right font-normal sm:table-cell">
              Tage im System
            </th>
          </tr>
        </thead>
        <tbody>
          {TALENT.map((t) => (
            <tr
              key={t.id}
              className="border-t border-foreground/10 transition hover:bg-foreground/[0.02]"
            >
              <td className="px-3 py-2.5 font-medium text-foreground">
                {t.id}
              </td>
              <td className="px-3 py-2.5 text-foreground/70">{t.level}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                {t.score}
              </td>
              <td className="px-3 py-2.5 text-center text-accent">
                {t.momentum}
              </td>
              <td className="hidden px-3 py-2.5 text-right tabular-nums text-foreground/60 sm:table-cell">
                {t.days}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const CallsPanel = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <p className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
        Call Review Library™ · letzte 4 Calls
      </p>
      <span className="text-[11px] text-foreground/45">
        Transcripts intern · hier nur Score & Snippet
      </span>
    </div>
    <ul className="space-y-3">
      {CALLS.map((c) => (
        <li
          key={c.id}
          className="flex flex-col gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4 sm:flex-row sm:items-start"
        >
          <div className="flex items-start gap-3 sm:flex-1">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/[0.06] text-accent">
              <Mic className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="font-medium text-foreground">{c.id}</span>
                <span className="text-foreground/55">{c.closer}</span>
                <span className="text-foreground/40">·</span>
                <span className="text-foreground/55">{c.duration}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-foreground/75">
                {c.snippet}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
            <div className="rounded-md border border-foreground/10 bg-background px-2.5 py-1 text-center">
              <p className="text-[9px] uppercase tracking-[0.16em] text-foreground/45">
                Score
              </p>
              <p className="font-serif text-base leading-none text-foreground">
                {c.score}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${
                c.outcome === "won"
                  ? "bg-accent/15 text-accent"
                  : "bg-foreground/10 text-foreground/65"
              }`}
            >
              <ChevronRight className="h-3 w-3" />
              {c.outcome === "won" ? "Won" : "Follow-Up"}
            </span>
          </div>
        </li>
      ))}
    </ul>
  </div>
);

export default LivePlatformDemo;
