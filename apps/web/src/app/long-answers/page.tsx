'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  EXAM_BY_SLUG,
  LONG_ANSWER_LENGTH_HINTS,
  type LongAnswerAttemptSummary,
  type LongAnswerQuestion,
} from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api, type MeResponse } from '~/lib/api';

/**
 * /long-answers -- Phase 18 student page for descriptive-answer practice.
 *
 * Lists curated questions for the student's target exam plus a "my recent
 * attempts" panel up top so they can jump back to a graded answer.
 *
 * Submission cost is shown on each card so the student knows the price
 * before opening the writer.
 */
export default function LongAnswersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [questions, setQuestions] = useState<LongAnswerQuestion[] | null>(null);
  const [attempts, setAttempts] = useState<LongAnswerAttemptSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const meRes = await api.me();
        if (cancelled) return;
        setMe(meRes.user);
        const exam = meRes.user.targetExam;
        const [qRes, aRes] = await Promise.all([
          exam
            ? api.longAnswers.list({ exam, limit: 100 })
            : api.longAnswers.list({ limit: 100 }),
          api.longAnswers.myAttempts(20).catch(() => ({ attempts: [] })),
        ]);
        if (cancelled) return;
        setQuestions(qRes.questions);
        setAttempts(aRes.attempts);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'failed to load questions');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const grouped = useMemo(() => {
    if (!questions) return new Map<string, LongAnswerQuestion[]>();
    const map = new Map<string, LongAnswerQuestion[]>();
    for (const q of questions) {
      const arr = map.get(q.subject) ?? [];
      arr.push(q);
      map.set(q.subject, arr);
    }
    for (const [k, v] of map) {
      v.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      map.set(k, v);
    }
    return map;
  }, [questions]);

  if (loading || !user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading...
        </span>
      </main>
    );
  }

  const examName = me?.targetExam ? EXAM_BY_SLUG.get(me.targetExam)?.name : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 pt-6 pb-24 sm:px-6 sm:pt-8 sm:pb-16">
      <header className="flex items-start justify-between">
        <Logo />
        <Link href="/dashboard" className="btn-ghost-sm">
          Dashboard
        </Link>
      </header>

      <section className="mt-10">
        <p className="pill mb-3">Long-form practice</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          Write. Submit. Get marked.
        </h1>
        <p className="mt-2 text-ink-800">
          Real exam questions, AI-graded on the same 5-axis rubric a marker
          would use.{' '}
          {examName ? (
            <>
              Curated for <span className="font-medium">{examName}</span>.
            </>
          ) : null}{' '}
          Each submission costs <span className="font-medium">30 credits</span>.
        </p>
      </section>

      {attempts && attempts.length > 0 ? (
        <section className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
            Recent attempts
          </p>
          <div className="mt-3 grid gap-2">
            {attempts.slice(0, 5).map((a) => (
              <Link
                key={a.id}
                href={`/long-answers/attempts/${encodeURIComponent(a.id)}`}
                className="paper-card flex items-start justify-between gap-3 p-4 transition hover:bg-paper-200/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm text-ink-800">{a.questionPrompt}</p>
                  <p className="mt-1 text-xs text-muted-500">
                    {a.wordCount} words · {timeAgo(a.submittedAt)}
                  </p>
                </div>
                <ScorePill status={a.status} overall={a.overall} />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="banner banner-error mt-6" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      {!questions && !error ? (
        <p className="mt-8 text-sm text-muted-500">Loading questions...</p>
      ) : null}

      {questions && questions.length === 0 ? (
        <AILongAnswerGenerator exam={me?.targetExam ?? ''} />
      ) : null}

      {questions && questions.length > 0 ? (
        <section className="mt-8 flex flex-col gap-8">
          {Array.from(grouped.entries()).map(([subject, list]) => (
            <div key={subject}>
              <h2 className="font-serif text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
                {subject}
              </h2>
              <div className="mt-3 grid gap-3">
                {list.map((q) => {
                  const len = LONG_ANSWER_LENGTH_HINTS[q.expectedLength];
                  return (
                    <Link
                      key={q.id}
                      href={`/long-answers/${encodeURIComponent(q.slug)}`}
                      className="paper-card block p-5 transition hover:bg-paper-200/40"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
                        {q.source}
                      </p>
                      <p className="font-serif mt-2 line-clamp-3 text-base font-medium leading-snug text-ink-900">
                        {q.prompt}
                      </p>
                      <p className="mt-3 text-xs text-muted-500">
                        {len.label} · 30 credits to submit
                      </p>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}

/**
 * AI-powered long-answer practice when Firestore is empty.
 * Generates MCQ-style practice questions from AI on-demand.
 */
function AILongAnswerGenerator({ exam }: { exam: string }) {
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [mcqs, setMcqs] = useState<Array<{
    question: string;
    options: { key: string; text: string }[];
    correctOption: string;
    explanation: string;
    subject: string;
  }> | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  async function onGenerate() {
    if (!topic.trim()) return;
    setGenerating(true);
    setGenError(null);
    setMcqs(null);
    setRevealed({});
    try {
      const res = await api.ai.generateMcqs(topic.trim(), 5);
      setMcqs(res.mcqs);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Failed to generate');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="mt-8">
      <div className="paper-card p-6 sm:p-8 border-l-4 border-l-ember-600">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
          AI Practice Mode
        </p>
        <h2 className="font-serif mt-2 text-xl font-semibold text-ink-900">
          Generate practice questions instantly
        </h2>
        <p className="mt-2 text-sm text-ink-800">
          AI creates questions personalized to your exam ({exam}) and level. Type a subject or topic below.
        </p>

        <div className="mt-5 flex gap-2">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onGenerate()}
            placeholder="Topic (e.g., Indian Polity, Organic Chemistry, Calculus)"
            className="input flex-1"
          />
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating || !topic.trim()}
            className="btn-primary whitespace-nowrap"
          >
            {generating ? <><span className="spinner" /> Generating...</> : 'Generate'}
          </button>
        </div>

        {genError && <p className="mt-3 text-sm text-ember-600">{genError}</p>}

        {!mcqs && !generating && (
          <div className="mt-4 flex flex-wrap gap-2">
            {['Indian Polity', 'Modern History', 'Physics', 'Organic Chemistry', 'Economics', 'Biology'].map((s) => (
              <button key={s} type="button" onClick={() => setTopic(s)} className="pill hover:bg-paper-300 cursor-pointer transition">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {generating && (
        <div className="mt-6 text-center paper-card p-6">
          <span className="spinner" />
          <p className="mt-3 text-sm text-muted-500">Generating questions on &ldquo;{topic}&rdquo;...</p>
        </div>
      )}

      {mcqs && mcqs.length > 0 && (
        <div className="mt-6 space-y-4">
          {mcqs.map((q, i) => (
            <div key={i} className="paper-card p-5">
              <p className="text-xs font-semibold uppercase text-ember-600">{q.subject}</p>
              <p className="font-serif mt-2 text-base font-medium text-ink-900">{q.question}</p>
              <div className="mt-3 space-y-2">
                {q.options.map((opt) => (
                  <div
                    key={opt.key}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                      revealed[i] && opt.key === q.correctOption
                        ? 'border-gold-500 bg-paper-300'
                        : 'border-line bg-paper-50'
                    }`}
                  >
                    <span className="font-semibold text-ember-600">{opt.key}.</span>
                    <span className="text-ink-900">{opt.text}</span>
                  </div>
                ))}
              </div>
              {!revealed[i] ? (
                <button
                  type="button"
                  onClick={() => setRevealed((p) => ({ ...p, [i]: true }))}
                  className="btn-ghost-sm mt-3"
                >
                  Show answer
                </button>
              ) : (
                <div className="mt-3 rounded-lg bg-paper-200 p-3 text-sm text-ink-800">
                  <p className="font-semibold text-ember-600">Answer: {q.correctOption}</p>
                  <p className="mt-1">{q.explanation}</p>
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() => { setMcqs(null); setTopic(''); }}
            className="btn-ghost w-full"
          >
            Generate more questions
          </button>
        </div>
      )}
    </section>
  );
}

function ScorePill({
  status,
  overall,
}: {
  status: LongAnswerAttemptSummary['status'];
  overall: number | null;
}) {
  if (status === 'pending') {
    return (
      <span className="rounded-full bg-paper-200 px-2 py-1 text-xs text-muted-500">
        Grading...
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="rounded-full bg-ember-100 px-2 py-1 text-xs text-ember-600">
        Failed
      </span>
    );
  }
  if (overall == null) {
    return (
      <span className="rounded-full bg-paper-200 px-2 py-1 text-xs text-muted-500">
        —
      </span>
    );
  }
  const tone =
    overall >= 8
      ? 'bg-gold-100 text-gold-700'
      : overall >= 5
      ? 'bg-paper-300 text-ink-800'
      : 'bg-ember-100 text-ember-600';
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold tabular-nums ${tone}`}>
      {overall}/10
    </span>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms) || ms < 0) return '';
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
