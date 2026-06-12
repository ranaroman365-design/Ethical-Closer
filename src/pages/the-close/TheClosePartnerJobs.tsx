import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTheCloseUser } from '@/hooks/the-close/useTheCloseUser';
import { PartnerDashboardLayout } from '@/components/the-close/PartnerDashboardLayout';
import { EmptyState } from '@/components/the-close/EmptyState';
import { toast } from 'sonner';

interface Job { id: string; title: string; role_type: string; status: string; applications_count: number; created_at: string; }
interface AppRow { id: string; status: string; applied_at: string; message: string | null; closer?: { display_name: string; user_id: string } }

export default function TheClosePartnerJobs() {
  const { user } = useTheCloseUser();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: pp } = await (supabase.from as Function)('tc_partner_profiles').select('id').eq('user_id', user.id).single();
      if (!pp) { setLoading(false); return; }
      const { data } = await (supabase.from as Function)('tc_job_offers').select('id, title, role_type, status, applications_count, created_at').eq('partner_id', pp.id).order('created_at', { ascending: false });
      if (data) setJobs(data);
      setLoading(false);
    })();
  }, [user?.id]);

  const loadApps = async (jobId: string) => {
    setSelectedJob(jobId);
    setAppsLoading(true);
    const { data } = await (supabase.from as Function)('tc_job_applications').select('id, status, applied_at, message, closer:closer_profiles(display_name, user_id)').eq('job_id', jobId).order('applied_at', { ascending: false });
    if (data) setApps(data);
    setAppsLoading(false);
  };

  const updateJobStatus = async (jobId: string, status: string) => {
    const { error } = await (supabase.from as Function)('tc_job_offers').update({ status }).eq('id', jobId);
    if (error) toast.error(error.message);
    else { setJobs(j => j.map(x => x.id === jobId ? { ...x, status } : x)); toast.success('Status aktualisiert.'); }
  };

  const updateAppStatus = async (appId: string, status: string) => {
    const { error } = await (supabase.from as Function)('tc_job_applications').update({ status }).eq('id', appId);
    if (error) toast.error(error.message);
    else { setApps(a => a.map(x => x.id === appId ? { ...x, status } : x)); }
  };

  if (loading) return <PartnerDashboardLayout><div className="p-10" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#7A7568' }}>Lade...</div></PartnerDashboardLayout>;

  return (
    <PartnerDashboardLayout>
      <div className="max-w-[900px] mx-auto py-8 px-6">
        <div className="flex items-center justify-between mb-4">
          <p className="uppercase tracking-[0.14em] text-[9px]" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568' }}>Meine Angebote</p>
          <a href="/the-close/partner/jobs/new" className="uppercase tracking-[0.2em] text-[10px] px-4 py-2"
            style={{ fontFamily: 'DM Sans, sans-serif', background: '#B8952A', color: '#141410', textDecoration: 'none' }}>Neues Angebot</a>
        </div>
        {jobs.length === 0 ? (
          <EmptyState title="Noch keine Angebote." description="Erstelle dein erstes Angebot." action={{ label: 'Neues Angebot', href: '/the-close/partner/jobs/new' }} />
        ) : (
          <div>
            {jobs.map(j => (
              <div key={j.id} className="py-4" style={{ borderBottom: '1px solid #EDE7D9' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '14px', color: '#141410' }}>{j.title}</p>
                    <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: '#7A7568' }}>{j.role_type} · {j.applications_count} Bewerbungen · {new Date(j.created_at).toLocaleDateString('de')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-[9px] uppercase" style={{ fontFamily: 'DM Sans, sans-serif', border: '1px solid #D4C9A8', color: j.status === 'active' ? '#22C55E' : '#7A7568' }}>{j.status}</span>
                    <button onClick={() => loadApps(j.id)} className="cursor-pointer text-[11px]" style={{ fontFamily: 'DM Sans, sans-serif', color: '#B8952A', background: 'none', border: 'none' }}>Bewerber</button>
                    {j.status === 'active' ? (
                      <button onClick={() => updateJobStatus(j.id, 'paused')} className="cursor-pointer text-[11px]" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568', background: 'none', border: 'none' }}>Pausieren</button>
                    ) : j.status === 'paused' ? (
                      <button onClick={() => updateJobStatus(j.id, 'active')} className="cursor-pointer text-[11px]" style={{ fontFamily: 'DM Sans, sans-serif', color: '#22C55E', background: 'none', border: 'none' }}>Aktivieren</button>
                    ) : null}
                    {j.status !== 'closed' && (
                      <button onClick={() => updateJobStatus(j.id, 'closed')} className="cursor-pointer text-[11px]" style={{ fontFamily: 'DM Sans, sans-serif', color: '#EF4444', background: 'none', border: 'none' }}>Schließen</button>
                    )}
                  </div>
                </div>
                {/* Applicants inline */}
                {selectedJob === j.id && (
                  <div className="mt-3 p-4" style={{ background: '#EDE7D9', border: '1px solid #D4C9A8' }}>
                    {appsLoading ? <p className="text-[12px]" style={{ color: '#7A7568' }}>Lade...</p> : apps.length === 0 ? <p className="text-[12px]" style={{ color: '#7A7568' }}>Keine Bewerbungen.</p> : (
                      apps.map(a => (
                        <div key={a.id} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #D4C9A8' }}>
                          <div>
                            <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', color: '#141410' }}>{a.closer?.display_name ?? '—'}</p>
                            {a.message && <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: '#7A7568' }}>{a.message}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <select value={a.status} onChange={e => updateAppStatus(a.id, e.target.value)}
                              className="cursor-pointer text-[11px] p-1" style={{ fontFamily: 'DM Sans, sans-serif', border: '1px solid #D4C9A8', background: '#F7F2E9' }}>
                              {['sent', 'viewed', 'shortlisted', 'hired', 'declined'].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            {a.closer?.user_id && <a href={`/the-close/profile/${a.closer.user_id}`} className="text-[11px]" style={{ color: '#B8952A' }}>Profil</a>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </PartnerDashboardLayout>
  );
}
