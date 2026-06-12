import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, TrendingUp, Users, Zap, Lock, CheckCircle, Clock, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { normalizeBusinessStage } from '@/lib/stage-utils';

const STAGE_LEVEL: Record<string, number> = {
  prospect: 0, opener: 1, setter: 2, associate_setter: 2,
  senior_associate: 3, senior_setter: 3, junior_manager: 4,
  manager: 5, senior_manager: 6, director: 7, partner: 8,
};

const LEAD_TYPE_LABELS: Record<string, { de: string; en: string }> = {
  simple: { de: 'Warm Lead', en: 'Warm Lead' },
  medium: { de: 'Medium Lead', en: 'Medium Lead' },
  high_intent: { de: 'High Intent', en: 'High Intent' },
  closing: { de: 'Closing Lead', en: 'Closing Lead' },
};

interface EarnStatus {
  is_unlocked: boolean;
  simulations_passed: number;
  qualification_test_passed: boolean;
  onboarding_complete: boolean;
  max_concurrent_leads: number;
  current_quality_score: number;
  lead_flow_status: string;
  total_leads_assigned: number;
  total_earnings: number;
}

interface LeadAssignment {
  id: string;
  lead_id: string;
  assigned_at: string;
  status: string;
  lead_type: string;
  outcome: string | null;
  outcome_score: number | null;
  deal_value: number | null;
  commission_earned: number | null;
  leads?: { name: string; email: string } | null;
}

interface EarnTransaction {
  id: string;
  amount: number;
  transaction_type: string;
  description: string | null;
  payout_status: string;
  created_at: string;
}

