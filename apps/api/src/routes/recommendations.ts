import { Hono } from 'hono';
import {
  asExamSlug,
  EXAMS,
  type ExamSlug,
  type UserId,
} from '@nexigrate/shared';
import { requireAuth } from '../auth.js';
import type { ChapterStore } from '../lib/chapterDraftStore.js';
import type { McqAttemptStore } from '../lib/mcqAttemptStore.js';
import type { UserStore } from '../lib/userStore.js';
import type { Logger } from '../logger.js';

/**
 * Personalized Recommendations Engine.
 *
 * The platform acts as a TEACHER/MENTOR:
 * - Analyzes student's skill level (from adaptive test)
 * - Tracks weak subjects (from MCQ attempts accuracy)
 * - Recommends specific chapters, MCQ topics, and study actions
 *
 * GET /v1/users/me/recommendations
 *
 * Returns personalized study plan based on:
 * 1. Student's target exam
 * 2. Their skill level (beginner/intermediate/advanced)
 * 3. Their weak topics (subjects with <60% accuracy)
 * 4. What they haven't read yet
 */
export interface RecommendationsDeps {
  users: UserStore;
  attempts: McqAttemptStore;
  chapters: ChapterStore;
  logger: Logger;
}

interface Recommendation {
  type: 'chapter' | 'mcq' | 'mock_test' | 'revision' | 'tip';
  title: string;
  description: string;
  action: string; // route to navigate to
  priority: 'high' | 'medium' | 'low';
  reason: string; // why this is recommended
}

interface PersonalizedResponse {
  greeting: string;
  skillLevel: string;
  focusAreas: string[];
  recommendations: Recommendation[];
  dailyGoal: {
    mcqs: number;
    readMinutes: number;
    mockTests: number;
  };
  motivationalMessage: string;
}

