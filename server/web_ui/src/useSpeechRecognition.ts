/**
 * useSpeechRecognition — browser SpeechRecognition API wrapper.
 * Chrome/Edge support. Returns transcript and controls.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

interface SpeechState {
  listening: boolean;
  transcript: string;
  error: string | null;
  supported: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SpeechRecognitionAPI: any =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function useSpeechRecognition(): SpeechState {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError]     = useState<string | null>(null);
  const recognitionRef        = useRef<any>(null);

  const supported = !!SpeechRecognitionAPI;

  useEffect(() => {
    if (!supported) return;

    const rec = new SpeechRecognitionAPI();
    rec.continuous  = false;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) {
          final += r[0].transcript;
        } else {
          interim += r[0].transcript;
        }
      }
      setTranscript((prev) => (final ? prev + ' ' + final : prev + interim).trim());
    };

    rec.onerror = (event: any) => {
      setError(event.error === 'no-speech' ? null : `Speech error: ${event.error}`);
      setListening(false);
    };

    rec.onend = () => {
      setListening(false);
    };

    recognitionRef.current = rec;

    return () => {
      try { rec.abort(); } catch { /* ignore */ }
    };
  }, [supported]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setError(null);
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch {
      // Already started — ignore
    }
  }, []);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    recognitionRef.current.stop();
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return { listening, transcript, error, supported, start, stop, reset };
}
