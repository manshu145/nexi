'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * Study Page — Exam Preparation Hub
 * Shows syllabus with subjects → topics progression.
 * Student reads chapter → takes mock test → needs 80% to advance.
 * After syllabus complete → Final Test available.
 */

interface Topic {
  id: string;
  title: string;
  order: number;
}

interface Subject {
  subject: string;
  topics: Topic[];
}

export default function StudyPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [progress, setProgress] = useState<any>(null);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { progress: p } = await api.ai.getProgress();
        setProgress(p);
        if (p?.syllabus?.length > 0) {
          setActiveSubject(p.currentSubject || p.syllabus[0].subject);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoadingState(false);
      }
    })();
  }, [user]);

  if (loading || !user || loadingState) {
    return (
      <main className="page-loading">
        <span className="spinner" /> Loading your syllabus…
      </main>
    );
  }

  if (!progress || !progress.syllabus) {
    return (
      <main className="page-empty">
        <h1>No study plan found</h1>
        <p>Complete onboarding to get your personalized syllabus.</p>
        <button className="btn-primary" onClick={() => router.push('/onboarding')}>
          Start Onboarding
        </button>
      </main>
    );
  }

  const syllabus: Subject[] = progress.syllabus;
  const completedTopics: string[] = progress.completedTopics ?? [];
  const mockScores: Record<string, number> = progress.chapterMockScores ?? {};
  const currentSubjectData = syllabus.find(s => s.subject === activeSubject);
  const syllabusComplete = progress.syllabusComplete;

  // Determine which topic is currently unlocked
  function getTopicStatus(topic: Topic, idx: number, topics: Topic[]): 'completed' | 'current' | 'locked' | 'mock-needed' {
    if (completedTopics.includes(topic.id)) return 'completed';
    // First topic is always unlocked
    if (idx === 0 && !completedTopics.includes(topic.id)) return 'current';
    // Check if previous topic is completed
    const prevTopic = topics[idx - 1];
    if (prevTopic && completedTopics.includes(prevTopic.id)) {
      // Check if previous mock score is >= 80%
      const prevScore = mockScores[prevTopic.id];
      if (prevScore === undefined || prevScore < 80) return 'locked';
      return 'current';
    }
    return 'locked';
  }

  return (
    <main className="study-page">
      <header className="study-header">
        <button className="btn-back" onClick={() => router.push('/dashboard')}>← Back</button>
        <h1>📚 {progress.exam}</h1>
        <span className={`level-badge level-${progress.skillLevel}`}>{progress.skillLevel}</span>
      </header>

      {/* Subject Tabs */}
      <nav className="subject-tabs">
        {syllabus.map(s => {
          const completed = s.topics.filter(t => completedTopics.includes(t.id)).length;
          return (
            <button
              key={s.subject}
              className={`subject-tab ${activeSubject === s.subject ? 'active' : ''}`}
              onClick={() => setActiveSubject(s.subject)}
            >
              <span className="tab-name">{s.subject}</span>
              <span className="tab-progress">{completed}/{s.topics.length}</span>
            </button>
          );
        })}
      </nav>

      {/* Topics List */}
      {currentSubjectData && (
        <section className="topics-list">
          {currentSubjectData.topics.map((topic, idx) => {
            const status = getTopicStatus(topic, idx, currentSubjectData.topics);
            const score = mockScores[topic.id];
            return (
              <div key={topic.id} className={`topic-card topic-${status}`}>
                <div className="topic-status-icon">
                  {status === 'completed' && '✅'}
                  {status === 'current' && '📖'}
                  {status === 'mock-needed' && '📝'}
                  {status === 'locked' && '🔒'}
                </div>
                <div className="topic-info">
                  <h3>{topic.title}</h3>
                  {score !== undefined && (
                    <span className={`mock-score ${score >= 80 ? 'pass' : 'fail'}`}>
                      Mock: {score}%
                    </span>
                  )}
                </div>
                <div className="topic-actions">
                  {(status === 'current' || status === 'completed') && (
                    <button
                      className="btn-sm btn-read"
                      onClick={() => router.push(`/study/chapter?subject=${encodeURIComponent(currentSubjectData.subject)}&topic=${encodeURIComponent(topic.title)}&topicId=${topic.id}`)}
                    >
                      {status === 'completed' ? 'Re-read' : 'Read'}
                    </button>
                  )}
                  {(status === 'current' || status === 'completed') && (
                    <button
                      className="btn-sm btn-test"
                      onClick={() => router.push(`/study/mock-test?subject=${encodeURIComponent(currentSubjectData.subject)}&topic=${encodeURIComponent(topic.title)}&topicId=${topic.id}`)}
                    >
                      Mock Test
                    </button>
                  )}
                  {status === 'locked' && (
                    <span className="locked-msg">Complete previous topic (80%+)</span>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Final Test Button */}
      {syllabusComplete && (
        <section className="final-test-section">
          <div className="final-test-card">
            <h2>🏆 Syllabus Complete!</h2>
            <p>You&apos;ve completed all topics. Take the final comprehensive test.</p>
            <button className="btn-primary" onClick={() => router.push('/study/final-test')}>
              Take Final Test
            </button>
          </div>
        </section>
      )}

      {error && <p className="error-msg">{error}</p>}
    </main>
  );
}
