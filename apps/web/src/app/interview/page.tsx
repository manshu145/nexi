'use client';

/**
 * Live Interview (Elite-only) — a real-time AI interviewer on the Gemini Live
 * API. The interviewer speaks (natural voice), sees the candidate via camera,
 * hears their answers, and asks follow-ups in real time. At the end the
 * transcript is scored into a scorecard.
 *
 * Security: the browser uses a short-lived EPHEMERAL token minted by our
 * backend (POST /v1/interview/token) — never the real GEMINI_API_KEY.
 *
 * NOTE: real-time camera/mic — must be tested on a real device. Gated to the
 * Elite (`achiever`) plan to control per-minute cost.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleGenAI, Modality, type Session, type LiveServerMessage } from '@google/genai';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { api, type InterviewReport } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';
import { Logo } from '~/components/Logo';
import { getClientLocale } from '~/lib/locale';
import { MicCapture, PcmPlayer } from '~/lib/liveAudio';

type Phase = 'intro' | 'connecting' | 'live' | 'scoring' | 'report' | 'error';
type Turn = { role: 'interviewer' | 'you'; text: string };

const ELITE = 'achiever';

export default function LiveInterviewPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { user: me, loading: meLoading } = useUser();

  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [caption, setCaption] = useState('');
  const [diag, setDiag] = useState('');
  const [modelInfo, setModelInfo] = useState('');
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [focus, setFocus] = useState('');

  const lang = (getClientLocale() as 'en' | 'hi') || 'en';
  const hi = lang === 'hi';
  const exam = me?.targetExam || '';

  // Live-session refs (kept out of state so re-renders don't recreate them).
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const turnsRef = useRef<Turn[]>([]);
  const kickedOffRef = useRef(false);
  const gotReplyRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (!authLoading && !user) router.replace('/signin'); }, [authLoading, user, router]);

  const pushTurn = useCallback((role: Turn['role'], text: string) => {
    if (!text) return;
    const turns = turnsRef.current;
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.text += text;
    else turns.push({ role, text });
    if (role === 'interviewer') setCaption(turnsRef.current[turnsRef.current.length - 1]?.text.slice(-220) ?? '');
  }, []);

  const cleanup = useCallback(() => {
    if (frameTimerRef.current) { clearInterval(frameTimerRef.current); frameTimerRef.current = null; }
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    try { micRef.current?.stop(); } catch { /* ignore */ }
    try { playerRef.current?.close(); } catch { /* ignore */ }
    try { sessionRef.current?.close(); } catch { /* ignore */ }
    streamRef.current?.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
    micRef.current = null; playerRef.current = null; sessionRef.current = null; streamRef.current = null;
  }, []);

  // Always clean up media on unmount.
  useEffect(() => cleanup, [cleanup]);

  // The opening trigger. Gemini Live never speaks first on its own — it waits
  // for input — so we send a user turn to make the interviewer greet + ask Q1.
  const sendKickoff = useCallback(() => {
    const text = hi
      ? 'नमस्ते, मैं तैयार हूँ। कृपया इंटरव्यू शुरू करें — पहले मेरा अभिवादन करें और फिर पहला सवाल पूछें।'
      : "Hello, I'm ready. Please begin the interview now — greet me, then ask your first question.";
    try {
      sessionRef.current?.sendClientContent({
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      });
    } catch { /* ignore */ }
  }, [hi]);

  const start = useCallback(async () => {
    setError(null);
    setDiag('');
    setModelInfo('');
    setPhase('connecting');
    kickedOffRef.current = false;
    gotReplyRef.current = false;
    setStatus(hi ? 'कैमरा और माइक चालू हो रहा है…' : 'Starting camera & mic…');
    try {
      // 1. Camera + mic.
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }

      // 2. Ephemeral token (Elite-gated server side).
      setStatus(hi ? 'इंटरव्यू तैयार हो रहा है…' : 'Preparing interview…');
      const { token, model, systemInstruction, availableModels, diag: tokenDiag } = await api.getInterviewToken({ exam, lang, ...(focus ? { role: focus } : {}) });
      setModelInfo(`model: ${model} | ${tokenDiag || (availableModels && availableModels.length ? `avail: ${availableModels.join(', ')}` : 'avail: none')}`);

      // 3. Connect to Gemini Live with the token.
      const player = new PcmPlayer(24000);
      await player.resume();
      playerRef.current = player;
      const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } });
      const session = await ai.live.connect({
        model,
        callbacks: {
          onopen: () => { setPhase('live'); setStatus(''); },
          onmessage: (msg: LiveServerMessage) => {
            // Send the opening trigger only AFTER the server's setup handshake,
            // otherwise Gemini Live silently drops the early client content and
            // the interviewer never starts talking.
            if (msg.setupComplete && !kickedOffRef.current) {
              kickedOffRef.current = true;
              sendKickoff();
            }
            const sc = msg.serverContent;
            if (!sc) return;
            if (!gotReplyRef.current) { gotReplyRef.current = true; setDiag(''); setModelInfo(''); }
            if (sc.interrupted) playerRef.current?.interrupt();
            if (sc.outputTranscription?.text) pushTurn('interviewer', sc.outputTranscription.text);
            if (sc.inputTranscription?.text) pushTurn('you', sc.inputTranscription.text);
            for (const part of sc.modelTurn?.parts ?? []) {
              const inline = part.inlineData;
              if (inline?.data && (inline.mimeType ?? '').startsWith('audio/')) playerRef.current?.play(inline.data);
            }
          },
          onerror: (e: ErrorEvent) => {
            setDiag(`connection error: ${e?.message || 'unknown'}`);
            setError(hi ? 'कनेक्शन में दिक्कत आई।' : 'Connection error.');
            setPhase('error');
            cleanup();
          },
          onclose: (e: CloseEvent) => {
            // A clean end (End button) sets phase to scoring/report first; if we
            // are still "live" when the socket closes, the server rejected the
            // session (e.g. bad model / quota) — surface the real reason.
            if (e && e.code !== 1000 && e.reason) setDiag(`closed (${e.code}): ${e.reason}`);
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          temperature: 0.8,
          ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
        },
      });
      sessionRef.current = session;

      // Safety net: if the setupComplete handshake never triggers the kick-off
      // (or the first reply never arrives), fire it directly after a short
      // delay so the interviewer still starts talking instead of going silent.
      retryTimerRef.current = setTimeout(() => {
        if (!gotReplyRef.current) {
          if (!kickedOffRef.current) kickedOffRef.current = true;
          sendKickoff();
        }
      }, 1500);

      // 4. Stream mic → Gemini.
      const mic = new MicCapture((b64) => {
        try { session.sendRealtimeInput({ audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } }); } catch { /* ignore */ }
      });
      mic.start(stream);
      micRef.current = mic;

      // 5. Stream camera frames (~1 every 1.5s) so the interviewer can "see".
      const canvas = document.createElement('canvas');
      frameTimerRef.current = setInterval(() => {
        const v = videoRef.current;
        if (!v || v.videoWidth === 0) return;
        canvas.width = 320; canvas.height = Math.round((v.videoHeight / v.videoWidth) * 320) || 240;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
        if (data) { try { session.sendRealtimeInput({ video: { data, mimeType: 'image/jpeg' } }); } catch { /* ignore */ } }
      }, 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDiag(`start failed: ${msg}`);
      const denied = /denied|permission|notallowed/i.test(msg);
      setError(denied
        ? (hi ? 'कैमरा/माइक की अनुमति दें और दोबारा कोशिश करें।' : 'Please allow camera & mic access and try again.')
        : (hi ? 'इंटरव्यू शुरू नहीं हो पाया। दोबारा कोशिश करें।' : 'Could not start the interview. Please try again.'));
      setPhase('error');
      cleanup();
    }
  }, [hi, exam, lang, focus, pushTurn, cleanup, sendKickoff]);

  const end = useCallback(async () => {
    setPhase('scoring');
    const transcript = turnsRef.current
      .map((t) => `${t.role === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${t.text.trim()}`)
      .filter((l) => l.length > 12)
      .join('\n');
    cleanup();
    if (transcript.length < 20) {
      setError(hi ? 'इंटरव्यू बहुत छोटा था — स्कोर नहीं बना।' : 'Interview too short to score.');
      setPhase('error');
      return;
    }
    try {
      const res = await api.getInterviewReport({ transcript, lang, ...(exam ? { exam } : {}), ...(focus ? { role: focus } : {}) });
      setReport(res.report);
      setPhase('report');
    } catch {
      setError(hi ? 'स्कोरकार्ड नहीं बन पाया।' : 'Could not generate the scorecard.');
      setPhase('error');
    }
  }, [hi, lang, exam, focus, cleanup]);

  if (authLoading || !user || meLoading || !me) {
    return <main className="flex min-h-dvh items-center justify-center"><AILoader context="general" /></main>;
  }

  // ── Elite gate ────────────────────────────────────────────────────────────
  if ((me.plan ?? 'free') !== ELITE) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
        <span className="text-5xl">🎤</span>
        <h1 className="font-serif mt-5 text-2xl font-bold text-ink-900">{hi ? 'लाइव इंटरव्यू' : 'Live Interview'}</h1>
        <p className="mt-3 text-sm text-muted-500">
          {hi
            ? 'AI के साथ रियल-टाइम मॉक इंटरव्यू — कैमरा ऑन, आवाज़ में सवाल-जवाब, और आख़िर में स्कोरकार्ड। यह Elite प्लान का फ़ीचर है।'
            : 'A real-time mock interview with AI — camera on, spoken Q&A, and a scorecard at the end. This is an Elite-plan feature.'}
        </p>
        <button onClick={() => router.push('/upgrade')} className="btn-primary mt-6 w-full">{hi ? 'Elite में अपग्रेड करें' : 'Upgrade to Elite'}</button>
        <button onClick={() => router.push('/dashboard')} className="btn-ghost mt-3 w-full">{hi ? 'वापस' : 'Back'}</button>
      </main>
    );
  }

  // ── Intro ───────────────────────────────────────────────────────────────
  if (phase === 'intro' || phase === 'error') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 py-10">
        <Logo height={34} />
        <span className="mt-8 text-5xl">🎤</span>
        <h1 className="font-serif mt-4 text-2xl font-bold text-ink-900">{hi ? 'लाइव इंटरव्यू' : 'Live Interview'}</h1>
        <p className="mt-2 text-center text-sm text-muted-500">
          {hi ? 'AI इंटरव्यूअर आपसे बात करेगा। शांत जगह चुनें, कैमरा और माइक की अनुमति दें।' : 'An AI interviewer will talk with you. Pick a quiet spot and allow camera & mic.'}
        </p>

        <div className="mt-6 w-full">
          <label className="text-xs font-medium text-muted-500">{hi ? 'फ़ोकस (वैकल्पिक)' : 'Focus (optional)'}</label>
          <input
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder={hi ? 'जैसे: UPSC पर्सनैलिटी टेस्ट, बैंक PO HR' : 'e.g. UPSC personality test, Bank PO HR'}
            className="mt-1 w-full rounded-lg border border-line bg-paper-50 px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-ember-500"
          />
          {exam && <p className="mt-2 text-xs text-muted-400">{hi ? 'लक्ष्य परीक्षा' : 'Target exam'}: {exam}</p>}
        </div>

        {error && <div className="banner banner-error mt-4 w-full text-sm">{error}</div>}
        {modelInfo && <p className="mt-2 w-full break-words text-center text-[11px] text-muted-400">{modelInfo}</p>}
        {diag && <p className="mt-2 w-full break-words text-center text-[11px] text-muted-400">{diag}</p>}

        <button onClick={start} className="btn-primary mt-6 w-full">{hi ? 'इंटरव्यू शुरू करें' : 'Start Interview'}</button>
        <button onClick={() => router.push('/dashboard')} className="btn-ghost mt-3 w-full">{hi ? 'वापस' : 'Back'}</button>
        <p className="mt-4 text-center text-[11px] text-muted-400">{hi ? 'सुझाव: 8–10 सवालों का इंटरव्यू, फिर स्कोरकार्ड।' : 'Tip: an 8–10 question interview, then a scorecard.'}</p>
      </main>
    );
  }

  // ── Scoring ───────────────────────────────────────────────────────────────
  if (phase === 'scoring') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6">
        <AILoader context="general" />
        <p className="text-sm text-muted-500">{hi ? 'आपका स्कोरकार्ड बन रहा है…' : 'Building your scorecard…'}</p>
      </main>
    );
  }

  // ── Report ──────────────────────────────────────────────────────────────
  if (phase === 'report' && report) {
    const Bar = ({ label, value }: { label: string; value: number }) => (
      <div>
        <div className="flex justify-between text-xs text-muted-500"><span>{label}</span><span>{value}/10</span></div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-paper-300"><div className="h-full rounded-full bg-ember-500" style={{ width: `${value * 10}%` }} /></div>
      </div>
    );
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-8 pb-16">
        <div className="flex flex-col items-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-gold-500 bg-paper-200"><span className="text-2xl font-bold text-ink-900">{report.overall}</span></div>
          <h1 className="font-serif mt-4 text-2xl font-bold text-ink-900">{hi ? 'इंटरव्यू रिपोर्ट' : 'Interview Report'}</h1>
          <p className="mt-1 text-sm text-muted-500">{hi ? 'कुल स्कोर' : 'Overall'}: {report.overall}/100</p>
        </div>

        <div className="paper-card mt-6 space-y-4 p-5">
          <Bar label={hi ? 'संवाद (Communication)' : 'Communication'} value={report.communication} />
          <Bar label={hi ? 'आत्मविश्वास (Confidence)' : 'Confidence'} value={report.confidence} />
          <Bar label={hi ? 'विषय-ज्ञान (Content)' : 'Content'} value={report.content} />
        </div>

        {report.summary && <div className="paper-card mt-4 p-4"><p className="text-sm text-ink-800">{report.summary}</p></div>}

        {report.strengths.length > 0 && (
          <div className="mt-4">
            <h2 className="text-sm font-semibold text-ink-900">{hi ? '✅ मज़बूत पक्ष' : '✅ Strengths'}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">{report.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        )}
        {report.improvements.length > 0 && (
          <div className="mt-4">
            <h2 className="text-sm font-semibold text-ink-900">{hi ? '🎯 सुधार के क्षेत्र' : '🎯 Areas to improve'}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">{report.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        )}

        <button onClick={() => { setReport(null); turnsRef.current = []; setCaption(''); setPhase('intro'); }} className="btn-primary mt-7 w-full">{hi ? 'फिर से अभ्यास करें' : 'Practice again'}</button>
        <button onClick={() => router.push('/dashboard')} className="btn-ghost mt-3 w-full">{hi ? 'डैशबोर्ड' : 'Dashboard'}</button>
      </main>
    );
  }

  // ── Connecting / Live ─────────────────────────────────────────────────────
  return (
    <main className="fixed inset-0 flex flex-col bg-ink-900">
      <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-ink-900/40 via-transparent to-ink-900/80" />

      {/* Top status */}
      <div className="relative z-10 flex flex-col gap-1 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-ink-900/60 px-3 py-1 text-xs font-medium text-paper-50 backdrop-blur">
          <span className={`h-2 w-2 rounded-full ${phase === 'live' ? 'bg-red-500 animate-pulse' : 'bg-amber-400'}`} />
          {phase === 'live' ? (hi ? 'लाइव' : 'LIVE') : (hi ? 'जुड़ रहे हैं…' : 'Connecting…')}
        </span>
        {modelInfo && <span className="max-w-full break-words rounded-lg bg-ink-900/60 px-2 py-1 text-[10px] text-paper-50/90 backdrop-blur">{modelInfo}</span>}
        {diag && <span className="max-w-full break-words rounded-lg bg-red-500/80 px-2 py-1 text-[10px] text-paper-50 backdrop-blur">{diag}</span>}
      </div>

      {/* Connecting overlay */}
      {phase === 'connecting' && (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3">
          <AILoader context="general" />
          <p className="text-sm text-paper-50/90">{status}</p>
        </div>
      )}

      {/* Live: caption + end button */}
      {phase === 'live' && (
        <div className="relative z-10 mt-auto flex flex-col items-center px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <div className="mx-auto mb-4 min-h-[3.5rem] w-full max-w-md rounded-2xl bg-ink-900/65 px-4 py-3 text-center text-sm text-paper-50 backdrop-blur">
            {caption || (hi ? 'इंटरव्यूअर बात शुरू कर रहा है… सुनिए और जवाब दीजिए।' : 'The interviewer is starting… listen, then answer.')}
          </div>
          <button onClick={end} className="rounded-full bg-red-500 px-8 py-3.5 text-sm font-bold text-paper-50 shadow-lg transition-all active:scale-95 hover:bg-red-600">
            {hi ? 'इंटरव्यू ख़त्म करें' : 'End Interview'}
          </button>
        </div>
      )}
    </main>
  );
}
