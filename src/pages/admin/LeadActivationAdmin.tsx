import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TOUCHPOINTS, TOUCHPOINT_DEFAULTS } from '@/lib/canonical-lead-activation';

export default function LeadActivationAdmin() {
  const [settings, setSettings] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [recentJobs, setRecentJobs] = useState<any[]>([]);

  const load = async () => {
    const { data: s } = await supabase.from('lead_activation_settings').select('*').eq('scope', 'global').is('funnel_key', null).maybeSingle();
    setSettings(s);
    const { data: t } = await supabase.from('lead_activation_templates').select('*').eq('scope', 'global').order('touchpoint_code');
    setTemplates(t ?? []);
    const { data: j } = await supabase.from('lead_activation_jobs').select('id, touchpoint_code, status, scheduled_for, channel').order('scheduled_for', { ascending: false }).limit(20);
    setRecentJobs(j ?? []);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (field: 'lead_activation_enabled' | 'test_mode') => {
    if (!settings) return;
    const patch = field === 'lead_activation_enabled'
      ? { lead_activation_enabled: !settings.lead_activation_enabled }
      : { test_mode: !settings.test_mode };
    await supabase.from('lead_activation_settings').update(patch).eq('id', settings.id);
    load();
  };

  return (
    <div className="container mx-auto max-w-5xl p-8">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Layer 29 · Admin</p>
      <h1 className="font-serif text-3xl mb-2">Lead Activation Touchpoints</h1>
      <p className="text-sm text-muted-foreground mb-8">Pre-Booking outreach engine. Strikt additiv — bleibt stumm bis global UND pro Funnel aktiviert.</p>

      <div className="rounded-2xl border border-border bg-card p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-medium">Status</p>
            <p className="text-xs text-muted-foreground">Globaler Schalter + Test-Mode</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => toggle('lead_activation_enabled')} className="px-4 py-2 rounded-lg border border-border text-sm">
              {settings?.lead_activation_enabled ? '🟢 Aktiv' : '⚪ Deaktiviert'}
            </button>
            <button onClick={() => toggle('test_mode')} className="px-4 py-2 rounded-lg border border-border text-sm">
              {settings?.test_mode ? '🧪 Test-Mode AN' : '🚀 LIVE'}
            </button>
          </div>
        </div>
        {settings?.test_mode && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-xs text-amber-900">
            Test-Mode aktiv. Keine echten SMS/WhatsApp/E-Mails werden gesendet — alles wird als <code>sent_stub</code> geloggt.
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 mb-8">
        <h2 className="font-serif text-xl mb-4">Touchpoint-Defaults (DE)</h2>
        <div className="space-y-3">
          {TOUCHPOINTS.map((code) => {
            const def = TOUCHPOINT_DEFAULTS.find((d) => d.code === code)!;
            const tpl = templates.find((t) => t.touchpoint_code === code);
            return (
              <div key={code} className="flex items-start gap-4 p-3 rounded-lg border border-border/50">
                <div className="min-w-[180px]">
                  <p className="text-xs font-mono">{code}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{def.phase} · {def.channel} · +{def.offset_minutes}m</p>
                </div>
                <div className="flex-1">
                  {tpl?.subject && <p className="text-xs font-medium mb-1">{tpl.subject}</p>}
                  <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{tpl?.body ?? '— kein Template —'}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-serif text-xl mb-4">Letzte Jobs</h2>
        {recentJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Jobs. Sobald ein Lead erstellt wird, plant der Trigger 9 Touchpoints.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-2">Touchpoint</th><th>Channel</th><th>Geplant</th><th>Status</th></tr>
            </thead>
            <tbody>
              {recentJobs.map((j) => (
                <tr key={j.id} className="border-t border-border/30">
                  <td className="py-2 font-mono">{j.touchpoint_code}</td>
                  <td>{j.channel}</td>
                  <td>{new Date(j.scheduled_for).toLocaleString('de-DE')}</td>
                  <td>{j.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