export default function EarnDashboard() {
  const { user, profile } = useAuth();
  const { lang } = useLanguage();
  const [earnStatus, setEarnStatus] = useState<EarnStatus | null>(null);
  const [assignments, setAssignments] = useState<LeadAssignment[]>([]);
  const [transactions, setTransactions] = useState<EarnTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const stage = normalizeBusinessStage(String(profile?.business_stage || profile?.current_phase || 'prospect'));
  const userLevel = STAGE_LEVEL[stage] ?? 0;
  const isEligibleLevel = userLevel >= 2;

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const [statusRes, assignRes, txRes] = await Promise.all([
        supabase.from('earn_mode_status').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('lead_assignments').select('*, leads(name, email)').eq('user_id', user.id).order('assigned_at', { ascending: false }).limit(20),
        supabase.from('earn_transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
      ]);
      if (statusRes.data) setEarnStatus(statusRes.data as any);
      if (assignRes.data) setAssignments(assignRes.data as any);
      if (txRes.data) setTransactions(txRes.data as any);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  // Not eligible yet — show unlock path
  if (!isEligibleLevel || !earnStatus?.is_unlocked) {
    return <UnlockView userLevel={userLevel} earnStatus={earnStatus} lang={lang} />;
  }

  // Active earn mode
  const activeLeads = assignments.filter(a => a.status === 'assigned' || a.status === 'in_progress');
  const completedLeads = assignments.filter(a => a.status === 'completed');
  const pendingEarnings = transactions.filter(t => t.payout_status === 'pending').reduce((s, t) => s + Number(t.amount), 0);
  const paidEarnings = transactions.filter(t => t.payout_status === 'paid').reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[960px] px-4 py-10 sm:px-6 sm:py-16">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">Earn While You Learn</p>
          <h1 className="mt-2 font-serif text-2xl tracking-tight text-foreground sm:text-3xl">
            {lang === 'de' ? 'Dein Einkommen' : 'Your Earnings'}
          </h1>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
        >
          <StatCard icon={Users} label={lang === 'de' ? 'Aktive Leads' : 'Active Leads'} value={String(activeLeads.length)} sub={`/ ${earnStatus.max_concurrent_leads} max`} />
          <StatCard icon={CheckCircle} label={lang === 'de' ? 'Abgeschlossen' : 'Completed'} value={String(completedLeads.length)} />
          <StatCard icon={DollarSign} label={lang === 'de' ? 'Ausstehend' : 'Pending'} value={`€${pendingEarnings.toFixed(0)}`} accent />
          <StatCard icon={TrendingUp} label={lang === 'de' ? 'Ausgezahlt' : 'Paid'} value={`€${paidEarnings.toFixed(0)}`} />
        </motion.div>

        {/* Quality Score */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="mb-10 rounded-2xl border border-border bg-card p-5 sm:p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Quality Score</p>
              <p className="mt-1 font-serif text-2xl text-foreground">{Number(earnStatus.current_quality_score).toFixed(1)} <span className="text-sm text-muted-foreground">/ 10</span></p>
            </div>
            <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
              earnStatus.lead_flow_status === 'active' ? 'bg-primary/10 text-primary' :
              earnStatus.lead_flow_status === 'reduced' ? 'bg-orange-500/10 text-orange-600' :
              'bg-destructive/10 text-destructive'
            }`}>
              {earnStatus.lead_flow_status === 'active' ? (lang === 'de' ? 'Aktiv' : 'Active') :
               earnStatus.lead_flow_status === 'reduced' ? (lang === 'de' ? 'Reduziert' : 'Reduced') :
               (lang === 'de' ? 'Pausiert' : 'Paused')}
            </div>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(Number(earnStatus.current_quality_score) * 10, 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {lang === 'de'
              ? 'Höherer Score = mehr und bessere Leads'
              : 'Higher score = more and better leads'}
          </p>
        </motion.div>

        {/* Active Leads */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-10">
          <h2 className="mb-4 font-serif text-lg text-foreground">
            {lang === 'de' ? 'Zugewiesene Leads' : 'Assigned Leads'}
          </h2>
          {activeLeads.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
              <Clock className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                {lang === 'de' ? 'Keine aktiven Leads gerade. Neue werden automatisch zugewiesen.' : 'No active leads right now. New ones will be assigned automatically.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeLeads.map(a => (
                <div key={a.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 sm:px-5">
                  <div>
                    <p className="text-sm font-medium text-foreground">{(a.leads as any)?.name || 'Lead'}</p>
                    <p className="text-xs text-muted-foreground">
                      {LEAD_TYPE_LABELS[a.lead_type]?.[lang] || a.lead_type} · {new Date(a.assigned_at).toLocaleDateString('de-DE')}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    a.status === 'in_progress' ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent-foreground'
                  }`}>
                    {a.status === 'in_progress' ? (lang === 'de' ? 'In Arbeit' : 'In Progress') : (lang === 'de' ? 'Zugewiesen' : 'Assigned')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Recent Earnings */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <h2 className="mb-4 font-serif text-lg text-foreground">
            {lang === 'de' ? 'Letzte Einnahmen' : 'Recent Earnings'}
          </h2>
          {transactions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
              <DollarSign className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                {lang === 'de' ? 'Noch keine Einnahmen. Schließe deinen ersten Deal ab!' : 'No earnings yet. Close your first deal!'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map(tx => (
                <div key={tx.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 sm:px-5">
                  <div>
                    <p className="text-sm font-medium text-foreground">€{Number(tx.amount).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{tx.description || tx.transaction_type} · {new Date(tx.created_at).toLocaleDateString('de-DE')}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    tx.payout_status === 'paid' ? 'bg-primary/10 text-primary' :
                    tx.payout_status === 'approved' ? 'bg-accent/10 text-accent-foreground' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {tx.payout_status === 'paid' ? (lang === 'de' ? 'Ausgezahlt' : 'Paid') :
                     tx.payout_status === 'approved' ? (lang === 'de' ? 'Genehmigt' : 'Approved') :
                     (lang === 'de' ? 'Ausstehend' : 'Pending')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

/* ── Stat Card ── */
function StatCard({ icon: Icon, label, value, sub, accent }: {
  icon: React.ComponentType<any>; label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <Icon className={`h-4 w-4 ${accent ? 'text-primary' : 'text-muted-foreground'}`} />
      <p className={`mt-2 font-serif text-xl ${accent ? 'text-primary' : 'text-foreground'}`}>
        {value}
        {sub && <span className="text-xs text-muted-foreground ml-1">{sub}</span>}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/* ── Unlock View (not yet eligible) ── */
function UnlockView({ userLevel, earnStatus, lang }: { userLevel: number; earnStatus: EarnStatus | null; lang: string }) {
  const requirements = [
    {
      label: lang === 'de' ? 'Level 2 erreicht (Setter)' : 'Reach Level 2 (Setter)',
      done: userLevel >= 2,
    },
    {
      label: lang === 'de' ? 'Simulationen bestanden' : 'Simulations passed',
      done: (earnStatus?.simulations_passed ?? 0) >= 1,
    },
    {
      label: lang === 'de' ? 'Qualifikationstest bestanden' : 'Qualification test passed',
      done: earnStatus?.qualification_test_passed ?? false,
    },
    {
      label: lang === 'de' ? 'Onboarding abgeschlossen' : 'Onboarding complete',
      done: earnStatus?.onboarding_complete ?? false,
    },
  ];

  const completedCount = requirements.filter(r => r.done).length;
  const progress = (completedCount / requirements.length) * 100;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[640px] px-4 py-16 sm:px-6 sm:py-24">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
            <Lock className="h-6 w-6 text-accent-foreground" />
          </div>
          <h1 className="mt-6 font-serif text-2xl tracking-tight text-foreground sm:text-3xl">
            Earn While You Learn
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {lang === 'de'
              ? 'Verdiene Geld mit echten Leads — parallel zu deiner Ausbildung. Erfülle die Voraussetzungen, um den Earn-Modus freizuschalten.'
              : 'Earn money with real leads — alongside your training. Complete the requirements to unlock Earn Mode.'}
          </p>
        </motion.div>

        {/* Progress */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-10">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>{lang === 'de' ? 'Fortschritt' : 'Progress'}</span>
            <span>{completedCount}/{requirements.length}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="h-full rounded-full bg-primary"
            />
          </div>
        </motion.div>

        {/* Requirements */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-8 space-y-3">
          {requirements.map((r, i) => (
            <div key={i} className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-colors ${
              r.done ? 'border-primary/20 bg-primary/5' : 'border-border bg-card'
            }`}>
              {r.done ? (
                <CheckCircle className="h-5 w-5 shrink-0 text-primary" />
              ) : (
                <div className="h-5 w-5 shrink-0 rounded-full border-2 border-muted-foreground/30" />
              )}
              <span className={`text-sm ${r.done ? 'text-foreground' : 'text-muted-foreground'}`}>{r.label}</span>
            </div>
          ))}
        </motion.div>

        {/* Motivation */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="mt-12 rounded-2xl border border-accent/20 bg-accent/5 px-6 py-6 text-center"
        >
          <Zap className="mx-auto h-5 w-5 text-accent-foreground" />
          <p className="mt-3 font-serif text-base text-foreground">
            {lang === 'de'
              ? 'Dein erster Deal wartet. Trainiere weiter und schalte den Earn-Modus frei.'
              : 'Your first deal is waiting. Keep training and unlock Earn Mode.'}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
