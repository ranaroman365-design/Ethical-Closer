import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Lock, History, Save, Loader2, AlertTriangle } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

/** DB columns: slug, title, description, category, current_version, sensitivity_level */
interface PromptMeta {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  current_version: number;
  sensitivity_level: string;
  created_at: string;
}

export default function PromptVault() {
  const { isOwner } = usePermissions();
  const { user } = useAuth();
  const { toast } = useToast();
  const [prompts, setPrompts] = useState<PromptMeta[]>([]);
  const [selected, setSelected] = useState<PromptMeta | null>(null);
  const [editContent, setEditContent] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [purposeInput, setPurposeInput] = useState('');
  const [versionHistory, setVersionHistory] = useState<{ version: number; change_note: string | null; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contentUnlocked, setContentUnlocked] = useState(false);

  // Load prompt list metadata (owner-gated by RLS)
  useEffect(() => {
    if (!isOwner) return;
    supabase.from('prompt_registry')
      .select('id, slug, title, description, category, current_version, sensitivity_level, created_at')
      .order('category').order('title')
      .then(({ data }) => { setPrompts((data as unknown as PromptMeta[]) ?? []); setLoading(false); });
  }, [isOwner]);

  /** Load full prompt content via server-side edge function — every read is audit-logged */
  const loadPromptContent = async (prompt: PromptMeta) => {
    if (!purposeInput.trim()) {
      toast({ title: 'Zweck erforderlich', description: 'Bitte gib den Zugriffszweck an.', variant: 'destructive' });
      return;
    }
    setContentLoading(true);
    setContentUnlocked(false);

    try {
      const { data, error } = await supabase.functions.invoke('access-prompt-vault', {
        body: { action: 'read', prompt_key: prompt.slug, purpose: purposeInput },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error ?? 'Unknown error');

      setSelected(prompt);
      setEditContent(data.version?.prompt_text ?? '');
      setChangeNote('');
      setContentUnlocked(true);

      // Load version history (metadata only — no content exposed client-side)
      const { data: versions } = await supabase
        .from('prompt_versions')
        .select('version, change_note, created_at')
        .eq('prompt_id', prompt.id)
        .order('version', { ascending: false });
      setVersionHistory((versions as unknown as { version: number; change_note: string | null; created_at: string }[]) ?? []);
    } catch (err: any) {
      toast({ title: 'Fehler', description: err.message, variant: 'destructive' });
    } finally {
      setContentLoading(false);
    }
  };

  /** Save new version via server-side edge function — NO client-side writes */
  const saveNewVersion = async () => {
    if (!selected || !user || !editContent.trim()) return;
    setSaving(true);

    try {
      const { data, error } = await supabase.functions.invoke('access-prompt-vault', {
        body: {
          action: 'write',
          prompt_id: selected.id,
          new_content: editContent,
          change_note: changeNote || null,
        },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error ?? 'Unknown error');

      toast({ title: `Version ${data.new_version} gespeichert` });
      setSelected(prev => prev ? { ...prev, current_version: data.new_version } : null);
      setChangeNote('');

      // Reload version history
      const { data: versions } = await supabase
        .from('prompt_versions')
        .select('version, change_note, created_at')
        .eq('prompt_id', selected.id)
        .order('version', { ascending: false });
      setVersionHistory((versions as unknown as { version: number; change_note: string | null; created_at: string }[]) ?? []);
    } catch (err: any) {
      toast({ title: 'Fehler', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!isOwner) {
    return <Navigate to="/members" replace />;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-3">
        <Lock className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Prompt Vault</h1>
          <p className="text-sm text-muted-foreground">Owner-only · Versionierte System-Prompts</p>
        </div>
        <Badge className="ml-auto bg-destructive/20 text-destructive border-destructive/30 text-[10px]">
          OWNER ONLY
        </Badge>
      </div>

      {/* Access warning */}
      <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
        <p className="text-xs text-warning">OWNER ACCESS IS AUDITED — Jeder Lese- und Schreibzugriff wird protokolliert.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Prompt List */}
        <Card className="md:col-span-1">
          <CardHeader><CardTitle className="text-sm">Prompts ({prompts.length})</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {/* Purpose input — required before any read */}
            <Input
              value={purposeInput}
              onChange={e => setPurposeInput(e.target.value)}
              placeholder="Zugriffszweck eingeben…"
              className="text-xs"
            />

            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {loading ? <p className="text-xs text-muted-foreground">Lade…</p> : prompts.map(p => (
                <button
                  key={p.id}
                  onClick={() => loadPromptContent(p)}
                  disabled={contentLoading || !purposeInput.trim()}
                  className={`w-full text-left p-2 rounded text-xs transition-colors disabled:opacity-50 ${
                    selected?.id === p.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-foreground'
                  }`}
                >
                  <div className="font-medium">{p.title}</div>
                  <div className="text-muted-foreground text-[10px]">{p.category} · v{p.current_version}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Editor */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">
              {selected ? `${selected.title} — v${selected.current_version}` : 'Prompt auswählen'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {contentLoading ? (
              <div className="flex items-center gap-2 py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Lade Prompt-Inhalt (audit-logged)…</span>
              </div>
            ) : selected && contentUnlocked ? (
              <>
                <Textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="font-mono text-xs min-h-[250px]"
                  placeholder="Prompt-Inhalt…"
                />
                <Input
                  value={changeNote}
                  onChange={e => setChangeNote(e.target.value)}
                  placeholder="Änderungsnotiz (optional)"
                  className="text-xs"
                />
                <Button size="sm" onClick={saveNewVersion} disabled={!editContent.trim() || saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                  Neue Version speichern
                </Button>

                {versionHistory.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h4 className="text-xs font-medium flex items-center gap-1">
                      <History className="h-3.5 w-3.5" /> Versionshistorie
                    </h4>
                    {versionHistory.map(v => (
                      <div key={v.version} className="p-2 rounded border border-border/50 text-[10px]">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">v{v.version}</Badge>
                          <span className="text-muted-foreground">
                            {new Date(v.created_at).toLocaleString('de-DE')}
                          </span>
                        </div>
                        {v.change_note && <p className="text-muted-foreground mt-1">{v.change_note}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Gib links einen Zugriffszweck ein und wähle einen Prompt aus.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
