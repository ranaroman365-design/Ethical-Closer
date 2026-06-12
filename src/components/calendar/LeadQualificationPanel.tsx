/**
 * LeadQualificationPanel — Calendar Command Center
 * Inline lead qualification from appointment detail.
 * Writes directly to leads table (single source of truth).
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Save, CheckCircle2, UserCheck, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  leadId: string;
  appointmentId?: string;
  onSaved?: () => void;
  onReadyToClose?: () => void;
}

type QualData = {
  qualification_status: string | null;
  qualification_notes: string | null;
  pain_points: string | null;
  motivation: string | null;
  sales_experience: string | null;
  financial_readiness: string | null;
  urgency: string | null;
  objection_status: string | null;
  fit_score: number | null;
  next_step: string | null;
  setter_budget_readiness: string | null;
  setter_decision_readiness: string | null;
  setter_problem_clarity: string | null;
  setter_recommendation: string | null;
};

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Ausstehend', color: 'bg-muted text-muted-foreground' },
  { value: 'in_progress', label: 'In Bearbeitung', color: 'bg-blue-500/15 text-blue-700' },
  { value: 'qualified', label: 'Qualifiziert', color: 'bg-emerald-500/15 text-emerald-700' },
  { value: 'disqualified', label: 'Disqualifiziert', color: 'bg-red-500/15 text-red-700' },
  { value: 'follow_up', label: 'Follow-Up nötig', color: 'bg-amber-500/15 text-amber-700' },
  { value: 'ready_to_close', label: 'Ready to Close', color: 'bg-primary/15 text-primary' },
];

const READINESS_OPTIONS = [
  { value: '', label: 'Nicht bewertet' },
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
];

const URGENCY_OPTIONS = [
  { value: '', label: 'Nicht bewertet' },
  { value: 'low', label: 'Gering' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
  { value: 'immediate', label: 'Sofort' },
];

export function LeadQualificationPanel({ leadId, appointmentId, onSaved, onReadyToClose }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<QualData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: lead, error } = await supabase
      .from('leads')
      .select('qualification_status, qualification_notes, pain_points, motivation, sales_experience, financial_readiness, urgency, objection_status, fit_score, next_step, setter_budget_readiness, setter_decision_readiness, setter_problem_clarity, setter_recommendation')
      .eq('id', leadId)
      .maybeSingle();
    if (error) {
      console.error('[LeadQual] load error', error);
    }
    setData(lead as QualData | null);
    setLoading(false);
    setDirty(false);
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  const update = (field: keyof QualData, value: any) => {
    if (!data) return;
    setData({ ...data, [field]: value });
    setDirty(true);
  };

  const save = async () => {
    if (!data || !user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('leads')
        .update({
          qualification_status: data.qualification_status,
          qualification_notes: data.qualification_notes,
          pain_points: data.pain_points,
          motivation: data.motivation,
          sales_experience: data.sales_experience,
          financial_readiness: data.financial_readiness,
          urgency: data.urgency,
          objection_status: data.objection_status,
          fit_score: data.fit_score,
          next_step: data.next_step,
          setter_budget_readiness: data.setter_budget_readiness,
          setter_decision_readiness: data.setter_decision_readiness,
          setter_problem_clarity: data.setter_problem_clarity,
          setter_recommendation: data.setter_recommendation,
        } as any)
        .eq('id', leadId);

      if (error) throw error;

      // Log event
      await supabase.rpc('log_calendar_event', {
        p_event_type: 'lead_qualification_updated',
        p_appointment_id: appointmentId || null,
        p_lead_id: leadId,
        p_metadata: { qualification_status: data.qualification_status, fit_score: data.fit_score },
      });

      setDirty(false);
      toast({ title: 'Qualifizierung gespeichert' });
      onSaved?.();

      if (data.qualification_status === 'ready_to_close') {
        onReadyToClose?.();
      }
    } catch (e: any) {
      toast({ title: 'Fehler', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-6 text-center text-sm text-muted-foreground">Lade Qualifizierungsdaten…</div>;
  }

  if (!data) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
        <AlertTriangle className="h-4 w-4" /> Lead-Daten nicht verfügbar
      </div>
    );
  }

  const currentStatus = STATUS_OPTIONS.find(s => s.value === data.qualification_status) || STATUS_OPTIONS[0];

  return (
    <div className="space-y-4">
      {/* Status */}
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Qualifizierungsstatus
        </Label>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => update('qualification_status', opt.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                data.qualification_status === opt.value
                  ? cn(opt.color, 'ring-2 ring-primary/30')
                  : 'bg-muted/30 text-muted-foreground border-border hover:bg-muted/50'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <Label className="text-xs">Gesprächsnotizen</Label>
        <Textarea
          value={data.qualification_notes || ''}
          onChange={e => update('qualification_notes', e.target.value)}
          placeholder="Was wurde besprochen? Kernerkenntnisse..."
          className="mt-1 min-h-[80px]"
        />
      </div>

      {/* Pain / Motivation */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Pain Points</Label>
          <Textarea
            value={data.pain_points || ''}
            onChange={e => update('pain_points', e.target.value)}
            placeholder="Hauptprobleme..."
            className="mt-1 min-h-[60px]"
          />
        </div>
        <div>
          <Label className="text-xs">Motivation</Label>
          <Textarea
            value={data.motivation || ''}
            onChange={e => update('motivation', e.target.value)}
            placeholder="Warum jetzt?"
            className="mt-1 min-h-[60px]"
          />
        </div>
      </div>

      {/* Readiness Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Budget-Bereitschaft</Label>
          <Select value={data.setter_budget_readiness || ''} onValueChange={v => update('setter_budget_readiness', v || null)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Wählen..." /></SelectTrigger>
            <SelectContent>
              {READINESS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Entscheidungsbereitschaft</Label>
          <Select value={data.setter_decision_readiness || ''} onValueChange={v => update('setter_decision_readiness', v || null)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Wählen..." /></SelectTrigger>
            <SelectContent>
              {READINESS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Dringlichkeit</Label>
          <Select value={data.urgency || ''} onValueChange={v => update('urgency', v || null)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Wählen..." /></SelectTrigger>
            <SelectContent>
              {URGENCY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Problemklarheit</Label>
          <Select value={data.setter_problem_clarity || ''} onValueChange={v => update('setter_problem_clarity', v || null)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Wählen..." /></SelectTrigger>
            <SelectContent>
              {READINESS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Objection & Experience */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Einwandlage</Label>
          <Textarea
            value={data.objection_status || ''}
            onChange={e => update('objection_status', e.target.value)}
            placeholder="Welche Einwände?"
            className="mt-1 min-h-[50px]"
          />
        </div>
        <div>
          <Label className="text-xs">Sales Experience</Label>
          <Textarea
            value={data.sales_experience || ''}
            onChange={e => update('sales_experience', e.target.value)}
            placeholder="Vorherige Erfahrung..."
            className="mt-1 min-h-[50px]"
          />
        </div>
      </div>

      {/* Fit Score */}
      <div>
        <Label className="text-xs">Fit Score (0–100)</Label>
        <div className="flex items-center gap-3 mt-1">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={data.fit_score ?? 50}
            onChange={e => update('fit_score', parseInt(e.target.value))}
            className="flex-1"
          />
          <Badge variant="outline" className="text-sm font-mono w-12 justify-center">
            {data.fit_score ?? 50}
          </Badge>
        </div>
      </div>

      {/* Next Step & Recommendation */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Nächster Schritt</Label>
          <Select value={data.next_step || ''} onValueChange={v => update('next_step', v || null)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Wählen..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Offen</SelectItem>
              <SelectItem value="follow_up_call">Follow-Up Call</SelectItem>
              <SelectItem value="closer_call">Closer Call</SelectItem>
              <SelectItem value="send_info">Info senden</SelectItem>
              <SelectItem value="disqualify">Disqualifizieren</SelectItem>
              <SelectItem value="ready_to_close">Ready to Close</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Empfehlung</Label>
          <Select value={data.setter_recommendation || ''} onValueChange={v => update('setter_recommendation', v || null)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Wählen..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Keine</SelectItem>
              <SelectItem value="close_ready">Zum Closer</SelectItem>
              <SelectItem value="needs_nurture">Braucht Nurturing</SelectItem>
              <SelectItem value="not_a_fit">Kein Fit</SelectItem>
              <SelectItem value="high_potential">Hohes Potenzial</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2">
        <Button onClick={save} disabled={saving || !dirty} className="flex-1 gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {dirty ? 'Speichern' : 'Gespeichert'}
        </Button>
        {data.qualification_status === 'ready_to_close' && (
          <Button variant="outline" onClick={onReadyToClose} className="gap-2">
            <UserCheck className="h-4 w-4" /> Closer zuweisen
          </Button>
        )}
      </div>

      {dirty && (
        <p className="text-[11px] text-amber-600 text-center">Ungespeicherte Änderungen</p>
      )}
    </div>
  );
}
