'use client';

import { useRef, useState } from 'react';
import { api } from '~/lib/api';

interface Props {
  text: string;
  language?: string;
}

export function TextToSpeech({ text, language = 'en-IN' }: Props) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function handleToggle() {
    if (playing) {
      stop();
      return;
    }

    setLoading(true);
    try {
      const res = await api.tts.synthesize(text, language);

      if (res.mode === 'server' && res.audioBase64) {
        // Server-rendered audio (Google Cloud TTS)
        const audioSrc = `data:audio/mp3;base64,${res.audioBase64}`;
        const audio = new Audio(audioSrc);
        audioRef.current = audio;
        audio.onended = () => setPlaying(false);
        audio.play();
        setPlaying(true);
      } else {
        // Client-side Web Speech API fallback
        if (!window.speechSynthesis) {
          throw new Error('Speech synthesis not supported');
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(res.text || text.slice(0, 5000));
        utterance.lang = language;
        utterance.rate = 0.9;
        utterance.onend = () => setPlaying(false);
        utterance.onerror = () => setPlaying(false);
        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
        setPlaying(true);
      }
    } catch {
      // Final fallback: direct Web Speech API
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text.slice(0, 5000));
        utterance.lang = language;
        utterance.rate = 0.9;
        utterance.onend = () => setPlaying(false);
        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
        setPlaying(true);
      }
    }
    setLoading(false);
  }

  function stop() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setPlaying(false);
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`tts-btn ${playing ? 'playing' : ''}`}
      title={playing ? 'Stop listening' : 'Listen to this'}
    >
      {loading ? (
        <span className="spinner" style={{ width: 12, height: 12 }} />
      ) : playing ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="currentColor" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )}
      {playing ? 'Stop' : 'Listen'}
    </button>
  );
}
