/**
 * Performance Filters Context — Integration Layer
 * ------------------------------------------------
 * Canon: ETC OS Layer 47 · Visualization Layer · Integration spine.
 *
 * One filter state shared across all 3 dashboards:
 *   · Revenue Flow Map™       (/members/performance/revenue)
 *   · Talent Flow Map™        (/members/performance/talent)
 *   · Intelligence Control™   (/members/performance/intelligence)
 *
 * Selections persist across navigation (sessionStorage) and across
 * dashboard switches — so the user always feels inside ONE system.
 *
 * Also exposes `crossNavigate()` — a helper that routes the user to a
 * sibling dashboard while carrying optional drilldown context (lead, member,
 * stage, channel) via URL query params.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";

export type RangeKey = "24h" | "7d" | "30d" | "90d";
export type DashboardKey = "revenue" | "talent" | "intelligence" | "l6" | "execution";

export interface PerformanceFilters {
  range: RangeKey;
  funnel: string;       // "__all" or funnel_key
  operator: string;     // "__all" or user_id
  level: string;        // "__all" or "L1".."L8"
}

const DEFAULTS: PerformanceFilters = {
  range: "30d",
  funnel: "__all",
  operator: "__all",
  level: "__all",
};

const STORAGE_KEY = "etc:perf:filters:v1";

interface CrossNavContext {
  leadId?: string;
  memberId?: string;
  stage?: string;
  channel?: string;
  reason?: string;
}

interface Ctx {
  filters: PerformanceFilters;
  setFilter: <K extends keyof PerformanceFilters>(k: K, v: PerformanceFilters[K]) => void;
  setFilters: (f: Partial<PerformanceFilters>) => void;
  reset: () => void;
  crossNavigate: (target: DashboardKey, ctx?: CrossNavContext) => void;
  /** Read drilldown context from current URL (set by the previous dashboard). */
  readIncomingContext: () => CrossNavContext;
}

const PerformanceFiltersContext = createContext<Ctx | null>(null);

function readPersisted(): PerformanceFilters {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<PerformanceFilters>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function persist(f: PerformanceFilters) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(f));
  } catch {
    // ignore quota / privacy mode
  }
}

const ROUTES: Record<DashboardKey, string> = {
  execution: "/members/performance/execution",
  revenue: "/members/performance/revenue",
  talent: "/members/performance/talent",
  intelligence: "/members/performance/intelligence",
  l6: "/members/performance/l6",
};

export function PerformanceFiltersProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [filters, setFiltersState] = useState<PerformanceFilters>(() => readPersisted());

  useEffect(() => {
    persist(filters);
  }, [filters]);

  const setFilter = useCallback<Ctx["setFilter"]>((k, v) => {
    setFiltersState((p) => ({ ...p, [k]: v }));
  }, []);

  const setFilters = useCallback<Ctx["setFilters"]>((f) => {
    setFiltersState((p) => ({ ...p, ...f }));
  }, []);

  const reset = useCallback(() => setFiltersState(DEFAULTS), []);

  const crossNavigate = useCallback<Ctx["crossNavigate"]>(
    (target, ctx) => {
      const params = new URLSearchParams();
      if (ctx?.leadId) params.set("lead", ctx.leadId);
      if (ctx?.memberId) params.set("member", ctx.memberId);
      if (ctx?.stage) params.set("stage", ctx.stage);
      if (ctx?.channel) params.set("channel", ctx.channel);
      if (ctx?.reason) params.set("reason", ctx.reason);
      const qs = params.toString();
      navigate(qs ? `${ROUTES[target]}?${qs}` : ROUTES[target]);
    },
    [navigate],
  );

  const readIncomingContext = useCallback<Ctx["readIncomingContext"]>(() => {
    if (typeof window === "undefined") return {};
    const sp = new URLSearchParams(window.location.search);
    return {
      leadId: sp.get("lead") ?? undefined,
      memberId: sp.get("member") ?? undefined,
      stage: sp.get("stage") ?? undefined,
      channel: sp.get("channel") ?? undefined,
      reason: sp.get("reason") ?? undefined,
    };
  }, []);

  const value = useMemo<Ctx>(
    () => ({ filters, setFilter, setFilters, reset, crossNavigate, readIncomingContext }),
    [filters, setFilter, setFilters, reset, crossNavigate, readIncomingContext],
  );

  return (
    <PerformanceFiltersContext.Provider value={value}>
      {children}
    </PerformanceFiltersContext.Provider>
  );
}

export function usePerformanceFilters(): Ctx {
  const v = useContext(PerformanceFiltersContext);
  if (!v) throw new Error("usePerformanceFilters must be used within <PerformanceFiltersProvider>");
  return v;
}

/** Safe variant — returns null when used outside the shell (legacy routes). */
export function useOptionalPerformanceFilters(): Ctx | null {
  return useContext(PerformanceFiltersContext);
}

export const PERFORMANCE_ROUTES = ROUTES;
