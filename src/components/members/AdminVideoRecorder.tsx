import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Video, Mic, Square, Circle, Upload, RotateCcw, Loader2 } from 'lucide-react';

interface AdminVideoRecorderProps {
  moduleId: string;
  moduleTitle: string;
  mode: 'video' | 'audio';
  onUploaded: (url: string) => void;
  onClose: () => void;
}

export default function AdminVideoRecorder({ moduleId, moduleTitle, mode, onUploaded, onClose }: AdminVideoRecorderProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<'idle' | 'recording' | 'recorded' | 'uploading'>('idle');
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const recordedBlobRef = useRef<Blob | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const constraints = mode === 'video'
        ? { video: { width: 1280, height: 720 }, audio: true }
        : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoPreviewRef.current && mode === 'video') {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.muted = true;
        videoPreviewRef.current.play();
      }

      const mimeType = mode === 'video'
        ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm')
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg');

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        recordedBlobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        setStatus('recorded');

        stream.getTracks().forEach(t => t.stop());
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = null;
          videoPreviewRef.current.src = url;
          videoPreviewRef.current.muted = false;
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setStatus('recording');
    } catch (err: any) {
      toast({ title: 'Kamerazugriff verweigert', description: err.message, variant: 'destructive' });
    }
  }, [mode, toast]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const resetRecording = useCallback(() => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    recordedBlobRef.current = null;
    setStatus('idle');
  }, [recordedUrl]);

  const uploadRecording = useCallback(async () => {
    if (!recordedBlobRef.current) return;
    setStatus('uploading');

    const ext = mode === 'video' ? 'webm' : 'webm';
    const fileName = `${moduleId}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('module-videos')
      .upload(fileName, recordedBlobRef.current, {
        contentType: mode === 'video' ? 'video/webm' : 'audio/webm',
        upsert: true,
      });

    if (error) {
      toast({ title: 'Upload fehlgeschlagen', description: error.message, variant: 'destructive' });
      setStatus('recorded');
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('module-videos').getPublicUrl(fileName);

    // Save URL to module
    await supabase.from('modules').update({ video_url: publicUrl }).eq('id', moduleId);

    toast({ title: mode === 'video' ? 'Video hochgeladen' : 'Audio hochgeladen' });
    onUploaded(publicUrl);
  }, [moduleId, mode, toast, onUploaded]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        {mode === 'video' ? <Video className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        <span>{mode === 'video' ? 'Video' : 'Audio'} aufnehmen für: <strong className="text-foreground">{moduleTitle}</strong></span>
      </div>

      {/* Preview area */}
      {mode === 'video' ? (
        <div className="relative aspect-video overflow-hidden rounded-xl bg-[hsl(220,15%,10%)]">
          <video
            ref={videoPreviewRef}
            className="h-full w-full object-cover"
            playsInline
            controls={status === 'recorded'}
          />
          {status === 'idle' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-[13px] text-muted-foreground">Klicke auf Aufnahme starten</p>
            </div>
          )}
          {status === 'recording' && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-destructive/90 px-3 py-1">
              <Circle className="h-2.5 w-2.5 fill-current text-destructive-foreground animate-pulse" />
              <span className="text-[11px] font-medium text-destructive-foreground">REC</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-xl bg-card border border-border/40 p-8">
          {status === 'idle' && <Mic className="h-12 w-12 text-muted-foreground/30" />}
          {status === 'recording' && (
            <div className="flex flex-col items-center gap-2">
              <div className="h-12 w-12 rounded-full bg-destructive/20 flex items-center justify-center animate-pulse">
                <Mic className="h-6 w-6 text-destructive" />
              </div>
              <span className="text-[12px] text-destructive font-medium">Aufnahme läuft…</span>
            </div>
          )}
          {status === 'recorded' && recordedUrl && (
            <audio src={recordedUrl} controls className="w-full" />
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2">
        {status === 'idle' && (
          <Button onClick={startRecording} className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs">
            <Circle className="mr-1.5 h-3.5 w-3.5 fill-current" />Aufnahme starten
          </Button>
        )}
        {status === 'recording' && (
          <Button onClick={stopRecording} variant="outline" className="flex-1 text-xs border-destructive text-destructive">
            <Square className="mr-1.5 h-3.5 w-3.5 fill-current" />Aufnahme stoppen
          </Button>
        )}
        {status === 'recorded' && (
          <>
            <Button onClick={resetRecording} variant="outline" className="flex-1 text-xs">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Neu aufnehmen
            </Button>
            <Button onClick={uploadRecording} className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 text-xs">
              <Upload className="mr-1.5 h-3.5 w-3.5" />Hochladen & zuweisen
            </Button>
          </>
        )}
        {status === 'uploading' && (
          <Button disabled className="flex-1 text-xs">
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Wird hochgeladen…
          </Button>
        )}
        <Button variant="ghost" size="sm" className="text-xs" onClick={onClose}>Abbrechen</Button>
      </div>
    </div>
  );
}
