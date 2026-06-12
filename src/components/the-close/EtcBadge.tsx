import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { BadgeType } from "@/types/the-close";

interface EtcBadgeProps {
  type: BadgeType;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  showTooltip?: boolean;
}

const badgeConfig: Record<BadgeType, { label: string; description: string; icon: string }> = {
  etc_certified: { label: "ETC Zertifiziert", description: "ETC Programm erfolgreich abgeschlossen", icon: "" },
  etc_closer_gold: { label: "ETC Gold Closer", description: "Gold+ Tier mit verifiziertem KPI-Nachweis", icon: "★" },
  etc_champion: { label: "Champion", description: "5+ Closes in 90 Tagen — Champion Track", icon: "⚡" },
  etc_top_performer: { label: "Top Performer", description: "Top 10% aller ETC Closer", icon: "♛" },
};

const sizeMap = { sm: 20, md: 28, lg: 40 };
const fontMap = { sm: "6px", md: "8px", lg: "11px" };
const iconFontMap = { sm: "7px", md: "9px", lg: "13px" };

export default function EtcBadge({ type, size = "md", showLabel = false, showTooltip = true }: EtcBadgeProps) {
  const config = badgeConfig[type];
  const dim = sizeMap[size];

  const badge = (
    <span className="inline-flex flex-col items-center gap-1">
      <svg width={dim} height={dim} viewBox="0 0 40 40" style={{ flexShrink: 0 }}>
        <defs>
          <linearGradient id={`bg-${type}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#B8952A" />
            <stop offset="100%" stopColor="#D4AF50" />
          </linearGradient>
        </defs>
        <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill={`url(#bg-${type})`} />
        <text x="20" y={config.icon ? 15 : 20} textAnchor="middle" dominantBaseline="central"
          fill="#F7F2E9" fontSize={fontMap[size]} fontFamily="'DM Sans', sans-serif" fontWeight="700">ETC</text>
        {config.icon && (
          <text x="20" y="28" textAnchor="middle" dominantBaseline="central"
            fill="#F7F2E9" fontSize={iconFontMap[size]}>{config.icon}</text>
        )}
      </svg>
      {showLabel && (
        <span className="uppercase tracking-[0.14em]"
          style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '9px', color: '#7A7568' }}>
          {config.label}
        </span>
      )}
    </span>
  );

  if (!showTooltip) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild><span className="cursor-default">{badge}</span></TooltipTrigger>
      <TooltipContent style={{ background: '#141410', color: '#F7F2E9', border: '1px solid #262620', fontFamily: 'DM Sans, sans-serif', fontSize: '11px' }}>
        <p style={{ fontWeight: 600 }}>{config.label}</p>
        <p style={{ opacity: 0.8, marginTop: 2 }}>{config.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Black member badge — solid black hexagon, no text */
export function BlackBadge({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dim = sizeMap[size];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <svg width={dim} height={dim} viewBox="0 0 40 40" className="cursor-default">
          <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="#0A0A08" stroke="#262620" strokeWidth="1" />
        </svg>
      </TooltipTrigger>
      <TooltipContent style={{ background: '#0A0A08', color: '#F7F2E9', border: '1px solid #262620', fontFamily: 'DM Sans, sans-serif', fontSize: '11px' }}>
        Black Member
      </TooltipContent>
    </Tooltip>
  );
}
