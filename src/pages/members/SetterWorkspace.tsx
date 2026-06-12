import { useEffect, useState, useMemo } from 'react';
import { WhatsAppButton } from '@/components/leads/WhatsAppButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  Phone, ArrowRight, Timer, CheckCircle2, XCircle, RotateCcw, UserPlus, AlertTriangle,
  Target, MessageSquare, Shield, TrendingUp, ChevronRight, Calendar, Clock, Zap, BarChart3, Sparkles
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import LeadDetailDrawer, { type LeadRecord } from '@/components/members/LeadDetailDrawer';
import LiveCallsDisplay from '@/components/members/LiveCallsDisplay';
import { cn } from '@/lib/utils';
import WorkspaceAnalytics from '@/components/members/WorkspaceAnalytics';
import SetterAppointments from '@/components/members/SetterAppointments';
import SetterHandoffModal, { type HandoffData } from '@/components/members/SetterHandoffModal';
import WorkspaceCopilotPanel from '@/components/members/WorkspaceCopilotPanel';
import AutoEnrichPanel from '@/components/members/AutoEnrichPanel';
import ManualLeadEntryModal from '@/components/leads/ManualLeadEntryModal';
import { useManualLeadEntry } from '@/hooks/useManualLeadEntry';

const SETTER_STAGES = ['assigned_setter', 'setter_attempting', 'setter_no_response', 'setter_qualified', 'setter_booked'];

const STAGE_LABELS: Record<string, string> = {
  assigned_setter: 'Neu zugewiesen',
  setter_attempting: 'Kontakt versucht',
  setter_no_response: 'Keine Antwort',
  setter_qualified: 'Qualifiziert',
  setter_booked: 'Closer Call gebucht',
  ready_for_closer: 'Bereit für Closer',
};

const QUALIFICATION_ITEMS = [
  { key: 'interest', label: 'Echtes Interesse bestätigt' },
  { key: 'situation', label: 'Situation & Problem verstanden' },
  { key: 'budget', label: 'Budget-Rahmen passt' },
  { key: 'timeline', label: 'Zeitrahmen geklärt' },
  { key: 'decision_maker', label: 'Entscheidungsträger bestätigt' },
];

const TRANSITIONS: Record<string, string[]> = {
  assigned_setter: ['setter_attempting'],
  setter_attempting: ['setter_no_response', 'setter_qualified'],
  setter_no_response: ['setter_attempting'],
  setter_qualified: ['setter_booked'],
  setter_booked: ['ready_for_closer'],
};

const FRAMEWORK_STEPS = [
  {
    title: 'Opening – Vertrauen aufbauen',
    description: 'Rapport herstellen, Rahmen setzen, Agenda klären.',
    questions: [
      'Wie hast du von uns erfahren?',
      'Was hat dich dazu bewogen, dich zu bewerben?',
      'Was erhoffst du dir von diesem Gespräch?',
    ],
  },
  {
    title: 'Bedarfsklärung',
    description: 'Aktuelle Situation verstehen, Schmerzpunkte identifizieren.',
    questions: [
      'Was machst du aktuell beruflich?',
      'Was funktioniert gut – und was nicht?',
      'Wo willst du in 6 Monaten stehen?',
    ],
  },
  {
    title: 'Qualifizierung',
    description: 'Zeit, Budget & Commitment prüfen.',
    questions: [
      'Hast du aktuell die Zeit, etwas Neues aufzubauen?',
      'Bist du bereit, in deine Entwicklung zu investieren?',
      'Was passiert, wenn sich nichts ändert?',
    ],
  },
  {
    title: 'Positioning',
    description: 'Programm als Lösung positionieren, ohne Druck.',
    questions: [
      'Basierend auf dem, was du erzählt hast – ich denke, das passt gut.',
      'Lass mich dir kurz erklären, wie das Programm aufgebaut ist.',
      'Was davon klingt für dich am relevantesten?',
    ],
  },
  {
    title: 'Termin setzen',
    description: 'Klarer Call-to-Action für den Closer-Call.',
    questions: [
      'Der nächste Schritt wäre ein Strategiegespräch mit einem unserer Experten.',
      'Passt dir [Tag] um [Uhrzeit]?',
      'Ich schicke dir direkt die Bestätigung.',
    ],
  },
];

