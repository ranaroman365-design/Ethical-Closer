import { useCallback } from 'react';
import { Mic, Square, Trash2, Send, AlertTriangle } from 'lucide-react';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import AudioPlayer from './AudioPlayer';

interface Props {
  onSent?: (fileUrl: string, duration: number) => void;
  onCancel?: () => void;
  contextType?: 'chat' | 'academy' | 'feedback';
  contextId?: string;
  targetUserId?: string;
}

function formatTimer(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function AudioRecorder({ onSent, onCancel, contextType = 'chat', contextId, targetUserId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    state, setState, elapsed, audioBlob, audioUrl, error,
    startRecording, stopRecording, discardRecording, getFileInfo, maxDuration,
  } = useAudioRecorder();

  const handleSend = useCallback(async () => {
    if (!audioBlob || !user) return;
    setState('uploading');

    try {
      const { extension } = getFileInfo();
      const fileName = `${user.id}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from('audio-messages')
        .upload(fileName, audioBlob, { contentType: audioBlob.type, upsert: false });

      if (uploadError) throw uploadError;

      // Store metadata
      await supabase.from('audio_messages' as any).insert({
        user_id: user.id,
        target_user_id: targetUserId || null,
        context_type: contextType,
        context_id: contextId || null,
        file_path: fileName,
        duration: elapsed,
      } as any);

      onSent?.(fileName, elapsed);
      discardRecording();
    } catch (err: any) {
      toast({ title: 'Fehler', description: err.message || 'Upload fehlgeschlagen', variant: 'destructive' });
      setState('preview');
    }
  }, [audioBlob, user, elapsed, contextType, contextId, targetUserId, onSent, discardRecording, getFileInfo, setState, toast]);

  const handleCancel = useCallback(() => {
    discardRecording();
    onCancel?.();
  }, [discardRecording, onCancel]);

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-destructive">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>{error}</span>
        <button onClick={handleCancel} className="ml-auto text-muted-foreground hover:text-foreground text-[10px]">
          Schließen
        </button>
      </div>
    );
  }

  // Idle state — just the mic button (rendered by parent usually)
  if (state === 'idle') {
    return (
      <button
        onClick={startRecording}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
        title="Sprachnachricht aufnehmen"
      >
        <Mic className="h-4 w-4" />
      </button>
    );
  }

  // Recording state
  if (state === 'recording') {
    return (
      <div className="flex items-center gap-2 w-full">
        <div className="flex items-center gap-1.5 flex-1">
          <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-xs font-medium text-destructive tabular-nums">
            {formatTimer(elapsed)}
          </span>
          <div className="flex-1 h-1 rounded-full bg-destructive/20 overflow-hidden">
            <div
              className="h-full bg-destructive/50 transition-all"
              style={{ width: `${(elapsed / maxDuration) * 100}%` }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground">{formatTimer(maxDuration)}</span>
        </div>
        <button
          onClick={handleCancel}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-destructive transition-colors"
          title="Verwerfen"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={stopRecording}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity"
          title="Stoppen"
        >
          <Square className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // Preview state
  if (state === 'preview' || state === 'uploading') {
    return (
      <div className="flex items-center gap-2 w-full">
        <div className="flex-1 min-w-0">
          {audioUrl && <AudioPlayer src={audioUrl} duration={elapsed} compact />}
        </div>
        <button
          onClick={handleCancel}
          disabled={state === 'uploading'}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-destructive disabled:opacity-40 transition-colors"
          title="Verwerfen"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleSend}
          disabled={state === 'uploading'}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
          title="Senden"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return null;
}
