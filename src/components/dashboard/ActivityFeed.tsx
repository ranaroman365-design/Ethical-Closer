import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Activity, Zap, Users, TrendingUp, BookOpen, RefreshCw, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface SimulatedEvent {
  id: string;
  event_type: string;
  title: string;
  description: string | null;
  created_at: string;
  priority: number;
}

const EVENT_ICONS: Record<string, typeof Activity> = {
  new_member: Users,
  booking_created: BookOpen,
  deal_closed: TrendingUp,
  level_up: Zap,
  system_tip: MessageSquare,
  recovery_action: RefreshCw,
  community_activity: Users,
};

const EVENT_COLORS: Record<string, string> = {
  new_member: 'text-blue-500',
  booking_created: 'text-amber-500',
  deal_closed: 'text-emerald-500',
  level_up: 'text-purple-500',
  system_tip: 'text-muted-foreground',
  recovery_action: 'text-orange-500',
  community_activity: 'text-cyan-500',
};

export default function ActivityFeed() {
  const { lang } = useLanguage();
  const [events, setEvents] = useState<SimulatedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('simulated_activity_events')
        .select('id, event_type, title, description, created_at, priority')
        .eq('is_simulated', true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(8);

      setEvents((data as SimulatedEvent[]) || []);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return null;
  if (events.length === 0) return null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Activity className="h-4 w-4 text-primary" />
          {tl('Was gerade im System passiert', 'What\'s happening right now')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.map((evt) => {
          const Icon = EVENT_ICONS[evt.event_type] || Activity;
          const color = EVENT_COLORS[evt.event_type] || 'text-muted-foreground';

          return (
            <div key={evt.id} className="flex items-start gap-3 text-sm">
              <div className={`mt-0.5 shrink-0 ${color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-foreground leading-snug">{evt.title}</p>
                {evt.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{evt.description}</p>
                )}
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground/70">
                {formatDistanceToNow(new Date(evt.created_at), {
                  addSuffix: true,
                  locale: lang === 'de' ? de : undefined,
                })}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
