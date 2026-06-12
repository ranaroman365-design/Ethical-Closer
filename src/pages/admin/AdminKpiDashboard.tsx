import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Sparkles } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell,
} from "recharts";
import { useKpiDashboard } from "@/hooks/useKpiDashboard";

/**
 * /admin/community-kpis — Live KPI dashboard for Admin + Director (L7+).
 * 30s polling. RLS-enforced via is_kpi_viewer() in DB.
 */
export default function AdminKpiDashboard() {
  const { overview, series, cohorts, funnel, levels, top, loading, forbidden, error, refresh } = useKpiDashboard();

  const insights = useMemo(() => {
    const out: string[] = [];
    if (!series.length || !funnel) return out;
    const last7 = series.slice(-7).reduce((a, b) => a + b.dau, 0) / 7;
    const prev7 = series.slice(-14, -7).reduce((a, b) => a + b.dau, 0) / 7;
    if (prev7 > 0) {
      const delta = ((last7 - prev7) / prev7) * 100;
      if (delta < -20) out.push(`DAU 7d-Trend ${delta.toFixed(0)}% — Engagement bricht ein`);
      else if (delta > 20) out.push(`DAU 7d-Trend +${delta.toFixed(0)}% — Momentum baut sich auf`);
    }
    const totalPosts = series.reduce((a, b) => a + b.posts, 0);
    const totalComments = series.reduce((a, b) => a + b.comments, 0);
    if (totalPosts > 0) {
      const ratio = (totalComments / totalPosts).toFixed(1);
      out.push(`Ø ${ratio} Comments pro Post (30d)`);
    }
    if (funnel.l0_to_l1_pct < 5) out.push(`L0→L1 nur ${funnel.l0_to_l1_pct}% — Bridge schwach`);
    if (funnel.l1_to_l2_pct > 30) out.push(`L1→L2 stark (${funnel.l1_to_l2_pct}%)`);
    return out;
  }, [series, funnel]);

  if (forbidden) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
          <h1 className="text-2xl mb-2" style={{ fontFamily: "Cormorant Garamond, serif" }}>Kein Zugriff</h1>
          <p className="text-sm text-muted-foreground mb-6">Dieses Dashboard ist Admin & Director (L7+) vorbehalten.</p>
          <Link to="/members" className="text-xs text-primary hover:underline">← Zurück</Link>
        </div>
      </div>
    );
  }

  const fmtCurrency = (n: number) =>
    n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Header */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <Link to="/members" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3" /> Members
            </Link>
            <h1 className="mt-1 text-3xl text-foreground" style={{ fontFamily: "Cormorant Garamond, serif" }}>
              Community KPI
            </h1>
            <p className="text-xs text-muted-foreground mt-1" style={{ fontFamily: "DM Mono, monospace" }}>
              Live · auto-refresh 30s
            </p>
          </div>
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] hover:border-primary/40 hover:text-primary"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{error}</div>
        )}

        {/* A. OVERVIEW */}
        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="DAU heute" value={overview?.dau_today ?? 0} delta={overview?.dau_delta_pct} />
          <KpiCard label="WAU" value={overview?.wau ?? 0} />
          <KpiCard label="Revenue heute" value={overview ? fmtCurrency(Number(overview.revenue_today)) : "—"} />
          <KpiCard label="Conversion %" value={overview ? `${overview.conversion_pct}%` : "—"} />
        </section>

        {/* Insights */}
        {insights.length > 0 && (
          <section className="mb-8 rounded-2xl border border-primary/20 bg-primary/[0.03] p-5">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                Decision Insights
              </span>
            </div>
            <ul className="space-y-1.5">
              {insights.map((i, idx) => (
                <li key={idx} className="text-sm text-foreground/85">→ {i}</li>
              ))}
            </ul>
          </section>
        )}

        {/* B. ENGAGEMENT */}
        <section className="mb-8 rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-4 text-[10px] uppercase tracking-[0.18em] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
            Engagement (30d)
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Line type="monotone" dataKey="dau" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="DAU" />
                <Line type="monotone" dataKey="posts" stroke="hsl(var(--foreground))" strokeWidth={1.5} dot={false} name="Posts" />
                <Line type="monotone" dataKey="comments" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} dot={false} name="Comments" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* C + D side by side */}
        <section className="mb-8 grid gap-6 lg:grid-cols-2">
          {/* Retention */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-4 text-[10px] uppercase tracking-[0.18em] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
              Retention Cohorts
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr><th className="py-2 text-left font-normal">Woche</th><th className="text-right font-normal">N</th><th className="text-right font-normal">D1</th><th className="text-right font-normal">D7</th><th className="text-right font-normal">D30</th></tr>
                </thead>
                <tbody>
                  {cohorts.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground/60">Noch keine Daten</td></tr>}
                  {cohorts.map(c => (
                    <tr key={c.cohort_week} className="border-b border-border/40">
                      <td className="py-2">{new Date(c.cohort_week).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}</td>
                      <td className="text-right">{c.cohort_size}</td>
                      <td className="text-right text-foreground">{pct(c.d1, c.cohort_size)}</td>
                      <td className="text-right text-foreground">{pct(c.d7, c.cohort_size)}</td>
                      <td className="text-right text-primary">{pct(c.d30, c.cohort_size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Funnel */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-4 text-[10px] uppercase tracking-[0.18em] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
              Conversion Funnel
            </h2>
            {funnel && (
              <div className="space-y-2">
                {[
                  { k: "L0", n: funnel.L0, next: funnel.l0_to_l1_pct },
                  { k: "L1", n: funnel.L1, next: funnel.l1_to_l2_pct },
                  { k: "L2", n: funnel.L2, next: funnel.l2_to_l4_pct },
                  { k: "L4", n: funnel.L4, next: funnel.l4_to_l6_pct },
                  { k: "L6+", n: funnel.L6, next: null },
                ].map((row, i, arr) => {
                  const max = Math.max(...arr.map(r => r.n), 1);
                  const w = (row.n / max) * 100;
                  return (
                    <div key={row.k}>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="font-mono text-muted-foreground">{row.k}</span>
                        <span className="text-foreground">{row.n}</span>
                      </div>
                      <div className="mt-1 h-6 rounded bg-muted/40">
                        <div className="h-full rounded bg-primary/60" style={{ width: `${w}%` }} />
                      </div>
                      {row.next !== null && (
                        <div className="text-[10px] text-muted-foreground text-right mt-0.5">↓ {row.next}%</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* E. LEVEL DISTRIBUTION */}
        <section className="mb-8 rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-4 text-[10px] uppercase tracking-[0.18em] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
            Level Distribution + Ø Credits
          </h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={levels}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="level_key" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Bar dataKey="user_count" name="Users">
                  {levels.map((_, i) => <Cell key={i} fill="hsl(var(--primary))" fillOpacity={0.4 + i * 0.1} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* F. TOP CONTENT */}
        <section className="mb-12 rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-4 text-[10px] uppercase tracking-[0.18em] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
            Top Posts (30d)
          </h2>
          <ul className="space-y-3">
            {top.length === 0 && <li className="text-xs text-muted-foreground/60">Noch keine Posts</li>}
            {top.map((p, i) => (
              <li key={p.message_id} className="flex items-start gap-3 border-b border-border/40 pb-3 last:border-0">
                <span className="font-mono text-[11px] text-muted-foreground w-6 shrink-0">#{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">{p.content_preview}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5" style={{ fontFamily: "DM Mono, monospace" }}>
                    {p.reactions} reactions · {p.replies} replies · score {p.score}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function KpiCard({ label, value, delta }: { label: string; value: number | string; delta?: number }) {
  const isUp = delta !== undefined && delta > 0;
  const isDown = delta !== undefined && delta < 0;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>{label}</p>
      <p className="mt-2 text-2xl text-foreground" style={{ fontFamily: "Cormorant Garamond, serif" }}>{value}</p>
      {delta !== undefined && (
        <p className={`mt-1 flex items-center gap-1 text-[11px] ${isUp ? "text-primary" : isDown ? "text-destructive" : "text-muted-foreground"}`}>
          {isUp && <TrendingUp className="h-3 w-3" />}
          {isDown && <TrendingDown className="h-3 w-3" />}
          {delta > 0 ? "+" : ""}{delta}% vs gestern
        </p>
      )}
    </div>
  );
}

function pct(n: number, total: number) {
  if (!total) return "—";
  return `${Math.round((n / total) * 100)}%`;
}
