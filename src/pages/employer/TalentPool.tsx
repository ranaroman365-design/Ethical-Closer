import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useEmployerAccess } from '@/hooks/useEmployerAccess';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Search, Bookmark, MessageSquare, Shield, CheckCircle2, Filter } from 'lucide-react';

interface Candidate {
  id: string;
  full_name: string | null;
  business_stage: string;
  certified: boolean;
  certification_status: string;
}

interface CertData {
  user_id: string;
  final_score: number | null;
  percentile_rank: number | null;
  kpi_total_calls: number | null;
  kpi_deals_closed: number | null;
  kpi_conversion_rate: number | null;
  kpi_revenue: number | null;
  simulation_avg: number | null;
  realtime_verified: boolean | null;
  certification_title: string | null;
}

export default function TalentPool() {
  const { companyId } = useEmployerAccess();
  const { user } = useAuth();
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [certMap, setCertMap] = useState<Record<string, CertData>>({});
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [contactTarget, setContactTarget] = useState<Candidate | null>(null);
  const [contactMsg, setContactMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [candRes, certRes, savedRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, business_stage, certified, certification_status')
          .eq('certified', true).eq('employer_visibility_enabled', true),
        supabase.from('certification_status').select('user_id, final_score, percentile_rank, kpi_total_calls, kpi_deals_closed, kpi_conversion_rate, kpi_revenue, simulation_avg, realtime_verified, certification_title'),
        companyId ? supabase.from('employer_saved_profiles').select('candidate_user_id').eq('company_id', companyId) : Promise.resolve({ data: [] }),
      ]);
      setCandidates((candRes.data ?? []) as Candidate[]);
      const cm: Record<string, CertData> = {};
      ((certRes.data ?? []) as CertData[]).forEach(c => { cm[c.user_id] = c; });
      setCertMap(cm);
      setSavedIds(new Set(((savedRes as any).data ?? []).map((s: any) => s.candidate_user_id)));
      setLoading(false);
    }
    load();
  }, [companyId]);

  const filtered = useMemo(() => {
    if (!search) return candidates;
    const q = search.toLowerCase();
    return candidates.filter(c => c.full_name?.toLowerCase().includes(q) || c.business_stage?.toLowerCase().includes(q));
  }, [candidates, search]);

  async function saveProfile(candidateId: string) {
    if (!companyId || !user) return;
    const { error } = await supabase.from('employer_saved_profiles').insert({
      company_id: companyId,
      candidate_user_id: candidateId,
      saved_by: user.id,
    });
    if (!error) {
      setSavedIds(prev => new Set([...prev, candidateId]));
      toast({ title: 'Profile saved' });
    }
  }

  async function sendContact() {
    if (!companyId || !user || !contactTarget) return;
    setSending(true);
    await supabase.from('employer_contacts').insert({
      company_id: companyId,
      sender_id: user.id,
      candidate_user_id: contactTarget.id,
      message: contactMsg,
    });
    setSending(false);
    setContactTarget(null);
    setContactMsg('');
    toast({ title: 'Contact request sent' });
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-xl font-semibold text-foreground">Talent Pool</h2>
          <p className="text-sm text-muted-foreground">{filtered.length} certified candidates available</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search candidates..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <h3 className="font-semibold text-foreground">No Visible Talent Yet</h3>
          <p className="text-sm text-muted-foreground">There are currently no certified candidates available for employer access.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(c => {
            const cert = certMap[c.id];
            return (
              <div key={c.id} className="rounded-xl border border-border/40 bg-card p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{c.full_name || 'Anonymous'}</p>
                    <p className="text-xs text-muted-foreground capitalize">{c.business_stage?.replace(/_/g, ' ')}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600">
                    <CheckCircle2 className="mr-1 h-3 w-3" />Certified
                  </Badge>
                </div>

                {cert && (
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                      <p className="text-muted-foreground">Score</p>
                      <p className="font-bold text-foreground">{cert.final_score?.toFixed(1) ?? '—'}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                      <p className="text-muted-foreground">Percentile</p>
                      <p className="font-bold text-foreground">Top {cert.percentile_rank ?? '—'}%</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                      <p className="text-muted-foreground">Deals</p>
                      <p className="font-bold text-foreground">{cert.kpi_deals_closed ?? 0}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                      <p className="text-muted-foreground">Conv. Rate</p>
                      <p className="font-bold text-foreground">{cert.kpi_conversion_rate?.toFixed(1) ?? 0}%</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  {cert?.realtime_verified && (
                    <Badge variant="outline" className="text-[9px] border-blue-500/30 text-blue-600">
                      <Shield className="mr-0.5 h-2.5 w-2.5" />RT Verified
                    </Badge>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 text-[11px]" onClick={() => saveProfile(c.id)} disabled={savedIds.has(c.id)}>
                    <Bookmark className="mr-1 h-3 w-3" />{savedIds.has(c.id) ? 'Saved' : 'Save'}
                  </Button>
                  <Button size="sm" className="flex-1 text-[11px]" onClick={() => setContactTarget(c)}>
                    <MessageSquare className="mr-1 h-3 w-3" />Contact
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!contactTarget} onOpenChange={() => setContactTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contact {contactTarget?.full_name || 'Candidate'}</DialogTitle>
          </DialogHeader>
          <Textarea placeholder="Write your message..." value={contactMsg} onChange={e => setContactMsg(e.target.value)} rows={4} />
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setContactTarget(null)}>Cancel</Button>
            <Button onClick={sendContact} disabled={sending || !contactMsg.trim()}>Send Request</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
