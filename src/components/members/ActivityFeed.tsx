import { useState, useEffect } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Activity } from 'lucide-react';

interface FeedItem {
  id: string;
  content: string;
  created_at: string;
  user_name: string;
}

export default function ActivityFeed() {
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);
  const [items, setItems] = useState<FeedItem[]>([]);

  useEffect(() => {
    // Fetch recent milestone messages from community
    supabase
      .from('community_messages')
      .select('id, content, created_at, user_id')
      .in('message_type', ['milestone_close', 'milestone_setter_booked', 'system'])
      .order('created_at', { ascending: false })
      .limit(6)
      .then(async ({ data }) => {
        if (!data || data.length === 0) return;
        const userIds = [...new Set(data.map(d => d.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        const nameMap = new Map((profiles ?? []).map(p => [p.id, p.full_name]));

        setItems(data.map(d => ({
          id: d.id,
          content: d.content,
          created_at: d.created_at,
          user_name: nameMap.get(d.user_id) ?? 'Member',
        })));
      });
  }, []);

  if (items.length === 0) return null;

  const timeAgo = (iso: string) => {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-4 w-4 text-muted-foreground/50" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {tl('Live Aktivität', 'Live Activity')}
        </p>
      </div>
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="flex items-start gap-3">
            <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground line-clamp-2">{item.content}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(item.created_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
