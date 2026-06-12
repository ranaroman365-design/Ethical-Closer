import type { CloserProfile, TierKey, EtcBadge, BadgeType } from '@/types/the-close';
import { TierBadge } from './TierBadge';
import { AvailabilityDot } from './AvailabilityDot';

interface CloserCardProps {
  closer: CloserProfile & {
    subscription_tier?: TierKey;
    badges?: EtcBadge[];
  };
  viewerTierRank: number;
  onClick?: () => void;
}

const BADGE_ICON: Record<BadgeType, string> = {
  etc_certified: 'ETC',
  etc_closer_gold: '★',
  etc_champion: '⚡',
  etc_top_performer: '♛',
};

const BADGE_LABEL: Record<BadgeType, string> = {
  etc_certified: 'ETC Certified',
  etc_closer_gold: 'Closer Gold',
  etc_champion: 'Champion',
  etc_top_performer: 'Top Performer',
};

function BadgeHex({ badge }: { badge: EtcBadge }) {
  return (
    <span
      title={BADGE_LABEL[badge.badge_type]}
      className="inline-flex items-center justify-center"
      style={{
        width: 16,
        height: 16,
        background: 'linear-gradient(135deg, #B8952A, #D4AF50)',
        clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
        fontFamily: 'DM Sans, sans-serif',
        fontSize: '7px',
        color: '#fff',
        lineHeight: 1,
      }}
    >
      {BADGE_ICON[badge.badge_type]}
    </span>
  );
}

export default function CloserCard({ closer, viewerTierRank, onClick }: CloserCardProps) {
  const initials = (closer.display_name ?? '?')[0]?.toUpperCase();
  const activeBadges = closer.badges?.filter(b => b.is_active) ?? [];

  return (
    <div
      onClick={onClick}
      className="transition-colors duration-200"
      style={{
        border: '1px solid #D4C9A8',
        background: '#F7F2E9',
        padding: 24,
        cursor: onClick ? 'pointer' : 'default',
        borderRadius: 0,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#B8952A'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#D4C9A8'; }}
    >
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {/* Avatar */}
          {closer.profile_image_url ? (
            <img
              src={closer.profile_image_url}
              alt={closer.display_name}
              style={{ width: 44, height: 44, objectFit: 'cover', border: '1px solid #D4C9A8' }}
            />
          ) : (
            <div
              style={{
                width: 44,
                height: 44,
                background: '#EDE7D9',
                border: '1px solid #D4C9A8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Cormorant Garamond, serif',
                fontSize: 20,
                fontWeight: 400,
                color: '#3A3830',
              }}
            >
              {initials}
            </div>
          )}
          {/* Text */}
          <div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 500, color: '#141410', lineHeight: 1.2 }}>
              {closer.display_name}
            </div>
            {viewerTierRank >= 2 && closer.priority_score > 0 && (
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 9, color: '#B8952A', letterSpacing: '0.1em', marginTop: 2 }}>
                ✦ Priorität: {closer.priority_score}
              </div>
            )}
            {closer.headline && (
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 300, color: '#7A7568', marginTop: 2 }}>
                {closer.headline}
              </div>
            )}
            {closer.location && (
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 10, fontWeight: 300, color: '#7A7568', marginTop: 2 }}>
                {closer.location}
              </div>
            )}
          </div>
        </div>
        {/* Right: Availability + Tier */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <AvailabilityDot availability={closer.availability} />
          <TierBadge size="sm" tier={closer.subscription_tier ?? 'bronze'} />
        </div>
      </div>

      {/* TAGS */}
      {(closer.industries.length > 0 || closer.languages.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
          {[...closer.industries, ...closer.languages].map((tag, i) => (
            <span
              key={i}
              style={{
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 9,
                padding: '2px 8px',
                border: '1px solid rgba(212,201,168,0.38)',
                background: '#EDE7D9',
                color: '#7A7568',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 14 }}>
        <StatCell value={`${closer.experience_years} Jahre`} label="Erfahrung" />
        <StatCell value={closer.avg_deal_size ?? '—'} label="Deal Size" />
        {viewerTierRank >= 2 ? (
          <StatCell value={closer.closing_rate ?? '—'} label="Closing Rate" />
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div
              title="Closing Rate ab Silver sichtbar"
              style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: '#B8952A' }}
            >
              ★ Silver
            </div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#7A7568', marginTop: 2 }}>
              Closing Rate
            </div>
          </div>
        )}
      </div>

      {/* BADGES */}
      {activeBadges.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {activeBadges.map(b => <BadgeHex key={b.id} badge={b} />)}
        </div>
      )}

      {/* FOOTER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid #E8E0CC' }}>
        <AvailabilityDot availability={closer.availability} showLabel />
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={e => { e.stopPropagation(); onClick?.(); }}
            style={{
              fontFamily: 'DM Sans, sans-serif', fontSize: 10, border: '1px solid #D4C9A8',
              padding: '6px 14px', background: 'transparent', color: '#3A3830', cursor: 'pointer',
            }}
          >
            Profil
          </button>
          {viewerTierRank >= 2 && (
            <button
              onClick={e => e.stopPropagation()}
              style={{
                fontFamily: 'DM Sans, sans-serif', fontSize: 10, border: 'none',
                padding: '6px 14px', background: '#141410', color: '#F7F2E9', cursor: 'pointer',
              }}
            >
              Kontakt
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 20, fontWeight: 300, color: '#141410' }}>
        {value}
      </div>
      <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#7A7568', marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}
