import { useState, useRef, useCallback, useEffect } from 'react';

export type RecorderState = 'idle' | 'recording' | 'preview' | 'uploading';

const MAX_DURATION = 180; // 3 minutes
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 10;

function getSupportedMimeType(): string {
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  return 'audio/webm';
}

function getFileExtension(mime: string): string {
  if (mime.includes('mp4')) return 'mp4';
  return 'webm';
}

export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const recordTimestamps = useRef<number[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [audioUrl]);

  const checkRateLimit = useCallback((): boolean => {
    const now = Date.now();
    recordTimestamps.current = recordTimestamps.current.filter(t => now - t < RATE_LIMIT_WINDOW);
    if (recordTimestamps.current.length >= RATE_LIMIT_MAX) {
      setError('Zu viele Aufnahmen. Bitte warte kurz.');
      return false;
    }
    recordTimestamps.current.push(now);
    return true;
  }, []);

  const startRecording = useCallback(async () => {
    if (state !== 'idle') return;
    if (!checkRateLimit()) return;

    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setState('preview');
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start(250); // collect data every 250ms for smooth stop
      startTimeRef.current = Date.now();
      setState('recording');

      timerRef.current = window.setInterval(() => {
        const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsed(secs);
        if (secs >= MAX_DURATION) {
          recorder.stop();
          if (timerRef.current) clearInterval(timerRef.current);
        }
      }, 250);
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Mikrofon-Zugriff wurde verweigert. Bitte erlaube den Zugriff in den Browser-Einstellungen.');
      } else if (err.name === 'NotFoundError') {
        setError('Kein Mikrofon gefunden.');
      } else {
        setError('Aufnahme konnte nicht gestartet werden.');
      }
    }
  }, [state, checkRateLimit]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const discardRecording = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setElapsed(0);
    setState('idle');
    setError(null);
  }, [audioUrl]);

  const getFileInfo = useCallback(() => {
    const mime = getSupportedMimeType();
    return { mimeType: mime, extension: getFileExtension(mime) };
  }, []);

  return {
    state,
    setState,
    elapsed,
    audioBlob,
    audioUrl,
    error,
    startRecording,
    stopRecording,
    discardRecording,
    getFileInfo,
    maxDuration: MAX_DURATION,
  };
}
