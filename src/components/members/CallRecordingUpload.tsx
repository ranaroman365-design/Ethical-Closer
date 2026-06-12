import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, CheckCircle2, Loader2, AlertCircle, Mic } from 'lucide-react';
import { toast } from 'sonner';

const ACCEPTED = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/wav', 'audio/wave', 'audio/x-wav'];
const ACCEPT_ATTR = '.mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav';
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

type Phase = 'idle' | 'uploading' | 'transcribing' | 'completed' | 'failed' | 'skipped';

interface Props {
  callId: string;
}

export default function CallRecordingUpload({ callId }: Props) {
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
      if (mounted && data?.transcript && data.transcript.length > 50) {
        setHasTranscript(true);
        setPhase('completed');
      }
    })();
    return () => { mounted = false; };
  }, [callId]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);

    if (file.size > MAX_BYTES) {
      setError(`Datei zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 100 MB.`);
      setPhase('failed');
      return;
    }
    if (file.type && !ACCEPTED.includes(file.type) && !/\.(mp3|m4a|wav)$/i.test(file.name)) {
      setError(`Format nicht unterstützt: ${file.type || file.name}. Erlaubt: mp3, m4a, wav.`);
      setPhase('failed');
      return;
    }

    try {
      // Idempotency check
      const { data: callRow } = await supabase
        .from('calls')
        .select('transcript')
        .eq('id', callId)
        .maybeSingle();
      if (callRow?.transcript && callRow.transcript.length > 50) {
        setPhase('skipped');
        toast.info('Transkript bereits vorhanden – Upload übersprungen.');
        setHasTranscript(true);
        return;
      }

      setPhase('uploading');
      const ext = (file.name.split('.').pop() || 'mp3').toLowerCase();
      const path = `${callId}/${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('call-recordings')
        .upload(path, file, { contentType: file.type || `audio/${ext}`, upsert: false });

      if (upErr) throw new Error(`Upload fehlgeschlagen: ${upErr.message}`);

      // Update call file_url for traceability
      await supabase.from('calls').update({ file_url: path }).eq('id', callId);

      setPhase('transcribing');

      const { data, error: fnErr } = await supabase.functions.invoke('transcribe-call', {
        body: { call_id: callId, file_path: path },
      });
      if (fnErr) throw new Error(`Transkription fehlgeschlagen: ${fnErr.message}`);
      if (data?.error) throw new Error(`Transkription fehlgeschlagen: ${data.error}`);

      setPhase('completed');
      setHasTranscript(true);
      toast.success('Transkript erstellt – Analyse läuft im Hintergrund.');
    } catch (err: any) {
      const msg = err?.message || 'Unbekannter Fehler';
      setError(msg);
      setPhase('failed');
      toast.error(msg);
    }
  };

  const statusBadge = () => {
    switch (phase) {
      case 'uploading':
        return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Upload läuft…</Badge>;
      case 'transcribing':
        return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Transkription läuft…</Badge>;
      case 'completed':
        return <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Abgeschlossen</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Fehler</Badge>;
      case 'skipped':
        return <Badge variant="outline" className="gap-1">Bereits vorhanden</Badge>;
      default:
        return null;
    }
  };

  const busy = phase === 'uploading' || phase === 'transcribing';

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Call-Aufnahme
          </p>
        </div>
        {statusBadge()}
      </div>

      {hasTranscript ? (
        <p className="text-xs text-muted-foreground">
          Transkript wurde bereits erstellt. Eine zusätzliche Datei wird ignoriert.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Lade die Audio-Aufnahme hoch (mp3, m4a, wav · max. 100 MB), damit das System Transkript, Analyse und Skript-Verbesserung automatisch erzeugen kann.
          </p>
          <label className="block">
            <input
              type="file"
              accept={ACCEPT_ATTR}
              className="sr-only"
              disabled={busy}
              onChange={handleFile}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              asChild
            >
              <span className="cursor-pointer">
                {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-2 h-3.5 w-3.5" />}
                Call-Aufnahme hochladen
              </span>
            </Button>
          </label>
        </>
      )}

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
