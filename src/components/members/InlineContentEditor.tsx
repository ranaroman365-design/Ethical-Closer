import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Save, Pencil, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ModuleRow {
  id: string;
  title: string;
  description: string | null;
  phase_id: number;
  sort_order: number;
}

interface PhaseRow {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
}

export default function InlineContentEditor() {
  const { toast } = useToast();
  const [phases, setPhases] = useState<PhaseRow[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPhase, setEditingPhase] = useState<string | null>(null);
  const [editingModule, setEditingModule] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');

  useEffect(() => {
    (async () => {
      const [p, m] = await Promise.all([
        supabase.from('phases').select('id, name, description, sort_order').order('sort_order'),
        supabase.from('modules').select('id, title, description, phase_id, sort_order').order('phase_id').order('sort_order'),
      ]);
      setPhases((p.data as PhaseRow[]) ?? []);
      setModules((m.data as ModuleRow[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const savePhase = async (id: number) => {
    const { error } = await supabase.from('phases').update({ name: editTitle, description: editDesc || null } as any).eq('id', id);
    if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
    setPhases(prev => prev.map(p => p.id === id ? { ...p, name: editTitle, description: editDesc || null } : p));
    setEditingPhase(null);
    toast({ title: 'Phase aktualisiert' });
  };

  const saveModule = async (id: string) => {
    const { error } = await supabase.from('modules').update({ title: editTitle, description: editDesc || null }).eq('id', id);
    if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
    setModules(prev => prev.map(m => m.id === id ? { ...m, title: editTitle, description: editDesc || null } : m));
    setEditingModule(null);
    toast({ title: 'Modul aktualisiert' });
  };

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">Laden…</div>;

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">Bearbeite Phasen- und Modul-Titel und Beschreibungen direkt. Änderungen sind sofort sichtbar.</p>

      {phases.map(phase => (
        <div key={phase.id} className="rounded-xl border border-border/40 bg-card overflow-hidden">
          {/* Phase Header */}
          <div className="p-4 border-b border-border/30">
            {editingPhase === String(phase.id) ? (
              <div className="space-y-2">
                <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="text-sm" placeholder="Phase-Titel" />
                <Textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="text-sm" rows={2} placeholder="Beschreibung" />
                <div className="flex gap-2">
                  <Button size="sm" className="text-xs h-7 bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => savePhase(phase.id)}><Save className="mr-1 h-3 w-3" />Speichern</Button>
                  <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setEditingPhase(null)}><X className="mr-1 h-3 w-3" />Abbrechen</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-foreground">Phase {phase.sort_order}: {phase.name}</p>
                  {phase.description && <p className="text-[11px] text-muted-foreground mt-0.5">{phase.description}</p>}
                </div>
                <Button variant="ghost" size="sm" className="text-[10px] h-7" onClick={() => { setEditingPhase(String(phase.id)); setEditTitle(phase.name); setEditDesc(phase.description || ''); }}>
                  <Pencil className="h-3 w-3 mr-1" />Bearbeiten
                </Button>
              </div>
            )}
          </div>

          {/* Modules */}
          <div className="divide-y divide-border/20">
            {modules.filter(m => m.phase_id === phase.id).map(mod => (
              <div key={mod.id} className="px-4 py-3">
                {editingModule === mod.id ? (
                  <div className="space-y-2">
                    <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="text-sm" placeholder="Modul-Titel" />
                    <Textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="text-sm" rows={2} placeholder="Beschreibung" />
                    <div className="flex gap-2">
                      <Button size="sm" className="text-xs h-7 bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => saveModule(mod.id)}><Save className="mr-1 h-3 w-3" />Speichern</Button>
                      <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setEditingModule(null)}><X className="mr-1 h-3 w-3" />Abbrechen</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-foreground">{mod.sort_order}. {mod.title}</p>
                      {mod.description && <p className="text-[11px] text-muted-foreground mt-0.5">{mod.description}</p>}
                    </div>
                    <Button variant="ghost" size="sm" className="text-[10px] h-7 shrink-0" onClick={() => { setEditingModule(mod.id); setEditTitle(mod.title); setEditDesc(mod.description || ''); }}>
                      <Pencil className="h-3 w-3 mr-1" />Edit
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
