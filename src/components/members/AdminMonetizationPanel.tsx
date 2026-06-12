import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { BarChart3, Users, TrendingUp, Eye } from 'lucide-react';

interface StateDistribution {
  state: string;
  count: number;
}

interface TriggerStats {
  offer_key: string;
  shown: number;
  clicked: number;
  dismissed: number;
  converted: number;
  acceptance_rate: number;
}

const STATE_COLORS: Record<string, string> = {
  new: 'bg-muted-foreground/20',
  learning: 'bg-accent/30',
  committed: 'bg-primary/30',
  stuck: 'bg-destructive/30',
  unstable: 'bg-[hsl(39,76%,49%)]/30',
  performing: 'bg-success/30',
  scaling: 'bg-primary/50',
  leading: 'bg-accent/50',
};

const STATE_EMOJIS: Record<string, string> = {
  new: '🌱', learning: '📖', committed: '🎯', stuck: '⏸️',
  unstable: '📊', performing: '🔥', scaling: '🚀', leading: '👑',
};

export default function AdminMonetizationPanel() {
  const { isAdmin } = useAuth();
  const [distribution, setDistribution] = useState<StateDistribution[]>([]);
  const [triggerStats, setTriggerStats] = useState<TriggerStats[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;

    Promise.all([
      // State distribution
      supabase.from('user_states' as any).select('current_state'),
      // Trigger/offer impressions
      supabase.from('offer_impressions' as any).select('offer_id, action'),
      // Offer catalog for key mapping
      supabase.from('monetization_offers' as any).select('id, offer_key'),
    ]).then(([statesRes, impressionsRes, offersRes]) => {
      // Distribution
      const states = (statesRes.data as any[]) ?? [];
      setTotalUsers(states.length);
      const counts: Record<string, number> = {};
      for (const s of states) {
        counts[s.current_state] = (counts[s.current_state] || 0) + 1;
      }
      setDistribution(
        Object.entries(counts)
          .map(([state, count]) => ({ state, count }))
          .sort((a, b) => b.count - a.count)
      );

      // Trigger stats
      const impressions = (impressionsRes.data as any[]) ?? [];
      const offers = (offersRes.data as any[]) ?? [];
      const offerMap = new Map(offers.map((o: any) => [o.id, o.offer_key]));

      const stats: Record<string, { shown: number; clicked: number; dismissed: number; converted: number }> = {};
      for (const imp of impressions) {
        const key = offerMap.get(imp.offer_id) || 'unknown';
        if (!stats[key]) stats[key] = { shown: 0, clicked: 0, dismissed: 0, converted: 0 };
        stats[key][imp.action as keyof typeof stats[typeof key]]++;
      }

      setTriggerStats(
        Object.entries(stats).map(([offer_key, s]) => ({
          offer_key,
          ...s,
          acceptance_rate: s.shown > 0 ? Math.round((s.clicked / s.shown) * 100) : 0,
        }))
      );

      setLoading(false);
    });
  }, [isAdmin]);

  if (!isAdmin) return null;
  if (loading) return null;

  const maxCount = Math.max(...distribution.map(d => d.count), 1);

  return (
    <div className="rounded-xl border border-border/60 bg-card p-6">
      <div className="flex items-center gap-2 mb-5">
        <BarChart3 className="h-4 w-4 text-primary" />
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Monetization Intelligence
        </p>
      </div>

      {/* State Distribution */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          User State Distribution ({totalUsers} Users)
        </p>
        <div className="space-y-2">
          {distribution.map(d => (
            <div key={d.state} className="flex items-center gap-3">
              <span className="w-20 text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                {STATE_EMOJIS[d.state]} {d.state}
              </span>
              <div className="flex-1 h-5 rounded-md bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-md transition-all duration-500 ${STATE_COLORS[d.state] || 'bg-muted-foreground/20'}`}
                  style={{ width: `${(d.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right text-[11px] font-bold text-foreground">{d.count}</span>
              <span className="w-10 text-right text-[10px] text-muted-foreground">
                {totalUsers > 0 ? Math.round((d.count / totalUsers) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Trigger Performance */}
      {triggerStats.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            Offer Trigger Performance
          </p>
          <div className="grid gap-2">
            {triggerStats.map(t => (
              <div key={t.offer_key} className="flex items-center justify-between rounded-lg border border-border/30 bg-background p-3">
                <span className="text-[11px] font-medium text-foreground capitalize">{t.offer_key.replace(/_/g, ' ')}</span>
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span>{t.shown} shown</span>
                  <span>{t.clicked} clicks</span>
                  <span className={`font-bold ${t.acceptance_rate >= 20 ? 'text-success' : t.acceptance_rate >= 10 ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {t.acceptance_rate}% CTR
                  </span>
                  {t.converted > 0 && (
                    <span className="text-success font-bold">{t.converted} conv.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
