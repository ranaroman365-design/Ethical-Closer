import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  EMAIL_LIFECYCLE_TRIGGERS,
  EMAIL_LIFECYCLE_EVENT_LIST,
  type EmailLifecycleEvent,
} from '@/lib/canonical-email-documentation';
import { Mail, ShieldCheck } from 'lucide-react';

interface Settings {
  master_enabled: boolean;
  per_event: Record<string, boolean>;
}

interface LogRow {
  id: string;
  event_name: string;
  recipient_email: string;
  template_name: string | null;
  decision: 'sent' | 'suppressed' | 'error';
  reason: string | null;
  created_at: string;
}

export function EmailDocumentationPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: l }] = await Promise.all([
      supabase
        .from('email_documentation_settings')
        .select('master_enabled, per_event')
        .eq('id', true)
        .maybeSingle(),
      supabase
        .from('email_documentation_log')
        .select('id, event_name, recipient_email, template_name, decision, reason, created_at')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    if (s) setSettings(s as Settings);
    if (l) setLogs(l as LogRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const updateSettings = async (next: Settings) => {
    setSaving(true);
    const { error } = await supabase
      .from('email_documentation_settings')
      .update({ master_enabled: next.master_enabled, per_event: next.per_event, updated_at: new Date().toISOString() })
      .eq('id', true);
    setSaving(false);
    if (error) {
      toast.error('Could not save settings');
      return;
    }
    setSettings(next);
    toast.success('Email documentation settings saved');
  };

  const toggleMaster = (v: boolean) => {
    if (!settings) return;
    updateSettings({ ...settings, master_enabled: v });
  };

  const toggleEvent = (ev: EmailLifecycleEvent, v: boolean) => {
    if (!settings) return;
    updateSettings({ ...settings, per_event: { ...settings.per_event, [ev]: v } });
  };

  if (loading || !settings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email Documentation Layer</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Documentation Layer
              </CardTitle>
              <CardDescription>
                Email = official documentation channel. Conversion stays on WhatsApp/SMS/Voice.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="master-toggle" className="text-sm">Master</Label>
              <Switch id="master-toggle" checked={settings.master_enabled} onCheckedChange={toggleMaster} disabled={saving} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3">
            {EMAIL_LIFECYCLE_EVENT_LIST.map((ev) => {
              const spec = EMAIL_LIFECYCLE_TRIGGERS[ev];
              const enabled = settings.per_event[ev] ?? true;
              return (
                <div
                  key={ev}
                  className="flex items-start justify-between rounded-md border border-border p-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{ev}</span>
                      {spec.mandatory && (
                        <Badge variant="secondary" className="gap-1">
                          <ShieldCheck className="h-3 w-3" /> mandatory
                        </Badge>
                      )}
                      {spec.dedupe_with_messaging && (
                        <Badge variant="outline">dedupe {spec.dedupe_window_minutes}m</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{spec.purpose}</p>
                    <p className="text-xs text-muted-foreground">
                      Template: <code className="text-xs">{spec.template_name}</code>
                    </p>
                  </div>
                  <Switch
                    checked={spec.mandatory ? true : enabled}
                    disabled={spec.mandatory || saving}
                    onCheckedChange={(v) => toggleEvent(ev, v)}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent dispatch decisions</CardTitle>
          <CardDescription>Last 20 events processed by the documentation layer</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No dispatch activity yet.</p>
          ) : (
            <div className="space-y-2">
              {logs.map((row) => (
                <div key={row.id} className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                  <div className="flex flex-col">
                    <span className="font-medium">{row.event_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {row.recipient_email} · {new Date(row.created_at).toLocaleString()}
                    </span>
                  </div>
                  <Badge
                    variant={
                      row.decision === 'sent'
                        ? 'default'
                        : row.decision === 'suppressed'
                          ? 'secondary'
                          : 'destructive'
                    }
                  >
                    {row.decision}
                    {row.reason && row.decision !== 'sent' ? ` · ${row.reason}` : ''}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
