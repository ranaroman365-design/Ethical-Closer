import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { SPRINT_OBJECTION_CODES, OBJECTION_LABELS, type ObjectionCode } from '@/lib/sprint-gap-closure-canon';

interface Props {
  leadId: string;
  onSubmitted?: () => void;
}

/**
 * GAP 4 — Closer kann nach CLOSED_LOST einen Objection-Code setzen,
 * der den Objection-Recovery-Cron auslöst (Tag 1/3/7).
 */
export function ObjectionRecoveryPicker({ leadId, onSubmitted }: Props) {
  const [code, setCode] = useState<ObjectionCode | ''>('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!code) return;
    setLoading(true);
    const next = new Date(Date.now() + 24 * 3600_000).toISOString();
    const { error } = await supabase
      .from('objection_recovery_queue' as any)
      .upsert({
        lead_id: leadId,
        objection_code: code,
        sequence_step: 1,
        next_action_at: next,
        status: 'active',
      } as any, { onConflict: 'lead_id' });

    setLoading(false);
    if (error) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Recovery aktiviert', description: `${OBJECTION_LABELS[code]} → Tag 1/3/7 Sequenz` });
      onSubmitted?.();
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="text-sm font-medium">Objection Recovery aktivieren</div>
      <Select value={code} onValueChange={(v) => setCode(v as ObjectionCode)}>
        <SelectTrigger><SelectValue placeholder="Einwand wählen…" /></SelectTrigger>
        <SelectContent>
          {SPRINT_OBJECTION_CODES.map(c => (
            <SelectItem key={c} value={c}>{OBJECTION_LABELS[c]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={handleSubmit} disabled={!code || loading} className="w-full">
        {loading ? 'Aktiviere…' : '3-Touch-Sequenz starten'}
      </Button>
    </div>
  );
}
