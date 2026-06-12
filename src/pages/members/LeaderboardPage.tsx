import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Trophy, TrendingUp, Target, Flame, Award, Star } from 'lucide-react';

interface LeaderEntry {
  user_id: string;
  level: number;
  weighted_score: number;
  average_score: number;
  best_score: number;
  recent_trend: number;
  total_attempts: number;
  realtime_attempts: number;
  full_name: string;
}

type Tab = 'level' | 'global';

const BADGE_TIERS = [
  { min: 8, label: 'Elite Closer', color: 'bg-primary/15 text-primary', icon: Star },
  { min: 7, label: 'Strong Performer', color: 'bg-accent/15 text-accent', icon: Flame },
  { min: 6, label: 'Rising Closer', color: 'bg-muted text-muted-foreground', icon: TrendingUp },
];

function getBadge(avg: number) {
  return BADGE_TIERS.find(b => avg >= b.min) || null;
}

export default function LeaderboardPage() {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState<Tab>('level');
  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLevel, setSelectedLevel] = useState(1);

  const userLevel = Math.max(1, Math.min(6, (profile as any)?.current_phase || 1));

  useEffect(() => {
    setSelectedLevel(userLevel);
  }, [userLevel]);

  useEffect(() => {
    setLoading(true);
    const fetchEntries = async () => {
      let query = supabase
        .from('leaderboard_entries' as any)
        .select('user_id, level, weighted_score, average_score, best_score, recent_trend, total_attempts, realtime_attempts')
        .gte('total_attempts', 5)
        .order('weighted_score', { ascending: false })
        .limit(50);

      if (tab === 'level') {
        query = query.eq('level', selectedLevel);
      }

      const { data } = await query;
      if (!data || data.length === 0) {
        setEntries([]);
        setLoading(false);
        return;
      }

      const userIds = (data as any[]).map((e: any) => e.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      const nameMap = new Map(profiles?.map(p => [p.id, p.full_name || 'Anonym']) ?? []);

      setEntries((data as any[]).map((e: any) => ({
        ...e,
        full_name: nameMap.get(e.user_id) ?? 'Anonym',
      })));
      setLoading(false);
    };
    fetchEntries();
  }, [tab, selectedLevel]);

  const myEntry = entries.find(e => e.user_id === user?.id);
  const myRank = myEntry ? entries.indexOf(myEntry) + 1 : null;
  const percentile = myRank && entries.length > 0 ? Math.round((1 - myRank / entries.length) * 100) : null;

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Trophy className="h-6 w-6 text-accent" /> Top Performers
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ranking basierend auf Performance, Konsistenz und Fortschritt.
        </p>
      </div>

      {/* User Position Card */}
      {myEntry && myRank && (
        <div className="mb-6 rounded-xl border border-accent/30 bg-accent/[0.03] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-2">Deine Position</p>
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">#{myRank}</span>
              {tab === 'level' && <span className="text-sm text-muted-foreground">in Level {selectedLevel}</span>}
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-foreground">{myEntry.weighted_score.toFixed(1)}</p>
              {percentile !== null && percentile > 0 && (
                <p className="text-[10px] text-accent">Top {100 - percentile}%</p>
              )}
            </div>
          </div>
          {myEntry.recent_trend > 0 && (
            <div className="mt-2 flex items-center gap-1 text-[11px] text-primary">
              <TrendingUp className="h-3 w-3" /> +{myEntry.recent_trend.toFixed(1)} Trend
            </div>
          )}
          {getBadge(myEntry.average_score) && (
            <div className="mt-2">
              <Badge className={`text-[9px] border-0 ${getBadge(myEntry.average_score)!.color}`}>
                {getBadge(myEntry.average_score)!.label}
              </Badge>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl border border-border/40 bg-card p-1">
        <button
          onClick={() => setTab('level')}
          className={`flex-1 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors ${tab === 'level' ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Level {selectedLevel}
        </button>
        <button
          onClick={() => setTab('global')}
          className={`flex-1 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors ${tab === 'global' ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Global
        </button>
      </div>

      {/* Level Selector (only for level tab) */}
      {tab === 'level' && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6].map(l => (
            <button
              key={l}
              onClick={() => setSelectedLevel(l)}
              className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-all ${
                selectedLevel === l
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-border/40 text-muted-foreground hover:border-border/70'
              }`}
            >
              L{l}
            </button>
          ))}
        </div>
      )}

      {/* Leaderboard List */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Lädt…</div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-border/40 bg-card p-8 text-center">
          <Target className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Noch keine Einträge. Mindestens 5 Versuche erforderlich.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e, i) => {
            const isMe = e.user_id === user?.id;
            const badge = getBadge(e.average_score);
            return (
              <div
                key={`${e.user_id}-${e.level}`}
                className={`flex items-center gap-3 rounded-xl border p-3.5 transition-colors ${
                  isMe ? 'border-accent/30 bg-accent/[0.04]' : 'border-border/30 bg-card'
                }`}
              >
                <span className="w-7 text-center text-sm font-bold text-muted-foreground">
                  {medals[i] ?? i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`text-[13px] font-medium truncate ${isMe ? 'text-accent' : 'text-foreground'}`}>
                      {e.full_name}
                    </p>
                    {badge && (
                      <Badge className={`text-[8px] border-0 ${badge.color}`}>{badge.label}</Badge>
                    )}
                    {e.realtime_attempts > 0 && (
                      <Badge variant="outline" className="text-[7px] border-primary/20 text-primary/60">RT</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                    <span>Ø {e.average_score.toFixed(1)}</span>
                    <span>Best: {e.best_score.toFixed(1)}</span>
                    <span>{e.total_attempts} Versuche</span>
                    {e.recent_trend > 0 && (
                      <span className="text-primary flex items-center gap-0.5">
                        <TrendingUp className="h-2.5 w-2.5" />+{e.recent_trend.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[15px] font-bold text-foreground">{e.weighted_score.toFixed(1)}</p>
                  <p className="text-[9px] text-muted-foreground">Score</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
