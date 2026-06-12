import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTheCloseUser } from '@/hooks/the-close/useTheCloseUser';
import CloserCard from '@/components/the-close/CloserCard';
import DirectoryFilters from '@/components/the-close/DirectoryFilters';
import type { CloserProfile, TierKey, EtcBadge } from '@/types/the-close';

type DirectoryFilter = {
  searchQuery: string;
  industries: string[];
  languages: string[];
  availability: 'all' | 'available' | 'open';
  hasEtcBadge: boolean;
};

const INITIAL_FILTERS: DirectoryFilter = {
  searchQuery: '',
  industries: [],
  languages: [],
  availability: 'all',
  hasEtcBadge: false,
};

type CloserRow = CloserProfile & { subscription_tier?: TierKey; badges?: EtcBadge[] };

export default function TheCloseDirectory() {
  const navigate = useNavigate();
  const { tierRank, isAuthenticated, tier } = useTheCloseUser();
  const [closers, setClosers] = useState<CloserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<DirectoryFilter>(INITIAL_FILTERS);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase
        .from('closer_profiles' as any)
        .select('*, user_type:the_close_user_types!inner(subscription_tier), badges:etc_badges(badge_type, is_active, granted_at, id, user_id, kpi_closes, kpi_revenue, kpi_period, verified_by, verified_at, expires_at, notes)')
        .eq('is_public', true)
        .order('priority_score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50) as any);

      if (data) {
        setClosers(
          data.map((d: any) => ({
            ...d,
            subscription_tier: d.user_type?.subscription_tier ?? 'bronze',
            badges: d.badges ?? [],
            user_type: undefined,
          })) as CloserRow[]
        );
      }
      setLoading(false);
    })();
  }, []);

  const filtered = closers.filter(c => {
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      if (!c.display_name.toLowerCase().includes(q) && !(c.headline ?? '').toLowerCase().includes(q)) return false;
    }
    if (filters.industries.length > 0 && !filters.industries.some(i => c.industries.includes(i))) return false;
    if (filters.languages.length > 0 && !filters.languages.some(l => c.languages.includes(l))) return false;
    if (filters.availability !== 'all' && c.availability !== filters.availability) return false;
    if (filters.hasEtcBadge && !c.badges?.some(b => b.is_active)) return false;
    return true;
  });

  const showBronzeBanner = !isAuthenticated || tier === 'bronze';

  return (
    <div style={{ minHeight: '100vh', background: '#F7F2E9' }}>
      {/* PAGE HEADER */}
      <div style={{ background: '#141410', padding: '40px 40px 32px' }}>
        <div style={{
          fontFamily: 'DM Sans, sans-serif', fontSize: 9, textTransform: 'uppercase',
          letterSpacing: '0.26em', color: '#B8952A', marginBottom: 8,
        }}>
          The Close — Directory
        </div>
        <h1 style={{
          fontFamily: 'Cormorant Garamond, serif', fontSize: 36, fontWeight: 300,
          color: '#F7F2E9', margin: 0,
        }}>
          Closer finden.
        </h1>
        <p style={{
          fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 300,
          color: '#4A4840', marginTop: 6,
        }}>
          {filtered.length} Closer im Netzwerk
        </p>
      </div>

      {/* BRONZE GATE BANNER */}
      {showBronzeBanner && (
        <div style={{
          background: '#EDE7D9', borderBottom: '1px solid #D4C9A8',
          padding: '12px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 8,
        }}>
          <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 300, color: '#7A7568' }}>
            Ab Silver: Kontakt aufnehmen und Closing Rates einsehen.
          </span>
          <button
            onClick={() => navigate('/the-close/join')}
            style={{
              fontFamily: 'DM Sans, sans-serif', fontSize: 10, padding: '6px 14px',
              border: '1px solid #B8952A', color: '#B8952A', background: 'transparent', cursor: 'pointer',
            }}
          >
            Ab Silver dabei sein
          </button>
        </div>
      )}

      {/* BODY */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 32 }}>
        {/* Mobile filter toggle */}
        <div className="md:hidden" style={{ marginBottom: 16 }}>
          <button
            onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
            style={{
              fontFamily: 'DM Sans, sans-serif', fontSize: 10, textTransform: 'uppercase',
              padding: '8px 16px', border: '1px solid #D4C9A8', background: 'transparent',
              color: '#3A3830', cursor: 'pointer', width: '100%',
            }}
          >
            {mobileFiltersOpen ? 'Filter ausblenden' : 'Filter anzeigen'}
          </button>
          {mobileFiltersOpen && (
            <div style={{ marginTop: 8, border: '1px solid #D4C9A8' }}>
              <DirectoryFilters filters={filters} onChange={setFilters} viewerTierRank={tierRank} />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 24 }}>
          {/* Desktop filters */}
          <div className="hidden md:block" style={{ width: 220, flexShrink: 0, position: 'sticky', top: 24, alignSelf: 'flex-start' }}>
            <DirectoryFilters filters={filters} onChange={setFilters} viewerTierRank={tierRank} />
          </div>

          {/* Grid */}
          <div style={{ flex: 1 }}>
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} style={{
                    background: '#EDE7D9', height: 260, animation: 'tc-pulse 1.5s ease infinite',
                  }} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, fontWeight: 300, color: '#7A7568' }}>
                  Keine Closer gefunden.
                </div>
                <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 300, color: '#7A7568', marginTop: 8 }}>
                  Passe die Filter an oder komm später wieder.
                </div>
                <button
                  onClick={() => setFilters(INITIAL_FILTERS)}
                  style={{
                    fontFamily: 'DM Sans, sans-serif', fontSize: 10, textTransform: 'uppercase',
                    border: '1px solid #D4C9A8', padding: '8px 20px', background: 'transparent',
                    cursor: 'pointer', marginTop: 16,
                  }}
                >
                  Filter zurücksetzen
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {filtered.map(c => (
                  <CloserCard
                    key={c.id}
                    closer={c}
                    viewerTierRank={tierRank}
                    onClick={() => navigate(`/the-close/profile/${c.user_id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Skeleton animation */}
      <style>{`
        @keyframes tc-pulse { 0%,100% { opacity:.6 } 50% { opacity:.3 } }
      `}</style>
    </div>
  );
}
