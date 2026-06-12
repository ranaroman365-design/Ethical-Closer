import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTheCloseUser } from '@/hooks/the-close/useTheCloseUser';
import { useProfileCompleteness } from '@/hooks/the-close/useProfileCompleteness';
import { DashboardLayout } from '@/components/the-close/DashboardLayout';
import { TierBadge } from '@/components/the-close/TierBadge';
import { TierUpgradeBanner } from '@/components/the-close/TierUpgradeBanner';
import { BlackBadge } from '@/components/the-close/EtcBadge';
import type { CloserProfile, JobApplication } from '@/types/the-close';

const STATUS_COLORS: Record<string, string> = {
  sent: '#D4C9A8', viewed: '#B8952A', shortlisted: '#22C55E', declined: '#EF4444', hired: '#B8952A',
};

export default function TheCloseDashboard() {
  const { user, tier, tierRank, isBlack } = useTheCloseUser();
  const location = useLocation();
  const isNewUser = location.state?.is_new_user || localStorage.getItem('tc_first_login') === 'true';
  const [profile, setProfile] = useState<CloserProfile | null>(null);
  const [applications, setApplications] = useState<(JobApplication & { job?: { title: string; partner?: { company_name: string } } })[]>([]);
  const [badgeCount, setBadgeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [firstJobs, setFirstJobs] = useState<{ id: string; title: string; partner?: { company_name: string } }[]>([]);
  const completeness = useProfileCompleteness(profile);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [pRes, aRes, bRes] = await Promise.all([
        supabase.from('closer_profiles').select('*').eq('user_id', user.id).single(),
        (supabase.from as Function)('tc_job_applications').select('*, job:tc_job_offers(title, partner:tc_partner_profiles(company_name))').eq('closer_id', user.id).order('applied_at', { ascending: false }).limit(5),
        supabase.from('etc_badges').select('id').eq('user_id', user.id).eq('is_active', true),
      ]);
      if (pRes.data) setProfile(pRes.data as CloserProfile);
      if (aRes.data) setApplications(aRes.data);
      if (bRes.data) setBadgeCount(bRes.data.length);
      if (isNewUser) {
        const { data: jobs } = await (supabase.from as Function)('tc_job_offers').select('id, title, partner:tc_partner_profiles(company_name)').eq('status', 'active').order('created_at', { ascending: false }).limit(3);
        if (jobs) setFirstJobs(jobs);
        localStorage.setItem('tc_first_login', 'false');
      }
      setLoading(false);
    };
    load();
  }, [user?.id]);

  if (loading) return <DashboardLayout><div className="p-10" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#7A7568' }}>Lade...</div></DashboardLayout>;

  const stats = [
    { label: 'Bewerbungen', value: applications.length },
    { label: 'Profil-Score', value: `${completeness}%` },
    { label: 'Aktive Badges', value: badgeCount },
    { label: 'Tier', value: <TierBadge tier={tier} size="sm" /> },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-[900px] mx-auto py-8 px-6">
        {/* First value for new users */}
        {isNewUser && firstJobs.length > 0 && (
          <div className="mb-8 p-6" style={{ background: '#EDE7D9', border: '1px solid #D4C9A8' }}>
            <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '24px', fontWeight: 300, color: '#141410' }}>Das Netzwerk hat dich aufgenommen.</h2>
            <p className="mt-1 mb-4" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#7A7568' }}>Hier sind die ersten Positionen die zu dir passen könnten.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {firstJobs.map(j => (
                <a key={j.id} href={`/the-close/jobs/${j.id}`} className="block p-4" style={{ background: '#F7F2E9', border: '1px solid #D4C9A8', textDecoration: 'none' }}>
                  <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', fontWeight: 500, color: '#141410' }}>{j.title}</p>
                  <p className="mt-1" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: '#7A7568' }}>{j.partner?.company_name}</p>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map(s => (
            <div key={s.label} className="p-5" style={{ border: '1px solid #D4C9A8' }}>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '36px', color: '#B8952A' }}>{s.value}</div>
              <p className="uppercase tracking-[0.14em] text-[9px] mt-1" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Profile completeness */}
        <div className="mt-6 p-5" style={{ border: '1px solid #D4C9A8' }}>
          <div className="flex justify-between items-center mb-2">
            <p className="uppercase tracking-[0.14em] text-[9px]" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568' }}>Profil-Vollständigkeit</p>
            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#141410' }}>{completeness}%</span>
          </div>
          <div style={{ height: 4, background: '#EDE7D9', width: '100%' }}>
            <div style={{ height: '100%', width: `${completeness}%`, background: '#B8952A', transition: 'width 0.3s' }} />
          </div>
          {completeness < 100 && <p className="mt-2" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: '#7A7568' }}>Vollständiges Profil = höhere Sichtbarkeit</p>}
        </div>

        {/* Recent applications */}
        {applications.length > 0 && (
          <div className="mt-6">
            <p className="uppercase tracking-[0.14em] text-[9px] mb-3" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568' }}>Letzte Bewerbungen</p>
            {applications.map(a => (
              <div key={a.id} className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid #EDE7D9' }}>
                <div>
                  <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', color: '#141410' }}>{a.job?.title ?? '—'}</p>
                  <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: '#7A7568' }}>{a.job?.partner?.company_name}</p>
                </div>
                <span className="px-2 py-0.5 text-[9px] uppercase" style={{ fontFamily: 'DM Sans, sans-serif', border: `1px solid ${STATUS_COLORS[a.status] ?? '#D4C9A8'}`, color: STATUS_COLORS[a.status] ?? '#7A7568' }}>{a.status}</span>
              </div>
            ))}
          </div>
        )}

        {/* Platinum gate */}
        {tierRank < 4 && (
          <div className="mt-6">
            <TierUpgradeBanner requiredTier="platinum" message="Community, Events und Webinare — ab Platinum." />
          </div>
        )}

        {/* Black VIP section */}
        {isBlack && (
          <div className="mt-6 p-6" style={{ background: '#0A0A08' }}>
            <div className="flex items-center gap-2 mb-4">
              <BlackBadge size="md" />
              <p className="uppercase tracking-[0.2em] text-[9px]" style={{ fontFamily: 'DM Sans, sans-serif', color: '#F7F2E9' }}>VIP</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4" style={{ border: '1px solid #262620' }}>
                <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '20px', color: '#B8952A' }}>Q3 2026</p>
                <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', color: '#F7F2E9' }}>Quarterly Crossing Black</p>
                <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: '#5A5850' }}>München · 3 Tage · Invitation Only</p>
              </div>
              <div className="p-4" style={{ border: '1px solid #262620' }}>
                <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '20px', color: '#B8952A' }}>Monthly</p>
                <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', color: '#F7F2E9' }}>Black Mastermind</p>
                <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: '#5A5850' }}>Online · Nächster Termin: 15. Juni</p>
              </div>
            </div>
          </div>
        )}

        {/* Platinum events */}
        {tierRank >= 4 && !isBlack && (
          <div className="mt-6">
            <p className="uppercase tracking-[0.14em] text-[9px] mb-3" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568' }}>Nächste Events</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4" style={{ border: '1px solid #D4C9A8' }}>
                <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '20px', color: '#B8952A' }}>Q3 2026</p>
                <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', color: '#141410' }}>Quarterly Crossing</p>
                <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: '#7A7568' }}>München · Live Event</p>
              </div>
              <div className="p-4" style={{ border: '1px solid #D4C9A8' }}>
                <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '20px', color: '#B8952A' }}>Webinar</p>
                <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', color: '#141410' }}>Decision Mastery</p>
                <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: '#7A7568' }}>Online · Datum folgt</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
