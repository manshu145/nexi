/**
 * Phase C — Adaptive test generation + study plan orchestrator.
 */
import type { LLMClient } from '../llm/index.js';
import { safeParseLlmJson } from '../llm/parseJson.js';
import {
  adaptiveTestGenerationPrompt,
  studyPlanGenerationPrompt,
} from './prompts.js';

export interface AdaptiveQuestion {
  id: string;
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correctOption: 'A' | 'B' | 'C' | 'D';
  difficulty: 'easy' | 'medium' | 'hard';
  subject: string;
  explanation: string;
}

export interface AdaptiveTestResult {
  questions: AdaptiveQuestion[];
}

export interface StudyPlan {
  overallLevel: 'beginner' | 'intermediate' | 'advanced';
  score: number;
  strengths: string[];
  weaknesses: string[];
  weeklyPlan: Array<{
    week: number;
    focus: string;
    dailyHours: number;
    topics: string[];
    practiceGoal: string;
  }>;
  recommendedChapters: string[];
  motivationalNote: string;
}

/**
 * Generate 10 adaptive MCQs for the diagnostic test.
 */
export async function generateAdaptiveTest(
  client: LLMClient,
  exam: string,
  classLevel: string,
  language: string,
): Promise<AdaptiveTestResult> {
  const { system, user } = adaptiveTestGenerationPrompt(exam, classLevel, language);

  const res = await client.complete({
    promptName: 'adaptive-test-generate',
    system,
    user,
    json: true,
    temperature: 0.7,
    maxTokens: 3000,
  });

  const parsed = safeParseLlmJson<AdaptiveTestResult>(res.content);
  if (!parsed || !Array.isArray(parsed.questions)) {
    // Fallback: return empty — frontend will skip the test gracefully
    return { questions: [] };
  }

  // Validate + sanitize
  const valid = parsed.questions
    .filter(
      (q) =>
        q.id &&
        q.question &&
        q.options &&
        q.correctOption &&
        ['A', 'B', 'C', 'D'].includes(q.correctOption),
    )
    .slice(0, 10);

  return { questions: valid };
}

/**
 * Grade the adaptive test and generate a personalized study plan.
 */
export async function generateStudyPlan(
  client: LLMClient,
  exam: string,
  classLevel: string,
  language: string,
  questions: AdaptiveQuestion[],
  answers: Record<string, string>,
): Promise<{ score: number; plan: StudyPlan }> {
  // Score the test
  let correct = 0;
  const subjectScores: Record<string, { correct: number; total: number }> = {};

  for (const q of questions) {
    const subj = q.subject || 'general';
    if (!subjectScores[subj]) subjectScores[subj] = { correct: 0, total: 0 };
    subjectScores[subj]!.total++;

    if (answers[q.id] === q.correctOption) {
      correct++;
      subjectScores[subj]!.correct++;
    }
  }

  // Generate study plan via AI
  const { system, user } = studyPlanGenerationPrompt(
    exam,
    classLevel,
    correct,
    questions.length,
    subjectScores,
    language,
  );

  const res = await client.complete({
    promptName: 'study-plan-generate',
    system,
    user,
    json: true,
    temperature: 0.4,
    maxTokens: 2000,
  });

  const plan = safeParseLlmJson<StudyPlan>(res.content);
  if (!plan || !plan.overallLevel) {
    // Fallback plan
    return {
      score: correct,
      plan: {
        overallLevel: correct >= 7 ? 'advanced' : correct >= 4 ? 'intermediate' : 'beginner',
        score: Math.round((correct / questions.length) * 100),
        strengths: Object.entries(subjectScores)
          .filter(([, s]) => s.correct / s.total >= 0.6)
          .map(([subj]) => subj),
        weaknesses: Object.entries(subjectScores)
          .filter(([, s]) => s.correct / s.total < 0.5)
          .map(([subj]) => subj),
        weeklyPlan: [
          { week: 1, focus: 'Foundation building', dailyHours: 2, topics: ['Basics'], practiceGoal: '10 MCQs daily' },
          { week: 2, focus: 'Core concepts', dailyHours: 3, topics: ['Intermediate'], practiceGoal: '15 MCQs daily' },
          { week: 3, focus: 'Advanced practice', dailyHours: 3, topics: ['Advanced'], practiceGoal: '20 MCQs daily' },
          { week: 4, focus: 'Revision + mock tests', dailyHours: 4, topics: ['Full syllabus'], practiceGoal: '1 mock test + 20 MCQs' },
        ],
        recommendedChapters: [],
        motivationalNote: 'You have a solid start! Focus on your weak areas and you will improve quickly.',
      },
    };
  }

  return { score: correct, plan };
}
