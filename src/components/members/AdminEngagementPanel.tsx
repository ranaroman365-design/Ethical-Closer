import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Trophy, Users, TrendingUp, MessageCircle, BarChart3 } from 'lucide-react';

interface LevelStats {
  level: string;
  count: number;
  wins: number;
  posts: number;
}

interface TopUser {
  user_id: string;
  name: string;
  posts: number;
  wins: number;
  stage: string;
}

export default function AdminEngagementPanel() {
  const [levelStats, setLevelStats] = useState<LevelStats[]>([]);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [totals, setTotals] = useState({ totalPosts: 0, totalWins: 0, activeUsers: 0, avgPostsPerUser: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const oneWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [msgRes, profilesRes] = await Promise.all([
      supabase
        .from('community_messages')
        .select('user_id, post_category, message_type, community_type, created_at')
        .gte('created_at', oneWeek)
        .limit(1000),
      supabase
        .from('profiles')
        .select('id, full_name, business_stage')
        .limit(1000),
    ]);

    const msgs = msgRes.data ?? [];
    const profiles = profilesRes.data ?? [];
    const profileMap = new Map(profiles.map(p => [p.id, p]));

    // Per-community stats
    const communityMap = new Map<string, { count: number; wins: number; posts: number }>();
    const userMap = new Map<string, { posts: number; wins: number }>();

    msgs.forEach(m => {
      const ct = m.community_type || 'trainee';
      const entry = communityMap.get(ct) || { count: 0, wins: 0, posts: 0 };
      entry.posts++;
      const isWin = m.post_category === 'win' || m.message_type === 'win' || m.message_type === 'milestone' || m.message_type === 'level_up';
      if (isWin) entry.wins++;
      communityMap.set(ct, entry);

      const ue = userMap.get(m.user_id) || { posts: 0, wins: 0 };
      ue.posts++;
      if (isWin) ue.wins++;
      userMap.set(m.user_id, ue);
    });

    const levelLabels: Record<string, string> = { trainee: 'Trainee', closer: 'Closer', manager: 'Leadership' };
    setLevelStats(
      ['trainee', 'closer', 'manager'].map(k => ({
        level: levelLabels[k] || k,
        count: communityMap.get(k)?.posts || 0,
        wins: communityMap.get(k)?.wins || 0,
        posts: communityMap.get(k)?.posts || 0,
      }))
    );

    // Top users
    const sorted = [...userMap.entries()]
      .sort((a, b) => b[1].posts - a[1].posts)
      .slice(0, 10);

    setTopUsers(sorted.map(([uid, stats]) => ({
      user_id: uid,
      name: profileMap.get(uid)?.full_name || 'Anonym',
      stage: profileMap.get(uid)?.business_stage || '—',
      ...stats,
    })));

    const totalPosts = msgs.length;
    const totalWins = msgs.filter(m => m.post_category === 'win' || m.message_type === 'win').length;
    const activeUsers = userMap.size;
    setTotals({
      totalPosts,
      totalWins,
      activeUsers,
      avgPostsPerUser: activeUsers > 0 ? Math.round(totalPosts / activeUsers * 10) / 10 : 0,
    });

    setLoading(false);
  }

  if (loading) return <p className="text-xs text-muted-foreground p-4">Lade Engagement-Daten…</p>;

  return (
    <div className="space-y-6">
      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Posts (7d)', value: totals.totalPosts, icon: MessageCircle },
          { label: 'Wins (7d)', value: totals.totalWins, icon: Trophy },
          { label: 'Aktive User', value: totals.activeUsers, icon: Users },
          { label: 'Ø Posts/User', value: totals.avgPostsPerUser, icon: BarChart3 },
        ].map(c => (
          <div key={c.label} className="rounded-lg border border-border/40 bg-card p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <c.icon className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</span>
            </div>
            <p className="text-lg font-bold text-foreground">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Per community */}
      <div className="rounded-xl border border-border/40 bg-card p-4">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5" /> Engagement pro Community (7d)
        </h4>
        <div className="space-y-2">
          {levelStats.map(ls => (
            <div key={ls.level} className="flex items-center justify-between rounded-lg border border-border/30 bg-background p-2.5">
              <span className="text-[12px] font-medium text-foreground">{ls.level}</span>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="text-muted-foreground">{ls.posts} Posts</span>
                <span className="text-amber-600 font-medium">{ls.wins} Wins</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top users */}
      <div className="rounded-xl border border-border/40 bg-card p-4">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
          <Users className="h-3.5 w-3.5" /> Top aktive User (7d)
        </h4>
        <div className="space-y-1.5">
          {topUsers.map((u, i) => (
            <div key={u.user_id} className="flex items-center justify-between rounded-lg border border-border/30 bg-background p-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-muted-foreground w-5">{i + 1}.</span>
                <div>
                  <p className="text-[12px] font-medium text-foreground">{u.name}</p>
                  <p className="text-[10px] text-muted-foreground">{u.stage}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-muted-foreground">{u.posts} Posts</span>
                <span className="text-amber-600 font-medium">{u.wins} Wins</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
