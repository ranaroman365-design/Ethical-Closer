import type { TierKey } from '@/types/the-close';
import { TIER_COLOR, TIER_LABEL, TIER_PRICE, TIER_RANK } from '@/types/the-close';
import { TierBadge } from './TierBadge';

interface TierUpgradeModalProps {
  fromTier: TierKey;
  toTier: TierKey;
  feature: string;
  onClose: () => void;
  onUpgrade: () => void;
}

export function TierUpgradeModal({ fromTier, toTier, feature, onClose, onUpgrade }: TierUpgradeModalProps) {
  const bgStyle = TIER_RANK[toTier] >= 3 ? '#141410' : '#B8952A';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: '#14141090', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full max-w-[480px] mx-4" style={{ background: '#F7F2E9', border: '1px solid #D4C9A8' }} onClick={e => e.stopPropagation()}>
        <div className="p-8">
          <p className="uppercase tracking-[0.28em] text-[9px] mb-4" style={{ color: '#B8952A', fontFamily: 'DM Sans, sans-serif' }}>Nächste Stufe</p>
          <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '26px', fontWeight: 300, color: '#141410' }}>
            {TIER_LABEL[toTier]} gibt dir {feature}.
          </h2>
          <p className="mt-2" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', fontWeight: 300, color: '#7A7568' }}>
            Du bist {TIER_LABEL[fromTier]}. {TIER_LABEL[toTier]} ist der nächste Schritt.
          </p>
          <div className="flex items-center gap-4 mt-6 mb-2">
            <TierBadge tier={fromTier} size="md" />
            <span style={{ color: '#D4C9A8' }}>→</span>
            <TierBadge tier={toTier} size="md" />
          </div>
          <p className="mt-1 mb-6" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#3A3830' }}>
            {TIER_PRICE[toTier]}
          </p>
          <button onClick={onUpgrade} className="w-full uppercase tracking-[0.2em] cursor-pointer transition-opacity hover:opacity-90"
            style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '10px', padding: '14px', background: bgStyle, color: bgStyle === '#141410' ? '#F7F2E9' : '#141410', border: 'none' }}>
            Ab {TIER_LABEL[toTier]} dabei sein
          </button>
          <button onClick={onClose} className="w-full mt-3 cursor-pointer bg-transparent border-none"
            style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#7A7568' }}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
