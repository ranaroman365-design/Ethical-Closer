import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Trophy, Medal, TrendingUp } from 'lucide-react';

interface LeaderEntry {
  user_id: string;
  full_name: string;
  accepted_count: number;
  total_value: number;
}

export default function ReferralLeaderboard() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  async function loadLeaderboard() {
    // Get all accepted referrals grouped by referrer
    const { data: refData } = await supabase
      .from('referrals')
      .select('referrer_id, status, reward_amount')
      .in('status', ['accepted']);

    if (!refData || refData.length === 0) {
      setLoading(false);
      return;
    }

    // Aggregate by referrer
    const map = new Map<string, { count: number; value: number }>();
    (refData as any[]).forEach((r) => {
      const existing = map.get(r.referrer_id) || { count: 0, value: 0 };
      existing.count += 1;
      existing.value += Number(r.reward_amount || 150);
      map.set(r.referrer_id, existing);
    });

    const referrerIds = Array.from(map.keys());
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', referrerIds);

    const nameMap = new Map<string, string>();
    (profiles || []).forEach((p) => nameMap.set(p.id, p.full_name || 'Anonym'));

    const sorted = referrerIds
      .map((id) => ({
        user_id: id,
        full_name: nameMap.get(id) || 'Anonym',
        accepted_count: map.get(id)!.count,
        total_value: map.get(id)!.value,
      }))
      .sort((a, b) => b.accepted_count - a.accepted_count || b.total_value - a.total_value)
      .slice(0, 10);

    setEntries(sorted);
    setLoading(false);
  }

  if (loading || entries.length === 0) return null;

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="rounded-xl border border-border/40 bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-foreground">Referral Leaderboard</h3>
      </div>
      <div className="space-y-2">
        {entries.map((e, i) => (
          <div
            key={e.user_id}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
              e.user_id === user?.id ? 'bg-accent/10 border border-accent/20' : 'hover:bg-muted/50'
            }`}
          >
            <span className="w-6 text-center text-sm font-bold">
              {i < 3 ? medals[i] : `${i + 1}.`}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-foreground truncate">
                {e.full_name}
                {e.user_id === user?.id && (
                  <span className="ml-1 text-[10px] text-accent">(Du)</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {e.accepted_count} Referrals
              </span>
              <span className="font-semibold text-foreground">{e.total_value}€</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
