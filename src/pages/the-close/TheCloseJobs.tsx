import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTheCloseUser } from '@/hooks/the-close/useTheCloseUser';
import JobCard from '@/components/the-close/JobCard';
import type { TierKey } from '@/types/the-close';
import { TIER_RANK } from '@/types/the-close';

type RoleFilter = 'all' | 'closer' | 'setter' | 'sales_manager';
type LocationFilter = 'all' | 'remote' | 'hybrid' | 'onsite';

const ROLE_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'closer', label: 'Closer' },
  { value: 'setter', label: 'Setter' },
  { value: 'sales_manager', label: 'Manager' },
];

const LOCATION_OPTIONS: { value: LocationFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'Vor Ort' },
];

export default function TheCloseJobs() {
  const navigate = useNavigate();
  const { user, tierRank, isCloser, isAuthenticated } = useTheCloseUser();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [locationFilter, setLocationFilter] = useState<LocationFilter>('all');
  const [badgeFilter, setBadgeFilter] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from as Function)('tc_job_offers')
        .select('*, partner:tc_partner_profiles(company_name, logo_url, is_verified)')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (data) setJobs(data);

      if (user && isCloser) {
        const { data: cp } = await supabase.from('closer_profiles').select('id').eq('user_id', user.id).single();
        if (cp) {
          const { data: apps } = await (supabase.from as Function)('tc_job_applications')
            .select('job_id')
            .eq('closer_id', cp.id);
          if (apps) setAppliedJobIds(new Set(apps.map((a: { job_id: string }) => a.job_id)));
        }
      }
      setLoading(false);
    })();
  }, [user?.id, isCloser]);

  const displayJobs = useMemo(() => {
    return jobs
      .map(job => ({
        ...job,
        isGated: tierRank < (TIER_RANK[(job.min_tier as TierKey) ?? 'bronze'] ?? 1),
      }))
      .filter(job => {
        if (roleFilter !== 'all' && job.role_type !== roleFilter) return false;
        if (locationFilter !== 'all' && job.location_type !== locationFilter) return false;
        if (badgeFilter && !job.requires_etc_badge) return false;
        return true;
      })
      .sort((a, b) => Number(a.isGated) - Number(b.isGated));
  }, [jobs, tierRank, roleFilter, locationFilter, badgeFilter]);

  const handleApply = async (jobId: string) => {
    if (!user || !isCloser) {
      navigate('/the-close/join');
      return;
    }
    const { data: cp } = await supabase.from('closer_profiles').select('id').eq('user_id', user.id).single();
    if (!cp) return;
    const { error } = await (supabase.from as Function)('tc_job_applications').insert({
      job_id: jobId,
      closer_id: cp.id,
      status: 'sent',
    });
    if (!error) {
      setAppliedJobIds(prev => new Set([...prev, jobId]));
    }
  };

  const filterBtnStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: 'DM Sans, sans-serif',
    fontSize: 9,
    textTransform: 'uppercase',
    padding: '5px 12px',
    cursor: 'pointer',
    background: active ? '#141410' : 'transparent',
    color: active ? '#F7F2E9' : '#7A7568',
    border: active ? '1px solid #141410' : '1px solid #D4C9A8',
  });

  return (
    <div style={{ minHeight: '100vh', background: '#F7F2E9' }}>
      {/* PAGE HEADER */}
      <div style={{ background: '#141410', padding: '40px 40px 32px' }}>
        <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', color: '#B8952A', marginBottom: 8 }}>
          The Close — Job Board
        </div>
        <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 36, fontWeight: 300, color: '#F7F2E9', margin: 0 }}>
          Closer-Positionen.
        </h1>
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 300, color: '#4A4840', marginTop: 6 }}>
          Wöchentlich aktualisiert · {jobs.length} aktive Angebote
        </p>
      </div>

      {/* SILVER UPGRADE BANNER */}
      {tierRank < 2 && (
        <div
          style={{
            background: '#F0EAD9',
            borderBottom: '1px solid #D4C9A8',
            padding: '12px 40px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 300, color: '#7A7568' }}>
            Ab Silver: alle Positionen ohne Einschränkung sehen.
          </span>
          <button
            onClick={() => navigate('/the-close/join')}
            style={{
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 9,
              textTransform: 'uppercase',
              border: '1px solid #B8952A',
              color: '#B8952A',
              background: 'transparent',
              padding: '6px 14px',
              cursor: 'pointer',
            }}
          >
            Ab Silver dabei sein
          </button>
        </div>
      )}

      {/* FILTER BAR */}
      <div
        style={{
          background: '#F0EAD9',
          borderBottom: '1px solid #D4C9A8',
          padding: '12px 40px',
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        {ROLE_OPTIONS.map(opt => (
          <button key={opt.value} onClick={() => setRoleFilter(opt.value)} style={filterBtnStyle(roleFilter === opt.value)}>
            {opt.label}
          </button>
        ))}
        <div style={{ width: 1, background: '#D4C9A8', margin: '0 4px' }} />
        {LOCATION_OPTIONS.map(opt => (
          <button key={opt.value} onClick={() => setLocationFilter(opt.value)} style={filterBtnStyle(locationFilter === opt.value)}>
            {opt.label}
          </button>
        ))}
        {tierRank >= 2 && (
          <>
            <div style={{ width: 1, background: '#D4C9A8', margin: '0 4px' }} />
            <button onClick={() => setBadgeFilter(!badgeFilter)} style={filterBtnStyle(badgeFilter)}>
              ETC Badge erforderlich
            </button>
          </>
        )}
      </div>

      {/* GRID BODY */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: 32 }}>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ background: '#EDE7D9', height: 260, animation: 'tc-pulse 1.5s ease infinite' }} />
            ))}
          </div>
        ) : displayJobs.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, fontWeight: 300, color: '#7A7568' }}>
              Keine Positionen gefunden.
            </div>
            <button
              onClick={() => { setRoleFilter('all'); setLocationFilter('all'); setBadgeFilter(false); }}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {displayJobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                viewerTierRank={tierRank}
                isCloser={isCloser}
                hasApplied={appliedJobIds.has(job.id)}
                onApply={() => handleApply(job.id)}
                onView={() => navigate(`/the-close/jobs/${job.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes tc-pulse { 0%,100% { opacity:.6 } 50% { opacity:.3 } }`}</style>
    </div>
  );
}
