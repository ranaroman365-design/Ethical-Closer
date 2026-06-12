import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PartnerDashboardLayout } from '@/components/the-close/PartnerDashboardLayout';
import CloserCard from '@/components/the-close/CloserCard';
import DirectoryFilters from '@/components/the-close/DirectoryFilters';
import { CloserCardSkeleton } from '@/components/the-close/Skeletons';
import { EmptyState } from '@/components/the-close/EmptyState';
import type { CloserProfile, TierKey } from '@/types/the-close';

type DirectoryFilter = {
  searchQuery: string;
  industries: string[];
  languages: string[];
  availability: 'all' | 'available' | 'open';
  hasEtcBadge: boolean;
};

export default function TheClosePartnerDirectory() {
  const navigate = useNavigate();
  const [closers, setClosers] = useState<(CloserProfile & { subscription_tier?: TierKey })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<DirectoryFilter>({
    searchQuery: '', industries: [], languages: [], availability: 'all', hasEtcBadge: false,
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('closer_profiles').select('*').eq('is_public', true).order('priority_score', { ascending: false });
      if (data) {
        const userIds = data.map(d => d.user_id);
        const { data: types } = await supabase.from('the_close_user_types').select('user_id, subscription_tier').in('user_id', userIds).eq('role', 'closer');
        const tierMap = new Map((types ?? []).map(t => [t.user_id, t.subscription_tier as TierKey]));
        setClosers(data.map(d => ({ ...d, subscription_tier: tierMap.get(d.user_id) ?? 'bronze' })) as unknown as (CloserProfile & { subscription_tier?: TierKey })[]);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = closers.filter(c => {
    if (filters.searchQuery && !c.display_name.toLowerCase().includes(filters.searchQuery.toLowerCase()) && !(c.headline ?? '').toLowerCase().includes(filters.searchQuery.toLowerCase())) return false;
    if (filters.availability !== 'all' && c.availability !== filters.availability) return false;
    if (filters.industries.length && !filters.industries.some(i => c.industries.includes(i))) return false;
    if (filters.languages.length && !filters.languages.some(l => c.languages.includes(l))) return false;
    return true;
  });

  return (
    <PartnerDashboardLayout>
      <div className="max-w-[1100px] mx-auto py-8 px-6">
        <p className="uppercase tracking-[0.14em] text-[9px] mb-1" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568' }}>The Close — Directory</p>
        <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '32px', fontWeight: 300, color: '#141410' }}>Closer finden</h1>
        <p className="mb-6" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#7A7568' }}>{filtered.length} Closer verfügbar</p>
        <div className="flex gap-6">
          <div className="hidden md:block w-[240px] shrink-0 sticky top-6 self-start">
            <DirectoryFilters filters={filters} onChange={setFilters} viewerTierRank={4} />
          </div>
          <div className="flex-1">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => <CloserCardSkeleton key={i} />)}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState title="Keine Closer gefunden." description="Versuche andere Filtereinstellungen." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map(c => (
                  <CloserCard
                    key={c.id}
                    closer={c}
                    viewerTierRank={4}
                    onClick={() => navigate(`/the-close/profile/${c.user_id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PartnerDashboardLayout>
  );
}