export function makeRecommendationsRoutes(deps: RecommendationsDeps): Hono {
  const app = new Hono();

  app.get('/me/recommendations', async (c) => {
    const principal = requireAuth(c);
    const userId = principal.userId;

    const user = await deps.users.get(userId);
    const targetExam = user?.targetExam ?? asExamSlug('jee-main');
    const exam = EXAMS.find(e => e.id === targetExam);
    const examName = exam?.name ?? 'your exam';

    // Get recent attempts to analyze performance
    const recentAttempts = await deps.attempts
      .list({ userId, exam: targetExam, limit: 200 })
      .catch(() => []);

    // Calculate subject-level accuracy
    const subjectStats = new Map<string, { correct: number; total: number }>();
    for (const a of recentAttempts) {
      const stat = subjectStats.get(a.subject) ?? { correct: 0, total: 0 };
      stat.total++;
      if (a.isCorrect) stat.correct++;
      subjectStats.set(a.subject, stat);
    }

    // Identify weak subjects (< 60% accuracy with 3+ attempts)
    const weakSubjects: string[] = [];
    const strongSubjects: string[] = [];
    for (const [subject, stat] of subjectStats) {
      const accuracy = stat.total > 0 ? stat.correct / stat.total : 0;
      if (stat.total >= 3 && accuracy < 0.6) weakSubjects.push(subject);
      else if (stat.total >= 3 && accuracy >= 0.75) strongSubjects.push(subject);
    }

    // Determine skill level based on overall accuracy
    const totalCorrect = recentAttempts.filter(a => a.isCorrect).length;
    const totalAttempts = recentAttempts.length;
    const overallAccuracy = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;

    let skillLevel: string;
    let difficulty: string;
    if (totalAttempts < 10) {
      skillLevel = 'new';
      difficulty = 'easy';
    } else if (overallAccuracy >= 0.8) {
      skillLevel = 'advanced';
      difficulty = 'hard';
    } else if (overallAccuracy >= 0.5) {
      skillLevel = 'intermediate';
      difficulty = 'medium';
    } else {
      skillLevel = 'beginner';
      difficulty = 'easy';
    }

    // Build personalized recommendations
    const recommendations: Recommendation[] = [];

    // 1. For weak subjects — suggest chapters + practice
    for (const subject of weakSubjects.slice(0, 2)) {
      recommendations.push({
        type: 'chapter',
        title: `Revise: ${prettySubject(subject)}`,
        description: `Your accuracy in ${prettySubject(subject)} is below 60%. Read the chapter to strengthen basics.`,
        action: `/chapters?subject=${encodeURIComponent(subject)}`,
        priority: 'high',
        reason: 'Weak area detected from your recent attempts',
      });
      recommendations.push({
        type: 'mcq',
        title: `Practice: ${prettySubject(subject)} MCQs`,
        description: `Focus on ${difficulty} questions to build confidence in this subject.`,
        action: '/mcq',
        priority: 'high',
        reason: `Below 60% accuracy in ${prettySubject(subject)}`,
      });
    }

    // 2. For new users — start with basics
    if (skillLevel === 'new') {
      recommendations.push({
        type: 'tip',
        title: 'Start with the daily MCQ',
        description: 'Take 10 questions daily to build a rhythm. You earn credits even if you don\'t pass!',
        action: '/mcq',
        priority: 'high',
        reason: 'You\'re just getting started — consistency is key',
      });
      recommendations.push({
        type: 'chapter',
        title: `Read your first chapter`,
        description: `Start with any chapter in your ${examName} syllabus. AI will explain it clearly.`,
        action: '/chapters',
        priority: 'medium',
        reason: 'Build your foundation before practicing',
      });
    }

    // 3. For intermediate/advanced — suggest mock tests
    if (skillLevel === 'intermediate' || skillLevel === 'advanced') {
      recommendations.push({
        type: 'mock_test',
        title: 'Take a full mock test',
        description: `Your ${Math.round(overallAccuracy * 100)}% accuracy shows you're ready for timed practice.`,
        action: '/mock-tests',
        priority: skillLevel === 'advanced' ? 'high' : 'medium',
        reason: `${skillLevel === 'advanced' ? 'You\'re performing well' : 'Good progress'} — test under exam conditions`,
      });
    }

    // 4. Current affairs (always recommended)
    recommendations.push({
      type: 'revision',
      title: 'Today\'s Current Affairs',
      description: 'Stay updated with verified news from 30+ official sources. Take the daily quiz!',
      action: '/today',
      priority: 'medium',
      reason: 'Daily current affairs keeps you exam-ready',
    });

    // 5. Strong subjects — suggest advanced content
    for (const subject of strongSubjects.slice(0, 1)) {
      recommendations.push({
        type: 'mcq',
        title: `Challenge: Advanced ${prettySubject(subject)}`,
        description: `You\'re strong in this area (75%+). Try harder questions to push your limit.`,
        action: '/mcq',
        priority: 'low',
        reason: `High accuracy in ${prettySubject(subject)} — time to level up`,
      });
    }

    // Daily goals based on skill level
    const dailyGoal = {
      mcqs: skillLevel === 'advanced' ? 20 : skillLevel === 'intermediate' ? 15 : 10,
      readMinutes: skillLevel === 'advanced' ? 45 : skillLevel === 'intermediate' ? 30 : 20,
      mockTests: skillLevel === 'advanced' ? 1 : 0,
    };

    // Motivational message based on performance
    let motivationalMessage: string;
    if (skillLevel === 'new') {
      motivationalMessage = 'Every expert was once a beginner. Start your first 10 questions today!';
    } else if (skillLevel === 'beginner') {
      motivationalMessage = `You've started well! Focus on your weak areas and you'll see improvement fast.`;
    } else if (skillLevel === 'intermediate') {
      motivationalMessage = `Great progress! You're at ${Math.round(overallAccuracy * 100)}% accuracy. Push for 80% this week.`;
    } else {
      motivationalMessage = `Excellent! ${Math.round(overallAccuracy * 100)}% accuracy shows serious preparation. Keep this momentum!`;
    }

    const response: PersonalizedResponse = {
      greeting: getTimeGreeting(),
      skillLevel,
      focusAreas: weakSubjects.slice(0, 3).map(prettySubject),
      recommendations: recommendations.slice(0, 6),
      dailyGoal,
      motivationalMessage,
    };

    deps.logger.info('recommendations.generated', {
      userId: String(userId),
      skillLevel,
      weakSubjects: weakSubjects.length,
      totalAttempts,
    });

    return c.json(response);
  });

  return app;
}

function prettySubject(s: string): string {
  return s.split('-').map(w => (w[0]?.toUpperCase() ?? '') + w.slice(1)).join(' ');
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