const OBJECTIONS = [
  {
    objection: '„Ich muss noch überlegen"',
    response: 'Das verstehe ich. Worüber genau möchtest du nachdenken? Lass uns das kurz gemeinsam durchgehen, damit du eine fundierte Entscheidung treffen kannst.',
    category: 'Entscheidung',
  },
  {
    objection: '„Ich habe kein Geld"',
    response: 'Das ist eine ehrliche Aussage. Lass mich fragen: Wenn du wüsstest, dass es funktioniert – wäre es dann eine Investition, die du finden würdest? Manchmal geht es weniger um das Geld, sondern darum, ob man an den Weg glaubt.',
    category: 'Finanziell',
  },
  {
    objection: '„Ich habe keine Zeit"',
    response: 'Das kenne ich. Die Frage ist: Wenn du jetzt nichts änderst, hast du dann in 6 Monaten mehr Zeit? Oder weniger? Die meisten Teilnehmer starten neben ihrem Job.',
    category: 'Zeitlich',
  },
  {
    objection: '„Ich muss mit meinem Partner reden"',
    response: 'Absolut. Was wäre das Wichtigste, das dein Partner wissen müsste? Vielleicht können wir die Punkte zusammen vorbereiten, damit das Gespräch einfacher wird.',
    category: 'Extern',
  },
  {
    objection: '„Funktioniert das wirklich?"',
    response: 'Berechtigte Frage. Ich zeige dir gerne, was andere in einer ähnlichen Situation wie deiner erreicht haben. Aber am Ende hängt es davon ab, ob du bereit bist, die Arbeit reinzustecken.',
    category: 'Vertrauen',
  },
];

function timerInfo(expiresAt: string | null) {
  if (!expiresAt) return { text: '', urgent: false, expired: false };
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return { text: 'Abgelaufen', urgent: true, expired: true };
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return { text: `${h}h ${m}m`, urgent: h < 6, expired: false };
}

function qualBucketBadge(bucket: string | null | undefined) {
  if (!bucket) return null;
  const styles: Record<string, string> = {
    high: 'bg-primary/15 text-primary border-primary/30',
    mid: 'bg-amber-100 text-amber-700 border-amber-300',
    low: 'bg-destructive/15 text-destructive border-destructive/30',
  };
  const labels: Record<string, string> = { high: 'HIGH', mid: 'MID', low: 'LOW' };
  return (
    <Badge variant="outline" className={cn('text-[9px] font-bold', styles[bucket] || '')}>
      {labels[bucket] || bucket}
    </Badge>
  );
}

interface CloserProfile {
  id: string;
  full_name: string | null;
  close_rate?: number;
  active_deals?: number;
  certified?: boolean;
}

