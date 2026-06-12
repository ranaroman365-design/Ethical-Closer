import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TOUCHPOINTS, TOUCHPOINT_DEFAULTS } from '@/lib/canonical-lead-activation';

export default function PerformanceLeadActivation() {
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('lead_activation_settings').select('*').eq('scope', 'global').is('funnel_key', null).maybeSingle();
      setGlobalSettings(s);
      const { data: t } = await supabase.from('lead_activation_templates').select('*').order('touchpoint_code');
      setTemplates(t ?? []);
      const { data: j } = await supabase.from('lead_activation_jobs').select('id, lead_id, touchpoint_code, channel, status, scheduled_for').order('scheduled_for', { ascending: false }).limit(30);
      setJobs(j ?? []);
      const { data: e } = await supabase.from('lead_activation_events').select('id, event_type, payload, created_at').order('created_at', { ascending: false }).limit(30);
      setEvents(e ?? []);
    })();
  }, []);

  return (
    <div className="container mx-auto max-w-5xl p-8">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Layer 29 · Performance · L6</p>
      <h1 className="font-serif text-3xl mb-2">Lead Activation</h1>
      <p className="text-sm text-muted-foreground mb-8">Pre-Booking-Touchpoints für deinen Funnel. Du siehst nur deine eigenen Leads.</p>

      <div className="rounded-2xl border border-border bg-card p-6 mb-8">
        <p className="text-sm font-medium mb-1">System-Status</p>
        <p className="text-xs text-muted-foreground">
          Global: {globalSettings?.lead_activation_enabled ? '🟢 Aktiv' : '⚪ Deaktiviert'} · Test-Mode: {globalSettings?.test_mode ? 'AN' : 'AUS'}
        </p>
        {(!globalSettings?.lead_activation_enabled || globalSettings?.test_mode) && (
          <p className="text-xs text-amber-700 mt-2">
            Aktuell werden keine echten Nachrichten verschickt. Templates und Pläne werden vorbereitet, aber stumm gehalten.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 mb-8">
        <h2 className="font-serif text-xl mb-4">Touchpoint-Übersicht</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TOUCHPOINTS.map((code) => {
            const def = TOUCHPOINT_DEFAULTS.find((d) => d.code === code)!;
            const tpl = templates.find((t) => t.touchpoint_code === code && t.scope === 'global');
            return (
              <div key={code} className="p-4 rounded-lg border border-border/50">
                <p className="text-xs font-mono mb-1">{code}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{def.phase} · {def.channel} · +{def.offset_minutes}m</p>
                <p className="text-xs whitespace-pre-wrap line-clamp-4">{tpl?.body ?? '—'}</p>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-4">Funnel-Overrides folgen in Phase 2.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-serif text-xl mb-4">Geplante Jobs</h2>
          {jobs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Keine Jobs sichtbar.</p>
          ) : jobs.map((j) => (
            <div key={j.id} className="text-xs py-2 border-t border-border/30 flex justify-between">
              <span className="font-mono">{j.touchpoint_code}</span>
              <span className="text-muted-foreground">{j.status}</span>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-serif text-xl mb-4">Event-Log</h2>
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground">Keine Events.</p>
          ) : events.map((e) => (
            <div key={e.id} className="text-xs py-2 border-t border-border/30">
              <span className="font-mono">{e.event_type}</span>
              <span className="ml-2 text-muted-foreground">{new Date(e.created_at).toLocaleString('de-DE')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
