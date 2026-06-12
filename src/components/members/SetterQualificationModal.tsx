import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { CalendarIcon, AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';

export interface SetterQualificationData {
  call_outcome: 'qualified' | 'not_qualified' | 'follow_up';
  budget_readiness: 'ready' | 'unsure' | 'not_ready';
  decision_readiness: 'can_decide' | 'needs_time' | 'not_decision_maker';
  problem_clarity: 'clear' | 'somewhat_clear' | 'unclear';
  recommendation: 'send_to_closer' | 'follow_up' | 'reject';
  notes: string;
  follow_up_date?: Date;
  qualification_score: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: SetterQualificationData) => void;
  leadName: string;
}

const BUDGET_OPTIONS = [
  { value: 'ready', label: 'Bereit', score: 3, icon: CheckCircle2, color: 'text-primary' },
  { value: 'unsure', label: 'Unsicher', score: 2, icon: Clock, color: 'text-amber-500' },
  { value: 'not_ready', label: 'Nicht bereit', score: 0, icon: XCircle, color: 'text-destructive' },
] as const;

const DECISION_OPTIONS = [
  { value: 'can_decide', label: 'Kann entscheiden', score: 3, icon: CheckCircle2, color: 'text-primary' },
  { value: 'needs_time', label: 'Braucht Zeit', score: 2, icon: Clock, color: 'text-amber-500' },
  { value: 'not_decision_maker', label: 'Kein Entscheider', score: 0, icon: XCircle, color: 'text-destructive' },
] as const;

const CLARITY_OPTIONS = [
  { value: 'clear', label: 'Klares Problem', score: 3, icon: CheckCircle2, color: 'text-primary' },
  { value: 'somewhat_clear', label: 'Teilweise klar', score: 2, icon: Clock, color: 'text-amber-500' },
  { value: 'unclear', label: 'Unklar', score: 0, icon: XCircle, color: 'text-destructive' },
] as const;

const RECOMMENDATION_OPTIONS = [
  { value: 'send_to_closer', label: 'An Closer senden', color: 'border-primary bg-primary/5' },
  { value: 'follow_up', label: 'Follow-up', color: 'border-amber-500 bg-amber-50' },
  { value: 'reject', label: 'Ablehnen', color: 'border-destructive bg-destructive/5' },
] as const;

function calcScore(budget: string, decision: string, clarity: string): number {
  const bScore = BUDGET_OPTIONS.find(o => o.value === budget)?.score ?? 0;
  const dScore = DECISION_OPTIONS.find(o => o.value === decision)?.score ?? 0;
  const cScore = CLARITY_OPTIONS.find(o => o.value === clarity)?.score ?? 0;
  return bScore + dScore + cScore;
}

export default function SetterQualificationModal({ open, onClose, onSubmit, leadName }: Props) {
  const [outcome, setOutcome] = useState<'qualified' | 'not_qualified' | 'follow_up' | ''>('');
  const [budget, setBudget] = useState('');
  const [decision, setDecision] = useState('');
  const [clarity, setClarity] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>();

  const score = calcScore(budget, decision, clarity);
  const needsNotes = recommendation === 'reject' || recommendation === 'follow_up';
  const needsDate = outcome === 'follow_up';

  const isValid =
    outcome !== '' &&
    budget !== '' &&
    decision !== '' &&
    clarity !== '' &&
    recommendation !== '' &&
    (!needsNotes || notes.trim().length > 0) &&
    (!needsDate || followUpDate);

  const handleSubmit = () => {
    if (!isValid) return;
    onSubmit({
      call_outcome: outcome as 'qualified' | 'not_qualified' | 'follow_up',
      budget_readiness: budget as any,
      decision_readiness: decision as any,
      problem_clarity: clarity as any,
      recommendation: recommendation as any,
      notes,
      follow_up_date: followUpDate,
      qualification_score: score,
    });
    // Reset
    setOutcome('');
    setBudget('');
    setDecision('');
    setClarity('');
    setRecommendation('');
    setNotes('');
    setFollowUpDate(undefined);
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">Call abschließen</DialogTitle>
          <DialogDescription>Qualifizierung für <span className="font-semibold text-foreground">{leadName}</span></DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* 1. Outcome */}
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

          {/* 2. Budget */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Budget-Bereitschaft *</Label>
            <RadioGroup value={budget} onValueChange={setBudget} className="mt-2 space-y-1.5">
              {BUDGET_OPTIONS.map(o => (
                <label key={o.value} className={cn(
                  'flex items-center gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors',
                  budget === o.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/20'
                )}>
                  <RadioGroupItem value={o.value} />
                  <o.icon className={cn('h-4 w-4', o.color)} />
                  <span className="text-sm">{o.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* 3. Decision */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Entscheidungsfähigkeit *</Label>
            <RadioGroup value={decision} onValueChange={setDecision} className="mt-2 space-y-1.5">
              {DECISION_OPTIONS.map(o => (
                <label key={o.value} className={cn(
                  'flex items-center gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors',
                  decision === o.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/20'
                )}>
                  <RadioGroupItem value={o.value} />
                  <o.icon className={cn('h-4 w-4', o.color)} />
                  <span className="text-sm">{o.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* 4. Clarity */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Problem-Klarheit *</Label>
            <RadioGroup value={clarity} onValueChange={setClarity} className="mt-2 space-y-1.5">
              {CLARITY_OPTIONS.map(o => (
                <label key={o.value} className={cn(
                  'flex items-center gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors',
                  clarity === o.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/20'
                )}>
                  <RadioGroupItem value={o.value} />
                  <o.icon className={cn('h-4 w-4', o.color)} />
                  <span className="text-sm">{o.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Auto-score display */}
          {budget && decision && clarity && (
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Qualification Score</span>
              <span className={cn(
                'text-lg font-bold',
                score >= 7 ? 'text-primary' : score >= 4 ? 'text-amber-500' : 'text-destructive'
              )}>
                {score}/9
              </span>
            </div>
          )}

          {/* 5. Recommendation */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Empfehlung *</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {RECOMMENDATION_OPTIONS.map(o => (
                <button
                  key={o.value}
                  onClick={() => setRecommendation(o.value)}
                  className={cn(
                    'rounded-lg border-2 px-3 py-2.5 text-center text-xs font-medium transition-all',
                    recommendation === o.value ? o.color : 'border-border hover:border-muted-foreground/30'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* 6. Follow-up date (conditional) */}
          {needsDate && (
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Follow-up Datum *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('mt-2 w-full justify-start text-left font-normal', !followUpDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {followUpDate ? format(followUpDate, 'PPP', { locale: de }) : 'Datum wählen'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={followUpDate}
                    onSelect={setFollowUpDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* 7. Notes */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Notizen {needsNotes && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="mt-2 text-sm min-h-[80px]"
              placeholder={needsNotes ? 'Begründung ist erforderlich…' : 'Gesprächsnotizen…'}
            />
            {needsNotes && !notes.trim() && (
              <p className="mt-1 text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Bei Ablehnung/Follow-up ist eine Begründung Pflicht.
              </p>
            )}
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={onClose}>Abbrechen</Button>
            <Button size="sm" onClick={handleSubmit} disabled={!isValid}>
              Call abschließen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
