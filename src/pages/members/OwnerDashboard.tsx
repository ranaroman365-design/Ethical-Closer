import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import {
  Shield, AlertTriangle, CheckCircle2,
  FileText, Users, Activity, Lock, Eye, ArrowRight,
  LayoutDashboard, Target,
  BarChart3, ShieldAlert, BookOpen, Plug,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de as deLocale } from 'date-fns/locale';

/* ─── Severity helpers ─── */
const SEV: Record<string, { text: string; bg: string; border: string }> = {
  critical: { text: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20' },
  high: { text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  medium: { text: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  low: { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
};
const sev = (s: string) => SEV[s] || SEV.medium;

/* ─── Section ─── */
const Section = ({ title, icon: Icon, children, delay = 0 }: { title: string; icon: React.ComponentType<any>; children: React.ReactNode; delay?: number }) => (
  <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay }} className="mb-8">
    <div className="flex items-center gap-2 mb-4">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">{title}</h2>
    </div>
    {children}
  </motion.section>
);

/* ─── Main ─── */
export default function OwnerDashboard() {
  const { isOwner } = useAuth();
  const { lang } = useLanguage();
  const tl = (d: string, e: string) => (lang === 'de' ? d : e);

  const [securityEvents, setSecurityEvents] = useState<any[]>([]);
  const [decisionRequests, setDecisionRequests] = useState<any[]>([]);
  const [breakGlassActive, setBreakGlassActive] = useState(0);
  const [pendingExports, setPendingExports] = useState(0);
  const [pendingEscalations, setPendingEscalations] = useState(0);
  const [integrationEvents, setIntegrationEvents] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [promptChangeReqs, setPromptChangeReqs] = useState<any[]>([]);
  const [watchlistItems, setWatchlistItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOwner) return;
    (async () => {
      setLoading(true);
      const [se, dr, bg, ex, es, ie, po, pc, wl] = await Promise.all([
        supabase.from('security_events').select('*').in('severity', ['high', 'critical']).order('created_at', { ascending: false }).limit(20),
        supabase.from('decision_requests').select('*').eq('current_status', 'pending').order('created_at', { ascending: false }).limit(50),
        supabase.from('break_glass_events').select('id').eq('status', 'active'),
        supabase.from('export_requests').select('id').eq('status', 'pending'),
        supabase.from('approval_requests').select('id').eq('status', 'pending').eq('request_type', 'role_escalation'),
        supabase.from('integration_health_events').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(20),
        supabase.from('decision_policies').select('*').order('policy_key'),
        supabase.from('prompt_change_requests').select('*').in('status', ['pending', 'under_review']).order('created_at', { ascending: false }).limit(20),
        supabase.from('owner_watchlist').select('*').eq('active', true).order('created_at', { ascending: false }).limit(20),
      ]);
      setSecurityEvents((se.data as any) || []);
      setDecisionRequests((dr.data as any) || []);
      setBreakGlassActive((bg.data as any)?.length || 0);
      setPendingExports((ex.data as any)?.length || 0);
      setPendingEscalations((es.data as any)?.length || 0);
      setIntegrationEvents((ie.data as any) || []);
      setPolicies((po.data as any) || []);
      setPromptChangeReqs((pc.data as any) || []);
      setWatchlistItems((wl.data as any) || []);
      setLoading(false);
    })();
  }, [isOwner]);

  const handleDecision = async (id: string, action: 'approve' | 'deny') => {
    await supabase.functions.invoke('secure-admin-action', {
      body: { action_type: action === 'approve' ? 'approve_decision' : 'deny_decision', target_id: id },
    });
    setDecisionRequests(prev => prev.filter(d => d.id !== id));
  };

  // Guard — after all hooks
  if (!isOwner) return <Navigate to="/members/dashboard" replace />;

  const criticalCount = securityEvents.filter((e: any) => e.severity === 'critical').length;
  const ownerDecisions = decisionRequests.filter((d: any) => d.owner_required);
  const autoRouted = decisionRequests.filter((d: any) => !d.owner_required).length;
  const policyCoverage = decisionRequests.length > 0 ? Math.round((autoRouted / decisionRequests.length) * 100) : 100;

  const cards = [
    { label: tl('Sicherheit', 'Security'), value: securityEvents.length, icon: ShieldAlert, color: 'text-destructive', bg: 'bg-destructive/8' },
    { label: tl('Kritisch', 'Critical'), value: criticalCount, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/8' },
    { label: tl('Owner-Queue', 'Owner Queue'), value: ownerDecisions.length, icon: Target, color: 'text-accent', bg: 'bg-accent/8' },
    { label: 'Break-Glass', value: breakGlassActive, icon: Lock, color: breakGlassActive > 0 ? 'text-destructive' : 'text-primary', bg: breakGlassActive > 0 ? 'bg-destructive/8' : 'bg-primary/8' },
    { label: tl('Exporte', 'Exports'), value: pendingExports, icon: FileText, color: 'text-primary', bg: 'bg-primary/8' },
    { label: tl('Eskalationen', 'Escalations'), value: pendingEscalations, icon: Users, color: 'text-accent', bg: 'bg-accent/8' },
    { label: tl('Integrationen', 'Integrations'), value: integrationEvents.length, icon: Plug, color: 'text-muted-foreground', bg: 'bg-muted' },
    { label: 'Watchlist', value: watchlistItems.length, icon: Eye, color: 'text-muted-foreground', bg: 'bg-muted' },
  ];

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 flex items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-sm text-muted-foreground">{tl('Lade Owner-Konsole…', 'Loading…')}</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10 lg:px-8">
      {/* HEADER */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{tl('Owner-Kontrollzentrum', 'Owner Control Center')}</p>
            <h1 className="font-serif text-xl font-semibold text-foreground">{tl('Systemsteuerung', 'System Governance')}</h1>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{tl('Alle Aktionen werden protokolliert.', 'All actions are logged.')}</p>
      </motion.div>

      {/* STATUS CARDS */}
      <Section title={tl('Systemstatus', 'System Status')} icon={Activity} delay={0.05}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {cards.map((c, i) => {
            const I = c.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.04 }} className="rounded-xl border border-border/40 bg-card p-4">
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${c.bg} mb-2`}><I className={`h-3.5 w-3.5 ${c.color}`} /></div>
                <p className="text-2xl font-bold text-foreground tabular-nums">{c.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{c.label}</p>
              </motion.div>
            );
          })}
        </div>
      </Section>

      {/* METRICS */}
      <Section title={tl('Owner-Metriken', 'Owner Metrics')} icon={BarChart3} delay={0.1}>
        <div className="grid grid-cols-3 gap-3">
          {[
            { v: ownerDecisions.length, l: tl('Owner-pflichtig', 'Owner Required') },
            { v: autoRouted, l: tl('Auto-geroutet', 'Auto-routed') },
            { v: `${policyCoverage}%`, l: tl('Policy-Abdeckung', 'Policy Coverage'), accent: true },
          ].map((m, i) => (
            <div key={i} className="rounded-xl border border-border/40 bg-card p-4 text-center">
              <p className={`text-xl font-bold ${(m as any).accent ? 'text-primary' : 'text-foreground'}`}>{m.v}</p>
              <p className="text-[10px] text-muted-foreground">{m.l}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* DECISION QUEUE */}
      <Section title={tl('Owner-Entscheidungen', 'Owner Decisions')} icon={Target} delay={0.15}>
        {ownerDecisions.length === 0 ? (
          <div className="rounded-xl border border-border/30 bg-card p-6 text-center">
            <CheckCircle2 className="mx-auto h-6 w-6 text-primary mb-2" />
            <p className="text-sm text-muted-foreground">{tl('Keine ausstehenden Entscheidungen', 'No pending decisions')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {ownerDecisions.map((req: any) => {
              const s = sev(req.severity);
              return (
                <div key={req.id} className={`rounded-xl border ${s.border} ${s.bg} p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${s.text} ${s.bg}`}>{req.severity}</span>
                        <span className="text-[10px] text-muted-foreground">{req.request_type}</span>
                        {req.policy_key && <span className="text-[9px] font-mono text-muted-foreground/60">{req.policy_key}</span>}
                      </div>
                      <p className="text-sm font-medium text-foreground">{req.reason || '—'}</p>
                      {req.recommended_action && <p className="text-[11px] text-muted-foreground mt-1">{tl('Empfehlung:', 'Rec:')} {req.recommended_action}</p>}
                      <p className="text-[10px] text-muted-foreground/60 mt-1">{formatDistanceToNow(new Date(req.created_at), { addSuffix: true, locale: lang === 'de' ? deLocale : undefined })}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => handleDecision(req.id, 'approve')} className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-1.5 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors">{tl('Genehmigen', 'Approve')}</button>
                      <button onClick={() => handleDecision(req.id, 'deny')} className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-[10px] font-semibold text-destructive hover:bg-destructive/20 transition-colors">{tl('Ablehnen', 'Deny')}</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* SECURITY RADAR */}
      <Section title={tl('Sicherheitsradar', 'Security Radar')} icon={ShieldAlert} delay={0.2}>
        {securityEvents.length === 0 ? (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-center">
            <Shield className="mx-auto h-5 w-5 text-primary mb-2" />
            <p className="text-sm text-muted-foreground">{tl('Keine aktiven Ereignisse', 'No active events')}</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
            {securityEvents.slice(0, 10).map((ev: any) => {
              const s = sev(ev.severity);
              return (
                <div key={ev.id} className="flex items-center gap-3 rounded-lg border border-border/30 bg-card px-4 py-2.5">
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${s.bg}`}><AlertTriangle className={`h-3 w-3 ${s.text}`} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-foreground truncate">{ev.event_type}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{ev.summary}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-bold uppercase ${s.text} ${s.bg}`}>{ev.severity}</span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* PROMPT GOVERNANCE */}
      <Section title={tl('Prompt-Governance', 'Prompt Governance')} icon={BookOpen} delay={0.25}>
        {promptChangeReqs.length === 0 ? (
          <div className="rounded-xl border border-border/30 bg-card p-5 text-center">
            <BookOpen className="mx-auto h-5 w-5 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">{tl('Keine Prompt-Anfragen', 'No prompt requests')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {promptChangeReqs.map((pcr: any) => (
              <div key={pcr.id} className="rounded-xl border border-border/40 bg-card p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-accent bg-accent/10 rounded-full px-2 py-0.5">{pcr.request_type}</span>
                  <span className="text-[9px] text-muted-foreground">{pcr.status}</span>
                </div>
                <p className="text-sm text-foreground">{pcr.rationale || pcr.proposal_summary || '—'}</p>
              </div>
            ))}
          </div>
        )}
        <Link to="/members/admin/prompt-vault" className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors">
          {tl('Prompt Vault öffnen', 'Open Prompt Vault')} <ArrowRight className="h-3 w-3" />
        </Link>
      </Section>

      {/* INTEGRATION GOVERNANCE */}
      <Section title={tl('Integrationen', 'Integrations')} icon={Plug} delay={0.3}>
        {integrationEvents.length === 0 ? (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-center">
            <Plug className="mx-auto h-5 w-5 text-primary mb-2" />
            <p className="text-sm text-muted-foreground">{tl('Alle gesund', 'All healthy')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {integrationEvents.map((ie: any) => {
              const s = sev(ie.severity);
              return (
                <div key={ie.id} className={`rounded-xl border ${s.border} bg-card p-4`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${s.text}`}>{ie.provider}</span>
                    <span className="text-[10px] text-muted-foreground">{ie.event_type}</span>
                  </div>
                  <p className="text-[12px] text-foreground">{ie.summary}</p>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* WATCHLIST */}
      <Section title="Watchlist" icon={Eye} delay={0.35}>
        {watchlistItems.length === 0 ? (
          <div className="rounded-xl border border-border/30 bg-card p-5 text-center">
            <Eye className="mx-auto h-5 w-5 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">{tl('Leer', 'Empty')}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {watchlistItems.map((wl: any) => (
              <div key={wl.id} className="flex items-center gap-3 rounded-lg border border-border/30 bg-card px-4 py-2.5">
                <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-foreground">{wl.target_type}: {wl.target_ref}</p>
                  <p className="text-[10px] text-muted-foreground">{wl.reason}</p>
                </div>
                <span className={`text-[9px] font-bold uppercase ${sev(wl.severity).text}`}>{wl.severity}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* POLICY MATRIX */}
      <Section title={tl('Entscheidungs-Policies', 'Decision Policies')} icon={Activity} delay={0.4}>
        <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-4 py-2 border-b border-border/30 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            <span>Policy</span><span>{tl('Risiko', 'Risk')}</span><span>Route</span><span>Status</span>
          </div>
          <div className="divide-y divide-border/20 max-h-[280px] overflow-y-auto">
            {policies.map((p: any) => (
              <div key={p.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center px-4 py-2.5 text-[11px]">
                <div><span className="font-mono text-muted-foreground/60 mr-1.5">{p.policy_key}</span><span className="text-foreground font-medium">{p.policy_name}</span></div>
                <span className={`${sev(p.risk_level).text} font-medium`}>{p.risk_level}</span>
                <span className="text-muted-foreground">{p.default_route}</span>
                <span className={p.enabled ? 'text-primary' : 'text-muted-foreground/40'}>{p.enabled ? '●' : '○'}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* QUICK ACCESS */}
      <Section title={tl('Schnellzugriff', 'Quick Access')} icon={LayoutDashboard} delay={0.45}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { label: tl('Sicherheit', 'Security'), to: '/members/admin/security', icon: Shield },
            { label: tl('Exporte', 'Exports'), to: '/members/admin/exports', icon: FileText },
            { label: tl('Eskalation', 'Escalation'), to: '/members/admin/escalation', icon: Users },
            { label: 'Prompt Vault', to: '/members/admin/prompt-vault', icon: BookOpen },
            { label: 'Audit Log', to: '/members/admin/audit-log', icon: Activity },
            { label: tl('Cleanup-Report', 'Cleanup Report'), to: '/members/admin/cleanup-report', icon: FileText },
            { label: tl('Integrationen', 'Integrations'), to: '/members/admin/integrations', icon: Plug },
          ].map((link, i) => {
            const LI = link.icon;
            return (
              <Link key={i} to={link.to} className="group flex items-center gap-2.5 rounded-xl border border-border/30 bg-card px-4 py-3 hover:border-primary/20 hover:bg-primary/[0.02] transition-all">
                <LI className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="text-[11px] font-medium text-foreground group-hover:text-primary transition-colors">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
