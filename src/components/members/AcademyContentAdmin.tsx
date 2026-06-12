import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Save, BookOpen, ExternalLink } from 'lucide-react';

interface ModuleRow {
  id: string;
  title: string;
  description: string | null;
  phase_id: number;
  sort_order: number;
  video_url: string | null;
  worksheet_url: string | null;
}

export default function AcademyContentAdmin() {
  const { toast } = useToast();
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<ModuleRow>>>({});

  useEffect(() => {
    supabase.from('modules').select('id, title, description, phase_id, sort_order, video_url, worksheet_url')
      .order('phase_id').order('sort_order')
      .then(({ data }) => {
        setModules((data as ModuleRow[]) ?? []);
        setLoading(false);
      });
  }, []);

  const getEdit = (id: string): Partial<ModuleRow> => edits[id] || {};

  const updateField = (id: string, field: string, value: any) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const saveModule = async (mod: ModuleRow) => {
    const edit = getEdit(mod.id);
    if (Object.keys(edit).length === 0) return;
    setSaving(mod.id);
    const { error, count } = await supabase.from('modules').update(edit).eq('id', mod.id).select();
    setSaving(null);
    if (error) {
      toast({ title: 'Fehler beim Speichern', description: error.message, variant: 'destructive' });
    } else if (count === 0) {
      toast({ title: 'Keine Berechtigung', description: 'Du brauchst Admin-Rechte um Module zu bearbeiten.', variant: 'destructive' });
    } else {
      setModules(prev => prev.map(m => m.id === mod.id ? { ...m, ...edit } : m));
      setEdits(prev => { const next = { ...prev }; delete next[mod.id]; return next; });
      toast({ title: 'Gespeichert' });
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Lade…</p>;

  // Group by phase
  const phases = Array.from(new Set(modules.map(m => m.phase_id))).sort();

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Verwalte Academy-Inhalte und hinterlege GHL-Video-Links. Die Frontend-Anzeige nutzt diese Links dynamisch.
      </p>

      {phases.map(phaseId => {
        const phaseMods = modules.filter(m => m.phase_id === phaseId);
        return (
          <div key={phaseId} className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Phase {phaseId}</h3>
            {phaseMods.map(mod => {
              const edit = getEdit(mod.id);
              const title = edit.title ?? mod.title;
              const description = edit.description ?? mod.description ?? '';
              const videoUrl = edit.video_url ?? mod.video_url ?? '';
              const worksheetUrl = edit.worksheet_url ?? mod.worksheet_url ?? '';
              const hasChanges = Object.keys(edit).length > 0;

              return (
                <div key={mod.id} className="rounded-xl border border-border/40 bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">{title}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">#{mod.sort_order}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[11px]">Titel</Label>
                      <Input value={title} onChange={e => updateField(mod.id, 'title', e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-[11px]">Sortierung</Label>
                      <Input type="number" value={edit.sort_order ?? mod.sort_order} onChange={e => updateField(mod.id, 'sort_order', parseInt(e.target.value) || 0)} className="mt-1" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-[11px]">Beschreibung</Label>
                    <Textarea value={description} onChange={e => updateField(mod.id, 'description', e.target.value)} className="mt-1 min-h-[50px]" />
                  </div>

                  <div>
                    <Label className="text-[11px]">GHL Video-Link</Label>
                    <div className="flex gap-2 mt-1">
                      <Input value={videoUrl} onChange={e => updateField(mod.id, 'video_url', e.target.value)} placeholder="https://app.gohighlevel.com/..." className="flex-1" />
                      {videoUrl && (
                        <Button variant="outline" size="sm" className="shrink-0" onClick={() => window.open(videoUrl, '_blank')}>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label className="text-[11px]">Worksheet-Link (optional)</Label>
                    <Input value={worksheetUrl} onChange={e => updateField(mod.id, 'worksheet_url', e.target.value)} placeholder="https://..." className="mt-1" />
                  </div>

                  {hasChanges && (
                    <Button size="sm" className="text-xs" onClick={() => saveModule(mod)} disabled={saving === mod.id}>
                      <Save className="mr-1 h-3 w-3" />
                      {saving === mod.id ? 'Speichern…' : 'Änderungen speichern'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
