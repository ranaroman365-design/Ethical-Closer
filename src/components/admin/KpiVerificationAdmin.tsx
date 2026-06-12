import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  CheckCircle2, XCircle, Clock, FileText, Eye,
  ChevronDown, ChevronUp, BarChart3, ExternalLink,
} from 'lucide-react';

type StatusFilter = 'all' | 'submitted' | 'under_review' | 'verified' | 'rejected';

interface VerificationRow {
  id: string;
  user_id: string;
  calls_completed: number;
  qualified_calls: number;
  deals_closed: number;
  conversion_rate: number;
  revenue_generated: number;
  proof_notes: string | null;
  proof_reference: string | null;
  admin_notes: string | null;
  submission_status: string;
  proof_status: string;
  verified_by: string | null;
  verified_at: string | null;
  rejected_at: string | null;
  created_at: string;
  profiles?: { full_name: string | null; email: string | null } | null;
}

interface ProofFile {
  id: string;
  verification_id: string;
  file_url: string;
  file_type: string | null;
  file_name: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-primary/15 text-primary',
  under_review: 'bg-amber-500/15 text-amber-600',
  verified: 'bg-emerald-500/15 text-emerald-600',
  rejected: 'bg-destructive/15 text-destructive',
};

export default function KpiVerificationAdmin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('submitted');
  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [proofFiles, setProofFiles] = useState<Record<string, ProofFile[]>>({});
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  useEffect(() => { loadSubmissions(); }, [filter]);

  async function loadSubmissions() {
    setLoading(true);
    let q = (supabase as any)
      .from('kpi_verifications')
      .select('*, profiles!kpi_verifications_user_id_fkey(full_name, email)')
      .order('created_at', { ascending: false });

    if (filter !== 'all') {
      q = q.eq('submission_status', filter);
    } else {
      q = q.neq('submission_status', 'draft');
    }

    const { data } = await q.limit(100);
    setRows((data as any as VerificationRow[]) ?? []);
    setLoading(false);
  }

  async function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!proofFiles[id]) {
      const { data } = await supabase
        .from('kpi_proof_files')
        .select('*')
        .eq('verification_id', id);
      setProofFiles(prev => ({ ...prev, [id]: (data as any as ProofFile[]) ?? [] }));
    }
  }

  async function verifySubmission(row: VerificationRow) {
    const notes = adminNotes[row.id] || '';
    await supabase
      .from('kpi_verifications')
      .update({
        submission_status: 'verified',
        proof_status: 'verified',
        verified_by: user?.id,
        verified_at: new Date().toISOString(),
        admin_notes: notes || null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', row.id);

    // Update certification_status kpi_verified
    await supabase
      .from('certification_status')
      .update({
        kpi_verified: true,
        kpi_total_calls: row.calls_completed,
        kpi_deals_closed: row.deals_closed,
        kpi_revenue: row.revenue_generated,
        kpi_conversion_rate: row.conversion_rate,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', row.user_id);

    // Trigger certification recalc
    await supabase.rpc('recalculate_certification', { p_user_id: row.user_id });

    // Audit
    await supabase.from('audit_logs').insert({
      action: 'kpi_submission_verified',
      actor_id: user?.id,
      target_user_id: row.user_id,
      source_type: 'admin',
      note: 'KPI verification approved',
      after_state: { calls: row.calls_completed, deals: row.deals_closed, revenue: row.revenue_generated } as any,
    });

    toast({ title: 'KPI verifiziert', description: `Verifizierung für User genehmigt.` });
    loadSubmissions();
  }

  async function rejectSubmission(row: VerificationRow) {
    const notes = adminNotes[row.id] || '';
    if (!notes.trim()) {
      toast({ title: 'Bitte Ablehnungsgrund angeben', variant: 'destructive' });
      return;
    }
    await supabase
      .from('kpi_verifications')
      .update({
        submission_status: 'rejected',
        proof_status: 'rejected',
        admin_notes: notes,
        rejected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', row.id);

    await supabase.from('audit_logs').insert({
      action: 'kpi_submission_rejected',
      actor_id: user?.id,
      target_user_id: row.user_id,
      source_type: 'admin',
      note: notes,
    });

    toast({ title: 'Abgelehnt' });
    loadSubmissions();
  }

  async function getSignedUrl(path: string): Promise<string | null> {
    const { data } = await supabase.storage.from('kpi-proof').createSignedUrl(path, 300);
    return data?.signedUrl ?? null;
  }

  async function openFile(path: string) {
    const url = await getSignedUrl(path);
    if (url) window.open(url, '_blank');
  }

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'submitted', label: 'Eingereicht' },
    { key: 'under_review', label: 'In Prüfung' },
    { key: 'verified', label: 'Verifiziert' },
    { key: 'rejected', label: 'Abgelehnt' },
    { key: 'all', label: 'Alle' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">KPI-Verifizierung Review</h2>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg border border-border/40 bg-card p-1">
        {filters.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`rounded px-3 py-1.5 text-[11px] font-medium transition-colors ${filter === f.key ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center border-border/40">
          <p className="text-sm text-muted-foreground">Keine Einreichungen in dieser Kategorie.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map(row => {
            const isOpen = expanded === row.id;
            const profile = row.profiles as any;
            return (
              <Card key={row.id} className="border-border/40 overflow-hidden">
                <button onClick={() => toggleExpand(row.id)} className="w-full p-4 flex items-center gap-3 text-left hover:bg-accent/5 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{profile?.full_name || profile?.email || row.user_id.slice(0,8)}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.calls_completed} Calls · {row.deals_closed} Deals · €{row.revenue_generated.toLocaleString()} Umsatz
                    </p>
                  </div>
                  <Badge className={`${STATUS_COLORS[row.submission_status] ?? STATUS_COLORS.draft} border-0 text-[10px]`}>
                    {row.submission_status}
                  </Badge>
                  <p className="text-[10px] text-muted-foreground">{new Date(row.created_at).toLocaleDateString('de-DE')}</p>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>

                {isOpen && (
                  <div className="border-t border-border/40 p-4 space-y-4 bg-muted/30">
                    {/* KPI details */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { label: 'Calls', value: row.calls_completed },
                        { label: 'Qualifizierte Calls', value: row.qualified_calls },
                        { label: 'Deals', value: row.deals_closed },
                        { label: 'Conversion', value: `${row.conversion_rate}%` },
                        { label: 'Umsatz', value: `€${row.revenue_generated.toLocaleString()}` },
                      ].map(m => (
                        <div key={m.label} className="rounded-lg border border-border/40 bg-card p-3 text-center">
                          <p className="text-lg font-bold text-foreground">{m.value}</p>
                          <p className="text-[10px] text-muted-foreground">{m.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Proof notes */}
                    {row.proof_notes && (
                      <div className="rounded-lg bg-card border border-border/40 p-3">
                        <p className="text-[10px] font-medium text-muted-foreground mb-1">Anmerkungen des Users</p>
                        <p className="text-xs text-foreground">{row.proof_notes}</p>
                      </div>
                    )}

                    {/* Proof files */}
                    {(proofFiles[row.id] ?? []).length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-muted-foreground mb-2">Nachweise</p>
                        <div className="space-y-1">
                          {proofFiles[row.id].map(f => (
                            <button key={f.id} onClick={() => openFile(f.file_url)}
                              className="flex items-center gap-2 w-full rounded-lg border border-border/40 bg-card p-2 text-xs hover:bg-accent/5 transition-colors">
                              <FileText className="h-3 w-3 text-muted-foreground" />
                              <span className="flex-1 truncate text-foreground">{f.file_name || 'Datei'}</span>
                              <ExternalLink className="h-3 w-3 text-muted-foreground" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Admin actions */}
                    {(row.submission_status === 'submitted' || row.submission_status === 'under_review') && (
                      <div className="space-y-3 pt-2 border-t border-border/40">
                        <div>
                          <label className="text-[10px] text-muted-foreground">Admin-Notizen</label>
                          <Textarea
                            value={adminNotes[row.id] ?? ''}
                            onChange={e => setAdminNotes(prev => ({ ...prev, [row.id]: e.target.value }))}
                            placeholder="Notizen zur Entscheidung..."
                            rows={2}
                            className="text-xs mt-1"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => verifySubmission(row)} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Verifizieren
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => rejectSubmission(row)} className="flex-1">
                            <XCircle className="mr-1 h-3 w-3" /> Ablehnen
                          </Button>
                        </div>
                      </div>
                    )}

                    {row.submission_status === 'verified' && (
                      <div className="flex items-center gap-2 text-emerald-600 text-xs">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Verifiziert am {row.verified_at ? new Date(row.verified_at).toLocaleDateString('de-DE') : '—'}</span>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
