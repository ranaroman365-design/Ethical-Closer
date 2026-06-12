import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, UserPlus, X, ArrowRight, Filter } from 'lucide-react';

const STAGE_LABELS: Record<string, string> = {
  prospect: 'L0 Bewerber', opener: 'L1 Trainee', setter: 'L2 Associate Setter',
  senior_associate: 'L3 Senior Setter', junior_manager: 'L4 Closer (Placement Track)',
  manager: 'L5 Managing Closer', senior_manager: 'L6 Senior Closer',
  director: 'L7 Director', partner: 'L8 Partner',
};

const LAYERS = [
  { key: 'setter', label: 'Setter Layer', mentorStages: ['senior_associate'], menteeStages: ['setter'] },
  { key: 'closer', label: 'Closer Layer', mentorStages: ['manager'], menteeStages: ['junior_manager'] },
] as const;

type LayerKey = typeof LAYERS[number]['key'];

interface ProfileMin {
  id: string;
  full_name: string | null;
  email: string | null;
  business_stage: string;
}

interface Assignment {
  id: string;
  mentor_id: string;
  mentee_id: string;
  layer: string;
  active: boolean;
}

export default function MentorAssignmentManager() {
  const { toast } = useToast();
  const [layer, setLayer] = useState<LayerKey>('setter');
  const [profiles, setProfiles] = useState<ProfileMin[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragMentee, setDragMentee] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const activeLayer = LAYERS.find(l => l.key === layer)!;

  const load = useCallback(async () => {
    setLoading(true);
    const [p, a] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, business_stage'),
      supabase.from('mentor_assignments').select('id, mentor_id, mentee_id, layer, active').eq('active', true),
    ]);
    setProfiles((p.data as ProfileMin[]) ?? []);
    setAssignments((a.data as Assignment[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const mentors = profiles.filter(p => (activeLayer.mentorStages as readonly string[]).includes(p.business_stage));
  const allMentees = profiles.filter(p => (activeLayer.menteeStages as readonly string[]).includes(p.business_stage));
  const assignedMenteeIds = new Set(assignments.filter(a => a.layer === layer).map(a => a.mentee_id));
  const unassignedMentees = allMentees.filter(m => !assignedMenteeIds.has(m.id));

  function getMenteesForMentor(mentorId: string) {
    const menteeIds = assignments.filter(a => a.layer === layer && a.mentor_id === mentorId).map(a => a.mentee_id);
    return profiles.filter(p => menteeIds.includes(p.id));
  }

  async function assignMentee(mentorId: string, menteeId: string) {
    setAssigning(true);
    const { error } = await supabase.from('mentor_assignments').insert({
      mentor_id: mentorId,
      mentee_id: menteeId,
      layer,
      active: true,
    });
    if (error) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Mentee zugewiesen' });
      await load();
    }
    setAssigning(false);
  }

  async function unassign(assignmentId: string) {
    await supabase.from('mentor_assignments').update({ active: false } as any).eq('id', assignmentId);
    toast({ title: 'Zuweisung entfernt' });
    await load();
  }

  function handleDragStart(menteeId: string) {
    setDragMentee(menteeId);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  async function handleDrop(e: React.DragEvent, mentorId: string) {
    e.preventDefault();
    if (!dragMentee || assigning) return;
    await assignMentee(mentorId, dragMentee);
    setDragMentee(null);
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Lade Mentor-Daten…</div>;
  }

  return (
    <div className="space-y-5">
      {/* Layer Filter */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-[12px] text-muted-foreground font-medium">Layer:</span>
        {LAYERS.map(l => (
          <button
            key={l.key}
            onClick={() => setLayer(l.key)}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
              layer === l.key ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        {/* Mentor Cards */}
        <div className="space-y-3">
          <h3 className="text-[13px] font-semibold text-foreground">
            Mentoren ({mentors.length})
          </h3>
          {mentors.length === 0 && (
            <p className="text-[12px] text-muted-foreground py-6 text-center">
              Keine Mentoren auf Stage {activeLayer.mentorStages.map(s => STAGE_LABELS[s]).join(', ')} gefunden.
            </p>
          )}
          {mentors.map(mentor => {
            const mentees = getMenteesForMentor(mentor.id);
            return (
              <div
                key={mentor.id}
                className="rounded-xl border border-border/40 bg-card p-4 transition-colors"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, mentor.id)}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent text-[12px] font-bold">
                    {(mentor.full_name || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-foreground truncate">{mentor.full_name || 'Kein Name'}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{mentor.email}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{STAGE_LABELS[mentor.business_stage]}</Badge>
                  <Badge className="bg-accent/10 text-accent border-0 text-[10px]">
                    <Users className="mr-1 h-3 w-3" />{mentees.length}
                  </Badge>
                </div>

                {/* Assigned Mentees */}
                {mentees.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {mentees.map(mentee => {
                      const assignment = assignments.find(a => a.layer === layer && a.mentor_id === mentor.id && a.mentee_id === mentee.id);
                      return (
                        <div key={mentee.id} className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-[11px]">
                          <span className="font-medium text-foreground">{mentee.full_name || mentee.email}</span>
                          <button
                            onClick={() => assignment && unassign(assignment.id)}
                            className="text-muted-foreground hover:text-destructive ml-1"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {mentees.length === 0 && (
                  <div className="rounded-lg border-2 border-dashed border-border/30 py-4 text-center text-[11px] text-muted-foreground">
                    Mentee hierher ziehen oder unten zuweisen
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Unassigned Mentees Pool */}
        <div>
          <h3 className="text-[13px] font-semibold text-foreground mb-3">
            Nicht zugewiesen ({unassignedMentees.length})
          </h3>
          <div className="space-y-2">
            {unassignedMentees.map(mentee => (
              <div
                key={mentee.id}
                draggable
                onDragStart={() => handleDragStart(mentee.id)}
                className="flex items-center gap-2 rounded-xl border border-border/40 bg-card p-3 cursor-grab active:cursor-grabbing hover:border-accent/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-foreground truncate">{mentee.full_name || 'Kein Name'}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{mentee.email}</p>
                </div>
                {/* Quick assign buttons */}
                {mentors.length > 0 && mentors.length <= 3 && (
                  <div className="flex gap-1 shrink-0">
                    {mentors.map(m => (
                      <button
                        key={m.id}
                        onClick={() => assignMentee(m.id, mentee.id)}
                        disabled={assigning}
                        className="flex h-6 w-6 items-center justify-center rounded bg-accent/10 text-accent text-[10px] font-bold hover:bg-accent/20 transition-colors"
                        title={`Zu ${m.full_name} zuweisen`}
                      >
                        {(m.full_name || '?')[0]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {unassignedMentees.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-6">Alle Mentees sind zugewiesen.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
