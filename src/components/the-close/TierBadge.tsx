import type { TierKey } from '@/types/the-close';
import { TIER_COLOR, TIER_LABEL } from '@/types/the-close';

interface TierBadgeProps {
  tier: TierKey;
  size?: 'sm' | 'md';
}

export function TierBadge({ tier, size = 'sm' }: TierBadgeProps) {
  const color = TIER_COLOR[tier];
  const isBlack = tier === 'black';

  const fontSize = size === 'sm' ? '7px' : '9px';
  const padding = size === 'sm' ? '2px 7px' : '3px 10px';

  return (
    <span
      className="inline-block uppercase tracking-[0.16em]"
      style={{
        fontFamily: 'DM Sans, sans-serif',
        fontSize,
        padding,
        background: isBlack ? '#141410' : `${color}12`,
        color: isBlack ? '#F7F2E9' : color,
        border: isBlack ? '1px solid #262620' : `1px solid ${color}40`,
      }}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}

export default TierBadge;
