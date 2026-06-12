import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ClipboardPaste, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  callId: string;
}

type Phase = 'idle' | 'saving' | 'completed' | 'failed' | 'skipped';

const MIN_LENGTH = 50;

export default function CallTranscriptPaste({ callId }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hasTranscript, setHasTranscript] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from('calls')
        .select('transcript')
        .eq('id', callId)
        .maybeSingle();
      if (mounted && data?.transcript && data.transcript.length > MIN_LENGTH) {
        setHasTranscript(true);
        setPhase('completed');
      }
    })();
    return () => { mounted = false; };
  }, [callId]);

  const handleSave = async () => {
    setError(null);
    const trimmed = text.trim();
    if (trimmed.length < MIN_LENGTH) {
      setError(`Mindestens ${MIN_LENGTH} Zeichen erforderlich (aktuell ${trimmed.length}).`);
      setPhase('failed');
      return;
    }

    try {
      // Idempotency check — never overwrite
      const { data: existing } = await supabase
        .from('calls')
        .select('transcript')
        .eq('id', callId)
        .maybeSingle();
      if (existing?.transcript && existing.transcript.length > MIN_LENGTH) {
        setHasTranscript(true);
        setPhase('skipped');
        toast.info('Transkript bereits vorhanden – Eingabe übersprungen.');
        return;
      }

      setPhase('saving');
      const { error: upErr } = await supabase
        .from('calls')
        .update({ transcript: trimmed, transcript_created_at: new Date().toISOString() })
        .eq('id', callId);
      if (upErr) throw new Error(upErr.message);

      // Verify analysis was enqueued by the DB trigger
      const { data: queued } = await supabase
        .from('pending_call_analyses')
        .select('id')
        .eq('call_id', callId)
        .limit(1);

      setPhase('completed');
      setHasTranscript(true);
      setText('');
      setOpen(false);
      toast.success(
        queued && queued.length > 0
          ? 'Transkript gespeichert – Analyse wurde in die Queue eingereiht.'
          : 'Transkript gespeichert.'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      setError(msg);
      setPhase('failed');
      toast.error(msg);
    }
  };

  if (hasTranscript) {
    return (
      <Badge variant="outline" className="gap-1 text-[10px]">
        <CheckCircle2 className="h-3 w-3" /> Transkript vorhanden
      </Badge>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-[11px]"
        onClick={() => setOpen(true)}
      >
        <ClipboardPaste className="h-3.5 w-3.5" />
        Transkript einfügen
      </Button>
    );
  }

  const busy = phase === 'saving';

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Transkript einfügen
        </p>
        {phase === 'saving' && (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Loader2 className="h-3 w-3 animate-spin" /> Speichern…
          </Badge>
        )}
        {phase === 'failed' && (
          <Badge variant="destructive" className="gap-1 text-[10px]">
            <AlertCircle className="h-3 w-3" /> Fehler
          </Badge>
        )}
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Füge hier den vollständigen Call-Transkript-Text ein (mind. 50 Zeichen)…"
        className="min-h-[120px] text-xs"
        disabled={busy}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground">
          {text.trim().length} Zeichen
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => { setOpen(false); setText(''); setError(null); setPhase('idle'); }}
            disabled={busy}
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 text-[11px]"
            onClick={handleSave}
            disabled={busy || text.trim().length < MIN_LENGTH}
          >
            {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Speichern
          </Button>
        </div>
      </div>
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
}
