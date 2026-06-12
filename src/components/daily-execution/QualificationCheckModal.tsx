import { useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  leadId?: string;
  appointmentId?: string;
  onSubmit: (data: any) => Promise<boolean | undefined>;
  onClose: () => void;
}

const CHECKS = [
  { key: 'need_confirmed', de: 'Need / Problem erkannt', en: 'Need / Problem identified' },
  { key: 'budget_confirmed', de: 'Budget grundsätzlich vorhanden', en: 'Budget fundamentally available' },
  { key: 'timing_confirmed', de: 'Timing passend', en: 'Timing appropriate' },
  { key: 'decision_maker_confirmed', de: 'Entscheidungsträger identifiziert', en: 'Decision maker identified' },
  { key: 'purpose_clear', de: 'Gesprächszweck klar', en: 'Call purpose clear' },
  { key: 'appointment_confirmed', de: 'Termin bestätigt', en: 'Appointment confirmed' },
] as const;

export default function QualificationCheckModal({ open, leadId, appointmentId, onSubmit, onClose }: Props) {
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => lang === 'de' ? de : en;

  const [checks, setChecks] = useState<Record<string, boolean>>({
    need_confirmed: false,
    budget_confirmed: false,
    timing_confirmed: false,
    decision_maker_confirmed: false,
    purpose_clear: false,
    appointment_confirmed: false,
  });
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const score = Object.values(checks).filter(Boolean).length;
  const hasWarning = score < 4;

  const handleSubmit = async () => {
    setSubmitting(true);
    const success = await onSubmit({
      lead_id: leadId || null,
      appointment_id: appointmentId || null,
      ...checks,
      notes: notes || null,
    });
    setSubmitting(false);
    if (success) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tl('Qualification Check', 'Qualification Check')}</DialogTitle>
          <DialogDescription>{tl('Prüfe alle Punkte vor der Terminbuchung.', 'Verify all points before booking.')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {CHECKS.map(c => (
            <label key={c.key} className="flex items-center gap-3 rounded-lg border border-border/50 p-3 cursor-pointer hover:bg-muted/30 transition-colors">
              <Checkbox
                checked={checks[c.key]}
                onCheckedChange={v => setChecks(prev => ({ ...prev, [c.key]: !!v }))}
              />
              <span className="text-sm">{lang === 'de' ? c.de : c.en}</span>
            </label>
          ))}

          <div>
            <Label className="text-xs">{tl('Notizen (optional)', 'Notes (optional)')}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="mt-1 text-sm" />
          </div>

          {/* Score indicator */}
          <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${hasWarning ? 'bg-amber-500/10 text-amber-700' : 'bg-green-500/10 text-green-700'}`}>
            {hasWarning && <AlertTriangle className="h-4 w-4" />}
            <span className="font-medium">{score}/6 {tl('Punkte bestätigt', 'points confirmed')}</span>
            {hasWarning && <span className="text-xs">— {tl('Achtung: Qualifikation unvollständig', 'Warning: Qualification incomplete')}</span>}
          </div>

          <Button onClick={handleSubmit} disabled={submitting} className="w-full">
            {submitting ? '...' : hasWarning ? tl('Trotzdem buchen', 'Book anyway') : tl('Qualifiziert — buchen', 'Qualified — book')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
