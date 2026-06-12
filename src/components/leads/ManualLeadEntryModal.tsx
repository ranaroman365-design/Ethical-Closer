import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, UserPlus, Loader2, AlertCircle } from 'lucide-react';
import { useManualLeadEntry, type ManualLeadData } from '@/hooks/useManualLeadEntry';
import { cn } from '@/lib/utils';

interface ManualLeadEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeadCreated?: (leadId: string) => void;
}

const SUBSOURCE_OPTIONS = [
  { value: 'referral', label: 'Empfehlung / Referral' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'event', label: 'Event / Networking' },
  { value: 'inbound_call', label: 'Eingehender Anruf' },
  { value: 'other', label: 'Sonstige' },
];

const INCOME_RANGES = [
  { value: 'under_2k', label: 'Unter 2.000€' },
  { value: '2k_4k', label: '2.000€ – 4.000€' },
  { value: '4k_6k', label: '4.000€ – 6.000€' },
  { value: '6k_10k', label: '6.000€ – 10.000€' },
  { value: 'over_10k', label: 'Über 10.000€' },
];

const initialForm: ManualLeadData = {
  full_name: '',
  email: '',
  phone: '',
  funnel_subsource: '',
  current_income_range: '',
  goal: '',
  commitment_level: 5,
};

export default function ManualLeadEntryModal({ open, onOpenChange, onLeadCreated }: ManualLeadEntryModalProps) {
  const [form, setForm] = useState<ManualLeadData>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<keyof ManualLeadData, string>>>({});
  const [duplicateWarning, setDuplicateWarning] = useState<{ exists: boolean; name?: string; leadId?: string } | null>(null);
  const { submitLead, checkDuplicate, isSubmitting } = useManualLeadEntry();

  const updateField = <K extends keyof ManualLeadData>(key: K, value: ManualLeadData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }));
  };

  const handleEmailBlur = useCallback(async () => {
    const email = form.email.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    const result = await checkDuplicate(email);
    setDuplicateWarning(result.exists ? result : null);
  }, [form.email, checkDuplicate]);

  const validate = (): boolean => {
    const newErrors: typeof errors = {};
    if (!form.full_name.trim()) newErrors.full_name = 'Name ist erforderlich';
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) newErrors.email = 'Gültige E-Mail erforderlich';
    if (!form.phone.trim() || form.phone.trim().length < 6) newErrors.phone = 'Telefonnummer erforderlich';
    if (!form.funnel_subsource) newErrors.funnel_subsource = 'Quelle auswählen';
    if (!form.current_income_range) newErrors.current_income_range = 'Einkommensbereich auswählen';
    if (!form.goal.trim()) newErrors.goal = 'Ziel angeben';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const result = await submitLead(form);
    if (result) {
      onLeadCreated?.(result.leadId);
      setForm(initialForm);
      setDuplicateWarning(null);
      setErrors({});
      onOpenChange(false);
    }
  };

  const handleClose = () => {
    setForm(initialForm);
    setErrors({});
    setDuplicateWarning(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Lead manuell hinzufügen
          </DialogTitle>
          <DialogDescription>
            Operator Override — Lead wird direkt als qualifiziert in den Funnel eingespeist.
          </DialogDescription>
        </DialogHeader>

        {/* Source Tag */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-xs">Quelle: manual</Badge>
          <span>Wird automatisch als manueller Eintrag getaggt</span>
        </div>

        {/* SECTION 1 — Basic Data */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Kontaktdaten</h4>

          <div className="space-y-1.5">
            <Label htmlFor="ml-name">Vollständiger Name *</Label>
            <Input
              id="ml-name"
              placeholder="Max Mustermann"
              value={form.full_name}
              onChange={e => updateField('full_name', e.target.value)}
              maxLength={100}
              className={cn(errors.full_name && 'border-destructive')}
            />
            {errors.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ml-email">E-Mail *</Label>
            <Input
              id="ml-email"
              type="email"
              placeholder="max@beispiel.de"
              value={form.email}
              onChange={e => updateField('email', e.target.value)}
              onBlur={handleEmailBlur}
              maxLength={255}
              className={cn(errors.email && 'border-destructive')}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            {duplicateWarning?.exists && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>Lead „{duplicateWarning.name}" existiert bereits mit dieser E-Mail.</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ml-phone">Telefon *</Label>
            <Input
              id="ml-phone"
              type="tel"
              placeholder="+49 170 1234567"
              value={form.phone}
              onChange={e => updateField('phone', e.target.value)}
              maxLength={30}
              className={cn(errors.phone && 'border-destructive')}
            />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
          </div>
        </div>

        {/* SECTION 2 — Source Tracking */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Herkunft</h4>
          <div className="space-y-1.5">
            <Label>Woher kommt der Lead? *</Label>
            <Select value={form.funnel_subsource} onValueChange={v => updateField('funnel_subsource', v)}>
              <SelectTrigger className={cn(errors.funnel_subsource && 'border-destructive')}>
                <SelectValue placeholder="Quelle auswählen..." />
              </SelectTrigger>
              <SelectContent>
                {SUBSOURCE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.funnel_subsource && <p className="text-xs text-destructive">{errors.funnel_subsource}</p>}
          </div>
        </div>

        {/* SECTION 3 — Mini Qualification */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Kurzqualifizierung</h4>

          <div className="space-y-1.5">
            <Label>Aktuelles Einkommen *</Label>
            <Select value={form.current_income_range} onValueChange={v => updateField('current_income_range', v)}>
              <SelectTrigger className={cn(errors.current_income_range && 'border-destructive')}>
                <SelectValue placeholder="Einkommensbereich..." />
              </SelectTrigger>
              <SelectContent>
                {INCOME_RANGES.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.current_income_range && <p className="text-xs text-destructive">{errors.current_income_range}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ml-goal">Ziel des Leads *</Label>
            <Textarea
              id="ml-goal"
              placeholder="Was möchte der Lead erreichen?"
              value={form.goal}
              onChange={e => updateField('goal', e.target.value)}
              maxLength={500}
              rows={2}
              className={cn(errors.goal && 'border-destructive')}
            />
            {errors.goal && <p className="text-xs text-destructive">{errors.goal}</p>}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Commitment-Level</Label>
              <Badge variant={form.commitment_level >= 7 ? 'default' : form.commitment_level >= 4 ? 'secondary' : 'outline'}>
                {form.commitment_level}/10
              </Badge>
            </div>
            <Slider
              min={1}
              max={10}
              step={1}
              value={[form.commitment_level]}
              onValueChange={([v]) => updateField('commitment_level', v)}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Niedrig</span>
              <span>Hoch</span>
            </div>
          </div>
        </div>

        {/* Warning for low commitment */}
        {form.commitment_level <= 3 && (
          <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>Niedriges Commitment. Manuelle Leads sollten ein Mindest-Commitment aufweisen, um Funnel-Qualität zu sichern.</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} className="flex-1" disabled={isSubmitting}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} className="flex-1" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
            Lead erstellen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
