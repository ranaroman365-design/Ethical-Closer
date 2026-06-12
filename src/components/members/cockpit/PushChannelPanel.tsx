import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Bell, BellOff } from 'lucide-react';
import { PUSH_USE_CASES, PUSH_USE_CASE_LIST, type PushUseCase } from '@/lib/canonical-push';
import { requestPushSubscription, revokePushSubscription, isPushSupported } from '@/lib/push-client';

interface Settings {
  master_enabled: boolean;
  vapid_public_key: string | null;
  per_use_case: Record<string, boolean>;
}

interface NotifRow {
  id: string;
  use_case: string;
  channel: string;
  title: string;
  decision: string;
  reason: string | null;
  created_at: string;
}

export function PushChannelPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [recent, setRecent] = useState<NotifRow[]>([]);
  const [vapidDraft, setVapidDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [supported, setSupported] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: r }] = await Promise.all([
      supabase.from('push_settings')
        .select('master_enabled, vapid_public_key, per_use_case')
        .eq('id', true).maybeSingle(),
      supabase.from('push_notifications')
        .select('id, use_case, channel, title, decision, reason, created_at')
        .order('created_at', { ascending: false }).limit(20),
    ]);
    if (s) {
      setSettings(s as Settings);
      setVapidDraft(s.vapid_public_key ?? '');
    }
    if (r) setRecent(r as NotifRow[]);
    setLoading(false);
    setSupported(await isPushSupported());
  };

  useEffect(() => { load(); }, []);

  const update = async (next: Partial<Settings>) => {
    if (!settings) return;
    setSaving(true);
    const merged = { ...settings, ...next };
    const { error } = await supabase
      .from('push_settings')
      .update({
        master_enabled: merged.master_enabled,
        vapid_public_key: merged.vapid_public_key,
        per_use_case: merged.per_use_case,
        updated_at: new Date().toISOString(),
      })
      .eq('id', true);
    setSaving(false);
    if (error) { toast.error('Could not save'); return; }
    setSettings(merged);
    toast.success('Push settings saved');
  };

  if (loading || !settings) {
    return (
      <Card><CardHeader><CardTitle>Push Notification Channel</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent></Card>
    );
  }

  const handleOptIn = async () => {
    const res = await requestPushSubscription();
    if (res.status === 'subscribed') toast.success('Push notifications enabled');
    else if (res.status === 'permission_denied') toast.error('Permission denied by browser');
    else if (res.status === 'unsupported') toast.error('Browser does not support web push');
    else if (res.status === 'no_vapid_key') toast.error('Configure VAPID public key first');
    else toast.error(`Could not subscribe: ${res.error ?? res.status}`);
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Push Notification Channel
              </CardTitle>
              <CardDescription>
                Additional channel — brings users back into the platform. Never replaces WhatsApp/SMS.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="push-master" className="text-sm">Master</Label>
              <Switch id="push-master" checked={settings.master_enabled}
                onCheckedChange={(v) => update({ master_enabled: v })} disabled={saving} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label className="text-sm">VAPID public key (web push)</Label>
            <div className="flex gap-2 mt-1">
              <Input value={vapidDraft} onChange={(e) => setVapidDraft(e.target.value)}
                placeholder="BNc... (base64url)" />
              <Button onClick={() => update({ vapid_public_key: vapidDraft || null })} disabled={saving}>
                Save key
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Without a VAPID key, in-app notifications still work; browser push is queued only.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Use cases</Label>
            <div className="grid grid-cols-1 gap-2">
              {PUSH_USE_CASE_LIST.map((uc) => {
                const spec = PUSH_USE_CASES[uc as PushUseCase];
                const enabled = settings.per_use_case[uc] ?? true;
                return (
                  <div key={uc} className="flex items-start justify-between rounded-md border border-border p-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{uc}</span>
                        {spec.dedupe_with_messaging_minutes > 0 && (
                          <Badge variant="outline">dedupe {spec.dedupe_with_messaging_minutes}m</Badge>
                        )}
                        {spec.allowed_channels.map((c) => (
                          <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">→ {spec.default_click_path}</p>
                    </div>
                    <Switch checked={enabled} disabled={saving}
                      onCheckedChange={(v) => update({
                        per_use_case: { ...settings.per_use_case, [uc]: v },
                      })} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Test on this device</p>
                <p className="text-xs text-muted-foreground">
                  {supported
                    ? 'Browser supports web push.'
                    : 'This browser does not support web push.'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleOptIn} disabled={!supported}>Enable on this device</Button>
                <Button size="sm" variant="outline" onClick={async () => { await revokePushSubscription(); toast.success('Revoked'); }}>
                  <BellOff className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent dispatch decisions</CardTitle>
          <CardDescription>Last 20 push events</CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No push activity yet.</p>
          ) : (
            <div className="space-y-2">
              {recent.map((row) => (
                <div key={row.id} className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                  <div>
                    <span className="font-medium">{row.use_case}</span>
                    <span className="text-muted-foreground"> · {row.channel}</span>
                    <p className="text-xs text-muted-foreground">{row.title} · {new Date(row.created_at).toLocaleString()}</p>
                  </div>
                  <Badge variant={
                    row.decision === 'sent' ? 'default'
                      : row.decision === 'suppressed' ? 'secondary'
                      : 'destructive'
                  }>
                    {row.decision}{row.reason && row.decision !== 'sent' ? ` · ${row.reason}` : ''}
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
