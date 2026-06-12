import { useNavigate } from 'react-router-dom';
import type { JobOffer, PartnerProfile, TierKey } from '@/types/the-close';
import { TIER_RANK, TIER_LABEL } from '@/types/the-close';
import { TierBadge } from './TierBadge';
import TierUpgradeBanner from './TierUpgradeBanner';

interface JobCardProps {
  job: JobOffer & {
    partner?: Pick<PartnerProfile, 'company_name' | 'logo_url' | 'is_verified'>;
  };
  viewerTierRank: number;
  isCloser: boolean;
  hasApplied?: boolean;
  onApply?: () => void;
  onView?: () => void;
}

function daysAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return 'heute';
  if (diff === 1) return 'vor 1 Tag';
  return `vor ${diff} Tagen`;
}

export default function JobCard({ job, viewerTierRank, isCloser, hasApplied, onApply, onView }: JobCardProps) {
  const navigate = useNavigate();
  const minTierRank = TIER_RANK[job.min_tier ?? 'bronze'] ?? 1;
  const isGated = viewerTierRank < minTierRank;

  const dealRange =
    job.deal_size_min && job.deal_size_max
      ? `€${job.deal_size_min.toLocaleString('de-DE')} – €${job.deal_size_max.toLocaleString('de-DE')}`
      : job.deal_size_min
        ? `ab €${job.deal_size_min.toLocaleString('de-DE')}`
        : job.deal_size_max
          ? `bis €${job.deal_size_max.toLocaleString('de-DE')}`
          : null;

  const roleLabels: Record<string, string> = { closer: 'Closer', setter: 'Setter', sales_manager: 'Manager', other: 'Sonstige' };
  const locationLabels: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'Vor Ort' };

  const tags = [
    roleLabels[job.role_type] || job.role_type,
    locationLabels[job.location_type] || job.location_type,
    job.industry,
    ...(job.languages || []),
  ].filter(Boolean);

  return (
    <div
      style={{
        position: 'relative',
        border: '1px solid #D4C9A8',
        background: '#F7F2E9',
        padding: 24,
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#B8952A'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#D4C9A8'; }}
    >
      {/* GATE OVERLAY */}
      {isGated && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(247,242,233,0.92)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            zIndex: 1,
          }}
        >
          <TierBadge size="md" tier={job.min_tier} />
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 16, fontWeight: 300, color: '#7A7568' }}>
            Ab {TIER_LABEL[job.min_tier]} sichtbar
          </div>
          <TierUpgradeBanner compact requiredTier={job.min_tier} message="" />
        </div>
      )}

      {/* CARD CONTENT */}
      <div style={{ opacity: isGated ? 0.35 : 1, pointerEvents: isGated ? 'none' : 'auto' }}>
        {/* HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {/* Logo */}
            {job.partner?.logo_url ? (
              <img
                src={job.partner.logo_url}
                alt={job.partner.company_name}
                style={{ width: 36, height: 36, objectFit: 'contain' }}
              />
            ) : (
              <div
                style={{
                  width: 36,
                  height: 36,
                  background: '#EDE7D9',
                  border: '1px solid #D4C9A8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#7A7568',
                }}
              >
                {job.partner?.company_name?.[0] || '?'}
              </div>
            )}
            {/* Company text */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 500, color: '#3A3830' }}>
                  {job.partner?.company_name}
                </span>
                {job.partner?.is_verified && (
                  <span
                    style={{
                      fontFamily: 'DM Sans, sans-serif',
                      fontSize: 8,
                      color: '#B8952A',
                      border: '1px solid #B8952A40',
                      padding: '1px 6px',
                    }}
                  >
                    ✓ Verifiziert
                  </span>
                )}
              </div>
            </div>
          </div>
          <TierBadge size="sm" tier={job.min_tier} />
        </div>

        {/* TITLE */}
        <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 15, fontWeight: 400, color: '#141410', marginBottom: 8 }}>
          {job.title}
        </div>

        {/* TAGS */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
          {tags.map((tag, i) => (
            <span
              key={i}
              style={{
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 9,
                padding: '2px 8px',
                border: '1px solid #D4C9A860',
                background: '#EDE7D9',
                color: '#7A7568',
              }}
            >
              {tag}
            </span>
          ))}
        </div>

        {/* DEAL INFO */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 18, fontWeight: 300, color: '#141410' }}>
              {dealRange ?? job.commission_type ?? '—'}
            </div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#7A7568', marginTop: 2 }}>
              Deal Size
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 18, fontWeight: 300, color: '#141410' }}>
              {job.commission_rate ?? '—'}
            </div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#7A7568', marginTop: 2 }}>
              Commission
            </div>
          </div>
        </div>

        {/* ETC BADGE REQUIRED */}
        {job.requires_etc_badge && (
          <span
            style={{
              display: 'inline-block',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 8,
              textTransform: 'uppercase',
              color: '#B8952A',
              border: '1px solid #B8952A40',
              padding: '2px 8px',
              marginBottom: 8,
            }}
          >
            ETC Badge erforderlich
          </span>
        )}

        {/* FOOTER */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 12,
            borderTop: '1px solid #E8E0CC',
          }}
        >
          <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 10, fontWeight: 300, color: '#7A7568' }}>
            {daysAgo(job.created_at)}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={onView}
              style={{
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 10,
                border: '1px solid #D4C9A8',
                background: 'transparent',
                color: '#3A3830',
                padding: '6px 14px',
                cursor: 'pointer',
              }}
            >
              Details
            </button>
            {isCloser && !isGated && (
              hasApplied ? (
                <span
                  style={{
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 9,
                    color: '#22C55E',
                    border: '1px solid #22C55E40',
                    padding: '6px 14px',
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  Beworben ✓
                </span>
              ) : (
                <button
                  onClick={onApply}
                  style={{
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    border: 'none',
                    background: '#141410',
                    color: '#F7F2E9',
                    padding: '6px 14px',
                    cursor: 'pointer',
                  }}
                >
                  Bewerben
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
