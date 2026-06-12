import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Activity, AlertTriangle, CheckCircle2, XCircle, AlertCircle, RefreshCw, Bell } from 'lucide-react';

interface AuditRow { action: string; source_type: string | null; note: string | null; created_at: string; }
interface TriggerHealth { kpi_errors: number; cert_errors: number; recalc_errors: number; }
interface EventGroup { event_type: string; count: number; last: string; }
interface StatusGroup { status: string; count: number; }

interface HealthCheck {
  id: string;
  check_name: string;
  domain: string;
  status: 'ok' | 'warning' | 'critical';
  metric_value: number;
  threshold: number;
  message: string;
  details: Record<string, unknown>;
  checked_at: string;
}

interface HealthAlert {
  id: string;
  severity: 'warning' | 'critical';
  domain: string;
  check_name: string;
  message: string;
  acknowledged: boolean;
  created_at: string;
}

export default function SystemHealth() {
  const { isAdmin } = useAuth();
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [triggerHealth, setTriggerHealth] = useState<TriggerHealth>({ kpi_errors: 0, cert_errors: 0, recalc_errors: 0 });
  const [events, setEvents] = useState<EventGroup[]>([]);
  const [promoStats, setPromoStats] = useState<StatusGroup[]>([]);
  const [certStats, setCertStats] = useState<StatusGroup[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [healthAlerts, setHealthAlerts] = useState<HealthAlert[]>([]);
  const [runningManualCheck, setRunningManualCheck] = useState(false);

  const load = useCallback(async () => {
    const errs: Record<string, string> = {};

    // Panel 1 — Recent Audit Log
    const { data: logs, error: e1 } = await supabase
      .from('audit_logs')
      .select('action, source_type, note, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    if (e1) errs.audit = e1.message; else setAuditLogs((logs as AuditRow[]) || []);

    // Panel 2 — Trigger Health (last 24h)
    const { data: th, error: e2 } = await supabase
      .from('audit_logs')
      .select('action')
      .gte('created_at', new Date(Date.now() - 86400000).toISOString())
      .in('action', ['kpi_snapshot_trigger_error', 'cert_sync_trigger_error', 'cert_recalc_failed']);
    if (e2) errs.triggers = e2.message;
    else {
      const rows = (th || []) as { action: string }[];
      setTriggerHealth({
        kpi_errors: rows.filter(r => r.action === 'kpi_snapshot_trigger_error').length,
        cert_errors: rows.filter(r => r.action === 'cert_sync_trigger_error').length,
        recalc_errors: rows.filter(r => r.action === 'cert_recalc_failed').length,
      });
    }

    // Panel 3 — Processed Events
    const { data: pe, error: e3 } = await supabase
      .from('processed_events')
      .select('event_type, processed_at');
    if (e3) errs.events = e3.message;
    else {
      const rows = (pe || []) as { event_type: string; processed_at: string }[];
      const grouped = new Map<string, { count: number; last: string }>();
      for (const r of rows) {
        const g = grouped.get(r.event_type) || { count: 0, last: '' };
        g.count++;
        if (r.processed_at > g.last) g.last = r.processed_at;
        grouped.set(r.event_type, g);
      }
      setEvents(Array.from(grouped.entries()).map(([k, v]) => ({ event_type: k, ...v })).sort((a, b) => b.count - a.count));
    }

    // Panel 4 — Promotion Pipeline
    const { data: ps, error: e4 } = await supabase
      .from('user_level_status')
      .select('promotion_status');
    if (e4) errs.promo = e4.message;
    else {
      const rows = (ps || []) as { promotion_status: string }[];
      const m = new Map<string, number>();
      for (const r of rows) m.set(r.promotion_status, (m.get(r.promotion_status) || 0) + 1);
      setPromoStats(Array.from(m.entries()).map(([s, c]) => ({ status: s, count: c })));
    }

    // Panel 5 — Certification Pipeline
    const { data: cs, error: e5 } = await supabase
      .from('certification_status')
      .select('certification_title');
    if (e5) errs.cert = e5.message;
    else {
      const rows = (cs || []) as { certification_title: string | null }[];
      const m = new Map<string, number>();
      for (const r of rows) {
        const k = r.certification_title || 'No Title';
        m.set(k, (m.get(k) || 0) + 1);
      }
      setCertStats(Array.from(m.entries()).map(([s, c]) => ({ status: s, count: c })));
    }

    // Panel 6 — Health Check Results (latest per check_name)
    const { data: hc } = await supabase
      .from('health_check_results')
      .select('*')
      .order('checked_at', { ascending: false })
      .limit(20);
    if (hc) setHealthChecks(hc as unknown as HealthCheck[]);

    // Panel 7 — Unacknowledged Alerts
    const { data: ha } = await supabase
      .from('health_check_alerts')
      .select('*')
      .eq('acknowledged', false)
      .order('created_at', { ascending: false })
      .limit(20);
    if (ha) setHealthAlerts(ha as unknown as HealthAlert[]);

    setErrors(errs);
    setLastRefresh(new Date());
  }, []);

  const runManualCheck = async () => {
    setRunningManualCheck(true);
    try {
      await supabase.functions.invoke('system-health-check', { body: { window_hours: 24 } });
      await load();
    } catch (e) {
      console.error('Manual health check failed', e);
    }
    setRunningManualCheck(false);
  };

  const acknowledgeAlert = async (alertId: string) => {
    await (supabase
      .from('health_check_alerts') as any)
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
      .eq('id', alertId);
    setHealthAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  useEffect(() => {
    if (!isAdmin) return;
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, [isAdmin, load]);

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground">Admin only.</div>;

  const StatCard = ({ label, value, isError }: { label: string; value: number; isError?: boolean }) => (
    <div className={`rounded-lg border p-4 text-center ${isError && value > 0 ? 'border-red-500/40 bg-red-500/5' : 'border-border/40 bg-card'}`}>
      <p className={`text-2xl font-bold ${isError && value > 0 ? 'text-red-500' : 'text-foreground'}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{label}</p>
    </div>
  );

  const ErrorInline = ({ msg }: { msg: string }) => (
    <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-500">
      <AlertTriangle className="h-4 w-4 shrink-0" /> {msg}
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10 space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-primary" />
          <h1 className="font-serif text-2xl font-semibold text-foreground">System Health</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runManualCheck}
            disabled={runningManualCheck}
            className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${runningManualCheck ? 'animate-spin' : ''}`} />
            Health Check
          </button>
          <p className="text-xs text-muted-foreground">
            {lastRefresh.toLocaleTimeString()} (auto 60s)
          </p>
        </div>
      </div>

      {/* ═══ HEALTH CHECK ALERTS ═══ */}
      {healthAlerts.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Bell className="h-4 w-4 text-red-500" />
            <h2 className="text-sm font-semibold text-red-500">{healthAlerts.length} offene Alerts</h2>
          </div>
          <div className="space-y-2">
            {healthAlerts.map(a => (
              <div key={a.id} className={`flex items-center justify-between rounded-lg border p-3 ${
                a.severity === 'critical' ? 'border-red-500/40 bg-red-500/5' : 'border-yellow-500/40 bg-yellow-500/5'
              }`}>
                <div className="flex items-center gap-2">
                  {a.severity === 'critical'
                    ? <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                    : <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />}
                  <div>
                    <p className="text-xs font-medium text-foreground">{a.message}</p>
                    <p className="text-[10px] text-muted-foreground">{a.domain} · {a.check_name} · {new Date(a.created_at).toLocaleString()}</p>
                  </div>
                </div>
                <button
                  onClick={() => acknowledgeAlert(a.id)}
                  className="rounded border border-border/40 px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted/50"
                >
                  Bestätigen
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══ HEALTH CHECK RESULTS ═══ */}
      {healthChecks.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">Pipeline Health Checks</h2>
          {(() => {
            const latest = healthChecks.length > 0 ? healthChecks[0].checked_at : '';
            const latestChecks = healthChecks.filter(c => c.checked_at === latest);
            const domains = [...new Set(latestChecks.map(c => c.domain))];
            return (
              <div className="space-y-3">
                <p className="text-[10px] text-muted-foreground">
                  Letzter Check: {latest ? new Date(latest).toLocaleString() : '—'}
                </p>
                {domains.map(domain => (
                  <div key={domain}>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">{domain.replace('_', ' ')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {latestChecks.filter(c => c.domain === domain).map(c => (
                        <div key={c.id} className={`rounded-lg border p-3 ${
                          c.status === 'critical' ? 'border-red-500/40 bg-red-500/5' :
                          c.status === 'warning' ? 'border-yellow-500/40 bg-yellow-500/5' :
                          'border-green-500/30 bg-green-500/5'
                        }`}>
                          <div className="flex items-center gap-1.5 mb-1">
                            {c.status === 'ok' && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                            {c.status === 'warning' && <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />}
                            {c.status === 'critical' && <XCircle className="h-3.5 w-3.5 text-red-500" />}
                            <span className="text-xs font-medium text-foreground">{c.check_name.replace(/_/g, ' ')}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">{c.message}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Wert: {c.metric_value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </section>
      )}

      {/* Panel 2 — Trigger Health */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Trigger Health (24h)</h2>
        {errors.triggers ? <ErrorInline msg={errors.triggers} /> : (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="KPI Trigger Errors" value={triggerHealth.kpi_errors} isError />
            <StatCard label="Cert Sync Errors" value={triggerHealth.cert_errors} isError />
            <StatCard label="Recalc Failures" value={triggerHealth.recalc_errors} isError />
          </div>
        )}
      </section>

      {/* Panel 4 — Promotion Pipeline */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Promotion Pipeline</h2>
        {errors.promo ? <ErrorInline msg={errors.promo} /> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {promoStats.map(s => <StatCard key={s.status} label={s.status} value={s.count} />)}
          </div>
        )}
      </section>

      {/* Panel 5 — Certification Pipeline */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Certification Pipeline</h2>
        {errors.cert ? <ErrorInline msg={errors.cert} /> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {certStats.map(s => <StatCard key={s.status} label={s.status} value={s.count} />)}
          </div>
        )}
      </section>

      {/* Panel 3 — Processed Events */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Processed Events</h2>
        {errors.events ? <ErrorInline msg={errors.events} /> : (
          <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border/30 bg-muted/30">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Event Type</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Count</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Last</th>
              </tr></thead>
              <tbody>
                {events.map(e => (
                  <tr key={e.event_type} className="border-b border-border/20">
                    <td className="px-4 py-2 font-mono text-xs text-foreground">{e.event_type}</td>
                    <td className="px-4 py-2 text-right text-foreground">{e.count}</td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">{new Date(e.last).toLocaleString()}</td>
                  </tr>
                ))}
                {events.length === 0 && <tr><td colSpan={3} className="px-4 py-3 text-center text-muted-foreground text-xs">Keine Events</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Panel 1 — Audit Log */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Recent Audit Log</h2>
        {errors.audit ? <ErrorInline msg={errors.audit} /> : (
          <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border/30 bg-muted/30">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Action</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Source</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Note</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Time</th>
              </tr></thead>
              <tbody>
                {auditLogs.map((l, i) => (
                  <tr key={i} className="border-b border-border/20">
                    <td className="px-4 py-2 font-mono text-xs text-foreground">{l.action}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{l.source_type || '—'}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground max-w-[300px] truncate">{l.note || '—'}</td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
