import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, ShieldAlert, ShieldCheck, RefreshCw, UserPlus, X, Search, TrendingUp, BarChart3 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';

const STAGE_LABELS: Record<string, string> = {
  prospect: 'L0 Bewerber', opener: 'L1 Trainee', setter: 'L2 Setter',
  senior_associate: 'L3 Senior Setter', junior_manager: 'L4 Closer (Placement Track)',
  manager: 'L5 Closer', senior_manager: 'L6 Senior Closer',
  director: 'L7 Director', partner: 'L8 Partner',
};

const RANK_LABELS: Record<string, { label: string; color: string }> = {
  top_mentor: { label: 'Top Mentor', color: 'bg-[hsl(39,76%,49%)]/15 text-[hsl(39,76%,49%)]' },
  strong_mentor: { label: 'Strong Mentor', color: 'bg-primary/10 text-primary' },
  stable_mentor: { label: 'Stable Mentor', color: 'bg-accent/10 text-accent' },
  eligible_mentor: { label: 'Eligible', color: 'bg-muted text-muted-foreground' },
  at_risk: { label: 'At Risk', color: 'bg-destructive/10 text-destructive' },
};

interface MentorScore {
  user_id: string;
  mentor_score_total: number;
  performance_score: number;
  mentee_progress_score: number;
  activity_score: number;
  reliability_score: number;
  quality_score: number;
  rank_category: string;
  calculated_at: string;
}

interface Assignment {
  id: string;
  mentor_id: string;
  mentee_id: string;
  source: string;
  active: boolean;
  level_at_assignment: number | null;
  notes: string | null;
  created_at: string | null;
}

interface Eligibility {
  user_id: string;
  is_eligible: boolean;
  reason_blocked: string | null;
  kpi_score: number;
  mentee_count: number;
  max_mentees: number;
  last_checked_at: string;
}

interface ProfileMin {
  id: string;
  full_name: string | null;
  email: string | null;
  business_stage: string;
}

interface FlagRow {
  id: string;
  user_id: string;
  flag_type: string;
  active: boolean;
  notes: string | null;
}

