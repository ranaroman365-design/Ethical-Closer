/**
 * Performance Shell — Unified ETC OS Visualization Layer
 * ------------------------------------------------------
 * Canon: Layer 47 · Visualization · Integration spine.
 *
 * Provides:
 *   · Single header with 3 tabs: Revenue · Talent · Intelligence
 *   · Persistent global filters (range · funnel · operator · level)
 *   · One <Outlet/> for the active dashboard
 *
 * Permissions:
 *   · L6+ → all three (Revenue + Talent + Intelligence)
 *   · Admin/Owner → all three
 */
import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/i18n/LanguageContext";
import { getLevelForStage } from "@/lib/kpi-config";
import { supabase } from "@/integrations/supabase/client";
import {
  PerformanceFiltersProvider,
  usePerformanceFilters,
  PERFORMANCE_ROUTES,
  type DashboardKey,
} from "@/contexts/PerformanceFiltersContext";
import AccessDenied from "@/components/members/AccessDenied";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock, RotateCcw, TrendingUp, Users, Brain, Activity, Zap } from "lucide-react";
import "@/pages/admin/conversion-intelligence-theme.css";

// ─── Tab definitions ────────────────────────────────────────────────────────
const TABS: Array<{
  key: DashboardKey;
  route: string;
  icon: typeof TrendingUp;
  label: { de: string; en: string };
  minLevel: number;
}> = [
  { key: "execution", route: PERFORMANCE_ROUTES.execution, icon: Zap, label: { de: "Execution", en: "Execution" }, minLevel: 6 },
  { key: "revenue", route: PERFORMANCE_ROUTES.revenue, icon: TrendingUp, label: { de: "Revenue Flow", en: "Revenue Flow" }, minLevel: 6 },
  { key: "talent", route: PERFORMANCE_ROUTES.talent, icon: Users, label: { de: "Talent Flow", en: "Talent Flow" }, minLevel: 6 },
  { key: "intelligence", route: PERFORMANCE_ROUTES.intelligence, icon: Brain, label: { de: "Intelligence Control", en: "Intelligence Control" }, minLevel: 6 },
  { key: "l6", route: PERFORMANCE_ROUTES.l6, icon: Activity, label: { de: "Operator Intelligence", en: "Operator Intelligence" }, minLevel: 6 },
];

export default function PerformanceShell() {
  return (
    <PerformanceFiltersProvider>
      <ShellInner />
    </PerformanceFiltersProvider>
  );
}

