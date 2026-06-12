/**
 * CreateAppointmentModal — Calendar Command Center
 * 3 modes: Blocker, Manual Lead, Lead Pool Pull
 * Full flow: Lead → Slot → Setter/Closer assignment → Create → Email/Reminder
 */
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock, UserPlus, Users, Search, Loader2, CheckCircle2, X, ChevronDown, ChevronUp, Copy, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
  defaultDate?: Date;
  defaultUserId?: string;
  /** Pre-select a lead and open in "pool" mode (used by Lead Detail "Termin vereinbaren"). */
  defaultLeadId?: string;
}

type PoolLead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  quiz_score: number | null;
  lead_quality: string | null;
  source: string;
  stage: string;
  created_at: string;
  is_test_lead?: boolean;
};

type TeamMember = {
  id: string;
  full_name: string | null;
  current_phase: number;
};

const AUTO_ASSIGN_VALUE = '__auto__';
const NO_CLOSER_VALUE = '__none__';

export function CreateAppointmentModal({ open, onOpenChange, onCreated, defaultDate, defaultUserId, defaultLeadId }: Props) {
  const { user, isAdmin, profile } = useAuth();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const callerLevel = (profile as any)?.current_phase ?? 0;

  const [mode, setMode] = useState<'blocker' | 'manual' | 'pool'>('blocker');
  const [saving, setSaving] = useState(false);
  const [errorDetail, setErrorDetail] = useState<{
    message: string;
    source: string;
    code?: string;
    payload?: Record<string, unknown>;
    raw?: string;
    timestamp: string;
  } | null>(null);
  const [errorExpanded, setErrorExpanded] = useState(false);

  // ── Call-type → duration map (canonical) ──
  const CALL_TYPE_DURATION: Record<string, number> = {
    setter: 30,
    closer: 45,
    onboarding: 60,
    priority: 45,
    standard: 30,
  };

  const computeEndTime = (start: string, ct: string) => {
    const dur = CALL_TYPE_DURATION[ct] ?? 30;
    const [h, m] = start.split(':').map(Number);
    const total = h * 60 + m + dur;
    const eh = Math.floor(total / 60) % 24;
    const em = total % 60;
    return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
  };

  // Shared fields
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('10:30');

  // Blocker fields
  const [blockerTitle, setBlockerTitle] = useState('');

  // Manual lead fields
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [callType, setCallType] = useState('setter');
  const [alreadyConfirmed, setAlreadyConfirmed] = useState(false);
  const [isTestLead, setIsTestLead] = useState(false);

  // Pool fields
  const [poolLeads, setPoolLeads] = useState<PoolLead[]>([]);
  const [loadingPool, setLoadingPool] = useState(false);
  const [poolSearch, setPoolSearch] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [poolCallType, setPoolCallType] = useState('setter');

  // Assignment fields (shared for manual + pool)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [assignedSetterId, setAssignedSetterId] = useState<string>('');
  const [assignedCloserId, setAssignedCloserId] = useState<string>('');
  const [poolSetterId, setPoolSetterId] = useState<string>('');
  const [poolCloserId, setPoolCloserId] = useState<string>('');

  useEffect(() => {
    if (defaultDate) {
      setDate(defaultDate.toISOString().slice(0, 10));
    }
  }, [defaultDate]);

  // Pre-select a lead (opened from Lead Detail "Termin vereinbaren")
  useEffect(() => {
    if (!open || !defaultLeadId) return;
    setMode('pool');
    setSelectedLeadId(defaultLeadId);
  }, [open, defaultLeadId]);

  // If preselected lead isn't in the user's pool RPC result, fetch & inject it
  // so handlePoolPull has email/phone/name for confirmation comms.
  useEffect(() => {
    if (!open || !defaultLeadId || loadingPool) return;
    if (poolLeads.some(l => l.id === defaultLeadId)) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, name, email, phone, quiz_score, lead_quality, source, stage, created_at, is_test_lead')
        .eq('id', defaultLeadId)
        .maybeSingle();
      if (cancelled || error || !data) return;
      setPoolLeads(prev => prev.some(l => l.id === data.id) ? prev : [data as PoolLead, ...prev]);
    })();
    return () => { cancelled = true; };
  }, [open, defaultLeadId, loadingPool, poolLeads]);

  // Load team members when modal opens and user is L4+
  useEffect(() => {
    if (!open || !user || (callerLevel < 4 && !isAdmin)) return;
    let cancelled = false;
    setLoadingTeam(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, current_phase')
          .not('current_phase', 'is', null)
          .gte('current_phase', 1)
          .order('full_name');
        if (error) throw error;
        if (!cancelled) setTeamMembers((data ?? []) as TeamMember[]);
      } catch (e: any) {
        console.error('[CreateAppt] team load error', e);
      } finally {
        if (!cancelled) setLoadingTeam(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, user, callerLevel, isAdmin]);

  // Load lead pool
  useEffect(() => {
    if (mode !== 'pool' || !open || !user) return;
    let cancelled = false;
    setLoadingPool(true);
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_leads_without_appointment', { p_user_id: user.id });
        if (error) {
          console.error('[CreateAppt] pool error', error);
          if (!cancelled) setPoolLeads([]);
          toast({ title: 'Leadpool konnte nicht geladen werden', description: error.message, variant: 'destructive' });
        } else {
          if (!cancelled) setPoolLeads(((data as PoolLead[]) ?? []).filter(l => l?.id));
        }
      } catch (e: any) {
        console.error('[CreateAppt] pool exception', e);
        if (!cancelled) {
          setPoolLeads([]);
          toast({ title: 'Leadpool konnte nicht geladen werden', description: e?.message || 'Bitte erneut versuchen.', variant: 'destructive' });
        }
      } finally {
        if (!cancelled) setLoadingPool(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mode, open, user, toast]);

  const filteredPool = poolLeads.filter(l => {
    if (!poolSearch) return true;
    const q = poolSearch.toLowerCase();
    return (l.name || '').toLowerCase().includes(q) || (l.email || '').toLowerCase().includes(q);
  });

  const setters = useMemo(() => teamMembers.filter(m => m.current_phase >= 2 && m.current_phase <= 3), [teamMembers]);
  const closers = useMemo(() => teamMembers.filter(m => m.current_phase >= 4), [teamMembers]);

  const showError = (description: string, detail?: {
    source: string;
    code?: string;
    payload?: Record<string, unknown>;
    raw?: unknown;
  }) => {
    toast({ title: 'Termin konnte nicht erstellt werden', description, variant: 'destructive' });
    if (isAdmin && detail) {
      setErrorDetail({
        message: description,
        source: detail.source,
        code: detail.code,
        payload: detail.payload,
        raw: typeof detail.raw === 'string' ? detail.raw : JSON.stringify(detail.raw, null, 2),
        timestamp: new Date().toISOString(),
      });
      setErrorExpanded(true);
    }
  };

  const creationError = (res: any, fallback = 'Unbekannter Fehler') => {
    if (res?.message) return res.message;
    if (res?.error === 'auth_required') return 'Bitte melde dich erneut an.';
    if (res?.error === 'missing_lead') return 'Es fehlt ein gültiger Lead.';
    if (res?.error === 'lead_not_found') return 'Dieser Lead existiert nicht mehr.';
    if (res?.error === 'invalid_time_range') return 'Bitte wähle eine gültige Start- und Endzeit.';
    if (res?.error === 'lead_has_active_appointment') return 'Dieser Lead hat bereits einen aktiven Termin.';
    return res?.error || fallback;
  };

  const buildTimestamps = () => {
    if (!date || !startTime || !endTime) return null;
    const startsAt = new Date(`${date}T${startTime}:00`);
    const endsAt = new Date(`${date}T${endTime}:00`);
    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime()) || endsAt <= startsAt) return null;
    return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
  };

  const CALL_TYPE_LABEL: Record<string, string> = {
    setter: 'Strategiegespräch', closer: 'Strategiegespräch', follow_up: 'Follow-Up',
    orientation: 'Orientierungsgespräch', strategy: 'Strategiegespräch', onboarding: 'Onboarding',
  };

  /** Fire-and-forget: dispatch confirmation email + schedule reminders */
  const triggerPostCreationComms = async (
    leadId: string,
    appointmentId: string,
    recipientEmail: string | null,
    recipientPhone: string | null,
    startsAt: string,
    endsAt: string,
    leadName: string | null,
    ct: string,
  ) => {
    try {
      const startDate = new Date(startsAt);
      const endDate = new Date(endsAt);
      const durationMin = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
      const dateStr = startDate.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' });
      const timeStr = startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });

      // 1. Booking confirmation email via transactional email (LP template)
      if (recipientEmail) {
        await supabase.functions.invoke('dispatch-communication', {
          body: {
            event_key: 'booking_completed_email',
            lead_id: leadId,
            recipient_email: recipientEmail,
            recipient_phone: recipientPhone,
            template_key: 'lp-appointment-confirmed',
            payload: {
              appointment_id: appointmentId,
              name: leadName,
              date: dateStr,
              time: timeStr,
              callType: ct,
              duration: String(durationMin),
              idempotency_key: `booking-confirm-${appointmentId}`,
            },
          },
        });
      }

      // 2. WhatsApp booking confirmation
      if (recipientPhone) {
        const callLabel = CALL_TYPE_LABEL[ct] ?? ct;
        await supabase.functions.invoke('dispatch-communication', {
          body: {
            event_key: 'booking_completed_wa',
            lead_id: leadId,
            recipient_phone: recipientPhone,
            recipient_email: recipientEmail,
            payload: {
              appointment_id: appointmentId,
              name: leadName,
              starts_at: startsAt,
              body: `Hi ${leadName ?? ''}! 📅 Dein ${callLabel} ist bestätigt: ${dateStr} um ${timeStr} (${durationMin} Min). Bis dann! – Dein ETC Team`,
            },
          },
        });
      }

      // 3. Pre-call reminders handled by canonical reminder pipeline via pg_cron
    } catch (e) {
      console.warn('[CreateAppt] post-creation comms failed (non-blocking)', e);
    }
  };

  const handleBlocker = async () => {
    const ts = buildTimestamps();
    if (!user) { showError('Bitte melde dich erneut an.'); return; }
    if (!ts) { showError('Bitte wähle Datum, Startzeit und Endzeit korrekt aus.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('calendar_blockers').insert({
        user_id: defaultUserId || user.id,
        starts_at: ts.startsAt,
        ends_at: ts.endsAt,
        title: blockerTitle || 'Blocker',
        blocker_type: 'personal',
      });
      if (error) throw error;

      await supabase.rpc('log_calendar_event', {
        p_event_type: 'appointment_block_created',
        p_metadata: { title: blockerTitle, starts_at: ts.startsAt, ends_at: ts.endsAt },
      });

      toast({ title: 'Blocker erstellt', description: `${date} ${startTime}–${endTime}` });
      onCreated?.();
      onOpenChange(false);
      resetForm();
    } catch (e: any) {
      showError(e?.message || 'Blocker konnte nicht erstellt werden.', {
        source: 'calendar_blockers.insert',
        code: e?.code,
        payload: { title: blockerTitle, starts_at: ts?.startsAt, ends_at: ts?.endsAt },
        raw: e,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleManualLead = async () => {
    const ts = buildTimestamps();
    if (!user) { showError('Bitte melde dich erneut an.'); return; }
    if (!ts) { showError('Bitte wähle Datum, Startzeit und Endzeit korrekt aus.'); return; }
    if (!leadName.trim()) { showError('Bitte gib den Namen des Leads ein.'); return; }
    if (!leadEmail.trim()) { showError('Bitte gib die E-Mail des Leads ein.'); return; }
    if (!leadPhone.trim()) { showError('Bitte gib die Telefonnummer des Leads ein.'); return; }
    setSaving(true);
    try {
      const target = defaultUserId && defaultUserId !== user.id ? teamMembers.find(m => m.id === defaultUserId) : null;
      const resolvedSetterId = assignedSetterId || (target && target.current_phase < 4 ? target.id : user.id);
      const effectiveCloserId = assignedCloserId || (target && target.current_phase >= 4 ? target.id : null);

      // Create or find lead
      let leadId: string;
      if (leadEmail) {
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .eq('email', leadEmail.toLowerCase().trim())
          .maybeSingle();
        if (existing) {
          leadId = existing.id;
          // Update setter_id on existing lead
          await supabase.from('leads').update({
            setter_id: resolvedSetterId,
            owner_id: effectiveCloserId || resolvedSetterId,
          } as any).eq('id', leadId);
        } else {
          const { data: newLead, error: leadErr } = await supabase
            .from('leads')
            .insert({
              name: leadName.trim(),
              email: leadEmail.toLowerCase().trim(),
              phone: leadPhone || null,
              source: 'manual',
              stage: 'booked',
              lead_level: 'L0',
              created_by: user.id,
              owner_id: effectiveCloserId || resolvedSetterId,
              setter_id: resolvedSetterId,
              closer_id: effectiveCloserId,
              funnel_source: 'manual',
              conversion_state: 'booked',
            } as any)
            .select('id')
            .maybeSingle();
          if (leadErr) throw leadErr;
          if (!newLead?.id) throw new Error('Lead wurde nicht angelegt. Bitte erneut versuchen.');
          leadId = newLead.id;
        }
      } else {
        const { data: newLead, error: leadErr } = await supabase
          .from('leads')
          .insert({
            name: leadName.trim(),
            phone: leadPhone || null,
            source: 'manual',
            stage: 'booked',
              lead_level: 'L0',
            created_by: user.id,
            owner_id: effectiveCloserId || resolvedSetterId,
            setter_id: resolvedSetterId,
              closer_id: effectiveCloserId,
            funnel_source: 'manual',
            conversion_state: 'booked',
          } as any)
          .select('id')
          .maybeSingle();
        if (leadErr) throw leadErr;
        if (!newLead?.id) throw new Error('Lead wurde nicht angelegt. Bitte erneut versuchen.');
        leadId = newLead.id;
      }

      // Create appointment via RPC (p_closer_id triggers closer ownership)
      const { data: result, error: apptErr } = await supabase.rpc('create_manual_appointment', {
        p_lead_id: leadId,
        p_starts_at: ts.startsAt,
        p_ends_at: ts.endsAt,
        p_call_type: callType,
        p_confirmed: alreadyConfirmed,
        p_reason: 'Manuell erstellt',
        p_closer_id: effectiveCloserId || null,
        p_setter_id: resolvedSetterId,
      });
      if (apptErr) throw apptErr;
      const res = result as any;
      if (!res?.success) throw new Error(creationError(res));

      // Mark test lead if toggled
      if (isTestLead) {
        await supabase.from('leads').update({ is_test_lead: true } as any).eq('id', leadId);
      }

      // Trigger emails & reminders (fire-and-forget, skip for test leads)
      if (!isTestLead) {
        triggerPostCreationComms(
          leadId,
          res.appointment_id,
          leadEmail.trim() || null,
          leadPhone.trim() || null,
          ts.startsAt,
          ts.endsAt,
          leadName.trim(),
          callType,
        );
      }

      toast({
        title: 'Termin erstellt',
        description: alreadyConfirmed ? 'Termin bestätigt' : 'Wartet auf Bestätigung — Emails werden versendet',
      });
      onCreated?.();
      onOpenChange(false);
      resetForm();
    } catch (e: any) {
      showError(e?.message || 'Termin konnte nicht erstellt werden.', {
        source: 'create_manual_appointment RPC (manual)',
        code: e?.code,
        payload: { leadName: leadName.trim(), leadEmail: leadEmail.trim(), callType, date, startTime, endTime },
        raw: e,
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePoolPull = async () => {
    const ts = buildTimestamps();
    if (!user) { showError('Bitte melde dich erneut an.'); return; }
    if (!ts) { showError('Bitte wähle Datum, Startzeit und Endzeit korrekt aus.'); return; }
    if (!selectedLeadId) { showError('Bitte wähle zuerst einen Lead aus dem Pool.'); return; }
    setSaving(true);
    try {
      const target = defaultUserId && defaultUserId !== user.id ? teamMembers.find(m => m.id === defaultUserId) : null;
      const effectiveSetterId = poolSetterId || (target && target.current_phase < 4 ? target.id : user.id);
      const effectiveCloserId = poolCloserId || (target && target.current_phase >= 4 ? target.id : null);
      const { data: result, error } = await supabase.rpc('create_manual_appointment', {
        p_lead_id: selectedLeadId,
        p_starts_at: ts.startsAt,
        p_ends_at: ts.endsAt,
        p_call_type: poolCallType,
        p_confirmed: false,
        p_reason: 'Aus Leadpool gezogen',
        p_closer_id: effectiveCloserId,
        p_setter_id: effectiveSetterId,
      });
      if (error) throw error;
      const res = result as any;
      if (!res?.success) {
        showError(creationError(res, 'Fehler'));
        return;
      }

      // Get lead details for email dispatch
      const selectedLead = poolLeads.find(l => l.id === selectedLeadId);

      // Update setter assignment on the lead if specified
      if (effectiveSetterId) {
        await supabase.from('leads').update({
          setter_id: effectiveSetterId,
          closer_id: effectiveCloserId,
          owner_id: effectiveCloserId || effectiveSetterId,
        } as any).eq('id', selectedLeadId);
      }

      // Trigger emails & reminders (fire-and-forget, skip test leads)
      const isTest = selectedLead?.is_test_lead;
      if (selectedLead && !isTest) {
        triggerPostCreationComms(
          selectedLeadId,
          res.appointment_id,
          selectedLead.email,
          selectedLead.phone,
          ts.startsAt,
          ts.endsAt,
          selectedLead.name,
          poolCallType,
        );
      }

      // Remove from local pool list immediately (optimistic)
      setPoolLeads(prev => prev.filter(l => l.id !== selectedLeadId));

      toast({ title: 'Termin erstellt', description: 'Lead aus Pool übernommen — Bestätigungs-Emails werden versendet' });
      onCreated?.();
      onOpenChange(false);
      resetForm();
    } catch (e: any) {
      showError(e?.message || 'Termin konnte nicht erstellt werden.', {
        source: 'create_manual_appointment RPC (pool)',
        code: e?.code,
        payload: { selectedLeadId, poolCallType, date, startTime, endTime },
        raw: e,
      });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setBlockerTitle('');
    setLeadName('');
    setLeadEmail('');
    setLeadPhone('');
    setAlreadyConfirmed(false);
    setIsTestLead(false);
    setSelectedLeadId(null);
    setPoolSearch('');
    setAssignedSetterId('');
    setAssignedCloserId('');
    setPoolSetterId('');
    setPoolCloserId('');
    setErrorDetail(null);
    setErrorExpanded(false);
  };

  const canAssign = callerLevel >= 4 || isAdmin;

  const renderAssignmentFields = (
    setterId: string,
    onSetterChange: (v: string) => void,
    closerId: string,
    onCloserChange: (v: string) => void,
  ) => {
    if (!canAssign) return null;
    return (
      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Zuweisung</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Setter</Label>
            <Select value={setterId || AUTO_ASSIGN_VALUE} onValueChange={v => onSetterChange(v === AUTO_ASSIGN_VALUE ? '' : v)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Automatisch (ich)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO_ASSIGN_VALUE}>Automatisch (ich)</SelectItem>
                {setters.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name || 'Unbekannt'} (L{m.current_phase})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Closer (optional)</Label>
            <Select value={closerId || NO_CLOSER_VALUE} onValueChange={v => onCloserChange(v === NO_CLOSER_VALUE ? '' : v)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Nicht zugewiesen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CLOSER_VALUE}>Nicht zugewiesen</SelectItem>
                {closers.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name || 'Unbekannt'} (L{m.current_phase})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {loadingTeam && <p className="text-[10px] text-muted-foreground">Lade Teammitglieder…</p>}
      </div>
    );
  };

  const content = (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-serif text-lg font-semibold">Neuer Eintrag</h2>
        {isMobile && (
          <button onClick={() => onOpenChange(false)} className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center">
            <X size={18} />
          </button>
        )}
      </div>

        <Tabs value={mode} onValueChange={v => setMode(v as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="blocker" className="text-xs gap-1.5">
              <Lock className="h-3 w-3" /> Blocker
            </TabsTrigger>
            <TabsTrigger value="manual" className="text-xs gap-1.5">
              <UserPlus className="h-3 w-3" /> Manuell
            </TabsTrigger>
            <TabsTrigger value="pool" className="text-xs gap-1.5" disabled={callerLevel < 3 && !isAdmin}>
              <Users className="h-3 w-3" /> Leadpool
            </TabsTrigger>
          </TabsList>

          {/* Shared date/time fields */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div>
              <Label className="text-xs">Datum</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Von</Label>
              <Input type="time" value={startTime} onChange={e => { setStartTime(e.target.value); setEndTime(computeEndTime(e.target.value, mode === 'pool' ? poolCallType : callType)); }} />
            </div>
            <div>
              <Label className="text-xs">Bis</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>

          <TabsContent value="blocker" className="space-y-3 mt-3">
            <div>
              <Label className="text-xs">Bezeichnung (optional)</Label>
              <Input
                placeholder="z.B. Mittagspause, Intern, Meeting"
                value={blockerTitle}
                onChange={e => setBlockerTitle(e.target.value)}
              />
            </div>
            <Button onClick={handleBlocker} disabled={saving || !date} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
              Blocker erstellen
            </Button>
          </TabsContent>

          <TabsContent value="manual" className="space-y-3 mt-3">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input placeholder="Max Mustermann" value={leadName} onChange={e => setLeadName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">E-Mail *</Label>
                <Input type="email" placeholder="max@email.de" value={leadEmail} onChange={e => setLeadEmail(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Telefon *</Label>
                <Input type="tel" placeholder="+49..." value={leadPhone} onChange={e => setLeadPhone(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Call-Typ</Label>
              <Select value={callType} onValueChange={v => { setCallType(v); setEndTime(computeEndTime(startTime, v)); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="setter">Setter Call</SelectItem>
                  <SelectItem value="closer">Closer Call</SelectItem>
                  <SelectItem value="follow_up">Follow-Up</SelectItem>
                  <SelectItem value="orientation">Orientation Call</SelectItem>
                  <SelectItem value="strategy">Strategy Call</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {renderAssignmentFields(assignedSetterId, setAssignedSetterId, assignedCloserId, setAssignedCloserId)}

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={alreadyConfirmed}
                onChange={e => setAlreadyConfirmed(e.target.checked)}
                className="rounded"
              />
              Bereits bestätigt (manuell abgesprochen)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer text-amber-600">
              <input
                type="checkbox"
                checked={isTestLead}
                onChange={e => setIsTestLead(e.target.checked)}
                className="rounded"
              />
              Test-Lead (keine Emails/Kommunikation)
            </label>
            <Button onClick={handleManualLead} disabled={saving || !date || !leadName} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
              Termin erstellen
            </Button>
          </TabsContent>

          <TabsContent value="pool" className="space-y-3 mt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Lead suchen..."
                value={poolSearch}
                onChange={e => setPoolSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="border rounded-lg max-h-48 overflow-y-auto divide-y divide-border">
              {loadingPool && Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-3"><Skeleton className="h-10 w-full" /></div>
              ))}
              {!loadingPool && filteredPool.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Keine Leads ohne Termin gefunden.
                </div>
              )}
              {filteredPool.map(lead => (
                <button
                  key={lead.id}
                  onClick={() => setSelectedLeadId(lead.id)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors',
                    selectedLeadId === lead.id && 'bg-primary/10'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{lead.name}</span>
                    <div className="flex gap-1.5">
                      {lead.is_test_lead && (
                        <Badge className="text-[10px] bg-amber-500/20 text-amber-700 border-amber-400/40">TEST</Badge>
                      )}
                      {lead.quiz_score != null && (
                        <Badge variant="secondary" className="text-[10px]">Score {lead.quiz_score}</Badge>
                      )}
                      {lead.lead_quality && (
                        <Badge variant="outline" className="text-[10px]">{lead.lead_quality}</Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {lead.email || lead.phone || 'Keine Kontaktdaten'}
                    {' · '}{lead.source}
                  </p>
                </button>
              ))}
            </div>

            {selectedLeadId && (
              <>
                <div>
                  <Label className="text-xs">Call-Typ</Label>
                  <Select value={poolCallType} onValueChange={v => { setPoolCallType(v); setEndTime(computeEndTime(startTime, v)); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="setter">Setter Call</SelectItem>
                      <SelectItem value="closer">Closer Call</SelectItem>
                      <SelectItem value="follow_up">Follow-Up</SelectItem>
                      <SelectItem value="orientation">Orientation Call</SelectItem>
                      <SelectItem value="strategy">Strategy Call</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {renderAssignmentFields(poolSetterId, setPoolSetterId, poolCloserId, setPoolCloserId)}

                <Button onClick={handlePoolPull} disabled={saving || !date} className="w-full">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Lead übernehmen & Termin erstellen
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>

      {/* ── Admin Error Detail Panel ── */}
      {isAdmin && errorDetail && (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
          <button
            onClick={() => setErrorExpanded(v => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              Fehlerdetails (Admin)
            </span>
            {errorExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>

          {errorExpanded && (
            <div className="space-y-2 text-[11px] font-mono text-foreground/80">
              <div>
                <span className="font-semibold text-muted-foreground">Zeitpunkt:</span>{' '}
                {errorDetail.timestamp}
              </div>
              <div>
                <span className="font-semibold text-muted-foreground">Quelle:</span>{' '}
                {errorDetail.source}
              </div>
              {errorDetail.code && (
                <div>
                  <span className="font-semibold text-muted-foreground">Code:</span>{' '}
                  {errorDetail.code}
                </div>
              )}
              <div>
                <span className="font-semibold text-muted-foreground">Nachricht:</span>{' '}
                {errorDetail.message}
              </div>
              {errorDetail.payload && (
                <div>
                  <span className="font-semibold text-muted-foreground">Payload:</span>
                  <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted/40 p-2 text-[10px] leading-tight">
                    {JSON.stringify(errorDetail.payload, null, 2)}
                  </pre>
                </div>
              )}
              {errorDetail.raw && (
                <div>
                  <span className="font-semibold text-muted-foreground">Raw Error:</span>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/40 p-2 text-[10px] leading-tight">
                    {errorDetail.raw}
                  </pre>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] gap-1"
                onClick={async () => {
                  const text = [
                    `Zeitpunkt: ${errorDetail.timestamp}`,
                    `Quelle: ${errorDetail.source}`,
                    errorDetail.code ? `Code: ${errorDetail.code}` : '',
                    `Nachricht: ${errorDetail.message}`,
                    errorDetail.payload ? `Payload: ${JSON.stringify(errorDetail.payload, null, 2)}` : '',
                    errorDetail.raw ? `Raw: ${errorDetail.raw}` : '',
                  ].filter(Boolean).join('\n');
                  try {
                    await navigator.clipboard.writeText(text);
                    toast({ title: 'Kopiert', description: 'Fehlerdetails in Zwischenablage kopiert.' });
                  } catch { /* noop */ }
                }}
              >
                <Copy className="h-3 w-3" /> Kopieren
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] text-muted-foreground"
                onClick={() => { setErrorDetail(null); setErrorExpanded(false); }}
              >
                Schließen
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(
            "p-4 rounded-t-2xl border-t border-border/60",
            "h-[90dvh] max-h-[90dvh] overflow-y-auto",
            "[&>button.absolute]:hidden",
          )}
        >
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        {content}
      </DialogContent>
    </Dialog>
  );
}