export default function MentorControlPanel() {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [eligibility, setEligibility] = useState<Eligibility[]>([]);
  const [profiles, setProfiles] = useState<ProfileMin[]>([]);
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [scores, setScores] = useState<MentorScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [assignDialog, setAssignDialog] = useState<{ menteeId: string } | null>(null);
  const [acting, setActing] = useState(false);

  const profileMap = new Map(profiles.map(p => [p.id, p]));

  const load = useCallback(async () => {
    setLoading(true);
    const [a, e, p, f, s] = await Promise.all([
      supabase.from('mentor_assignments').select('*').eq('active', true).order('created_at', { ascending: false }),
      supabase.from('mentor_eligibility' as any).select('*'),
      supabase.from('profiles').select('id, full_name, email, business_stage'),
      supabase.from('mentor_flags' as any).select('*').eq('active', true),
      supabase.from('mentor_scores' as any).select('*').order('mentor_score_total', { ascending: false }),
    ]);
    setAssignments((a.data as any[]) ?? []);
    setEligibility((e.data as any[]) ?? []);
    setProfiles((p.data as ProfileMin[]) ?? []);
    setFlags((f.data as any[]) ?? []);
    setScores((s.data as unknown as MentorScore[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const getName = (id: string) => profileMap.get(id)?.full_name || profileMap.get(id)?.email || id.slice(0, 8);
  const getStage = (id: string) => STAGE_LABELS[profileMap.get(id)?.business_stage || ''] || profileMap.get(id)?.business_stage || '—';

  const eligMap = new Map(eligibility.map(e => [e.user_id, e]));
  const flaggedIds = new Set(flags.map(f => f.user_id));

  const handleBlock = async (userId: string, block: boolean) => {
    setActing(true);
    const { data } = await supabase.rpc('admin_toggle_mentor_block' as any, {
      p_user_id: userId, p_block: block, p_notes: block ? 'Admin blocked' : null,
    });
    const result = data as any;
    if (result?.error) {
      toast({ title: 'Fehler', description: result.error, variant: 'destructive' });
    } else {
      toast({ title: block ? 'Mentor blockiert' : 'Mentor freigegeben' });
      await load();
    }
    setActing(false);
  };

  const handleManualAssign = async (mentorId: string, menteeId: string) => {
    setActing(true);
    const { data } = await supabase.rpc('admin_assign_mentor' as any, {
      p_mentor_id: mentorId, p_mentee_id: menteeId,
    });
    const result = data as any;
    if (result?.error) {
      toast({ title: 'Fehler', description: result.error, variant: 'destructive' });
    } else {
      toast({ title: 'Mentor zugewiesen' });
      setAssignDialog(null);
      await load();
    }
    setActing(false);
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    await supabase.from('mentor_assignments').update({ active: false } as any).eq('id', assignmentId);
    toast({ title: 'Zuweisung entfernt' });
    await load();
  };

  const handleRunEligibilityCheck = async () => {
    setActing(true);
    // Check eligibility for all profiles with level >= 2
    let checked = 0;
    for (const p of profiles) {
      const stage = p.business_stage;
      const levelStages = ['setter', 'senior_associate', 'junior_manager', 'manager', 'senior_manager', 'director', 'partner'];
      if (levelStages.includes(stage)) {
        await supabase.rpc('check_mentor_eligibility' as any, { p_user_id: p.id });
        checked++;
      }
    }
    toast({ title: `Eligibility geprüft für ${checked} User` });
    await load();
    setActing(false);
  };

  // Unassigned mentees (no active assignment)
  const assignedMenteeIds = new Set(assignments.map(a => a.mentee_id));
  const unassignedUsers = profiles.filter(p => !assignedMenteeIds.has(p.id) && p.business_stage !== 'prospect');

  const filteredAssignments = assignments.filter(a => {
    if (!search) return true;
    const s = search.toLowerCase();
    return getName(a.mentor_id).toLowerCase().includes(s) || getName(a.mentee_id).toLowerCase().includes(s);
  });

  const eligibleMentors = profiles.filter(p => eligMap.get(p.id)?.is_eligible);

  if (loading) return <div className="py-12 text-center text-sm text-muted-foreground">Lade Mentor-System…</div>;

  const handleRecalcScores = async () => {
    setActing(true);
    await supabase.rpc('recalculate_all_mentor_scores' as any);
    toast({ title: 'Mentor-Scores neu berechnet' });
    await load();
    setActing(false);
  };

  const scoreMap = new Map(scores.map(s => [s.user_id, s]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-foreground">Mentor Control Panel</h2>
          <p className="text-xs text-muted-foreground">Zuweisungen, Ranking, Eligibility & Overrides</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleRecalcScores} disabled={acting}>
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" /> Scores berechnen
          </Button>
          <Button size="sm" variant="outline" onClick={handleRunEligibilityCheck} disabled={acting}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Eligibility prüfen
          </Button>
        </div>
      </div>

      <Tabs defaultValue="assignments" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="assignments">Zuweisungen</TabsTrigger>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="eligibility">Eligibility</TabsTrigger>
        </TabsList>

        {/* ── RANKING TAB ── */}
        <TabsContent value="ranking" className="space-y-4 mt-4">
          {scores.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              Noch keine Scores berechnet. Klicke „Scores berechnen".
            </p>
          ) : (
            <div className="space-y-2">
              {scores.map((s, idx) => {
                const rank = RANK_LABELS[s.rank_category] || RANK_LABELS.eligible_mentor;
                return (
                  <div key={s.user_id} className="rounded-xl border border-border/40 bg-card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] font-bold text-muted-foreground w-6">#{idx + 1}</span>
                        <div>
                          <p className="text-[12px] font-semibold text-foreground">{getName(s.user_id)}</p>
                          <p className="text-[10px] text-muted-foreground">{getStage(s.user_id)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`border-0 text-[9px] ${rank.color}`}>{rank.label}</Badge>
                        <span className="text-sm font-bold text-foreground">{Math.round(s.mentor_score_total)}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {[
                        { label: 'Performance', value: s.performance_score, weight: '25%' },
                        { label: 'Mentee Progress', value: s.mentee_progress_score, weight: '30%' },
                        { label: 'Activity', value: s.activity_score, weight: '15%' },
                        { label: 'Reliability', value: s.reliability_score, weight: '15%' },
                        { label: 'Quality', value: s.quality_score, weight: '15%' },
                      ].map(dim => (
                        <div key={dim.label} className="text-center">
                          <p className="text-[8px] text-muted-foreground">{dim.label}</p>
                          <Progress value={Math.min(dim.value, 100)} className="h-1 mt-1" />
                          <p className="text-[10px] font-medium text-foreground mt-0.5">{Math.round(dim.value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── ASSIGNMENTS TAB ── */}
        <TabsContent value="assignments" className="space-y-4 mt-4">

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Aktive Zuweisungen', value: assignments.length },
          { label: 'Eligible Mentoren', value: eligibleMentors.length },
          { label: 'Blockierte Mentoren', value: flaggedIds.size },
          { label: 'Ohne Mentor', value: unassignedUsers.length },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border/40 bg-card p-3 text-center">
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
            <p className="text-lg font-bold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Suche nach Name…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-xs" />
        </div>

        {/* Active Assignments */}
        <div>
          <h3 className="text-[13px] font-semibold text-foreground mb-2">Aktive Zuweisungen ({filteredAssignments.length})</h3>
          <div className="space-y-2">
            {filteredAssignments.map(a => (
              <div key={a.id} className="flex items-center justify-between rounded-xl border border-border/40 bg-card p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="text-center shrink-0">
                    <p className="text-[10px] text-muted-foreground">Mentor</p>
                    <p className="text-[12px] font-semibold text-foreground truncate max-w-[120px]">{getName(a.mentor_id)}</p>
                    <p className="text-[9px] text-muted-foreground">{getStage(a.mentor_id)}</p>
                  </div>
                  <span className="text-muted-foreground text-[10px]">→</span>
                  <div className="text-center shrink-0">
                    <p className="text-[10px] text-muted-foreground">Mentee</p>
                    <p className="text-[12px] font-semibold text-foreground truncate max-w-[120px]">{getName(a.mentee_id)}</p>
                    <p className="text-[9px] text-muted-foreground">{getStage(a.mentee_id)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-[9px]">{a.source}</Badge>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleRemoveAssignment(a.id)}>
                    <X className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            {filteredAssignments.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Keine aktiven Zuweisungen.</p>}
          </div>
        </div>

        {/* Unassigned Users */}
        <div>
          <h3 className="text-[13px] font-semibold text-foreground mb-2">Ohne Mentor ({unassignedUsers.length})</h3>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {unassignedUsers.slice(0, 20).map(u => (
              <div key={u.id} className="flex items-center justify-between rounded-xl border border-border/40 bg-card p-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-foreground truncate">{u.full_name || u.email || 'Kein Name'}</p>
                  <p className="text-[10px] text-muted-foreground">{STAGE_LABELS[u.business_stage] || u.business_stage}</p>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 shrink-0" onClick={() => setAssignDialog({ menteeId: u.id })}>
                  <UserPlus className="h-3 w-3 mr-1" /> Zuweisen
                </Button>
              </div>
            ))}
            {unassignedUsers.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Alle User haben einen Mentor.</p>}
          </div>
        </div>
        </TabsContent>

        {/* ── ELIGIBILITY TAB ── */}
        <TabsContent value="eligibility" className="space-y-4 mt-4">
          <div className="space-y-2">
            {eligibility.map(e => {
              const blocked = flaggedIds.has(e.user_id);
              const score = scoreMap.get(e.user_id);
              return (
                <div key={e.user_id} className="flex items-center justify-between rounded-xl border border-border/40 bg-card p-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-foreground truncate">{getName(e.user_id)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {getStage(e.user_id)} · KPI: {Math.round(e.kpi_score)} · Mentees: {e.mentee_count}/{e.max_mentees}
                      {score ? ` · Score: ${Math.round(score.mentor_score_total)}` : ''}
                    </p>
                    {e.reason_blocked && <p className="text-[10px] text-destructive">{e.reason_blocked}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {e.is_eligible && !blocked && <Badge className="bg-primary/10 text-primary border-0 text-[9px]"><ShieldCheck className="h-3 w-3 mr-1" />Eligible</Badge>}
                    {blocked && <Badge className="bg-destructive/10 text-destructive border-0 text-[9px]"><ShieldAlert className="h-3 w-3 mr-1" />Blockiert</Badge>}
                    <Button size="sm" variant="outline" className="h-7 text-[10px] px-2"
                      onClick={() => handleBlock(e.user_id, !blocked)} disabled={acting}>
                      {blocked ? 'Freigeben' : 'Blockieren'}
                    </Button>
                  </div>
                </div>
              );
            })}
            {eligibility.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Noch keine Eligibility-Daten.</p>}
          </div>
        </TabsContent>
      </Tabs>

      {/* Manual Assign Dialog */}
      <Dialog open={!!assignDialog} onOpenChange={() => setAssignDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Mentor manuell zuweisen</DialogTitle>
          </DialogHeader>
          {assignDialog && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Mentee: <strong>{getName(assignDialog.menteeId)}</strong> ({getStage(assignDialog.menteeId)})
              </p>
              <p className="text-xs text-muted-foreground">Wähle einen Mentor:</p>
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {eligibleMentors.map(m => (
                  <Button key={m.id} variant="outline" className="w-full justify-between h-auto py-2"
                    onClick={() => handleManualAssign(m.id, assignDialog.menteeId)} disabled={acting}>
                    <div className="text-left">
                      <p className="text-[12px] font-medium">{m.full_name || m.email}</p>
                      <p className="text-[10px] text-muted-foreground">{STAGE_LABELS[m.business_stage]} · KPI: {Math.round(eligMap.get(m.id)?.kpi_score || 0)}</p>
                    </div>
                    <UserPlus className="h-3.5 w-3.5 text-primary" />
                  </Button>
                ))}
                {eligibleMentors.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Keine eligible Mentoren verfügbar.</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
