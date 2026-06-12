import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Zap, Target, Brain, Shield, TrendingUp, CheckCircle2,
  RefreshCw, User, MessageSquare,
} from 'lucide-react';

interface Match {
  id: string;
  opportunity_id: string;
  closer_user_id: string;
  match_score: number;
  match_reasoning: string[];
  depth_score: number;
  objection_score: number;
  commitment_score: number;
  close_rate: number;
  conversation_style: string;
  product_fit_score: number;
  status: string;
  placement_outcome: string | null;
  revenue_generated: number;
  feedback_score: number | null;
}

interface CloserProfile {
  id: string;
  full_name: string | null;
  business_stage: string;
}

interface Props {
  opportunityId: string;
  opportunityTitle: string;
}

const STYLE_LABELS: Record<string, { label: string; color: string }> = {
  'depth-driven closer': { label: 'Depth-Driven', color: 'text-purple-600 border-purple-500/30' },
  'objection specialist': { label: 'Objection Specialist', color: 'text-orange-600 border-orange-500/30' },
  'empathic depth builder': { label: 'Empathic Builder', color: 'text-blue-600 border-blue-500/30' },
  'high-conversion closer': { label: 'High-Conv. Closer', color: 'text-emerald-600 border-emerald-500/30' },
  'balanced': { label: 'Balanced', color: 'text-muted-foreground border-border/40' },
};

export default function MatchingResults({ opportunityId, opportunityTitle }: Props) {
  const { toast } = useToast();
  const [matches, setMatches] = useState<Match[]>([]);
  const [profiles, setProfiles] = useState<Record<string, CloserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => { loadMatches(); }, [opportunityId]);

  async function loadMatches() {
    setLoading(true);
    const { data } = await supabase
      .from('placement_matches')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('match_score', { ascending: false });

    const matchData = (data ?? []) as Match[];
    setMatches(matchData);

    if (matchData.length > 0) {
      const ids = matchData.map(m => m.closer_user_id);
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, business_stage')
        .in('id', ids);
      const pm: Record<string, CloserProfile> = {};
      (profs ?? []).forEach((p: any) => { pm[p.id] = p; });
      setProfiles(pm);
    }
    setLoading(false);
  }

  async function runEngine() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('run-placement-matching', {
        body: { opportunity_id: opportunityId },
      });
      if (error) throw error;
      toast({ title: `${data?.matches?.length ?? 0} Matches generiert` });
      await loadMatches();
    } catch (err: any) {
      toast({ title: 'Fehler', description: err.message, variant: 'destructive' });
    }
    setRunning(false);
  }

  async function updateMatchStatus(matchId: string, status: string) {
    await supabase.from('placement_matches').update({ status }).eq('id', matchId);
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status } : m));
    toast({ title: `Status → ${status}` });
  }

  function ScoreBar({ value, label, icon: Icon }: { value: number; label: string; icon: any }) {
    const color = value >= 70 ? 'bg-primary' : value >= 50 ? 'bg-accent' : 'bg-muted-foreground/30';
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="flex items-center gap-1 text-muted-foreground"><Icon className="h-3 w-3" />{label}</span>
          <span className="font-bold text-foreground">{value}</span>
        </div>
        <div className="h-1 w-full rounded-full bg-muted">
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
        </div>
      </div>
    );
  }

  if (loading) return <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Matching Engine</h3>
          <p className="text-[11px] text-muted-foreground">{opportunityTitle} · {matches.length} Matches</p>
        </div>
        <Button size="sm" variant="outline" onClick={runEngine} disabled={running} className="text-xs">
          <RefreshCw className={`mr-1.5 h-3 w-3 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Matching…' : 'Engine starten'}
        </Button>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/40 bg-muted/20 p-8 text-center">
          <Zap className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Noch keine Matches. Starte die Matching Engine.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((m, idx) => {
            const profile = profiles[m.closer_user_id];
            const style = STYLE_LABELS[m.conversation_style] ?? STYLE_LABELS['balanced'];
            return (
              <div key={m.id} className="rounded-xl border border-border/40 bg-card p-4 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                      #{idx + 1}
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-foreground">{profile?.full_name || 'Closer'}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{profile?.business_stage?.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-[9px] ${style.color}`}>{style.label}</Badge>
                    <div className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      m.match_score >= 80 ? 'bg-primary/10 text-primary' :
                      m.match_score >= 60 ? 'bg-accent/10 text-accent' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      <Target className="h-3 w-3" />{m.match_score}%
                    </div>
                  </div>
                </div>

                {/* Score Bars */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                  <ScoreBar value={m.depth_score} label="Depth" icon={Brain} />
                  <ScoreBar value={m.objection_score} label="Objections" icon={Shield} />
                  <ScoreBar value={m.commitment_score} label="Commitment" icon={CheckCircle2} />
                  <ScoreBar value={m.close_rate} label="Close Rate" icon={TrendingUp} />
                </div>

                {/* Reasoning */}
                {(m.match_reasoning as string[])?.length > 0 && (
                  <div className="rounded-lg bg-muted/30 p-2.5">
                    <p className="text-[10px] font-semibold text-muted-foreground mb-1">Warum dieser Match</p>
                    <ul className="space-y-0.5">
                      {(m.match_reasoning as string[]).map((r, i) => (
                        <li key={i} className="text-[11px] text-foreground flex items-start gap-1.5">
                          <span className="text-primary mt-0.5">•</span>{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-1">
                  <Badge variant="outline" className="text-[10px]">{m.status}</Badge>
                  <div className="flex gap-1.5">
                    {m.status === 'suggested' && (
                      <>
                        <Button size="sm" variant="outline" className="text-[10px] h-7" onClick={() => updateMatchStatus(m.id, 'shortlisted')}>
                          Shortlist
                        </Button>
                        <Button size="sm" className="text-[10px] h-7" onClick={() => updateMatchStatus(m.id, 'proposed')}>
                          Vorschlagen
                        </Button>
                      </>
                    )}
                    {m.status === 'shortlisted' && (
                      <Button size="sm" className="text-[10px] h-7" onClick={() => updateMatchStatus(m.id, 'proposed')}>
                        An Firma senden
                      </Button>
                    )}
                    {m.status === 'proposed' && (
                      <Button size="sm" className="text-[10px] h-7 bg-primary" onClick={() => updateMatchStatus(m.id, 'placed')}>
                        <CheckCircle2 className="mr-1 h-3 w-3" />Platzieren
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
