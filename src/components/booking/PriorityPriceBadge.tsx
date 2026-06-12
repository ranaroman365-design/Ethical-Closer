import { motion } from "framer-motion";
import { Flame, Zap, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface PriorityPriceBadgeProps {
  tierKey: string;
  priceFormatted: string;
  label: string;
  availableSlots?: number;
  className?: string;
}

const tierConfig: Record<string, {
  icon: typeof Flame;
  bg: string;
  text: string;
  border: string;
  glow?: string;
}> = {
  low: {
    icon: Zap,
    bg: "bg-primary/10",
    text: "text-primary",
    border: "border-primary/30",
  },
  medium: {
    icon: TrendingUp,
    bg: "bg-amber-500/10",
    text: "text-amber-600",
    border: "border-amber-500/30",
  },
  high: {
    icon: Flame,
    bg: "bg-orange-500/10",
    text: "text-orange-600",
    border: "border-orange-500/30",
    glow: "shadow-orange-500/20",
  },
  extreme: {
    icon: Flame,
    bg: "bg-destructive/10",
    text: "text-destructive",
    border: "border-destructive/30",
    glow: "shadow-destructive/20",
  },
};

export function PriorityPriceBadge({
  tierKey,
  priceFormatted,
  label,
  availableSlots,
  className,
}: PriorityPriceBadgeProps) {
  const config = tierConfig[tierKey] ?? tierConfig.low;
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "flex items-center gap-2 rounded-sm border px-3 py-2",
        config.bg,
        config.border,
        config.glow && `shadow-md ${config.glow}`,
        className
      )}
    >
      <Icon className={cn("h-4 w-4", config.text)} />
      <div className="flex flex-col">
        <div className="flex items-baseline gap-1.5">
          <span className={cn("font-sans text-lg font-bold", config.text)}>
            {priceFormatted}
          </span>
          <span className="font-sans text-[10px] text-muted-foreground">
            Priority Call
          </span>
        </div>
        <span className={cn("font-sans text-[10px] font-medium", config.text)}>
          {label}
        </span>
      </div>
      {availableSlots !== undefined && availableSlots <= 5 && (
        <span className="ml-auto rounded-sm bg-destructive/10 px-2 py-0.5 font-sans text-[10px] font-bold text-destructive">
          Noch {availableSlots}
        </span>
      )}
    </motion.div>
  );
}

export function ScarcityBanner({ availableSlots }: { availableSlots: number }) {
  if (availableSlots > 10) return null;

  const urgency =
    availableSlots <= 2
      ? { text: "Letzte Priority Plätze – fast ausgebucht", color: "text-destructive", bg: "bg-destructive/5 border-destructive/20" }
      : availableSlots <= 5
      ? { text: "Hohe Nachfrage – Priority Slots füllen sich", color: "text-orange-600", bg: "bg-orange-500/5 border-orange-500/20" }
      : { text: "Priority Termine sind begrenzt verfügbar", color: "text-amber-600", bg: "bg-amber-500/5 border-amber-500/20" };

  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex items-center gap-2 rounded-sm border px-3 py-2",
        urgency.bg
      )}
    >
      <Flame className={cn("h-3.5 w-3.5 shrink-0", urgency.color)} />
      <p className={cn("font-sans text-xs font-medium", urgency.color)}>
        {urgency.text}
      </p>
    </motion.div>
  );
}
