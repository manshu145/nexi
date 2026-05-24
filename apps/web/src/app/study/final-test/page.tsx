'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * Final Comprehensive Test — available after completing entire syllabus.
 * 50 questions across all subjects. Tests overall readiness.
 */
export default function FinalTestPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mcqs, setMcqs] = useState<any[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<(string | null)[]>([]);
  const [generating, setGenerating] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { progress } = await api.ai.getProgress();
        if (!progress?.syllabusComplete) {
          router.replace('/study');
          return;
        }
        const subjects = progress.syllabus?.map((s: any) => s.subject) ?? [];
        const { mcqs: generated } = await api.ai.generateFinalTest(
          progress.exam,
          subjects,
          50,
          progress.language ?? 'en',
        );
        setMcqs(generated);
        setAnswers(new Array(generated.length).fill(null));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to generate');
      } finally {
        setGenerating(false);
      }
    })();
  }, [user, router]);

  async function submitTest() {
    let correct = 0;
    for (let i = 0; i < mcqs.length; i++) {
      if (answers[i] === mcqs[i].correctOption) correct++;
    }
    const percentage = Math.round((correct / mcqs.length) * 100);
    setScore(percentage);
    setSubmitted(true);

    try {
      await api.ai.updateProgress({ finalTestScore: percentage });
    } catch { /* non-critical */ }
  }

  if (loading || !user || generating) {
    return (
      <main className="mock-loading">
        <span className="spinner" />
        <p>Generating final comprehensive test (50 questions)…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mock-error">
        <p>{error}</p>
        <button className="btn-primary" onClick={() => router.back()}>Go Back</button>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="mock-result">
        <div className={`result-card ${score >= 70 ? 'result-pass' : 'result-fail'}`}>
          <div className="result-icon">🏆</div>
          <h1 className="result-score">{score}%</h1>
          <p className="result-label">
            {score >= 90 ? 'Outstanding! You are exam ready!' :
             score >= 70 ? 'Great job! Strong preparation!' :
             score >= 50 ? 'Good effort. Review weak areas.' :
             'More practice needed. Revise and retry.'}
          </p>
          <p className="result-detail">
            {answers.filter((a, i) => a === mcqs[i]?.correctOption).length}/{mcqs.length} correct
          </p>
          <div className="result-actions">
            <button className="btn-primary" onClick={() => router.push('/dashboard')}>
              Back to Dashboard
            </button>
            <button className="btn-ghost" onClick={() => router.push('/study')}>
              Review Syllabus
            </button>
          </div>
        </div>
      </main>
    );
  }

  const mcq = mcqs[currentQ];
  if (!mcq) return null;

  return (
    <main className="mock-page">
      <header className="mock-header">
        <button className="btn-back" onClick={() => router.push('/study')}>✕</button>
        <h1>Final Test</h1>
        <span className="mock-count">Q{currentQ + 1}/{mcqs.length}</span>
      </header>

      <div className="mock-progress">
        <div className="mock-progress-bar" style={{ width: `${((currentQ + 1) / mcqs.length) * 100}%` }} />
      </div>

      <article className="mock-question-card">
        <p className="mock-subject-tag">{mcq.subject} · {mcq.difficulty}</p>
        <h2 className="mock-question">{mcq.question}</h2>
        <div className="mock-options">
          {mcq.options.map((opt: any) => (
            <button
              key={opt.key}
              className={`mock-option ${answers[currentQ] === opt.key ? 'selected' : ''}`}
              onClick={() => { const n = [...answers]; n[currentQ] = opt.key; setAnswers(n); }}
            >
              <span className="opt-key">{opt.key}</span>
              <span className="opt-text">{opt.text}</span>
            </button>
          ))}
        </div>
      </article>

      <footer className="mock-footer">
        {currentQ > 0 && <button className="btn-ghost" onClick={() => setCurrentQ(currentQ - 1)}>←</button>}
        <div style={{ flex: 1 }} />
        {currentQ < mcqs.length - 1 ? (
          <button className="btn-primary" onClick={() => setCurrentQ(currentQ + 1)}>Next →</button>
        ) : (
          <button className="btn-primary" onClick={submitTest}>Submit Final Test</button>
        )}
      </footer>
    </main>
  );
}
