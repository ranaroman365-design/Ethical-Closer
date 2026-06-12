import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Radio, Zap, Mail, Webhook, Bell, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import WebhookDlqPanel from './WebhookDlqPanel';

const GROUP_ICONS: Record<string, typeof Radio> = {
  db_triggers: Zap,
  cron_functions: Radio,
  transactional_emails: Mail,
  webhook_dispatch: Webhook,
  realtime_notifications: Bell,
  monetization_triggers: TrendingUp,
};

const GROUP_COLORS: Record<string, string> = {
  db_triggers: 'text-primary',
  cron_functions: 'text-accent',
  transactional_emails: 'text-primary',
  webhook_dispatch: 'text-muted-foreground',
  realtime_notifications: 'text-accent',
  monetization_triggers: 'text-primary',
};

interface Toggle {
  id: string;
  group_key: string;
  group_label: string;
  group_description: string;
  enabled: boolean;
}

export default function AdminCommunicationToggles() {
  const { toast } = useToast();
  const [toggles, setToggles] = useState<Toggle[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [dlqOpen, setDlqOpen] = useState(false);

  useEffect(() => {
    supabase
      .from('communication_toggles')
      .select('id, group_key, group_label, group_description, enabled')
      .order('group_key')
      .then(({ data }) => {
        setToggles((data as Toggle[]) ?? []);
        setLoading(false);
      });
  }, []);

  async function handleToggle(toggle: Toggle) {
    setUpdating(toggle.id);
    const newEnabled = !toggle.enabled;
    const { error } = await supabase
      .from('communication_toggles')
      .update({ enabled: newEnabled, updated_at: new Date().toISOString() } as any)
      .eq('id', toggle.id);

    if (error) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    } else {
      setToggles(prev =>
        prev.map(t => (t.id === toggle.id ? { ...t, enabled: newEnabled } : t))
      );
      toast({
        title: newEnabled ? 'Aktiviert' : 'Deaktiviert',
        description: toggle.group_label,
      });
    }
    setUpdating(null);
  }

  if (loading) return null;

  const enabledCount = toggles.filter(t => t.enabled).length;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">
              Kommunikations-Steuerung
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {enabledCount}/{toggles.length} Gruppen aktiv
            </p>
          </div>
        </div>

        <div className="grid gap-3">
          {toggles.map(toggle => {
            const Icon = GROUP_ICONS[toggle.group_key] || Radio;
            const color = GROUP_COLORS[toggle.group_key] || 'text-muted-foreground';

            return (
              <div
                key={toggle.id}
                className={`flex items-start gap-4 rounded-xl border p-4 transition-colors ${
                  toggle.enabled
                    ? 'border-border/40 bg-card'
                    : 'border-border/20 bg-muted/30 opacity-70'
                }`}
              >
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  toggle.enabled ? 'bg-accent/10' : 'bg-muted'
                }`}>
                  <Icon className={`h-4 w-4 ${toggle.enabled ? color : 'text-muted-foreground'}`} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground">
                    {toggle.group_label}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    {toggle.group_description}
                  </p>
                </div>

                <Switch
                  checked={toggle.enabled}
                  disabled={updating === toggle.id}
                  onCheckedChange={() => handleToggle(toggle)}
                  className="shrink-0 mt-1"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Dead Letter Queue — collapsible */}
      <div className="border border-border/40 rounded-xl overflow-hidden">
        <button
          onClick={() => setDlqOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/20 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Webhook className="h-3.5 w-3.5 text-destructive" />
            <span className="text-[13px] font-medium text-foreground">Dead Letter Queue</span>
          </div>
          {dlqOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
        {dlqOpen && (
          <div className="px-4 pb-4">
            <WebhookDlqPanel />
          </div>
        )}
      </div>
    </div>
  );
}
