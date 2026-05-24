'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

function MockTestContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const subject = params.get('subject') ?? '';
  const topic = params.get('topic') ?? '';
  const topicId = params.get('topicId') ?? '';

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
    if (!user || !topicId) return;
    (async () => {
      try {
        const { progress } = await api.ai.getProgress();
        const { mcqs: generated } = await api.ai.generateMockTest({
          exam: progress?.exam ?? '',
          subject,
          topic,
          count: 10,
          skillLevel: progress?.skillLevel ?? 'intermediate',
          language: progress?.language ?? 'en',
        });
        setMcqs(generated);
        setAnswers(new Array(generated.length).fill(null));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to generate test');
      } finally {
        setGenerating(false);
      }
    })();
  }, [user, topicId, subject, topic]);

  async function submitTest() {
    let correct = 0;
    for (let i = 0; i < mcqs.length; i++) {
      if (answers[i] === mcqs[i].correctOption) correct++;
    }
    const percentage = Math.round((correct / mcqs.length) * 100);
    setScore(percentage);
    setSubmitted(true);

    // Save score to progress
    try {
      const { progress } = await api.ai.getProgress();
      if (progress) {
        const updatedScores = { ...(progress.chapterMockScores ?? {}), [topicId]: percentage };
        const updatedCompleted = [...(progress.completedTopics ?? [])];
        if (percentage >= 80 && !updatedCompleted.includes(topicId)) {
          updatedCompleted.push(topicId);
        }

        // Check if all topics across all subjects are completed
        const totalTopics = progress.syllabus?.reduce((acc: number, s: any) => acc + (s.topics?.length ?? 0), 0) ?? 0;
        const syllabusComplete = updatedCompleted.length >= totalTopics;

        await api.ai.updateProgress({
          chapterMockScores: updatedScores,
          completedTopics: updatedCompleted,
          syllabusComplete,
        });
      }
    } catch {
      // Non-critical — progress will sync next time
    }
  }

  if (loading || !user || generating) {
    return (
      <main className="mock-loading">
        <span className="spinner" />
        <p>Generating mock test for: {topic}</p>
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

  // Results Screen
  if (submitted) {
    const passed = score >= 80;
    return (
      <main className="mock-result">
        <div className={`result-card ${passed ? 'result-pass' : 'result-fail'}`}>
          <div className="result-icon">{passed ? '🎉' : '📝'}</div>
          <h1 className="result-score">{score}%</h1>
          <p className="result-label">{passed ? 'Excellent! You passed!' : 'Keep practicing — you need 80% to advance'}</p>
          <p className="result-detail">{answers.filter((a, i) => a === mcqs[i]?.correctOption).length}/{mcqs.length} correct</p>

          {/* Show explanations */}
          <div className="result-explanations">
            {mcqs.map((mcq, i) => {
              const isCorrect = answers[i] === mcq.correctOption;
              return (
                <div key={i} className={`explanation-card ${isCorrect ? 'correct' : 'wrong'}`}>
                  <p className="expl-q"><strong>Q{i + 1}:</strong> {mcq.question}</p>
                  <p className="expl-answer">
                    Your answer: <strong>{answers[i] ?? 'Skipped'}</strong>
                    {!isCorrect && <> · Correct: <strong>{mcq.correctOption}</strong></>}
                  </p>
                  <p className="expl-text">{mcq.explanation}</p>
                </div>
              );
            })}
          </div>

          <div className="result-actions">
            {passed ? (
              <button className="btn-primary" onClick={() => router.push('/study')}>
                Continue to Next Topic →
              </button>
            ) : (
              <>
                <button className="btn-primary" onClick={() => { setSubmitted(false); setCurrentQ(0); setAnswers(new Array(mcqs.length).fill(null)); }}>
                  Retry Test
                </button>
                <button className="btn-ghost" onClick={() => router.push(`/study/chapter?subject=${encodeURIComponent(subject)}&topic=${encodeURIComponent(topic)}&topicId=${topicId}`)}>
                  Re-read Chapter
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    );
  }

  // Test UI
  const mcq = mcqs[currentQ];
  if (!mcq) return null;

  return (
    <main className="mock-page">
      <header className="mock-header">
        <button className="btn-back" onClick={() => router.push('/study')}>✕</button>
        <h1>Mock Test: {topic}</h1>
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
              onClick={() => {
                const next = [...answers];
                next[currentQ] = opt.key;
                setAnswers(next);
              }}
            >
              <span className="opt-key">{opt.key}</span>
              <span className="opt-text">{opt.text}</span>
            </button>
          ))}
        </div>
      </article>

      <footer className="mock-footer">
        {currentQ > 0 && (
          <button className="btn-ghost" onClick={() => setCurrentQ(currentQ - 1)}>← Previous</button>
        )}
        <div style={{ flex: 1 }} />
        {currentQ < mcqs.length - 1 ? (
          <button className="btn-primary" onClick={() => setCurrentQ(currentQ + 1)}>Next →</button>
        ) : (
          <button className="btn-primary" onClick={submitTest}>Submit Test</button>
        )}
      </footer>
    </main>
  );
}

export default function MockTestPage() {
  return (
    <Suspense fallback={<main className="mock-loading"><span className="spinner" /> Loading…</main>}>
      <MockTestContent />
    </Suspense>
  );
}
