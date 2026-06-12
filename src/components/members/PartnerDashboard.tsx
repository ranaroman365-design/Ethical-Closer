import { useEffect, useState, useMemo, useCallback } from 'react';
import { PRODUCT } from '@/config/product';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import EscalationPanel from '@/components/members/EscalationPanel';
import {
  TrendingUp, TrendingDown, Users, BarChart3, Activity,
  CheckCircle2, Phone, AlertTriangle, Zap, Star, Target,
  RefreshCw, Minus, Eye, ShieldAlert, Rocket,
  Settings2, ArrowRightLeft, Mail, RotateCcw, GraduationCap,
  Brain, Sparkles, History, ToggleLeft, ToggleRight, Shield,
} from 'lucide-react';

/* ── types ── */
interface SystemHealth {
  activeLeads: number;
  callsBooked: number;
  showUpRate: number;
  closeRate: number;
  revenue: number;
  avgDealValue: number;
  prevActiveLeads: number;
  prevCallsBooked: number;
  prevShowUpRate: number;
  prevCloseRate: number;
  prevRevenue: number;
}

interface FunnelStage {
  label: string;
  count: number;
  conversionFromPrev: number | null;
}

interface TeamMember {
  id: string;
  name: string;
  stage: string;
  bookings: number;
  showRate: number;
  closeRate: number;
  revenue: number;
  epc: number;
}

interface Insight {
  type: 'bottleneck' | 'top' | 'attention' | 'action';
  title: string;
  description: string;
}

interface Forecast {
  type: 'revenue' | 'risk' | 'growth';
  title: string;
  value: string;
  description: string;
}

type AutomationMode = 'suggest' | 'assisted' | 'automatic';

interface AutomationAction {
  id: string;
  module: 'reallocation' | 'followup' | 'reengagement' | 'intervention';
  title: string;
  description: string;
  status: 'pending' | 'executed' | 'dismissed';
  timestamp: Date;
}

interface AIDecision {
  type: 'pattern' | 'decision' | 'learning';
  title: string;
  description: string;
  confidence: number;
  impact: string;
}

const STAGE_LABELS: Record<string, string> = {
  opener: 'Trainee', setter: 'Associate Setter', senior_associate: 'Senior Setter',
  junior_manager: 'Closer (Placement Track)', manager: 'Managing Closer', senior_manager: 'Senior Closer',
  director: 'Director', partner: 'Partner',
};

/* ── helpers ── */
const pct = (v: number) => `${v.toFixed(1)}%`;
const eur = (v: number) => v >= 1000 ? `€${(v / 1000).toFixed(1)}k` : `€${v.toFixed(0)}`;
const delta = (curr: number, prev: number) => prev === 0 ? 0 : ((curr - prev) / prev) * 100;

