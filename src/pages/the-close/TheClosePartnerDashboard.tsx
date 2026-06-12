import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTheCloseUser } from '@/hooks/the-close/useTheCloseUser';
import { PartnerDashboardLayout } from '@/components/the-close/PartnerDashboardLayout';
import { TierBadge } from '@/components/the-close/TierBadge';

export default function TheClosePartnerDashboard() {
  const { user } = useTheCloseUser();
  const [stats, setStats] = useState({ activeJobs: 0, totalApps: 0, newApps: 0, contacts: 0 });
  const [recentApps, setRecentApps] = useState<{ id: string; status: string; applied_at: string; closer_name: string; job_title: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: pp } = await (supabase.from as Function)('tc_partner_profiles').select('id').eq('user_id', user.id).single();
      if (!pp) { setLoading(false); return; }
      const [jobsRes, appsRes, contactsRes] = await Promise.all([
        (supabase.from as Function)('tc_job_offers').select('id, status, applications_count').eq('partner_id', pp.id),
        (supabase.from as Function)('tc_job_applications').select('id, status, applied_at, closer:closer_profiles(display_name), job:tc_job_offers!inner(title, partner_id)').eq('job.partner_id', pp.id).order('applied_at', { ascending: false }).limit(5),
        (supabase.from as Function)('tc_direct_contacts').select('id').eq('from_user_id', user.id),
      ]);
      const jobs = jobsRes.data ?? [];
      const apps = appsRes.data ?? [];
      setStats({
        activeJobs: jobs.filter((j: { status: string }) => j.status === 'active').length,
        totalApps: jobs.reduce((s: number, j: { applications_count: number }) => s + (j.applications_count || 0), 0),
        newApps: apps.filter((a: { status: string }) => a.status === 'sent').length,
        contacts: contactsRes.data?.length ?? 0,
      });
      setRecentApps(apps.map((a: { id: string; status: string; applied_at: string; closer?: { display_name: string }; job?: { title: string } }) => ({
        id: a.id, status: a.status, applied_at: a.applied_at,
        closer_name: a.closer?.display_name ?? '—', job_title: a.job?.title ?? '—',
      })));
      setLoading(false);
    })();
  }, [user?.id]);

  if (loading) return <PartnerDashboardLayout><div className="p-10" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#7A7568' }}>Lade...</div></PartnerDashboardLayout>;

  const statCards = [
    { label: 'Aktive Angebote', value: stats.activeJobs },
    { label: 'Bewerbungen gesamt', value: stats.totalApps },
    { label: 'Neue Bewerbungen', value: stats.newApps },
    { label: 'Gesendete Kontakte', value: stats.contacts },
  ];

  return (
    <PartnerDashboardLayout>
      <div className="max-w-[900px] mx-auto py-8 px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statCards.map(s => (
            <div key={s.label} className="p-5" style={{ border: '1px solid #D4C9A8' }}>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '36px', color: '#B8952A' }}>{s.value}</div>
              <p className="uppercase tracking-[0.14em] text-[9px] mt-1" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568' }}>{s.label}</p>
            </div>
          ))}
        </div>
        {recentApps.length > 0 && (
          <div className="mt-6">
            <p className="uppercase tracking-[0.14em] text-[9px] mb-3" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568' }}>Letzte Bewerbungen</p>
            {recentApps.map(a => (
              <div key={a.id} className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid #EDE7D9' }}>
                <div>
                  <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', color: '#141410' }}>{a.closer_name}</p>
                  <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: '#7A7568' }}>{a.job_title}</p>
                </div>
                <span className="px-2 py-0.5 text-[9px] uppercase" style={{ fontFamily: 'DM Sans, sans-serif', border: '1px solid #D4C9A8', color: '#7A7568' }}>{a.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </PartnerDashboardLayout>
  );
}
