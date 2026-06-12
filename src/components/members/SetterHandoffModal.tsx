import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, addDays, setHours, setMinutes } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  CalendarIcon, CheckCircle2, XCircle, Clock, AlertTriangle, Zap, ArrowRight, Sparkles,
} from 'lucide-react';

export interface HandoffData {
  outcome: 'qualified' | 'not_qualified' | 'follow_up';
  lead_uniqueness: string;
  closing_insights: {
    budget_sensitivity?: string;
    decision_structure?: string;
    urgency?: string;
    objections?: string;
  };
  appointment_date: Date;
  appointment_time: string;
  closer_id: string;
  notes: string;
  follow_up_date?: Date;
}

interface CloserProfile {
  id: string;
  full_name: string | null;
  close_rate?: number;
  active_deals?: number;
  certified?: boolean;
  show_rate?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: HandoffData) => void;
  leadName: string;
  closers: CloserProfile[];
}

const TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00',
];

export default function SetterHandoffModal({ open, onClose, onSubmit, leadName, closers }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Outcome & Uniqueness
  const [outcome, setOutcome] = useState<'qualified' | 'not_qualified' | 'follow_up' | ''>('');
  const [uniqueness, setUniqueness] = useState('');

  // Step 2: Insights (optional) + Appointment
  const [budgetSensitivity, setBudgetSensitivity] = useState('');
  const [decisionStructure, setDecisionStructure] = useState('');
  const [urgency, setUrgency] = useState('');
  const [objections, setObjections] = useState('');
  const [appointmentDate, setAppointmentDate] = useState<Date | undefined>();
  const [appointmentTime, setAppointmentTime] = useState('');
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>();
  const [notes, setNotes] = useState('');

  // Step 3: Closer selection
  const [closerId, setCloserId] = useState('');

  // Auto-select top closer when reaching step 3
  useEffect(() => {
    if (step === 3 && closers.length > 0 && !closerId) {
      setCloserId(closers[0].id);
    }
  }, [step, closers, closerId]);

  const isStep1Valid = outcome !== '' && uniqueness.trim().length >= 10;
  const isStep2Valid = outcome === 'follow_up'
    ? !!followUpDate
    : !!appointmentDate && !!appointmentTime;
  const isStep3Valid = !!closerId;

  const resetForm = () => {
    setStep(1);
    setOutcome('');
    setUniqueness('');
    setBudgetSensitivity('');
    setDecisionStructure('');
    setUrgency('');
    setObjections('');
    setAppointmentDate(undefined);
    setAppointmentTime('');
    setFollowUpDate(undefined);
    setNotes('');
    setCloserId('');
  };

  const handleSubmit = () => {
    if (!isStep3Valid || !appointmentDate || !appointmentTime) return;
    onSubmit({
      outcome: outcome as 'qualified' | 'not_qualified' | 'follow_up',
      lead_uniqueness: uniqueness,
      closing_insights: {
        budget_sensitivity: budgetSensitivity || undefined,
        decision_structure: decisionStructure || undefined,
        urgency: urgency || undefined,
        objections: objections || undefined,
      },
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      closer_id: closerId,
      notes,
      follow_up_date: followUpDate,
    });
    resetForm();
  };

  const rankedClosers = useMemo(() => {
    return [...closers].sort((a, b) => {
      const scoreA = (a.close_rate || 0) * 0.5 + ((100 - (a.active_deals || 0) * 10)) * 0.3 + (a.show_rate || 50) * 0.2;
      const scoreB = (b.close_rate || 0) * 0.5 + ((100 - (b.active_deals || 0) * 10)) * 0.3 + (b.show_rate || 50) * 0.2;
      return scoreB - scoreA;
    });
  }, [closers]);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { resetForm(); onClose(); } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Closer Handoff
          </DialogTitle>
          <DialogDescription>
            Übergabe für <span className="font-semibold text-foreground">{leadName}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 py-2">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={cn(
                'h-2 rounded-full flex-1 transition-colors',
                s <= step ? 'bg-primary' : 'bg-muted'
              )} />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground -mt-1 mb-2">
          <span>Ergebnis</span>
          <span>Termin</span>
          <span>Closer</span>
        </div>

        {/* STEP 1: Outcome + Uniqueness */}
        {step === 1 && (
          <div className="space-y-5">
            {/* Outcome */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ergebnis *</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {[
                  { value: 'qualified', label: 'Qualifiziert', icon: CheckCircle2, cls: 'border-primary bg-primary/5' },
                  { value: 'not_qualified', label: 'Nicht qualifiziert', icon: XCircle, cls: 'border-destructive bg-destructive/5' },
                  { value: 'follow_up', label: 'Follow-up', icon: Clock, cls: 'border-amber-500 bg-amber-50' },
                ].map(o => (
                  <button
                    key={o.value}
                    onClick={() => setOutcome(o.value as any)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-center transition-all',
                      outcome === o.value ? o.cls : 'border-border hover:border-muted-foreground/30'
                    )}
                  >
                    <o.icon className={cn('h-5 w-5', outcome === o.value ? '' : 'text-muted-foreground')} />
                    <span className="text-xs font-medium">{o.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Uniqueness — The Critical Field */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Was macht diesen Bewerber besonders? <span className="text-destructive">*</span>
              </Label>
              <p className="text-[11px] text-muted-foreground mt-1 mb-2">
                Persönliche Story, Pain Point, Motivation oder entscheidender Trigger für den Kauf.
              </p>
              <Textarea
                value={uniqueness}
                onChange={e => setUniqueness(e.target.value)}
                className="text-sm min-h-[100px]"
                placeholder="z.B. Seit 3 Jahren im Job unzufrieden, hat gerade Kündigung erhalten. Will unbedingt finanziell unabhängig werden. Sehr emotional im Gespräch..."
              />
              {uniqueness.length > 0 && uniqueness.trim().length < 10 && (
                <p className="mt-1 text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Mindestens 10 Zeichen für eine aussagekräftige Beschreibung.
                </p>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={() => setStep(2)} disabled={!isStep1Valid}>
                Weiter <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: Insights + Appointment */}
        {step === 2 && (
          <div className="space-y-5">
            {/* Closing Insights (optional) */}
            <div className="rounded-lg border border-border p-3 space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Closing-Relevante Insights <span className="text-muted-foreground/60">(optional)</span>
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-muted-foreground">Budget-Sensibilität</label>
                  <Select value={budgetSensitivity} onValueChange={setBudgetSensitivity}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Wählen..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">Hohe Bereitschaft</SelectItem>
                      <SelectItem value="medium">Moderat</SelectItem>
                      <SelectItem value="sensitive">Preissensibel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Dringlichkeit</label>
                  <Select value={urgency} onValueChange={setUrgency}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Wählen..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">Hoch – will sofort starten</SelectItem>
                      <SelectItem value="medium">Mittel – in 2-4 Wochen</SelectItem>
                      <SelectItem value="low">Niedrig – exploriert</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Entscheidungsstruktur</label>
                  <Select value={decisionStructure} onValueChange={setDecisionStructure}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Wählen..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sole">Entscheidet allein</SelectItem>
                      <SelectItem value="partner">Muss Partner fragen</SelectItem>
                      <SelectItem value="complex">Mehrere Entscheider</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Einwände</label>
                  <Select value={objections} onValueChange={setObjections}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Wählen..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Keine</SelectItem>
                      <SelectItem value="price">Preis</SelectItem>
                      <SelectItem value="time">Zeit</SelectItem>
                      <SelectItem value="trust">Vertrauen</SelectItem>
                      <SelectItem value="other">Sonstiges</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Appointment or Follow-up */}
            {outcome === 'follow_up' ? (
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Follow-up Datum <span className="text-destructive">*</span>
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('mt-2 w-full justify-start text-left font-normal', !followUpDate && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {followUpDate ? format(followUpDate, 'PPP', { locale: de }) : 'Datum wählen'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={followUpDate} onSelect={setFollowUpDate}
                      disabled={d => d < new Date()} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            ) : (
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Termin festlegen <span className="text-destructive">*</span>
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Date */}
                  <div>
                    <label className="text-[11px] text-muted-foreground">Datum</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn('mt-1 w-full justify-start text-left font-normal h-9 text-xs', !appointmentDate && 'text-muted-foreground')}>
                          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                          {appointmentDate ? format(appointmentDate, 'dd.MM.yyyy') : 'Datum'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={appointmentDate} onSelect={setAppointmentDate}
                          disabled={d => d < new Date()} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                  {/* Time */}
                  <div>
                    <label className="text-[11px] text-muted-foreground">Uhrzeit</label>
                    <Select value={appointmentTime} onValueChange={setAppointmentTime}>
                      <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder="Uhrzeit" /></SelectTrigger>
                      <SelectContent>
                        {TIME_SLOTS.map(t => (
                          <SelectItem key={t} value={t}>{t} Uhr</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* Extra notes */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notizen</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)}
                className="mt-1 text-sm min-h-[60px]" placeholder="Weitere Hinweise für den Closer..." />
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" size="sm" onClick={() => setStep(1)}>Zurück</Button>
              {outcome === 'not_qualified' || outcome === 'follow_up' ? (
                <Button size="sm" onClick={() => {
                  // For not_qualified/follow_up, submit directly without closer selection
                  onSubmit({
                    outcome: outcome as any,
                    lead_uniqueness: uniqueness,
                    closing_insights: {
                      budget_sensitivity: budgetSensitivity || undefined,
                      decision_structure: decisionStructure || undefined,
                      urgency: urgency || undefined,
                      objections: objections || undefined,
                    },
                    appointment_date: followUpDate || new Date(),
                    appointment_time: '09:00',
                    closer_id: '',
                    notes,
                    follow_up_date: followUpDate,
                  });
                  resetForm();
                }} disabled={outcome === 'follow_up' && !followUpDate}>
                  Abschließen
                </Button>
              ) : (
                <Button size="sm" onClick={() => setStep(3)} disabled={!isStep2Valid}>
                  Closer wählen <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: Closer Selection */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Summary card */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs space-y-1">
              <p><span className="font-semibold">Termin:</span> {appointmentDate ? format(appointmentDate, 'dd.MM.yyyy') : '–'} um {appointmentTime} Uhr</p>
              <p className="line-clamp-2"><span className="font-semibold">Besonderheit:</span> {uniqueness}</p>
            </div>

            {/* Closer ranking */}
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-2">
                <Zap className="h-3 w-3" /> Auto-Matching (sortiert nach Fit)
              </Label>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {rankedClosers.map((c, idx) => (
                  <button
                    key={c.id}
                    onClick={() => setCloserId(c.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors',
                      closerId === c.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/20'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      {idx === 0 && (
                        <Badge variant="outline" className="text-[9px] border-primary/30 text-primary bg-primary/10">TOP</Badge>
                      )}
                      <div>
                        <p className="text-sm font-medium text-foreground">{c.full_name || 'Unbekannt'}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">CR: {c.close_rate || 0}%</span>
                          <span className="text-[10px] text-muted-foreground">Aktiv: {c.active_deals || 0}</span>
                          {c.certified && <Badge variant="outline" className="text-[8px] h-4 border-primary/20 text-primary">Zertifiziert</Badge>}
                        </div>
                      </div>
                    </div>
                    {closerId === c.id && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                ))}
                {rankedClosers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Keine Closer verfügbar.</p>
                )}
              </div>
            </div>

            <div className="flex justify-between pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setStep(2)}>Zurück</Button>
              <Button size="sm" onClick={handleSubmit} disabled={!isStep3Valid}>
                Termin zuweisen <CheckCircle2 className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
