/**
 * CrossNavCta — Contextual transition between Performance dashboards.
 *
 * Canon: Layer 47 · Visualization · Integration spine.
 *
 * Renders the canonical 3 cross-CTAs:
 *   · Revenue → Talent          ("View in Talent Flow")
 *   · Talent  → Revenue         ("View Revenue Contribution")
 *   · Both    → Intelligence    ("Fix via Intelligence")
 *
 * Falls back to a no-op (returns null) when used outside the
 * PerformanceFiltersProvider — keeps legacy routes safe.
 */
import { ArrowRight, Brain, TrendingUp, Users, Wrench } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";
import {
  useOptionalPerformanceFilters,
  type DashboardKey,
} from "@/contexts/PerformanceFiltersContext";

type Variant = "to_talent" | "to_revenue" | "to_intelligence";

const PRESETS: Record<
  Variant,
  { target: DashboardKey; icon: any; label: { de: string; en: string } }
> = {
  to_talent: {
    target: "talent",
    icon: Users,
    label: { de: "Im Talent Flow ansehen", en: "View in Talent Flow" },
  },
  to_revenue: {
    target: "revenue",
    icon: TrendingUp,
    label: { de: "Revenue-Beitrag ansehen", en: "View Revenue Contribution" },
  },
  to_intelligence: {
    target: "intelligence",
    icon: Wrench,
    label: { de: "Über Intelligence beheben", en: "Fix via Intelligence" },
  },
};

interface Props {
  variant: Variant;
  ctx?: {
    leadId?: string;
    memberId?: string;
    stage?: string;
    channel?: string;
    reason?: string;
  };
  size?: "sm" | "md";
  className?: string;
}

export function CrossNavCta({ variant, ctx, size = "sm", className = "" }: Props) {
  const { lang } = useLanguage();
  const filters = useOptionalPerformanceFilters();
  if (!filters) return null;

  const preset = PRESETS[variant];
  const Icon = preset.icon;
  const padding = size === "md" ? "px-3 py-1.5" : "px-2.5 py-1";
  const text = size === "md" ? "text-xs" : "text-[11px]";

  return (
    <button
      onClick={() => filters.crossNavigate(preset.target, ctx)}
      className={`group inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] ${padding} ${text} font-medium uppercase tracking-wider text-[color:var(--ci-fg-muted)] transition-all hover:border-[color:var(--ci-accent)]/40 hover:bg-[color:var(--ci-accent)]/10 hover:text-[color:var(--ci-fg)] ${className}`}
    >
      <Icon className="h-3 w-3" />
      <span>{preset.label[lang]}</span>
      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