export default function SetterWorkspace() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LeadRecord | null>(null);
  const [notes, setNotes] = useState('');
  const [closers, setClosers] = useState<CloserProfile[]>([]);
  const [expandedFrameworkStep, setExpandedFrameworkStep] = useState<number | null>(null);
  const [expandedObjection, setExpandedObjection] = useState<number | null>(null);
  const [handoffLead, setHandoffLead] = useState<LeadRecord | null>(null);
  const [manualLeadOpen, setManualLeadOpen] = useState(false);
  const { manualLeadRatio, loadManualLeadRatio } = useManualLeadEntry();

  useEffect(() => { loadManualLeadRatio(); }, []);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('leads').select('*').eq('setter_id', user.id)
        .in('stage', [...SETTER_STAGES, 'ready_for_closer'])
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, business_stage, certified')
        .in('business_stage', ['junior_manager', 'manager', 'senior_manager', 'director', 'partner']),
    ]).then(async ([{ data: leadsData }, { data: closerData }]) => {
      setLeads((leadsData as LeadRecord[]) ?? []);

      // Enrich closers with KPI data for matching
      const closerProfiles = (closerData ?? []) as any[];
      if (closerProfiles.length > 0) {
        const closerIds = closerProfiles.map(c => c.id);
        const [kpiRes, activeDealsRes] = await Promise.all([
          supabase.from('member_kpis').select('user_id, closing_rate').in('user_id', closerIds),
          supabase.from('leads').select('closer_id').in('closer_id', closerIds).in('stage', ['assigned_closer', 'closer_attempting', 'closer_qualified']),
        ]);

        const kpiMap = new Map((kpiRes.data ?? []).map((k: any) => [k.user_id, k.closing_rate || 0]));
        const dealCounts = new Map<string, number>();
        (activeDealsRes.data ?? []).forEach((l: any) => {
          dealCounts.set(l.closer_id, (dealCounts.get(l.closer_id) || 0) + 1);
        });

        const enriched: CloserProfile[] = closerProfiles
          .map(c => ({
            id: c.id,
            full_name: c.full_name,
            close_rate: kpiMap.get(c.id) || 0,
            active_deals: dealCounts.get(c.id) || 0,
            certified: c.certified || false,
          }))
          .sort((a, b) => {
            // Sort: highest close rate first, then fewest active deals
            if ((b.close_rate || 0) !== (a.close_rate || 0)) return (b.close_rate || 0) - (a.close_rate || 0);
            return (a.active_deals || 0) - (b.active_deals || 0);
          });

        setClosers(enriched);
      }
      setLoading(false);
    });
  }, [user]);

  const stats = useMemo(() => {
    const total = leads.length;
    const qualified = leads.filter(l => ['setter_qualified', 'setter_booked', 'ready_for_closer'].includes(l.stage)).length;
    const booked = leads.filter(l => ['setter_booked', 'ready_for_closer'].includes(l.stage)).length;
    const withOutcome = leads.filter(l => (l as any).setter_call_outcome).length;
    const avgScore = leads.filter(l => (l as any).setter_qualification_score != null);
    const avgScoreVal = avgScore.length > 0
      ? Math.round(avgScore.reduce((s, l) => s + ((l as any).setter_qualification_score || 0), 0) / avgScore.length)
      : 0;
    return {
      assigned: leads.filter(l => l.stage === 'assigned_setter').length,
      contacting: leads.filter(l => ['setter_attempting', 'setter_no_response'].includes(l.stage)).length,
      qualified,
      booked,
      qualRate: total > 0 ? Math.round((qualified / total) * 100) : 0,
      showRate: booked > 0 ? Math.round((booked / qualified || 1) * 100) : 0,
      completed: withOutcome,
      avgScore: avgScoreVal,
    };
  }, [leads]);

  const priorityLeads = useMemo(() =>
    leads.filter(l => l.stage === 'assigned_setter' || (l.timer_expires_at && timerInfo(l.timer_expires_at).urgent))
  , [leads]);

  const followUpLeads = useMemo(() =>
    leads.filter(l => l.stage === 'setter_no_response' || (l as any).setter_call_outcome === 'follow_up')
  , [leads]);

  const nextAction = useMemo(() => {
    if (leads.some(l => l.timer_expires_at && timerInfo(l.timer_expires_at).expired))
      return { text: 'Abgelaufene Leads bearbeiten', icon: AlertTriangle, variant: 'destructive' as const };
    if (leads.some(l => l.stage === 'assigned_setter'))
      return { text: 'Neuen Lead kontaktieren', icon: Phone, variant: 'default' as const };
    if (followUpLeads.length > 0)
      return { text: 'Follow-up durchführen', icon: RotateCcw, variant: 'outline' as const };
    if (leads.some(l => l.stage === 'setter_qualified'))
      return { text: 'Termin bestätigen', icon: Calendar, variant: 'default' as const };
    return { text: 'Weiter trainieren', icon: Target, variant: 'outline' as const };
  }, [leads, followUpLeads]);

  const transition = async (lead: LeadRecord, newStage: string) => {
    const now = new Date().toISOString();
    const updates = { stage: newStage, updated_at: now, last_action_at: now } as any;

    if (newStage === 'setter_attempting') {
      if (!lead.first_action_at) updates.first_action_at = now;
      updates.contact_count = (lead.contact_count || 0) + 1;
      if (!lead.timer_expires_at) updates.timer_expires_at = new Date(Date.now() + 72 * 3600000).toISOString();
    }

    const { error } = await supabase.from('leads').update(updates).eq('id', lead.id);
    if (!error) {
      await supabase.from('lead_transitions').insert({ lead_id: lead.id, previous_stage: lead.stage, new_stage: newStage, changed_by: user!.id });
      const updated = { ...lead, ...updates } as LeadRecord;
      setLeads(prev => prev.map(l => l.id === lead.id ? updated : l));
      if (selected?.id === lead.id) setSelected(updated);
      toast({ title: `→ ${STAGE_LABELS[newStage] || newStage}` });
    }
  };

  // Unified handoff handler — replaces old qualification + handoff
  const handleUnifiedHandoff = async (data: HandoffData) => {
    if (!handoffLead || !user) return;
    const now = new Date().toISOString();

    // Build updates for the lead
    const updates: any = {
      setter_lead_uniqueness: data.lead_uniqueness,
      setter_closing_insights: data.closing_insights,
      setter_call_outcome: data.outcome,
      setter_notes: data.notes || handoffLead.setter_notes,
      setter_call_completed_at: now,
      updated_at: now,
      last_action_at: now,
    };

    if (data.follow_up_date) {
      updates.setter_follow_up_date = data.follow_up_date.toISOString().split('T')[0];
    }

    // Handle non-qualified / follow-up outcomes (no closer assignment)
    if (data.outcome === 'not_qualified') {
      updates.stage = 'closed_lost';
      const { error } = await supabase.from('leads').update(updates).eq('id', handoffLead.id);
      if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
      await supabase.from('lead_transitions').insert({ lead_id: handoffLead.id, previous_stage: handoffLead.stage, new_stage: 'closed_lost', changed_by: user.id });
      await supabase.from('lead_events').insert({ lead_id: handoffLead.id, event_type: 'setter_call_completed', actor_user_id: user.id, notes: `Nicht qualifiziert | Besonderheit: ${data.lead_uniqueness.slice(0, 100)}` } as any);
      setLeads(prev => prev.filter(l => l.id !== handoffLead.id));
      if (selected?.id === handoffLead.id) setSelected(null);
      toast({ title: 'Lead abgelehnt' });
      setHandoffLead(null);
      return;
    }

    if (data.outcome === 'follow_up') {
      updates.stage = 'setter_no_response';
      const { error } = await supabase.from('leads').update(updates).eq('id', handoffLead.id);
      if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
      await supabase.from('lead_transitions').insert({ lead_id: handoffLead.id, previous_stage: handoffLead.stage, new_stage: 'setter_no_response', changed_by: user.id });
      await supabase.from('lead_events').insert({ lead_id: handoffLead.id, event_type: 'setter_call_completed', actor_user_id: user.id, notes: `Follow-up geplant: ${data.follow_up_date ? data.follow_up_date.toISOString().split('T')[0] : '—'}` } as any);
      const updatedLead = { ...handoffLead, ...updates } as LeadRecord;
      setLeads(prev => prev.map(l => l.id === handoffLead.id ? updatedLead : l));
      if (selected?.id === handoffLead.id) setSelected(updatedLead);
      toast({ title: 'Follow-up erstellt' });
      setHandoffLead(null);
      return;
    }

    // QUALIFIED path: create appointment + assign closer
    // Step 1: Mark as ready_for_closer
    updates.stage = 'ready_for_closer';
    const { error: step1Error } = await supabase.from('leads').update(updates).eq('id', handoffLead.id);
    if (step1Error) { toast({ title: 'Fehler', description: step1Error.message, variant: 'destructive' }); return; }

    await supabase.from('lead_transitions').insert({ lead_id: handoffLead.id, previous_stage: handoffLead.stage, new_stage: 'ready_for_closer', changed_by: user.id });

    // Step 2: Create appointment via central RPC (handles status, lead update, event logging)
    const [hours, minutes] = data.appointment_time.split(':').map(Number);
    const startsAt = new Date(data.appointment_date);
    startsAt.setHours(hours, minutes, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000); // 1 hour

    const { data: rpcResult, error: rpcError } = await supabase.rpc('create_manual_appointment', {
      p_lead_id: handoffLead.id,
      p_starts_at: startsAt.toISOString(),
      p_ends_at: endsAt.toISOString(),
      p_call_type: 'closer_call',
      p_confirmed: false,
      p_reason: 'setter_handoff',
      p_closer_id: data.closer_id,
      p_setter_notes: data.lead_uniqueness,
    });

    const result = rpcResult as any;
    if (rpcError || !result?.success) {
      const errMsg = rpcError?.message || result?.error || 'Appointment konnte nicht erstellt werden';
      toast({ title: 'Fehler', description: errMsg, variant: 'destructive' });
      return;
    }

    // Step 3: Update lead stage to assigned_closer
    await supabase.from('leads').update({
      stage: 'assigned_closer',
      booking_id: result.appointment_id,
      updated_at: now,
    } as any).eq('id', handoffLead.id);

    await supabase.from('lead_transitions').insert({ lead_id: handoffLead.id, previous_stage: 'ready_for_closer', new_stage: 'assigned_closer', changed_by: user.id });

    const closerProfile = closers.find(c => c.id === data.closer_id);

    // Send closer notification email
    if (closerProfile) {
      const { data: closerEmail } = await supabase.from('profiles').select('email').eq('id', data.closer_id).maybeSingle();
      if (closerEmail?.email) {
        try {
          await supabase.functions.invoke('send-transactional-email', {
            body: {
              templateName: 'setter-assigned',
              recipientEmail: closerEmail.email,
              idempotencyKey: `closer-assigned-${handoffLead.id}-${data.closer_id}`,
              templateData: {
                setterName: closerProfile.full_name || 'Closer',
                leadName: handoffLead.name,
                appointmentDate: data.appointment_date.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }),
                appointmentTime: data.appointment_time,
                callType: 'Closer Call (qualifiziert)',
                leadUniqueness: data.lead_uniqueness,
              },
            },
          });
        } catch (e) { console.error('Closer notification failed:', e); }
      }
    }

    // Send lead notification email
    if (handoffLead.email) {
      try {
        await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'booking-confirmation',
            recipientEmail: handoffLead.email,
            idempotencyKey: `booking-confirm-handoff-${handoffLead.id}-${data.closer_id}`,
            templateData: {
              leadName: handoffLead.name,
              appointmentDate: data.appointment_date.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }),
              appointmentTime: data.appointment_time,
              closerName: closerProfile?.full_name || 'Dein Berater',
            },
          },
        });
      } catch (e) { console.error('Lead notification failed:', e); }
    }

    toast({ title: 'An Closer übergeben ✓', description: `Termin: ${data.appointment_date.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })} um ${data.appointment_time}` });
    setHandoffLead(null);
    setLeads(prev => prev.filter(l => l.id !== handoffLead.id));
    if (selected?.id === handoffLead.id) setSelected(null);
  };

  const returnToPool = async (lead: LeadRecord) => {
    const { error } = await supabase.from('leads').update({
      stage: 'recycled', setter_id: null, owner_id: null, updated_at: new Date().toISOString(),
    }).eq('id', lead.id);
    if (!error) {
      await supabase.from('lead_transitions').insert({ lead_id: lead.id, previous_stage: lead.stage, new_stage: 'recycled', changed_by: user!.id });
      setLeads(prev => prev.filter(l => l.id !== lead.id));
      setSelected(null);
      toast({ title: 'Lead zurück in den Pool' });
    }
  };

  const toggleChecklist = async (lead: LeadRecord, key: string, val: boolean) => {
    const newCl = { ...(lead.qualification_checklist || {}), [key]: val };
    await supabase.from('leads').update({ qualification_checklist: newCl } as any).eq('id', lead.id);
    const updated = { ...lead, qualification_checklist: newCl };
    setLeads(prev => prev.map(l => l.id === lead.id ? updated : l));
    if (selected?.id === lead.id) setSelected(updated);
  };

  const saveNotes = async (lead: LeadRecord) => {
    await supabase.from('leads').update({ setter_notes: notes }).eq('id', lead.id);
    toast({ title: 'Notizen gespeichert' });
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Setter Workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">Du qualifizierst Leads und bereitest den Abschluss vor.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setManualLeadOpen(true)} className="gap-1.5">
          <UserPlus className="h-3.5 w-3.5" />
          Lead manuell hinzufügen
        </Button>
      </div>

      {/* Manual Lead Ratio Warning */}
      {manualLeadRatio !== null && manualLeadRatio > 0.2 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>Manual Leads machen {Math.round(manualLeadRatio * 100)}% der letzten 30 Tage aus — Tracking-Qualität könnte beeinträchtigt sein.</span>
        </div>
      )}

      {/* KPI Stats — Enhanced */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        {[
          { label: 'Zugewiesen', value: stats.assigned },
          { label: 'Kontaktiert', value: stats.contacting },
          { label: 'Qualifiziert', value: stats.qualified },
          { label: 'Termin gebucht', value: stats.booked },
          { label: 'Qualifiz. Rate', value: `${stats.qualRate}%` },
          { label: 'Booking Rate', value: `${stats.showRate}%` },
          { label: 'Calls abgeschl.', value: stats.completed },
          { label: 'Ø Score', value: stats.avgScore > 0 ? `${stats.avgScore}/9` : '—' },
        ].map(s => (
          <div key={s.label} className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-2xl font-semibold text-foreground">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Next Action */}
      <div className="mb-6 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <nextAction.icon className="h-5 w-5 text-accent" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nächste Aktion</p>
            <p className="text-sm font-medium text-foreground">{nextAction.text}</p>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="pipeline" className="space-y-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="appointments">Termine</TabsTrigger>
          <TabsTrigger value="framework">Framework</TabsTrigger>
          <TabsTrigger value="objections">Einwände</TabsTrigger>
          <TabsTrigger value="followup">Follow-up</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="live">Live Calls</TabsTrigger>
        </TabsList>

        {/* Appointments Tab */}
        <TabsContent value="appointments">
          <SetterAppointments />
        </TabsContent>

        {/* Pipeline Tab */}
        <TabsContent value="pipeline" className="space-y-6">
          {/* Priority Leads */}
          {priorityLeads.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Prioritäre Leads</h2>
              <div className="rounded-lg border border-border bg-card divide-y divide-border/50">
                {priorityLeads.map(lead => {
                  const timer = timerInfo(lead.timer_expires_at);
                  const leadAny = lead as any;
                  return (
                    <button
                      key={lead.id}
                      onClick={() => { setSelected(lead); setNotes(lead.setter_notes || ''); }}
                      className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/20"
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{lead.name}</p>
                          <p className="text-xs text-muted-foreground">{lead.email || lead.phone || '—'}</p>
                        </div>
                        {/* Pre-call lead quality (qualification_bucket / qualification_score)
                            intentionally hidden to prevent cherry-picking. Backend tracking unchanged. */}
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-[10px]">{STAGE_LABELS[lead.stage]}</Badge>
                        {timer.text && (
                          <span className={cn('text-xs', timer.urgent ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                            {timer.expired && <AlertTriangle className="inline h-3 w-3 mr-1" />}
                            {timer.text}
                          </span>
                        )}
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Full Table */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Alle zugewiesenen Leads</h2>
            {leads.length === 0 ? (
              <div className="rounded-lg border border-border bg-card py-16 text-center">
                <p className="text-sm text-muted-foreground">Keine Leads zugewiesen.</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">Kontakt</th>
                      {/* Qual. column removed to prevent cherry-picking. Backend tracking unchanged. */}
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">Timer</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {leads.map(lead => {
                      const timer = timerInfo(lead.timer_expires_at);
                      const leadAny = lead as any;
                      return (
                        <tr key={lead.id} className="transition-colors hover:bg-muted/20">
                          <td className="px-4 py-3">
                            <button onClick={() => { setSelected(lead); setNotes(lead.setter_notes || ''); }} className="text-left">
                              <p className="font-medium text-foreground">{lead.name}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {/* Pre-call qualification_bucket hidden — anti cherry-picking */}
                                {leadAny.setter_qualification_score != null && (
                                  <span className={cn(
                                    'text-[10px] font-medium',
                                    leadAny.setter_qualification_score >= 7 ? 'text-primary' :
                                    leadAny.setter_qualification_score >= 4 ? 'text-amber-500' : 'text-destructive'
                                  )}>
                                    S:{leadAny.setter_qualification_score}/9
                                  </span>
                                )}
                              </div>
                            </button>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{lead.phone || lead.email || '—'}</td>
                          {/* Qual. cell removed to prevent cherry-picking */}
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-[10px]">{STAGE_LABELS[lead.stage] || lead.stage}</Badge>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {timer.text && (
                              <span className={cn('text-xs', timer.urgent ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                                {timer.text}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5 flex-wrap">
                              {/* Stage transitions */}
                              {(TRANSITIONS[lead.stage] || []).filter(s => s !== 'ready_for_closer').map(next => (
                                <Button key={next} variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => transition(lead, next)}>
                                  {STAGE_LABELS[next] || next}
                                </Button>
                              ))}
                              {/* Unified Call + Handoff button */}
                              {['setter_attempting', 'setter_qualified', 'setter_booked'].includes(lead.stage) && (
                                <Button
                                  size="sm"
                                  className="h-7 text-[11px]"
                                  onClick={() => setHandoffLead(lead)}
                                >
                                  <Sparkles className="mr-1 h-3 w-3" /> Call abschließen
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="h-7 text-[11px] text-muted-foreground" onClick={() => returnToPool(lead)}>
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Detail Panel */}
          {selected && (
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="font-serif text-lg font-semibold text-foreground">{selected.name}</h3>
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    {selected.email && <span>{selected.email}</span>}
                    {selected.phone && <span>· {selected.phone}</span>}
                    <WhatsAppButton phone={selected.phone} leadName={selected.name} leadId={selected.id} withTemplate compact sourceComponent="SetterWorkspace" />
                  </div>
                  {/* Pre-call lead quality (qualification_bucket / quiz score) intentionally
                      hidden to prevent cherry-picking. Backend tracking unchanged. */}
                </div>
                <Badge variant="outline" className="text-[10px]">{STAGE_LABELS[selected.stage]}</Badge>
              </div>

              {/* Qualification Snapshot */}
              {((selected as any).setter_call_outcome) && (
                <div className="mb-6 rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Setter Qualifikation</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Budget</p>
                      <p className="text-sm font-medium text-foreground capitalize">{(selected as any).setter_budget_readiness || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Entscheidung</p>
                      <p className="text-sm font-medium text-foreground capitalize">{(selected as any).setter_decision_readiness || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Klarheit</p>
                      <p className="text-sm font-medium text-foreground capitalize">{(selected as any).setter_problem_clarity || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Score</p>
                      <p className={cn(
                        'text-sm font-bold',
                        ((selected as any).setter_qualification_score || 0) >= 7 ? 'text-primary' :
                        ((selected as any).setter_qualification_score || 0) >= 4 ? 'text-amber-500' : 'text-destructive'
                      )}>
                        {(selected as any).setter_qualification_score ?? '—'}/9
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Qualifikation</p>
                  <div className="space-y-1.5">
                    {QUALIFICATION_ITEMS.map(item => {
                      const checked = selected.qualification_checklist?.[item.key] ?? false;
                      return (
                        <button
                          key={item.key}
                          onClick={() => toggleChecklist(selected, item.key, !checked)}
                          className="flex w-full items-center gap-2.5 rounded-md border border-border/50 bg-background px-3 py-2.5 text-left transition-colors hover:bg-muted/20"
                        >
                          {checked
                            ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                            : <XCircle className="h-4 w-4 text-muted-foreground/25 shrink-0" />
                          }
                          <span className={cn('text-sm', checked ? 'text-foreground' : 'text-muted-foreground')}>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Call + Handoff CTA */}
                  {['setter_attempting', 'setter_qualified', 'setter_booked'].includes(selected.stage) && (
                    <Button
                      className="mt-4 w-full"
                      onClick={() => setHandoffLead(selected)}
                    >
                      <BarChart3 className="mr-2 h-4 w-4" /> Call abschließen & qualifizieren
                    </Button>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Setter Notizen</p>
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="min-h-[120px] text-sm"
                    placeholder="Gesprächsnotizen…"
                  />
                  <div className="flex gap-2 mt-3">
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => saveNotes(selected)}>
                      Speichern
                    </Button>
                  </div>
                  <div className="mt-3">
                    <AutoEnrichPanel
                      leadId={selected.id}
                      currentNotes={notes}
                      onApply={({ setter_notes }) => {
                        setNotes(setter_notes);
                        saveNotes({ ...selected, setter_notes } as any);
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Framework Tab */}
        <TabsContent value="framework" className="space-y-4">
          <div className="mb-4">
            <h2 className="font-serif text-lg font-semibold text-foreground">Setter Framework</h2>
            <p className="text-sm text-muted-foreground mt-1">Strukturierter Gesprächsleitfaden für maximale Qualifizierung.</p>
          </div>
          <div className="space-y-2">
            {FRAMEWORK_STEPS.map((step, idx) => (
              <div key={idx} className="rounded-lg border border-border bg-card overflow-hidden">
                <button
                  onClick={() => setExpandedFrameworkStep(expandedFrameworkStep === idx ? null : idx)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{step.title}</p>
                      <p className="text-xs text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                  <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', expandedFrameworkStep === idx && 'rotate-90')} />
                </button>
                {expandedFrameworkStep === idx && (
                  <div className="border-t border-border/50 px-4 py-3 bg-muted/10">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Gesprächsbausteine</p>
                    <div className="space-y-2">
                      {step.questions.map((q, qi) => (
                        <div key={qi} className="flex items-start gap-2 rounded-md border border-border/30 bg-background px-3 py-2">
                          <MessageSquare className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
                          <p className="text-sm text-foreground">{q}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Objections Tab */}
        <TabsContent value="objections" className="space-y-4">
          <div className="mb-4">
            <h2 className="font-serif text-lg font-semibold text-foreground">Einwandbehandlung</h2>
            <p className="text-sm text-muted-foreground mt-1">Die häufigsten Einwände und wie du sie auflöst – ohne Druck.</p>
          </div>
          <div className="space-y-2">
            {OBJECTIONS.map((obj, idx) => (
              <div key={idx} className="rounded-lg border border-border bg-card overflow-hidden">
                <button
                  onClick={() => setExpandedObjection(expandedObjection === idx ? null : idx)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Shield className="h-4 w-4 text-accent shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{obj.objection}</p>
                      <p className="text-[10px] text-muted-foreground">{obj.category}</p>
                    </div>
                  </div>
                  <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', expandedObjection === idx && 'rotate-90')} />
                </button>
                {expandedObjection === idx && (
                  <div className="border-t border-border/50 px-4 py-3 bg-muted/10">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Antwortstruktur</p>
                    <p className="text-sm text-foreground leading-relaxed">{obj.response}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Follow-up Tab */}
        <TabsContent value="followup" className="space-y-4">
          <div className="mb-4">
            <h2 className="font-serif text-lg font-semibold text-foreground">Follow-up System</h2>
            <p className="text-sm text-muted-foreground mt-1">Leads mit offenen Follow-ups – systematisch nachfassen.</p>
          </div>

          {followUpLeads.length === 0 ? (
            <div className="rounded-lg border border-border bg-card py-12 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-primary/40 mb-3" />
              <p className="text-sm text-muted-foreground">Keine offenen Follow-ups.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {followUpLeads.map(lead => {
                const timer = timerInfo(lead.timer_expires_at);
                const leadAny = lead as any;
                return (
                  <div key={lead.id} className="rounded-lg border border-border bg-card px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{lead.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {lead.contact_count} Kontaktversuch{lead.contact_count !== 1 ? 'e' : ''}
                        {timer.text && ` · ${timer.text}`}
                        {leadAny.setter_follow_up_date && ` · Follow-up: ${leadAny.setter_follow_up_date}`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => transition(lead, 'setter_attempting')}>
                        <Phone className="mr-1 h-3 w-3" /> Erneut kontaktieren
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-[11px] text-muted-foreground" onClick={() => returnToPool(lead)}>
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics">
          <WorkspaceAnalytics roleOverride="setter" />
        </TabsContent>

        {/* Live Calls Tab */}
        <TabsContent value="live">
          <LiveCallsDisplay />
        </TabsContent>
      </Tabs>

      {/* Unified Setter Handoff Modal */}
      <SetterHandoffModal
        open={!!handoffLead}
        onClose={() => setHandoffLead(null)}
        onSubmit={handleUnifiedHandoff}
        leadName={handoffLead?.name || ''}
        closers={closers}
      />

      {/* AI Copilot Panel */}
      <WorkspaceCopilotPanel role="setter" />

      {/* Manual Lead Entry */}
      <ManualLeadEntryModal
        open={manualLeadOpen}
        onOpenChange={setManualLeadOpen}
        onLeadCreated={() => {
          loadManualLeadRatio();
          // Refresh leads
          if (user) {
            supabase.from('leads').select('*').eq('setter_id', user.id)
              .in('stage', [...SETTER_STAGES, 'ready_for_closer', 'qualified'])
              .order('created_at', { ascending: false })
              .then(({ data }) => setLeads((data as LeadRecord[]) ?? []));
          }
        }}
      />
    </div>
  );
}
