import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTheCloseUser } from '@/hooks/the-close/useTheCloseUser';
import { DashboardLayout } from '@/components/the-close/DashboardLayout';
import { EmptyState } from '@/components/the-close/EmptyState';

const STATUS_COLORS: Record<string, string> = {
  sent: '#D4C9A8', viewed: '#B8952A', shortlisted: '#22C55E', declined: '#EF4444', hired: '#B8952A',
};

interface AppRow {
  id: string;
  status: string;
  applied_at: string;
  job?: { title: string; role_type: string; location_type: string; partner?: { company_name: string; logo_url: string | null; is_verified: boolean } };
}

export default function TheCloseDashboardJobs() {
  const { user } = useTheCloseUser();
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // First get closer_id
      const { data: cp } = await supabase.from('closer_profiles').select('id').eq('user_id', user.id).single();
      if (!cp) { setLoading(false); return; }
      const { data } = await (supabase.from as Function)('tc_job_applications')
        .select('*, job:tc_job_offers(title, role_type, location_type, partner:tc_partner_profiles(company_name, logo_url, is_verified))')
        .eq('closer_id', cp.id)
        .order('applied_at', { ascending: false });
      if (data) setApps(data);
      setLoading(false);
    })();
  }, [user?.id]);

  if (loading) return <DashboardLayout><div className="p-10" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#7A7568' }}>Lade...</div></DashboardLayout>;

  const active = apps.filter(a => ['sent', 'viewed', 'shortlisted'].includes(a.status));
  const done = apps.filter(a => ['declined', 'hired'].includes(a.status));

  return (
    <DashboardLayout>
      <div className="max-w-[760px] mx-auto py-8 px-6">
        <p className="uppercase tracking-[0.14em] text-[9px] mb-4" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568' }}>Meine Bewerbungen</p>
        {apps.length === 0 ? (
          <EmptyState title="Noch keine Bewerbungen." description="Schau dir das Job Board an." action={{ label: 'Jobs ansehen', href: '/the-close/jobs' }} />
        ) : (
          <>
            {active.length > 0 && (
              <div className="mb-6">
                <p className="text-[10px] uppercase mb-2" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568' }}>Aktiv</p>
                {active.map(a => <AppRow key={a.id} app={a} />)}
              </div>
            )}
            {done.length > 0 && (
              <div>
                <p className="text-[10px] uppercase mb-2" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568' }}>Abgeschlossen</p>
                {done.map(a => <AppRow key={a.id} app={a} />)}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function AppRow({ app }: { app: AppRow }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid #EDE7D9' }}>
      <div>
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', color: '#141410' }}>{app.job?.title ?? '—'}</p>
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: '#7A7568' }}>{app.job?.partner?.company_name} · {new Date(app.applied_at).toLocaleDateString('de')}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="px-2 py-0.5 text-[9px] uppercase" style={{ fontFamily: 'DM Sans, sans-serif', border: `1px solid ${STATUS_COLORS[app.status] ?? '#D4C9A8'}`, color: STATUS_COLORS[app.status] ?? '#7A7568' }}>{app.status}</span>
        <a href={`/the-close/jobs/${app.id}`} style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: '#B8952A', textDecoration: 'none' }}>Details</a>
      </div>
    </div>
  );
}
