'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { Logo } from '~/components/Logo';
import { Skeleton } from '~/components/Skeleton';
import { getFirebaseAuthClient } from '~/lib/firebase';

interface NewsDetail {
  item: { id: string; headline: string; body: string; summary: string; category: string; sources: string[]; factChecked: boolean; date: string; };
  detailedSummary: string;
  keyPoints: string[];
  examRelevance: string[];
}

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

export default function NewsDetailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [detail, setDetail] = useState<NewsDetail | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      try {
        const lang = (localStorage.getItem('nexigrate-language') as 'en' | 'hi') || 'en';
        const auth = getFirebaseAuthClient();
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`${API}/v1/current-affairs/${id}?lang=${lang}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load news');
        const data = await res.json() as NewsDetail;
        setDetail(data);
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
      finally { setPageLoading(false); }
    })();
  }, [user, id]);

  const handleLike = async () => {
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API}/v1/current-affairs/${id}/like`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as { liked: boolean; likeCount: number };
        setLiked(data.liked);
        setLikeCount(data.likeCount);
      }
    } catch { /* ignore */ }
  };

  const handleBookmark = async () => {
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API}/v1/current-affairs/${id}/bookmark`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as { bookmarked: boolean };
        setBookmarked(data.bookmarked);
      }
    } catch { /* ignore */ }
  };

  const handleShare = async () => {
    if (!detail) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: detail.item.headline,
          text: `${detail.item.headline} — Nexigrate Current Affairs`,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert('Link copied!');
      }
    } catch { /* user cancelled */ }
  };

  const handleTTS = () => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    if (!detail) return;
    const text = `${detail.item.headline}. ${detail.detailedSummary}. Key points: ${detail.keyPoints.join('. ')}`;
    const utterance = new SpeechSynthesisUtterance(text);
    const lang = (localStorage.getItem('nexigrate-language') as 'en' | 'hi') || 'en';
    utterance.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    utterance.rate = 0.9;
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  const handleAskNexi = () => {
    if (!detail) return;
    // Start a chat conversation about this topic
    const topic = encodeURIComponent(detail.item.headline);
    router.push(`/chat?topic=${topic}`);
  };

  if (loading || !user || pageLoading) return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pt-6 pb-28">
      <div className="space-y-4 mt-8">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-20 w-full" />
      </div>
    </main>
  );

  if (error || !detail) return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-5">
      <div className="banner banner-error">{error || 'News not found'}</div>
      <button onClick={() => router.back()} className="btn-ghost mt-4">← Back</button>
    </main>
  );

  const { item, detailedSummary, keyPoints, examRelevance } = detail;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pt-6 pb-28">
      {/* Header */}
      <header className="flex items-center justify-between">
        <button onClick={() => router.back()} className="btn-ghost-sm">← Back</button>
        <div className="flex items-center gap-2">
          <button onClick={handleTTS} className={`tts-btn ${speaking ? 'playing' : ''}`}>
            {speaking ? '⏸ Pause' : '🔊 Listen'}
          </button>
        </div>
      </header>

      {/* Category + Source */}
      <div className="mt-5 flex items-center gap-2 flex-wrap">
        <span className="pill text-xs">{item.category}</span>
        {item.factChecked && <span className="pill text-xs pill-success">✓ Verified</span>}
        {examRelevance.map(exam => (
          <span key={exam} className="rounded-full bg-ember-500/10 px-2.5 py-0.5 text-xs font-medium text-ember-600">{exam}</span>
        ))}
      </div>

      {/* Headline */}
      <h1 className="mt-4 font-serif text-2xl sm:text-3xl font-bold leading-tight text-ink-900">
        {item.headline}
      </h1>

      {/* Meta */}
      <div className="mt-3 flex items-center gap-3 text-xs text-muted-500">
        <span>📅 {item.date}</span>
        {item.sources.length > 0 && <span>📌 {item.sources.join(', ')}</span>}
      </div>

      {/* Detailed Summary */}
      <section className="mt-6">
        <div className="rounded-xl bg-paper-200/50 border border-line p-5">
          <p className="font-serif text-base leading-relaxed text-ink-900">
            {detailedSummary}
          </p>
        </div>
      </section>

      {/* Key Points */}
      {keyPoints.length > 0 && (
        <section className="mt-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">📋 Key Points for Exams</h2>
          <ul className="mt-3 space-y-3">
            {keyPoints.map((point, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-ember-500 text-xs font-bold text-paper-50">{i + 1}</span>
                <p className="text-sm leading-relaxed text-ink-800">{point}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Exam Relevance */}
      {examRelevance.length > 0 && (
        <section className="mt-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">🎯 Relevant For</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {examRelevance.map(exam => (
              <span key={exam} className="pill text-xs">{exam}</span>
            ))}
          </div>
        </section>
      )}

      {/* Sources */}
      {item.sources.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-muted-500">Sources</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {item.sources.map((src, i) => (
              <span key={i} className="text-xs text-muted-400">📰 {src}</span>
            ))}
          </div>
        </section>
      )}

      {/* Action Bar */}
      <div className="mt-8 flex items-center justify-between rounded-xl bg-paper-200/50 border border-line px-4 py-3">
        <button onClick={handleLike} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-all ${liked ? 'bg-ember-500/10 text-ember-500' : 'text-muted-500 hover:text-ink-900'}`}>
          {liked ? '❤️' : '🤍'} {likeCount > 0 ? likeCount : 'Like'}
        </button>
        <button onClick={handleBookmark} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-all ${bookmarked ? 'bg-gold-500/10 text-gold-600' : 'text-muted-500 hover:text-ink-900'}`}>
          {bookmarked ? '🔖' : '📑'} {bookmarked ? 'Saved' : 'Save'}
        </button>
        <button onClick={handleShare} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-500 hover:text-ink-900 transition-all">
          📤 Share
        </button>
      </div>

      {/* Ask Nexi */}
      <button
        onClick={handleAskNexi}
        className="mt-4 w-full rounded-xl border border-line bg-paper-50 p-4 text-left transition-colors hover:bg-paper-200"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-500/10">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="currentColor" className="text-gold-500"/></svg>
          </span>
          <div>
            <p className="text-sm font-medium text-ink-900">Ask Nexi about this topic</p>
            <p className="text-xs text-muted-500">Get detailed explanations, related topics, PYQ connections</p>
          </div>
        </div>
      </button>

      {/* Quick Revision */}
      <div className="mt-4 paper-card p-4">
        <h3 className="text-sm font-semibold text-ink-900">⚡ Quick Revision</h3>
        <p className="mt-2 text-xs text-muted-500">
          <span className="font-medium text-ink-800">Topic:</span> {item.headline}
        </p>
        <p className="mt-1 text-xs text-muted-500">
          <span className="font-medium text-ink-800">Category:</span> {item.category}
        </p>
        {keyPoints.length > 0 && (
          <p className="mt-1 text-xs text-muted-500">
            <span className="font-medium text-ink-800">Remember:</span> {keyPoints[0]}
          </p>
        )}
      </div>
    </main>
  );
}
