import { useState, useRef, useCallback, useEffect } from 'react';

export type ListeningStatus = 'off' | 'live' | 'paused';

interface SpeechRecognitionHook {
  status: ListeningStatus;
  transcript: string;
  interimTranscript: string;
  confidence: number;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  pauseListening: () => void;
  resumeListening: () => void;
  clearTranscript: () => void;
  isSupported: boolean;
  elapsed: number;
}

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

export function useSpeechRecognition(lang: string = 'de'): SpeechRecognitionHook {
  const [status, setStatus] = useState<ListeningStatus>('off');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const isPausedRef = useRef(false);
  const shouldRestartRef = useRef(false);

  const isSupported = typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const createRecognition = useCallback(() => {
    if (!isSupported) return null;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang === 'de' ? 'de-DE' : 'en-US';
    recognition.maxAlternatives = 1;
    return recognition;
  }, [isSupported, lang]);

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now() - (elapsed * 1000);
    timerRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }, [elapsed]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError(lang === 'de' 
        ? 'Spracherkennung wird in diesem Browser nicht unterstuetzt. Bitte Chrome verwenden.' 
        : 'Speech recognition not supported. Please use Chrome.');
      return;
    }

    setError(null);
    isPausedRef.current = false;
    shouldRestartRef.current = true;

    const recognition = createRecognition();
    if (!recognition) return;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let final = '';
      let interim = '';

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript + ' ';
          setConfidence(Math.round(result[0].confidence * 100));
        } else {
          interim += result[0].transcript;
        }
      }

      if (final) {
        setTranscript(prev => prev + final);
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setError(lang === 'de' 
          ? 'Mikrofon-Zugriff verweigert. Bitte in den Browser-Einstellungen erlauben.' 
          : 'Microphone access denied. Please allow in browser settings.');
        setStatus('off');
        shouldRestartRef.current = false;
      }
    };

    recognition.onend = () => {
      // Auto-restart if still supposed to be listening
      if (shouldRestartRef.current && !isPausedRef.current) {
        try {
          recognition.start();
        } catch (e) {
          // Already started
        }
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setStatus('live');
      setElapsed(0);
      startTimeRef.current = Date.now();
      startTimer();
    } catch (e) {
      setError(lang === 'de' ? 'Konnte Spracherkennung nicht starten.' : 'Could not start speech recognition.');
    }
  }, [isSupported, lang, createRecognition, startTimer]);

  const stopListening = useCallback(() => {
    shouldRestartRef.current = false;
    isPausedRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setStatus('off');
    stopTimer();
    setInterimTranscript('');
  }, [stopTimer]);

  const pauseListening = useCallback(() => {
    isPausedRef.current = true;
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
    }
    setStatus('paused');
    stopTimer();
  }, [stopTimer]);

  const resumeListening = useCallback(() => {
    isPausedRef.current = false;
    shouldRestartRef.current = true;
    const recognition = createRecognition();
    if (!recognition) return;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let final = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript + ' ';
          setConfidence(Math.round(result[0].confidence * 100));
        } else {
          interim += result[0].transcript;
        }
      }
      if (final) setTranscript(prev => prev + final);
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
    };

    recognition.onend = () => {
      if (shouldRestartRef.current && !isPausedRef.current) {
        try { recognition.start(); } catch (e) {}
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setStatus('live');
      startTimer();
    } catch (e) {}
  }, [createRecognition, startTimer]);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return {
    status,
    transcript,
    interimTranscript,
    confidence,
    error,
    startListening,
    stopListening,
    pauseListening,
    resumeListening,
    clearTranscript,
    isSupported,
    elapsed,
  };
}