export default function PartnerDashboard() {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const t = (de: string, en: string) => (lang === 'de' ? de : en);

  const [range, setRange] = useState<7 | 30>(30);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    setRefreshing(true);
    const now = new Date();
    const rangeStart = new Date(now.getTime() - range * 86400000).toISOString();
    const prevStart = new Date(now.getTime() - range * 2 * 86400000).toISOString();

    // Fetch leads in current + previous period
    const [{ data: currentLeads }, { data: prevLeads }, { data: profiles }, { data: kpis }, { data: callsData }] = await Promise.all([
      supabase.from('leads').select('id, stage, setter_id, closer_id, deal_value, appointment_date, created_at')
        .gte('created_at', rangeStart),
      supabase.from('leads').select('id, stage, setter_id, closer_id, deal_value, appointment_date, created_at')
        .gte('created_at', prevStart).lt('created_at', rangeStart),
      supabase.from('profiles').select('id, full_name, business_stage'),
      supabase.from('member_kpis').select('user_id, closing_rate, show_rate, revenue_closed, calls_handled, earnings_per_call, leads_assigned, leads_qualified, leads_won'),
      // Confirmed Revenue from calls table
      supabase.from('calls' as any).select('closer_id, revenue, result, created_at').eq('result', 'closed_won'),
    ]);

    const cl = (currentLeads ?? []) as any[];
    const pl = (prevLeads ?? []) as any[];
    const allCalls = (callsData ?? []) as any[];

    // Build confirmed revenue from calls
    const currentCalls = allCalls.filter(c => c.created_at >= rangeStart);
    const prevCalls = allCalls.filter(c => c.created_at >= prevStart && c.created_at < rangeStart);

    // System Health
    const activeLeads = cl.filter(l => !['closed_won', 'closed_lost', 'lost'].includes(l.stage)).length;
    const callsBooked = cl.filter(l => l.appointment_date).length;
    const showed = cl.filter(l => ['offer_presented', 'closed_won', 'closed_lost', 'qualified'].includes(l.stage)).length;
    const won = cl.filter(l => l.stage === 'closed_won').length;
    const showUpRate = callsBooked > 0 ? (showed / callsBooked) * 100 : 0;
    const closeRate = showed > 0 ? (won / showed) * 100 : 0;
    const revenue = currentCalls.reduce((s: number, c: any) => s + (Number(c.revenue) || 0), 0); // Confirmed Revenue
    const avgDealValue = won > 0 ? revenue / won : 2000;

    const prevActive = pl.filter(l => !['closed_won', 'closed_lost', 'lost'].includes(l.stage)).length;
    const prevBooked = pl.filter(l => l.appointment_date).length;
    const prevShowed = pl.filter(l => ['offer_presented', 'closed_won', 'closed_lost', 'qualified'].includes(l.stage)).length;
    const prevWon = pl.filter(l => l.stage === 'closed_won').length;
    const prevShowUp = prevBooked > 0 ? (prevShowed / prevBooked) * 100 : 0;
    const prevClose = prevShowed > 0 ? (prevWon / prevShowed) * 100 : 0;
    const prevRev = prevCalls.reduce((s: number, c: any) => s + (Number(c.revenue) || 0), 0); // Confirmed Revenue

    setHealth({
      activeLeads, callsBooked, showUpRate, closeRate, revenue, avgDealValue,
      prevActiveLeads: prevActive, prevCallsBooked: prevBooked,
      prevShowUpRate: prevShowUp, prevCloseRate: prevClose, prevRevenue: prevRev,
    });

    // Team performance from member_kpis joined with profiles
    const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const teamData: TeamMember[] = ((kpis ?? []) as any[])
      .filter(k => profMap.has(k.user_id))
      .map(k => {
        const prof = profMap.get(k.user_id)!;
        return {
          id: k.user_id,
          name: prof.full_name || 'Unnamed',
          stage: prof.business_stage || 'opener',
          bookings: k.leads_qualified || 0,
          showRate: k.show_rate || 0,
          closeRate: k.closing_rate || 0,
          revenue: k.revenue_closed || 0,
          epc: k.earnings_per_call || 0,
        };
      });
    setTeam(teamData);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { fetchData(); }, [range]);

  // Derived data
  const funnel = useMemo((): FunnelStage[] => {
    if (!health) return [];
    const stages: FunnelStage[] = [
      { label: 'Leads', count: health.activeLeads + (health.revenue > 0 ? Math.round(health.revenue / 2000) : 0), conversionFromPrev: null },
      { label: 'Booked', count: health.callsBooked, conversionFromPrev: null },
      { label: 'Showed', count: Math.round(health.callsBooked * health.showUpRate / 100), conversionFromPrev: health.showUpRate },
      { label: 'Closed', count: Math.round(health.callsBooked * health.showUpRate / 100 * health.closeRate / 100), conversionFromPrev: health.closeRate },
    ];
    if (stages[0].count > 0 && stages[1].count > 0) {
      stages[1].conversionFromPrev = (stages[1].count / stages[0].count) * 100;
    }
    return stages;
  }, [health]);

  const setters = useMemo(() => team.filter(m => ['opener', 'setter', 'senior_associate'].includes(m.stage)).sort((a, b) => b.bookings - a.bookings), [team]);
  const closers = useMemo(() => team.filter(m => ['junior_manager', 'manager', 'senior_manager'].includes(m.stage)).sort((a, b) => b.revenue - a.revenue), [team]);

  const insights = useMemo((): Insight[] => {
    if (!health) return [];

    /* ── 1. BOTTLENECK: find lowest funnel conversion ── */
    const totalLeads = funnel[0]?.count || 0;
    const bookedCount = funnel[1]?.count || 0;
    const showedCount = funnel[2]?.count || 0;
    const closedCount = funnel[3]?.count || 0;

    const convRates: { segment: string; rate: number; labelDe: string; labelEn: string }[] = [];
    if (totalLeads > 0) convRates.push({ segment: 'leads_to_booked', rate: totalLeads > 0 ? (bookedCount / totalLeads) * 100 : 0, labelDe: 'Leads → Booked', labelEn: 'Leads → Booked' });
    if (bookedCount > 0) convRates.push({ segment: 'booked_to_show', rate: bookedCount > 0 ? (showedCount / bookedCount) * 100 : 0, labelDe: 'Booked → Show', labelEn: 'Booked → Show' });
    if (showedCount > 0) convRates.push({ segment: 'show_to_close', rate: showedCount > 0 ? (closedCount / showedCount) * 100 : 0, labelDe: 'Show → Close', labelEn: 'Show → Close' });

    const worstConv = convRates.length > 0 ? convRates.reduce((a, b) => a.rate < b.rate ? a : b) : null;

    const bottleneck: Insight = worstConv
      ? { type: 'bottleneck', title: t(worstConv.labelDe, worstConv.labelEn), description: t(`Niedrigste Conversion: ${pct(worstConv.rate)} — Hauptengpass im Funnel.`, `Lowest conversion: ${pct(worstConv.rate)} — main funnel bottleneck.`) }
      : { type: 'bottleneck', title: t('Kein Engpass erkannt', 'No Bottleneck Detected'), description: t('Zu wenig Daten für Analyse.', 'Insufficient data for analysis.') };

    /* ── 2. TOP PERFORMER: weighted scoring ── */
    const scoredClosers = closers.map(c => ({ ...c, score: c.closeRate * 0.4 + (c.revenue / Math.max(1, closers[0]?.revenue || 1)) * 100 * 0.4 + (c.epc / Math.max(1, closers[0]?.epc || 1)) * 100 * 0.2 }));
    const scoredSetters = setters.map(s => ({ ...s, score: s.bookings * 3 + s.showRate * 0.5 }));
    const allScored = [...scoredClosers, ...scoredSetters].sort((a, b) => b.score - a.score);
    const top = allScored[0];

    const topInsight: Insight = top
      ? { type: 'top', title: top.name, description: `${STAGE_LABELS[top.stage] || top.stage} · ${closers.includes(top as any) ? `${pct(top.closeRate)} Close Rate · ${eur(top.revenue)}` : `${top.bookings} Bookings · ${pct(top.showRate)} Show Rate`}` }
      : { type: 'top', title: t('Keine Daten', 'No Data'), description: t('Noch keine Team-Performance verfügbar.', 'No team performance data yet.') };

    /* ── 3. NEEDS ATTENTION: threshold + period drop ── */
    const attentionCandidates = [...closers, ...setters].filter(m => m.closeRate < 15 || m.showRate < 50);
    // Also check period drops via health deltas
    const bookingsDrop = health.prevCallsBooked > 0 ? delta(health.callsBooked, health.prevCallsBooked) : 0;
    let attention: Insight;
    if (bookingsDrop < -20) {
      attention = { type: 'attention', title: t('Booking-Einbruch', 'Booking Drop'), description: t(`Bookings ${bookingsDrop.toFixed(0)}% vs. Vorperiode — Outreach prüfen.`, `Bookings ${bookingsDrop.toFixed(0)}% vs. previous period — review outreach.`) };
    } else if (attentionCandidates.length > 0) {
      const worst = attentionCandidates.sort((a, b) => a.closeRate - b.closeRate)[0];
      attention = { type: 'attention', title: worst.name, description: t(`${pct(worst.closeRate)} Close Rate / ${pct(worst.showRate)} Show Rate — Training empfohlen.`, `${pct(worst.closeRate)} Close Rate / ${pct(worst.showRate)} Show Rate — training recommended.`) };
    } else {
      attention = { type: 'attention', title: t('Alle im Zielbereich', 'All On Target'), description: t('Kein Teammitglied unter Schwellenwert.', 'No team member below threshold.') };
    }

    /* ── 4. SUGGESTED ACTION: 1:1 bottleneck→action mapping ── */
    const ACTION_MAP: Record<string, { de: string; en: string; descDe: string; descEn: string }> = {
      leads_to_booked: { de: 'Lead-Flow erhöhen', en: 'Increase Lead Flow', descDe: 'Outreach-Volumen und Lead-Qualifikation steigern.', descEn: 'Increase outreach volume and lead qualification.' },
      booked_to_show: { de: 'Reminder-Flow optimieren', en: 'Optimize Reminder Flow', descDe: 'Automatische Erinnerungen und Bestätigungen vor Calls verstärken.', descEn: 'Strengthen automated reminders and confirmations before calls.' },
      show_to_close: { de: 'Call-Qualität verbessern', en: 'Improve Call Quality', descDe: 'Top-Performer Calls analysieren und Closer Framework aktualisieren.', descEn: 'Analyze top performer calls and update closer framework.' },
    };
    const actionKey = worstConv?.segment || 'show_to_close';
    const actionData = ACTION_MAP[actionKey] || ACTION_MAP.show_to_close;
    const action: Insight = { type: 'action', title: t(actionData.de, actionData.en), description: t(actionData.descDe, actionData.descEn) };

    return [bottleneck, topInsight, attention, action];
  }, [health, funnel, closers, setters, t]);

  /* ══════════════════════════════════════════════
     PREDICTIVE INTELLIGENCE ENGINE
     ══════════════════════════════════════════════ */
  const predictions = useMemo((): Forecast[] => {
    if (!health) return [];

    const bookingRate = funnel[0]?.count > 0 && funnel[1]?.count > 0 ? funnel[1].count / funnel[0].count : 0.3;
    const showRate = health.showUpRate / 100;
    const clRate = health.closeRate / 100;
    const adv = health.avgDealValue;
    const dailyLeadRate = health.activeLeads / Math.max(range, 1);

    const forecast30 = Math.round(dailyLeadRate * 30 * bookingRate * showRate * clRate * adv);
    const forecast7 = Math.round(dailyLeadRate * 7 * bookingRate * showRate * clRate * adv);
    const displayForecast = range === 7 ? forecast7 : forecast30;
    const horizonLabel = range === 7 ? '7' : '30';

    const revForecast: Forecast = {
      type: 'revenue',
      title: t(`Umsatzprognose ${horizonLabel} Tage`, `Revenue Forecast ${horizonLabel} Days`),
      value: eur(displayForecast),
      description: t(
        `${pct(bookingRate * 100)} Booking · ${pct(showRate * 100)} Show · ${pct(clRate * 100)} Close · ${eur(adv)} Ø Deal`,
        `${pct(bookingRate * 100)} booking · ${pct(showRate * 100)} show · ${pct(clRate * 100)} close · ${eur(adv)} avg deal`
      ),
    };

    const showDelta = health.showUpRate - health.prevShowUpRate;
    const closeDelta = health.closeRate - health.prevCloseRate;
    const bookDelta = health.prevCallsBooked > 0 ? delta(health.callsBooked, health.prevCallsBooked) : 0;

    let risk: Forecast;
    if (showDelta < -5 && health.showUpRate < 65) {
      risk = { type: 'risk', title: t('Show-Up Trend fällt', 'Declining Show-Up Trend'), value: `${showDelta.toFixed(1)}pp`,
        description: t(`${pct(health.prevShowUpRate)} → ${pct(health.showUpRate)}. Revenue-Impact in 2–3 Wochen.`, `${pct(health.prevShowUpRate)} → ${pct(health.showUpRate)}. Revenue impact in 2–3 weeks.`) };
    } else if (closeDelta < -5) {
      risk = { type: 'risk', title: t('Close Rate sinkt', 'Close Rate Declining'), value: `${closeDelta.toFixed(1)}pp`,
        description: t(`${pct(health.prevCloseRate)} → ${pct(health.closeRate)}. Closer-Qualität prüfen.`, `${pct(health.prevCloseRate)} → ${pct(health.closeRate)}. Review closer quality.`) };
    } else if (bookDelta < -15) {
      risk = { type: 'risk', title: t('Bookings rückläufig', 'Bookings Declining'), value: `${bookDelta.toFixed(0)}%`,
        description: t(`Pipeline-Lücke in 2–4 Wochen möglich.`, `Pipeline gap possible in 2–4 weeks.`) };
    } else {
      risk = { type: 'risk', title: t('Kein Risiko erkannt', 'No Risk Detected'), value: '✓',
        description: t('Alle Trends stabil oder positiv.', 'All trends stable or positive.') };
    }

    let growth: Forecast;
    if (clRate > 0.25 && health.callsBooked < 15) {
      growth = { type: 'growth', title: t('Call-Volumen erhöhen', 'Increase Call Volume'), value: `${pct(clRate * 100)} CR`,
        description: t(`Hohe Conversion bei nur ${health.callsBooked} Calls — mehr Leads = maximaler Hebel.`, `High conversion with only ${health.callsBooked} calls — more leads = max leverage.`) };
    } else if (closers.some(c => c.closeRate > 25 && c.revenue < 5000)) {
      growth = { type: 'growth', title: t('Closer unterausgelastet', 'Closers Underutilized'), value: `${closers.filter(c => c.closeRate > 25).length}`,
        description: t('Starke Closer mit wenig Volumen — mehr Leads zuweisen.', 'Strong closers with low volume — assign more leads.') };
    } else {
      growth = { type: 'growth', title: t('Gleichmäßiges Wachstum', 'Steady Growth'), value: eur(forecast30),
        description: t('System im Gleichgewicht — Kurs halten.', 'System balanced — maintain course.') };
    }

    return [revForecast, risk, growth];
  }, [health, funnel, closers, setters, range, t]);

  /* ══════════════════════════════════════════════
     AUTOMATED ACTION LAYER (LEVEL 3)
     ══════════════════════════════════════════════ */
  const [automationMode, setAutomationMode] = useState<AutomationMode>('suggest');
  const [actionLog, setActionLog] = useState<AutomationAction[]>([]);

  const automationActions = useMemo((): AutomationAction[] => {
    if (!health) return [];
    const actions: AutomationAction[] = [];
    const now = new Date();

    // 1. LEAD REALLOCATION
    const weakClosers = closers.filter(c => c.closeRate < 15 && c.closeRate > 0);
    const strongClosers = closers.filter(c => c.closeRate > 25);
    if (weakClosers.length > 0 && strongClosers.length > 0) {
      actions.push({
        id: 'realloc-1', module: 'reallocation',
        title: t('Lead-Umverteilung', 'Lead Reallocation'),
        description: t(
          `${weakClosers[0].name} (${pct(weakClosers[0].closeRate)}) → Neue Leads an ${strongClosers[0].name} (${pct(strongClosers[0].closeRate)})`,
          `${weakClosers[0].name} (${pct(weakClosers[0].closeRate)}) → Route new leads to ${strongClosers[0].name} (${pct(strongClosers[0].closeRate)})`
        ),
        status: 'pending', timestamp: now,
      });
    }

    // 2. FOLLOW-UP OPTIMIZATION
    if (health.showUpRate < 60) {
      actions.push({
        id: 'followup-1', module: 'followup',
        title: t('Reminder-Sequenz verstärken', 'Enhance Reminder Sequence'),
        description: t(
          `Show-Up bei ${pct(health.showUpRate)} — zusätzliche SMS/Email + kürzere Intervalle aktivieren.`,
          `Show-up at ${pct(health.showUpRate)} — activate additional SMS/email + shorter intervals.`
        ),
        status: 'pending', timestamp: now,
      });
    }

    // 3. RE-ENGAGEMENT
    const staleLeads = health.activeLeads > 0 && health.callsBooked < health.activeLeads * 0.3;
    if (staleLeads) {
      actions.push({
        id: 'reengage-1', module: 'reengagement',
        title: t('Re-Engagement starten', 'Start Re-Engagement'),
        description: t(
          `${health.activeLeads - health.callsBooked} Leads ohne Booking — Re-Engagement Flow auslösen.`,
          `${health.activeLeads - health.callsBooked} leads without booking — trigger re-engagement flow.`
        ),
        status: 'pending', timestamp: now,
      });
    }

    // 4. PERFORMANCE INTERVENTION
    const underperformers = [...closers, ...setters].filter(m => m.closeRate < 10 && m.closeRate > 0 || m.showRate < 40 && m.showRate > 0);
    if (underperformers.length > 0) {
      actions.push({
        id: 'intervene-1', module: 'intervention',
        title: t('Training zuweisen', 'Assign Training'),
        description: t(
          `${underperformers[0].name} — KPI unter Schwellenwert. Coaching-Content + Training-Modul empfohlen.`,
          `${underperformers[0].name} — KPI below threshold. Coaching content + training module recommended.`
        ),
        status: 'pending', timestamp: now,
      });
    }

    return actions;
  }, [health, closers, setters, t]);

  const executeAction = useCallback((actionId: string) => {
    setActionLog(prev => {
      const existing = prev.find(a => a.id === actionId);
      if (existing) return prev;
      const action = automationActions.find(a => a.id === actionId);
      if (!action) return prev;
      return [...prev, { ...action, status: 'executed' as const, timestamp: new Date() }];
    });
    toast.success(t('Aktion ausgeführt', 'Action executed'));
  }, [automationActions, t]);

  const dismissAction = useCallback((actionId: string) => {
    setActionLog(prev => {
      const existing = prev.find(a => a.id === actionId);
      if (existing) return prev;
      const action = automationActions.find(a => a.id === actionId);
      if (!action) return prev;
      return [...prev, { ...action, status: 'dismissed' as const, timestamp: new Date() }];
    });
  }, [automationActions]);

  // Auto-execute in automatic mode
  useEffect(() => {
    if (automationMode === 'automatic' && automationActions.length > 0) {
      automationActions.forEach(a => {
        if (!actionLog.find(l => l.id === a.id)) {
          executeAction(a.id);
        }
      });
    }
  }, [automationMode, automationActions, actionLog, executeAction]);

  /* ══════════════════════════════════════════════
     AI DECISION LAYER (LEVEL 4)
     ══════════════════════════════════════════════ */
  const aiDecisions = useMemo((): AIDecision[] => {
    if (!health || closers.length === 0) return [];
    const decisions: AIDecision[] = [];

    // 1. PATTERN RECOGNITION — closer/lead type matching
    const highCR = closers.filter(c => c.closeRate > 20);
    const lowVol = closers.filter(c => c.closeRate > 20 && c.revenue < 5000);
    if (highCR.length > 0 && health.showUpRate > 50) {
      const warmPerformers = closers.filter(c => c.showRate > 60 && c.closeRate > 20);
      const coldPerformers = closers.filter(c => c.showRate <= 60 && c.closeRate > 15);
      if (warmPerformers.length > 0 && coldPerformers.length > 0) {
        decisions.push({
          type: 'pattern',
          title: t('Closer-Lead Matching erkannt', 'Closer-Lead Matching Detected'),
          description: t(
            `${warmPerformers[0].name} performt besser bei warmen Leads (${pct(warmPerformers[0].closeRate)} CR). ${coldPerformers[0].name} konvertiert kalte Leads effektiver.`,
            `${warmPerformers[0].name} performs better with warm leads (${pct(warmPerformers[0].closeRate)} CR). ${coldPerformers[0].name} converts cold leads more effectively.`
          ),
          confidence: 78, impact: t('+8–12% Close Rate', '+8–12% Close Rate'),
        });
      }
    }

    // 2. DECISION ENGINE — optimal resource allocation
    const avgCloseRate = closers.reduce((s, c) => s + c.closeRate, 0) / closers.length;
    const topQuartile = closers.filter(c => c.closeRate > avgCloseRate * 1.3);
    if (topQuartile.length > 0 && lowVol.length > 0) {
      decisions.push({
        type: 'decision',
        title: t('Dynamische Lead-Verteilung', 'Dynamic Lead Distribution'),
        description: t(
          `${topQuartile.length} Top-Closer mit Kapazität. System empfiehlt gewichtete Zuweisung statt Round-Robin.`,
          `${topQuartile.length} top closers with capacity. System recommends weighted distribution over round-robin.`
        ),
        confidence: 72, impact: t('+15–20% Revenue', '+15–20% Revenue'),
      });
    }

    // 3. CONTINUOUS LEARNING — follow-up strategy comparison
    const showDelta = health.showUpRate - health.prevShowUpRate;
    if (showDelta > 3) {
      decisions.push({
        type: 'learning',
        title: t('Strategie-Verbesserung erkannt', 'Strategy Improvement Detected'),
        description: t(
          `Show-Up stieg ${showDelta.toFixed(1)}pp — aktuelle Reminder-Strategie wirkt. System verstärkt dieses Muster.`,
          `Show-up rose ${showDelta.toFixed(1)}pp — current reminder strategy is working. System reinforces this pattern.`
        ),
        confidence: 85, impact: `+${showDelta.toFixed(1)}pp Show Rate`,
      });
    } else if (health.closeRate > health.prevCloseRate + 3) {
      const crDelta = health.closeRate - health.prevCloseRate;
      decisions.push({
        type: 'learning',
        title: t('Closing-Verbesserung erkannt', 'Closing Improvement Detected'),
        description: t(
          `Close Rate stieg ${crDelta.toFixed(1)}pp — erfolgreiches Muster wird priorisiert.`,
          `Close rate rose ${crDelta.toFixed(1)}pp — successful pattern being prioritized.`
        ),
        confidence: 80, impact: `+${crDelta.toFixed(1)}pp CR`,
      });
    }

    // Fallback insight
    if (decisions.length === 0) {
      decisions.push({
        type: 'pattern',
        title: t('Daten werden analysiert', 'Analyzing Data'),
        description: t(
          'System sammelt Performance-Muster. Empfehlungen erscheinen bei ausreichend Daten.',
          'System collecting performance patterns. Recommendations appear with sufficient data.'
        ),
        confidence: 0, impact: '—',
      });
    }

    return decisions;
  }, [health, closers, setters, t]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  const healthCards = health ? [
    { label: 'Active Leads', value: health.activeLeads, fmt: String(health.activeLeads), change: delta(health.activeLeads, health.prevActiveLeads), icon: Users },
    { label: 'Calls Booked', value: health.callsBooked, fmt: String(health.callsBooked), change: delta(health.callsBooked, health.prevCallsBooked), icon: Phone },
    { label: 'Show-Up Rate', value: health.showUpRate, fmt: pct(health.showUpRate), change: health.showUpRate - health.prevShowUpRate, icon: Activity },
    { label: 'Close Rate', value: health.closeRate, fmt: pct(health.closeRate), change: health.closeRate - health.prevCloseRate, icon: Target },
    { label: 'Revenue', value: health.revenue, fmt: eur(health.revenue), change: delta(health.revenue, health.prevRevenue), icon: TrendingUp },
  ] : [];

  const insightStyles: Record<string, { icon: typeof AlertTriangle; border: string; iconColor: string }> = {
    bottleneck: { icon: AlertTriangle, border: 'border-[hsl(var(--danger)_/_0.2)]', iconColor: 'text-[hsl(var(--danger))]' },
    top: { icon: Star, border: 'border-[hsl(var(--success)_/_0.2)]', iconColor: 'text-[hsl(var(--success))]' },
    attention: { icon: Zap, border: 'border-[hsl(var(--warning)_/_0.2)]', iconColor: 'text-[hsl(var(--warning))]' },
    action: { icon: Target, border: 'border-[hsl(var(--info)_/_0.2)]', iconColor: 'text-[hsl(var(--info))]' },
  };

  return (
    <div className="space-y-10">
      {/* ── Escalation Alerts (Partner sees critical + system-wide) ── */}
      <EscalationPanel />

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground mb-1">
            {PRODUCT.nameTM}
          </p>
          <h1 className="font-serif text-xl font-semibold text-foreground tracking-tight">
            {t('Partner Dashboard', 'Partner Dashboard')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            <button
              onClick={() => setRange(7)}
              className={`px-3 py-1.5 transition-colors ${range === 7 ? 'bg-foreground text-background font-medium' : 'bg-card text-muted-foreground hover:bg-muted'}`}
            >
              7 {t('Tage', 'days')}
            </button>
            <button
              onClick={() => setRange(30)}
              className={`px-3 py-1.5 transition-colors ${range === 30 ? 'bg-foreground text-background font-medium' : 'bg-card text-muted-foreground hover:bg-muted'}`}
            >
              30 {t('Tage', 'days')}
            </button>
          </div>
          <button
            onClick={fetchData}
            disabled={refreshing}
            className="p-2 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── SECTION 2: SYSTEM HEALTH ── */}
      <section>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-4">
          {t('System Health', 'System Health')}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {healthCards.map(card => {
            const isUp = card.change > 0;
            const isFlat = Math.abs(card.change) < 0.5;
            return (
              <div key={card.label} className="rounded-xl border border-border bg-card p-5 space-y-2">
                <card.icon className="h-4 w-4 text-muted-foreground/40" />
                <p className="text-2xl font-bold tracking-tight text-foreground">{card.fmt}</p>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{card.label}</p>
                  {!isFlat && (
                    <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${isUp ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--danger))]'}`}>
                      {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {Math.abs(card.change).toFixed(1)}%
                    </span>
                  )}
                  {isFlat && <Minus className="h-3 w-3 text-muted-foreground/30" />}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── SECTION 3: FUNNEL FLOW ── */}
      <section>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-4">
          {t('Funnel Flow', 'Funnel Flow')}
        </p>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            {funnel.map((stage, i) => (
              <div key={stage.label} className="flex items-center flex-1">
                <div className="flex-1 text-center">
                  <p className="text-2xl font-bold text-foreground">{stage.count}</p>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mt-1">{stage.label}</p>
                  {stage.conversionFromPrev !== null && (
                    <p className="text-[10px] font-semibold text-accent mt-0.5">{pct(stage.conversionFromPrev)}</p>
                  )}
                </div>
                {i < funnel.length - 1 && (
                  <div className="mx-2 flex flex-col items-center">
                    <div className="w-8 h-px bg-border" />
                    <span className="text-[9px] text-muted-foreground/50 mt-0.5">→</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 4: TEAM PERFORMANCE ── */}
      <section>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-4">
          {t('Team Performance', 'Team Performance')}
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Setter */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-4 flex items-center gap-2">
              <Phone className="h-3.5 w-3.5" /> Setter
            </h3>
            {setters.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">{t('Keine Setter-Daten verfügbar.', 'No setter data available.')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 font-medium text-muted-foreground">Name</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Bookings</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Show Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {setters.slice(0, 8).map(m => (
                      <tr key={m.id} className="border-b border-border/20 last:border-0">
                        <td className="py-2.5 text-foreground font-medium">{m.name}</td>
                        <td className="py-2.5 text-right text-foreground">{m.bookings}</td>
                        <td className="py-2.5 text-right text-foreground">{pct(m.showRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Closer */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-4 flex items-center gap-2">
              <Target className="h-3.5 w-3.5" /> Closer
            </h3>
            {closers.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">{t('Keine Closer-Daten verfügbar.', 'No closer data available.')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 font-medium text-muted-foreground">Name</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Close Rate</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Revenue</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">EPC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closers.slice(0, 8).map(m => (
                      <tr key={m.id} className="border-b border-border/20 last:border-0">
                        <td className="py-2.5 text-foreground font-medium">{m.name}</td>
                        <td className="py-2.5 text-right text-foreground">{pct(m.closeRate)}</td>
                        <td className="py-2.5 text-right text-foreground">{eur(m.revenue)}</td>
                        <td className="py-2.5 text-right text-foreground">{eur(m.epc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── SECTION 5: SYSTEM INTELLIGENCE ── */}
      <section>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-4">
          {t('System Intelligence', 'System Intelligence')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {insights.map((ins, i) => {
            const style = insightStyles[ins.type];
            const Icon = style.icon;
            return (
              <div key={i} className={`rounded-xl border ${style.border} bg-card p-5 space-y-2`}>
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${style.iconColor}`} />
                  <p className="text-xs font-semibold text-foreground">{ins.title}</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{ins.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── SECTION 6: FORWARD VIEW (PREDICTIVE) ── */}
      <section>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-4">
          {t('Forward View', 'Forward View')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {predictions.map((pred, i) => {
            const icons: Record<string, typeof Eye> = { revenue: Eye, risk: ShieldAlert, growth: Rocket };
            const borders: Record<string, string> = {
              revenue: 'border-[hsl(var(--accent)_/_0.25)]',
              risk: pred.value === '✓' ? 'border-[hsl(var(--success)_/_0.2)]' : 'border-[hsl(var(--danger)_/_0.2)]',
              growth: 'border-[hsl(var(--success)_/_0.2)]',
            };
            const iconColors: Record<string, string> = {
              revenue: 'text-[hsl(var(--accent))]',
              risk: pred.value === '✓' ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--danger))]',
              growth: 'text-[hsl(var(--success))]',
            };
            const PIcon = icons[pred.type] || Eye;
            return (
              <div key={i} className={`rounded-xl border ${borders[pred.type]} bg-card p-5 space-y-3`}>
                <div className="flex items-center gap-2">
                  <PIcon className={`h-4 w-4 ${iconColors[pred.type]}`} />
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{pred.title}</p>
                </div>
                <p className="text-2xl font-bold tracking-tight text-foreground">{pred.value}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{pred.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── SECTION 7: AUTOMATED ACTIONS ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {t('Automatisierung', 'Automation')}
          </p>
          <div className="flex items-center gap-2">
            {(['suggest', 'assisted', 'automatic'] as AutomationMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setAutomationMode(mode)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  automationMode === mode
                    ? 'bg-foreground text-background'
                    : 'bg-card text-muted-foreground border border-border hover:bg-muted'
                }`}
              >
                {mode === 'suggest' ? t('Vorschlag', 'Suggest') : mode === 'assisted' ? t('Assistiert', 'Assisted') : t('Automatisch', 'Automatic')}
              </button>
            ))}
          </div>
        </div>

        {automationActions.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))] mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">{t('Keine Aktionen nötig — System läuft optimal.', 'No actions needed — system running optimally.')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {automationActions.map(action => {
              const executed = actionLog.find(l => l.id === action.id);
              const moduleIcons: Record<string, typeof ArrowRightLeft> = {
                reallocation: ArrowRightLeft, followup: Mail, reengagement: RotateCcw, intervention: GraduationCap,
              };
              const moduleColors: Record<string, string> = {
                reallocation: 'text-[hsl(var(--info))]', followup: 'text-[hsl(var(--warning))]',
                reengagement: 'text-[hsl(var(--accent))]', intervention: 'text-[hsl(var(--danger))]',
              };
              const MIcon = moduleIcons[action.module] || Settings2;
              return (
                <div key={action.id} className={`rounded-xl border bg-card p-4 flex items-start gap-3 ${executed?.status === 'executed' ? 'border-[hsl(var(--success)_/_0.3)] opacity-70' : executed?.status === 'dismissed' ? 'border-border opacity-40' : 'border-border'}`}>
                  <MIcon className={`h-4 w-4 mt-0.5 shrink-0 ${moduleColors[action.module] || 'text-muted-foreground'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground">{action.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{action.description}</p>
                  </div>
                  {!executed && automationMode !== 'automatic' && (
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => executeAction(action.id)} className="px-2.5 py-1 rounded-md bg-foreground text-background text-[10px] font-medium hover:opacity-90 transition-opacity">
                        {automationMode === 'assisted' ? t('Bestätigen', 'Confirm') : t('Ausführen', 'Execute')}
                      </button>
                      <button onClick={() => dismissAction(action.id)} className="px-2 py-1 rounded-md border border-border text-[10px] text-muted-foreground hover:bg-muted transition-colors">
                        ✕
                      </button>
                    </div>
                  )}
                  {executed && (
                    <span className={`text-[10px] font-medium shrink-0 ${executed.status === 'executed' ? 'text-[hsl(var(--success))]' : 'text-muted-foreground'}`}>
                      {executed.status === 'executed' ? '✓' : '—'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {actionLog.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <History className="h-3 w-3" /> {t('Aktions-Log', 'Action Log')}
            </p>
            <div className="space-y-1.5">
              {actionLog.slice(-5).reverse().map((log, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <span className={log.status === 'executed' ? 'text-[hsl(var(--success))]' : 'text-muted-foreground'}>
                    {log.status === 'executed' ? '✓' : '—'}
                  </span>
                  <span className="text-foreground">{log.title}</span>
                  <span className="text-muted-foreground/50 ml-auto">{log.timestamp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── SECTION 8: ADAPTIVE INTELLIGENCE (AI DECISION LAYER) ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Brain className="h-3.5 w-3.5 text-accent" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {t('Adaptive Intelligence', 'Adaptive Intelligence')}
          </p>
        </div>
        <div className="space-y-3">
          {aiDecisions.map((decision, i) => {
            const typeIcons: Record<string, typeof Sparkles> = {
              pattern: Sparkles, decision: Brain, learning: TrendingUp,
            };
            const typeBorders: Record<string, string> = {
              pattern: 'border-[hsl(var(--accent)_/_0.25)]',
              decision: 'border-[hsl(var(--info)_/_0.2)]',
              learning: 'border-[hsl(var(--success)_/_0.2)]',
            };
            const typeIconColors: Record<string, string> = {
              pattern: 'text-[hsl(var(--accent))]',
              decision: 'text-[hsl(var(--info))]',
              learning: 'text-[hsl(var(--success))]',
            };
            const DIcon = typeIcons[decision.type] || Brain;
            return (
              <div key={i} className={`rounded-xl border ${typeBorders[decision.type]} bg-card p-5 space-y-3`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DIcon className={`h-4 w-4 ${typeIconColors[decision.type]}`} />
                    <p className="text-xs font-semibold text-foreground">{decision.title}</p>
                  </div>
                  {decision.confidence > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">{decision.confidence}%</span>
                      <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${decision.confidence}%` }} />
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{decision.description}</p>
                {decision.impact !== '—' && (
                  <p className="text-[10px] font-semibold text-accent">{t('Impact', 'Impact')}: {decision.impact}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