function ShellInner() {
  const { user, profile, isAdmin, isOwner } = useAuth();
  const { lang } = useLanguage();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Resolve level from user_level_status (canonical) with fallback to business_stage
  const [resolvedLevel, setResolvedLevel] = useState<number | null>(null);
  useEffect(() => {
    if (!user) return;
    if (isAdmin || isOwner) { setResolvedLevel(8); return; }
    let cancelled = false;
    supabase
      .from("user_level_status")
      .select("current_level")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.current_level != null) {
          setResolvedLevel(data.current_level);
        } else {
          // Fallback to business_stage mapping
          const stage = (profile as any)?.business_stage ?? "opener";
          setResolvedLevel(getLevelForStage(stage));
        }
      });
    return () => { cancelled = true; };
  }, [user, isAdmin, isOwner, profile]);

  const level = resolvedLevel ?? (isAdmin || isOwner ? 8 : getLevelForStage((profile as any)?.business_stage ?? "opener"));
  const allowed = level >= 6 || isAdmin || isOwner;

  // Log denial once
  useEffect(() => {
    if (resolvedLevel !== null && !allowed) {
      import("@/lib/log-access-denial").then(({ logAccessDenial }) =>
        logAccessDenial({
          resourceType: "performance_shell",
          resolvedLevel: level,
          denialReason: `Level ${level} < 6, not admin/owner`,
        })
      );
    }
  }, [resolvedLevel, allowed, level]);

  const t = (de: string, en: string) => (lang === "de" ? de : en);

  const { filters, setFilter, reset } = usePerformanceFilters();
  const [funnels, setFunnels] = useState<string[]>([]);
  const [operators, setOperators] = useState<Array<{ id: string; label: string }>>([]);

  // Load filter options once — funnels from leads, operators from team scope RPC
  useEffect(() => {
    if (!allowed || !user) return;
    let cancelled = false;
    (async () => {
      const [{ data: srcData }, { data: teamData }] = await Promise.all([
        supabase.from("leads").select("source").limit(1000),
        supabase.rpc("get_team_member_ids", { p_user_id: user.id }),
      ]);
      if (cancelled) return;

      // Deduplicate and map source values to human-readable funnel names
      const SOURCE_MAP: Record<string, string> = {
        funnel_apply: "Apply", funnel: "Apply", "funnel_apply-test": "Apply (Test)",
        quiz: "Quiz", referral: "Referral", instagram: "Instagram",
        cold_outreach: "Cold Outreach", webinar: "Webinar", website: "Website",
      };
      const rawSources = Array.from(new Set(((srcData ?? []) as any[]).map((r: any) => r.source).filter(Boolean))) as string[];
      const mapped = rawSources.map(s => SOURCE_MAP[s] ?? s).filter(Boolean);
      setFunnels(Array.from(new Set(mapped)).sort());

      // Build operator list from team scope + self — never show raw IDs
      const teamOps = ((teamData ?? []) as any[]).map((m: any) => ({
        id: m.member_id,
        label: m.member_name || "Teammitglied",
      }));
      // Add self at top with full name
      const selfLabel = (profile as any)?.full_name || (profile as any)?.email || "Ich";
      const selfId = user.id;
      // Deduplicate: remove self from team list if already there
      const deduped = teamOps.filter((o: any) => o.id !== selfId);
      setOperators([{ id: selfId, label: selfLabel }, ...deduped].slice(0, 100));
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, user]);

  const activeTab = useMemo<DashboardKey>(() => {
    if (pathname.includes("/execution")) return "execution";
    if (pathname.includes("/talent")) return "talent";
    if (pathname.includes("/intelligence")) return "intelligence";
    if (pathname.includes("/l6")) return "l6";
    return "revenue";
  }, [pathname]);

  if (!allowed) return <AccessDenied />;

  return (
    <div data-ci-theme="exec-dark" className="min-h-screen">
      {/* ─── Unified header ────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[color:var(--ci-bg)]/95 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--ci-bg)]/75">
        <div className="mx-auto max-w-[1400px] px-6 py-4 lg:px-10">
          {/* Title + status */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[color:var(--ci-fg-dim)]">
                ETC OS · Performance
              </p>
              <Badge variant="outline" className="gap-1.5 border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Live
              </Badge>
            </div>
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-wider text-[color:var(--ci-fg-muted)] transition-colors hover:bg-white/10"
            >
              <RotateCcw className="h-3 w-3" />
              {t("Filter zurücksetzen", "Reset filters")}
            </button>
          </div>

          {/* Tabs */}
          <nav className="mt-4 flex flex-wrap gap-1 border-b border-white/5">
            {TABS.map((tab) => {
              const locked = level < tab.minLevel && !isAdmin && !isOwner;
              const isActive = activeTab === tab.key;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => !locked && navigate(tab.route)}
                  disabled={locked}
                  title={locked ? t(`Verfügbar ab L${tab.minLevel}`, `Available from L${tab.minLevel}`) : undefined}
                  className={[
                    "group relative -mb-px inline-flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
                    isActive
                      ? "border-b-2 border-[color:var(--ci-accent)] text-[color:var(--ci-fg)]"
                      : locked
                      ? "cursor-not-allowed text-[color:var(--ci-fg-dim)] opacity-60"
                      : "border-b-2 border-transparent text-[color:var(--ci-fg-muted)] hover:text-[color:var(--ci-fg)]",
                  ].join(" ")}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label[lang]}</span>
                  {locked && <Lock className="h-3 w-3" />}
                </button>
              );
            })}
          </nav>

          {/* Global filter bar */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <FilterLabel>{t("Zeitraum", "Range")}</FilterLabel>
            <Select value={filters.range} onValueChange={(v) => setFilter("range", v as any)}>
              <SelectTrigger className="h-8 w-[110px] border-white/10 bg-white/5 text-xs text-[color:var(--ci-fg)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">{t("24 Stunden", "24 hours")}</SelectItem>
                <SelectItem value="7d">{t("7 Tage", "7 days")}</SelectItem>
                <SelectItem value="30d">{t("30 Tage", "30 days")}</SelectItem>
                <SelectItem value="90d">{t("90 Tage", "90 days")}</SelectItem>
              </SelectContent>
            </Select>

            <FilterLabel>{t("Funnel", "Funnel")}</FilterLabel>
            <Select value={filters.funnel} onValueChange={(v) => setFilter("funnel", v)}>
              <SelectTrigger className="h-8 w-[180px] border-white/10 bg-white/5 text-xs text-[color:var(--ci-fg)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">{t("Alle Funnels", "All funnels")}</SelectItem>
                {funnels.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <FilterLabel>{t("Operator", "Operator")}</FilterLabel>
            <Select value={filters.operator} onValueChange={(v) => setFilter("operator", v)}>
              <SelectTrigger className="h-8 w-[180px] border-white/10 bg-white/5 text-xs text-[color:var(--ci-fg)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">{t("Alle", "All")}</SelectItem>
                {operators.map((op) => (
                  <SelectItem key={op.id} value={op.id}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <FilterLabel>{t("Rolle", "Role")}</FilterLabel>
            <Select value={filters.level} onValueChange={(v) => setFilter("level", v)}>
              <SelectTrigger className="h-8 w-[160px] border-white/10 bg-white/5 text-xs text-[color:var(--ci-fg)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">{t("Alle Rollen", "All roles")}</SelectItem>
                <SelectItem value="setter">{t("Setter (L1–L3)", "Setter (L1–L3)")}</SelectItem>
                <SelectItem value="closer">{t("Closer (L4–L5)", "Closer (L4–L5)")}</SelectItem>
                <SelectItem value="senior_closer">{t("Senior Closer (L6)", "Senior Closer (L6)")}</SelectItem>
                <SelectItem value="director">{t("Director+ (L7+)", "Director+ (L7+)")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {/* ─── Active dashboard ──────────────────────────────────────── */}
      <Outlet />
    </div>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--ci-fg-dim)]">
      {children}
    </span>
  );
}
