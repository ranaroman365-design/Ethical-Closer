import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Video, ExternalLink, Calendar } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

interface LiveCall {
  id: string;
  title: string;
  weekday: string;
  time_slot: string;
  description: string;
  join_link: string;
}

export default function LiveCallsDisplay() {
  const [calls, setCalls] = useState<LiveCall[]>([]);
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => lang === 'de' ? de : en;

  useEffect(() => {
    supabase.from('live_calls').select('*').eq('is_active', true).order('sort_order')
      .then(({ data }) => setCalls((data as LiveCall[]) ?? []));
  }, []);

  if (calls.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Calendar className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{tl('Live-Trainings', 'Live Trainings')}</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {calls.map(call => (
          <div key={call.id} className="rounded-xl border border-border/40 bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Video className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">{call.title}</span>
            </div>
            <p className="text-xs font-medium text-accent mb-1">{call.weekday} · {call.time_slot} Uhr</p>
            <p className="text-xs text-muted-foreground mb-3">{call.description}</p>
            {call.join_link && (
              <Button variant="outline" size="sm" className="text-xs w-full" onClick={() => window.open(call.join_link, '_blank')}>
                <ExternalLink className="mr-1 h-3 w-3" />
                {tl('Teilnehmen', 'Join')}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
