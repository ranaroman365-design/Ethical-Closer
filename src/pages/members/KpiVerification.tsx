import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Upload, FileText, CheckCircle2, Clock, XCircle,
  AlertTriangle, Send, Plus, Trash2, BarChart3,
} from 'lucide-react';

type SubmissionStatus = 'draft' | 'submitted' | 'under_review' | 'verified' | 'rejected';

interface Verification {
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
  verified_at: string | null;
  rejected_at: string | null;
  created_at: string;
}

interface ProofFile {
  id: string;
  verification_id: string;
  file_url: string;
  file_type: string | null;
  file_name: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<SubmissionStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  draft: { label: 'Entwurf', color: 'bg-muted text-muted-foreground', icon: FileText },
  submitted: { label: 'Eingereicht', color: 'bg-primary/15 text-primary', icon: Send },
  under_review: { label: 'Wird geprüft', color: 'bg-amber-500/15 text-amber-600', icon: Clock },
  verified: { label: 'Verifiziert', color: 'bg-emerald-500/15 text-emerald-600', icon: CheckCircle2 },
  rejected: { label: 'Abgelehnt', color: 'bg-destructive/15 text-destructive', icon: XCircle },
};

export default function KpiVerification() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [proofFiles, setProofFiles] = useState<ProofFile[]>([]);

  // Form state
  const [form, setForm] = useState({
    calls_completed: 0,
    qualified_calls: 0,
    deals_closed: 0,
    conversion_rate: 0,
    revenue_generated: 0,
    proof_notes: '',
  });

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('kpi_verifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      const v = data as any as Verification;
      setVerification(v);
      setForm({
        calls_completed: v.calls_completed,
        qualified_calls: v.qualified_calls ?? 0,
        deals_closed: v.deals_closed,
        conversion_rate: v.conversion_rate,
        revenue_generated: v.revenue_generated,
        proof_notes: v.proof_notes ?? '',
      });
      // Load proof files
      const { data: files } = await supabase
        .from('kpi_proof_files')
        .select('*')
        .eq('verification_id', v.id)
        .order('created_at');
      setProofFiles((files as any as ProofFile[]) ?? []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const status = (verification?.submission_status ?? 'draft') as SubmissionStatus;
  const isEditable = status === 'draft' || status === 'rejected';
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const StatusIcon = statusCfg.icon;

  async function createOrSaveDraft() {
    if (!user) return;
    setSaving(true);
    if (verification) {
      await supabase
        .from('kpi_verifications')
        .update({
          calls_completed: form.calls_completed,
          qualified_calls: form.qualified_calls,
          deals_closed: form.deals_closed,
          conversion_rate: form.conversion_rate,
          revenue_generated: form.revenue_generated,
          proof_notes: form.proof_notes || null,
          submission_status: 'draft',
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', verification.id);
    } else {
      const { data } = await supabase
        .from('kpi_verifications')
        .insert({
          user_id: user.id,
          calls_completed: form.calls_completed,
          qualified_calls: form.qualified_calls,
          deals_closed: form.deals_closed,
          conversion_rate: form.conversion_rate,
          revenue_generated: form.revenue_generated,
          proof_notes: form.proof_notes || null,
          submission_status: 'draft',
          proof_status: 'pending',
        } as any)
        .select()
        .single();
      if (data) setVerification(data as any);
    }
    setSaving(false);
    toast({ title: 'Entwurf gespeichert' });
    loadData();
  }

  async function submitVerification() {
    if (!verification) {
      await createOrSaveDraft();
    }
    setSubmitting(true);
    const vid = verification?.id;
    if (vid) {
      await supabase
        .from('kpi_verifications')
        .update({
          calls_completed: form.calls_completed,
          qualified_calls: form.qualified_calls,
          deals_closed: form.deals_closed,
          conversion_rate: form.conversion_rate,
          revenue_generated: form.revenue_generated,
          proof_notes: form.proof_notes || null,
          submission_status: 'submitted',
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', vid);
      // Audit log
      await supabase.from('audit_logs').insert({
        action: 'kpi_submission_submitted',
        actor_id: user?.id,
        target_user_id: user?.id,
        source_type: 'user',
        note: 'KPI verification submitted for review',
        after_state: form as any,
      });
    }
    setSubmitting(false);
    toast({ title: 'Eingereicht', description: 'Deine KPI-Verifizierung wird jetzt geprüft.' });
    loadData();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length || !user || !verification) return;
    setUploading(true);
    const file = e.target.files[0];
    const path = `${user.id}/${verification.id}/${Date.now()}_${file.name}`;
    const { error: uploadErr } = await supabase.storage.from('kpi-proof').upload(path, file);
    if (uploadErr) {
      toast({ title: 'Upload-Fehler', description: uploadErr.message, variant: 'destructive' });
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('kpi-proof').getPublicUrl(path);
    await supabase.from('kpi_proof_files').insert({
      verification_id: verification.id,
      file_url: path,
      file_type: file.type,
      file_name: file.name,
      uploaded_by: user.id,
    } as any);
    setUploading(false);
    toast({ title: 'Datei hochgeladen' });
    loadData();
  }

  async function deleteProofFile(fileId: string) {
    await supabase.from('kpi_proof_files').delete().eq('id', fileId);
    setProofFiles(prev => prev.filter(f => f.id !== fileId));
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-5 sm:py-8">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          KPI-Verifizierung
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dokumentiere und belege deine reale Vertriebsleistung für die ETC-Zertifizierung.
        </p>
      </div>

      {/* Status banner */}
      <Card className="mb-6 p-4 flex items-center gap-3 border-border/40">
        <div className={`rounded-full p-2 ${statusCfg.color}`}>
          <StatusIcon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Status: {statusCfg.label}</p>
          {status === 'verified' && verification?.verified_at && (
            <p className="text-xs text-muted-foreground">Verifiziert am {new Date(verification.verified_at).toLocaleDateString('de-DE')}</p>
          )}
          {status === 'rejected' && verification?.admin_notes && (
            <div className="mt-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
              <p className="font-medium mb-1">Ablehnungsgrund:</p>
              <p>{verification.admin_notes}</p>
            </div>
          )}
        </div>
        <Badge className={`${statusCfg.color} border-0 text-[11px]`}>{statusCfg.label}</Badge>
      </Card>

      {/* Guidance */}
      <Card className="mb-6 p-4 border-border/40 bg-accent/5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground text-sm">Hinweis zur KPI-Verifizierung</p>
            <p>Um die Performance-Säule deiner Zertifizierung abzuschließen, reiche dokumentierte Nachweise deiner realen Vertriebsaktivität und Ergebnisse ein.</p>
            <p>Deine Einreichung wird geprüft, bevor die KPI-Verifizierung erteilt wird.</p>
          </div>
        </div>
      </Card>

      {/* KPI Form */}
      <Card className="mb-6 p-5 border-border/40">
        <h2 className="text-sm font-semibold text-foreground mb-4">Leistungskennzahlen</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground">Calls abgeschlossen</label>
            <Input type="number" min={0} value={form.calls_completed} disabled={!isEditable}
              onChange={e => setForm(f => ({ ...f, calls_completed: parseInt(e.target.value) || 0 }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Qualifizierte Calls</label>
            <Input type="number" min={0} value={form.qualified_calls} disabled={!isEditable}
              onChange={e => setForm(f => ({ ...f, qualified_calls: parseInt(e.target.value) || 0 }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Deals abgeschlossen</label>
            <Input type="number" min={0} value={form.deals_closed} disabled={!isEditable}
              onChange={e => setForm(f => ({ ...f, deals_closed: parseInt(e.target.value) || 0 }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Conversion Rate (%)</label>
            <Input type="number" min={0} max={100} step={0.1} value={form.conversion_rate} disabled={!isEditable}
              onChange={e => setForm(f => ({ ...f, conversion_rate: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">Generierter Umsatz (€)</label>
            <Input type="number" min={0} step={0.01} value={form.revenue_generated} disabled={!isEditable}
              onChange={e => setForm(f => ({ ...f, revenue_generated: parseFloat(e.target.value) || 0 }))} />
          </div>
        </div>
      </Card>

      {/* Proof upload */}
      <Card className="mb-6 p-5 border-border/40">
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Upload className="h-4 w-4" /> Nachweise hochladen
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Lade Screenshots, PDF-Exports, CRM-Auszüge oder andere Belege hoch.
        </p>

        {proofFiles.length > 0 && (
          <div className="space-y-2 mb-4">
            {proofFiles.map(f => (
              <div key={f.id} className="flex items-center gap-3 rounded-lg border border-border/40 p-3 text-xs">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate text-foreground">{f.file_name || 'Datei'}</span>
                <span className="text-muted-foreground">{f.file_type}</span>
                {isEditable && (
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => deleteProofFile(f.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {isEditable && verification && (
          <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-border/60 p-4 hover:bg-accent/5 transition-colors">
            <Plus className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{uploading ? 'Wird hochgeladen...' : 'Datei auswählen'}</span>
            <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx" onChange={handleFileUpload} disabled={uploading} />
          </label>
        )}
      </Card>

      {/* Notes */}
      <Card className="mb-6 p-5 border-border/40">
        <h2 className="text-sm font-semibold text-foreground mb-3">Anmerkungen</h2>
        <Textarea
          placeholder="Beschreibe kurz die eingereichten Nachweise und den Kontext deiner Leistung..."
          value={form.proof_notes}
          disabled={!isEditable}
          onChange={e => setForm(f => ({ ...f, proof_notes: e.target.value }))}
          rows={4}
          className="text-xs"
        />
      </Card>

      {/* Actions */}
      {isEditable && (
        <div className="flex gap-3">
          <Button variant="outline" onClick={createOrSaveDraft} disabled={saving} className="flex-1">
            {saving ? 'Speichern...' : 'Entwurf speichern'}
          </Button>
          <Button onClick={submitVerification} disabled={submitting || form.calls_completed === 0} className="flex-1">
            <Send className="mr-2 h-4 w-4" />
            {submitting ? 'Einreichen...' : 'Zur Prüfung einreichen'}
          </Button>
        </div>
      )}

      {status === 'verified' && (
        <Card className="p-5 border-emerald-500/30 bg-emerald-500/5 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
          <p className="text-sm font-semibold text-foreground">KPI-Performance verifiziert</p>
          <p className="text-xs text-muted-foreground mt-1">Deine reale Vertriebsleistung wurde bestätigt.</p>
        </Card>
      )}
    </div>
  );
}
