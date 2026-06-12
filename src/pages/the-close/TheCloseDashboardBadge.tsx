import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTheCloseUser } from '@/hooks/the-close/useTheCloseUser';
import { DashboardLayout } from '@/components/the-close/DashboardLayout';
import EtcBadge from '@/components/the-close/EtcBadge';
import KpiSubmissionForm from '@/components/the-close/KpiSubmissionForm';
import { TierUpgradeBanner } from '@/components/the-close/TierUpgradeBanner';
import type { EtcBadge as EtcBadgeType, KpiSubmission } from '@/types/the-close';

const STATUS_COLORS: Record<string, string> = {
  submitted: '#D4C9A8', under_review: '#B8952A', approved: '#22C55E', rejected: '#EF4444',
};

export default function TheCloseDashboardBadge() {
  const { user, tierRank } = useTheCloseUser();
  const [badges, setBadges] = useState<EtcBadgeType[]>([]);
  const [submissions, setSubmissions] = useState<KpiSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    const [bRes, sRes] = await Promise.all([
      supabase.from('etc_badges').select('*').eq('user_id', user.id),
      supabase.from('kpi_submissions').select('*').eq('user_id', user.id).order('submitted_at', { ascending: false }),
    ]);
    if (bRes.data) setBadges(bRes.data as unknown as EtcBadgeType[]);
    if (sRes.data) setSubmissions(sRes.data as unknown as KpiSubmission[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const hasApprovedKpi = submissions.some(s => s.status === 'approved');
  const hasActiveBadge = badges.some(b => b.is_active && b.badge_type === 'etc_closer_gold');

  if (loading) return <DashboardLayout><div className="p-10" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#7A7568' }}>Lade...</div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="max-w-[760px] mx-auto py-8 px-6">
        {/* Active badges */}
        <div className="mb-8">
          <p className="uppercase tracking-[0.14em] text-[9px] mb-4" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568' }}>Meine Badges</p>
          {badges.filter(b => b.is_active).length === 0 ? (
            <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#7A7568' }}>Noch keine Badges. Reiche deine KPIs ein um den Prozess zu starten.</p>
          ) : (
            <div className="flex gap-6 flex-wrap">
              {badges.filter(b => b.is_active).map(b => (
                <EtcBadge key={b.id} type={b.badge_type} size="lg" showLabel showTooltip />
              ))}
            </div>
          )}
        </div>

        {/* Checklist */}
        <div className="mb-8 p-5" style={{ border: '1px solid #D4C9A8' }}>
          <p className="uppercase tracking-[0.14em] text-[9px] mb-4" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568' }}>Voraussetzungen für ETC Badge</p>
          {[
            { label: 'ETC Programm abgeschlossen', done: false },
            { label: 'Gold oder höher Tier aktiv', done: tierRank >= 2 },
            { label: 'KPI Nachweis eingereicht', done: hasApprovedKpi },
            { label: 'Vom Team verifiziert', done: hasActiveBadge },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-3 py-2">
              <span style={{ color: item.done ? '#22C55E' : '#D4C9A8', fontSize: '16px' }}>{item.done ? '✓' : '○'}</span>
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', color: item.done ? '#141410' : '#7A7568' }}>{item.label}</span>
            </div>
          ))}
        </div>

        {/* KPI submission */}
        {tierRank >= 3 ? (
          <div className="mb-8">
            <p className="uppercase tracking-[0.14em] text-[9px] mb-4" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568' }}>KPI Nachweis einreichen</p>
            <KpiSubmissionForm onSuccess={load} />
          </div>
        ) : tierRank === 2 ? (
          <div className="mb-8">
            <TierUpgradeBanner requiredTier="gold" message="KPI-Einreichung ist ab Gold-Mitgliedschaft möglich." />
          </div>
        ) : null}

        {/* Existing submissions */}
        {submissions.length > 0 && (
          <div>
            <p className="uppercase tracking-[0.14em] text-[9px] mb-3" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568' }}>Bestehende Einreichungen</p>
            {submissions.map(s => (
              <div key={s.id} className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid #EDE7D9' }}>
                <div>
                  <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', color: '#141410' }}>
                    {s.submission_type === 'badge_application' ? 'Badge-Antrag' : s.submission_type === 'champion_claim' ? 'Champion Track' : 'KPI-Update'}
                  </p>
                  <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: '#7A7568' }}>{s.closes_count} Closes</p>
                </div>
                <span className="px-2 py-0.5 text-[9px] uppercase" style={{ fontFamily: 'DM Sans, sans-serif', border: `1px solid ${STATUS_COLORS[s.status]}`, color: STATUS_COLORS[s.status] }}>{s.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
