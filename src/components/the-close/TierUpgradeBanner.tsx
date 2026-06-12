import { useNavigate } from 'react-router-dom';
import type { TierKey } from '@/types/the-close';
import { TIER_COLOR, TIER_LABEL } from '@/types/the-close';
import { TierBadge } from './TierBadge';

interface TierUpgradeBannerProps {
  requiredTier: TierKey;
  message: string;
  compact?: boolean;
  onUpgrade?: () => void;
}

export default function TierUpgradeBanner({ requiredTier, message, compact, onUpgrade }: TierUpgradeBannerProps) {
  const navigate = useNavigate();
  const color = TIER_COLOR[requiredTier];

  return (
    <div
      style={{
        background: `${color}08`,
        border: `1px solid ${color}30`,
        padding: compact ? '10px 16px' : '18px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <TierBadge tier={requiredTier} size="sm" />
        {message && (
          <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 300, color: '#3A3830', lineHeight: 1.5 }}>
            {message}
          </span>
        )}
      </div>
      <button
        onClick={onUpgrade ?? (() => navigate('/the-close/join'))}
        style={{
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          border: `1px solid ${color}`,
          color,
          background: 'transparent',
          padding: '6px 14px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Ab {TIER_LABEL[requiredTier]} dabei sein
      </button>
    </div>
  );
}

// Named export for backwards compat
export { TierUpgradeBanner };

// Re-export the modal from old file
export { TierUpgradeModal } from './TierUpgradeModal';
