import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTheCloseUser } from '@/hooks/the-close/useTheCloseUser';
import { TierBadge } from '@/components/the-close/TierBadge';
import { AvailabilityDot } from '@/components/the-close/AvailabilityDot';
import { DirectContactModal } from '@/components/the-close/DirectContactModal';
import type { CloserProfile, TierKey, EtcBadge, BadgeType } from '@/types/the-close';

const BADGE_ICON: Record<BadgeType, string> = {
  etc_certified: 'ETC',
  etc_closer_gold: '★',
  etc_champion: '⚡',
  etc_top_performer: '♛',
};

type ProfileRow = CloserProfile & { subscription_tier?: TierKey; badges?: EtcBadge[] };

export default function TheCloseProfile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { tierRank, user } = useTheCloseUser();
  const [closer, setCloser] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showContact, setShowContact] = useState(false);

  useEffect(() => {
    if (!userId) { setNotFound(true); setLoading(false); return; }
    (async () => {
      const query = supabase
        .from('closer_profiles' as any)
        .select('*, user_type:the_close_user_types(subscription_tier), badges:etc_badges(*)')
        .eq('user_id', userId)
        .single();
      const { data, error } = await query as any;

      if (error || !data) {
        setNotFound(true);
      } else {
        setCloser({
          ...data,
          subscription_tier: (data as any).user_type?.subscription_tier ?? 'bronze',
          badges: (data as any).badges ?? [],
          user_type: undefined,
        } as ProfileRow);
      }
      setLoading(false);
    })();
  }, [userId]);

  // Loading
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F7F2E9' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px' }}>
          <div style={{ background: '#EDE7D9', height: 80, animation: 'tc-pulse 1.5s ease infinite', marginBottom: 16 }} />
          <div style={{ background: '#EDE7D9', height: 40, animation: 'tc-pulse 1.5s ease infinite', marginBottom: 16 }} />
          <div style={{ background: '#EDE7D9', height: 120, animation: 'tc-pulse 1.5s ease infinite' }} />
        </div>
        <style>{`@keyframes tc-pulse { 0%,100% { opacity:.6 } 50% { opacity:.3 } }`}</style>
      </div>
    );
  }

  // Not found
  if (notFound || !closer) {
    return (
      <div style={{ minHeight: '100vh', background: '#F7F2E9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, fontWeight: 300, color: '#7A7568' }}>
          Profil nicht gefunden.
        </div>
        <button
          onClick={() => navigate('/the-close/directory')}
          style={{
            fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: '#B8952A',
            background: 'none', border: 'none', cursor: 'pointer', marginTop: 16, textDecoration: 'none',
          }}
        >
          ← Zurück zum Directory
        </button>
      </div>
    );
  }

  const initials = (closer.display_name ?? '?')[0]?.toUpperCase();
  const activeBadges = closer.badges?.filter(b => b.is_active) ?? [];
  const isSelf = user?.id === closer.user_id;

  return (
    <div style={{ minHeight: '100vh', background: '#F7F2E9' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px' }}>

        {/* PROFILE HEADER */}
        <div style={{ background: '#F0EAD9', border: '1px solid #D4C9A8', padding: '28px 28px 24px' }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Avatar */}
            {closer.profile_image_url ? (
              <img src={closer.profile_image_url} alt={closer.display_name}
                style={{ width: 72, height: 72, objectFit: 'cover', border: '1px solid #D4C9A8' }} />
            ) : (
              <div style={{
                width: 72, height: 72, background: '#EDE7D9', border: '1px solid #D4C9A8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Cormorant Garamond, serif', fontSize: 28, fontWeight: 400, color: '#3A3830',
              }}>
                {initials}
              </div>
            )}

            {/* Info */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 28, fontWeight: 400, color: '#141410' }}>
                  {closer.display_name}
                </span>
                <AvailabilityDot availability={closer.availability} showLabel />
              </div>

              {closer.headline && (
                <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 300, color: '#7A7568' }}>
                  {closer.headline}
                </div>
              )}
              {closer.location && (
                <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 300, color: '#7A7568' }}>
                  {closer.location}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <TierBadge size="md" tier={closer.subscription_tier ?? 'bronze'} />
                {activeBadges.map(b => (
                  <span
                    key={b.id}
                    title={b.badge_type}
                    style={{
                      width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: 'linear-gradient(135deg, #B8952A, #D4AF50)',
                      clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                      fontFamily: 'DM Sans, sans-serif', fontSize: 8, color: '#fff',
                    }}
                  >
                    {BADGE_ICON[b.badge_type]}
                  </span>
                ))}
              </div>

              {closer.linkedin_url && (
                <a
                  href={closer.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: 'DM Sans, sans-serif', fontSize: 10, textTransform: 'uppercase',
                    color: '#B8952A', textDecoration: 'none',
                  }}
                >
                  LinkedIn →
                </a>
              )}
            </div>

            {/* Contact button */}
            {tierRank >= 2 && !isSelf && (
              <button
                onClick={() => setShowContact(true)}
                style={{
                  fontFamily: 'DM Sans, sans-serif', fontSize: 10, textTransform: 'uppercase',
                  background: '#141410', color: '#F7F2E9', padding: '10px 20px',
                  border: 'none', cursor: 'pointer', alignSelf: 'flex-start',
                }}
              >
                Kontakt aufnehmen
              </button>
            )}
          </div>
        </div>

        {/* STATS BAR */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          border: '1px solid #D4C9A8', borderTop: 'none',
        }}>
          <StatCell value={`${closer.experience_years} Jahre`} label="Erfahrung" />
          <StatCell value={closer.avg_deal_size ?? '—'} label="Avg. Deal" border />
          {tierRank >= 2 ? (
            <StatCell value={closer.closing_rate ?? '—'} label="Closing Rate" border />
          ) : (
            <div style={{ padding: '16px 20px', textAlign: 'center', borderLeft: '1px solid #D4C9A8' }}>
              <div title="Ab Silver" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#B8952A' }}>
                ★ Silver
              </div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#7A7568', marginTop: 2 }}>
                Closing Rate
              </div>
            </div>
          )}
          <StatCell value={`${closer.total_closes} Closes`} label="Gesamt" border />
        </div>

        {/* BIO */}
        {closer.bio && (
          <div style={{ padding: '24px 0' }}>
            <div style={{
              fontFamily: 'DM Sans, sans-serif', fontSize: 9, textTransform: 'uppercase',
              letterSpacing: '0.2em', color: '#7A7568', marginBottom: 10,
            }}>
              Über mich
            </div>
            <div style={{ height: 1, background: '#D4C9A8', marginBottom: 16 }} />
            <div style={{
              fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 300,
              color: '#3A3830', lineHeight: 1.8, whiteSpace: 'pre-wrap',
            }}>
              {closer.bio}
            </div>
          </div>
        )}

        {/* INDUSTRIES + LANGUAGES */}
        {(closer.industries.length > 0 || closer.languages.length > 0) && (
          <div style={{
            padding: '20px 0', borderTop: '1px solid #D4C9A8',
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20,
          }}>
            {closer.industries.length > 0 && (
              <div>
                <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#7A7568' }}>
                  Branchen
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                  {closer.industries.map((ind, i) => (
                    <span key={i} style={{
                      fontFamily: 'DM Sans, sans-serif', fontSize: 9, padding: '3px 10px',
                      border: '1px solid rgba(212,201,168,0.38)', background: '#EDE7D9', color: '#7A7568',
                    }}>{ind}</span>
                  ))}
                </div>
              </div>
            )}
            {closer.languages.length > 0 && (
              <div>
                <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#7A7568' }}>
                  Sprachen
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                  {closer.languages.map((lang, i) => (
                    <span key={i} style={{
                      fontFamily: 'DM Sans, sans-serif', fontSize: 9, padding: '3px 10px',
                      border: '1px solid rgba(212,201,168,0.38)', background: '#EDE7D9', color: '#7A7568',
                    }}>{lang}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* BACK LINK */}
        <button
          onClick={() => navigate('/the-close/directory')}
          style={{
            fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: '#B8952A',
            background: 'none', border: 'none', cursor: 'pointer', marginTop: 32,
            textDecoration: 'none', padding: 0,
          }}
        >
          ← Zurück zum Directory
        </button>
      </div>
      <style>{`@keyframes tc-pulse { 0%,100% { opacity:.6 } 50% { opacity:.3 } }`}</style>
      {showContact && closer && (
        <DirectContactModal targetCloser={closer} onClose={() => setShowContact(false)} />
      )}
    </div>
  );
}

function StatCell({ value, label, border }: { value: string; label: string; border?: boolean }) {
  return (
    <div style={{
      padding: '16px 20px', textAlign: 'center',
      ...(border ? { borderLeft: '1px solid #D4C9A8' } : {}),
    }}>
      <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, fontWeight: 300, color: '#141410' }}>
        {value}
      </div>
      <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#7A7568', marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}
