import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatK } from '@/lib/utils';
import { Trophy, TrendingUp, Percent } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getLevelForStage } from '@/lib/kpi-config';
import { normalizeBusinessStage } from '@/lib/stage-utils';
import { useUserSegmentsBulk } from '@/hooks/useUserSegment';


interface LeaderEntry {
  user_id: string;
  full_name: string;
  closing_rate: number;
  revenue_closed: number;
  commission_earned: number;
  calls_handled: number;
}

export default function Leaderboard() {
  const { user, profile } = useAuth();
  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const stage = normalizeBusinessStage((profile as any)?.business_stage || 'opener');
  const level = getLevelForStage(stage);
  const { map: segmentMap } = useUserSegmentsBulk(entries.map(e => e.user_id));

  useEffect(() => {
    async function load() {
      const { data: kpis } = await supabase
        .from('member_kpis')
        .select('user_id, closing_rate, revenue_closed, calls_handled, commission_earned')
        .order('closing_rate', { ascending: false })
        .limit(10);

      if (!kpis || kpis.length === 0) { setLoading(false); return; }

      const userIds = kpis.map(k => k.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      const nameMap = new Map(profiles?.map(p => [p.id, p.full_name || 'Anonym']) ?? []);

      setEntries(
        kpis
          .filter(k => (k.closing_rate ?? 0) > 0 || (k.calls_handled ?? 0) > 0)
          .map(k => ({
            user_id: k.user_id,
            full_name: nameMap.get(k.user_id) ?? 'Anonym',
            closing_rate: k.closing_rate ?? 0,
            revenue_closed: k.revenue_closed ?? 0,
            commission_earned: (k as any).commission_earned ?? 0,
            calls_handled: k.calls_handled ?? 0,
          }))
      );
      setLoading(false);
    }
    load();
  }, []);

  if (loading || entries.length === 0) return null;

  const medals = ['🥇', '🥈', '🥉'];
  // L1-L3: show commission. L4+: show revenue.
  const showRevenue = level >= 4;

  return (
    <div className="mb-6">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <Trophy className="h-3.5 w-3.5" /> Leaderboard
      </h2>
      <div className="space-y-1.5">
        {entries.map((e, i) => {
          const isMe = e.user_id === user?.id;
          const metricValue = showRevenue ? e.revenue_closed : e.commission_earned;
          return (
            <div key={e.user_id} className={`flex items-center gap-3 rounded-xl border p-3 ${isMe ? 'border-accent/30 bg-accent/[0.04]' : 'border-border/30 bg-card'}`}>
              <span className="w-6 text-center text-sm font-bold">{medals[i] ?? i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className={`text-[13px] font-medium truncate ${isMe ? 'text-accent' : 'text-foreground'}`}>{e.full_name}</p>
                  {segmentMap[e.user_id]?.segment === 'a_player' && (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" aria-label="A-Player" />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><Percent className="h-3 w-3" />{e.closing_rate}%</span>
                <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />{formatK(metricValue, '€')}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
