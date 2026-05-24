import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';

/**
 * Adaptive test endpoints.
 * After onboarding, student takes a 10-question AI-generated diagnostic test.
 * Based on performance, the platform computes a skill level and generates
 * a personalized study plan stored on their profile.
 *
 * POST /v1/users/me/adaptive-test/start   → returns 10 diagnostic MCQs
 * POST /v1/users/me/adaptive-test/complete → scores, computes skill, generates plan
 */
export interface AdaptiveTestDeps {
  users: UserStore;
  logger: Logger;
  openaiApiKey?: string;
}

interface DiagnosticMCQ {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  difficulty: 'easy' | 'medium' | 'hard';
  subject: string;
}

const DIAGNOSTIC_PROMPT = `You are generating a diagnostic test for an Indian student.
Generate exactly 10 multiple-choice questions to assess their current level.
Mix difficulties: 3 easy, 4 medium, 3 hard.
Cover the core subjects for their exam.

Return a JSON array of objects with:
- question: string
- options: array of 4 strings
- correctIndex: 0-3 (index of correct answer)
- difficulty: "easy" | "medium" | "hard"  
- subject: string (short subject name)

Return ONLY the JSON array, no markdown fences, no commentary.`;

export function makeAdaptiveTestRoutes(deps: AdaptiveTestDeps): Hono {
  const app = new Hono();

  app.post('/start', async (c) => {
    const principal = requireAuth(c);
    const user = await deps.users.get(principal.userId);
    if (!user) throw new HTTPException(404, { message: 'user not found' });

    const exam = user.targetExam ?? 'class-10-cbse';

    // Generate diagnostic MCQs via OpenAI
    let mcqs: DiagnosticMCQ[];
    try {
      if (!deps.openaiApiKey) {
        // Fallback: return static diagnostic questions
        mcqs = generateFallbackMCQs(exam);
      } else {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${deps.openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            temperature: 0.7,
            max_tokens: 2000,
            messages: [
              { role: 'system', content: DIAGNOSTIC_PROMPT },
              { role: 'user', content: `Generate diagnostic questions for: ${exam}. Target audience: Indian student preparing for this exam.` },
            ],
          }),
        });

        if (!response.ok) {
          deps.logger.warn('adaptive_test.openai_failed', { status: response.status });
          mcqs = generateFallbackMCQs(exam);
        } else {
          const data = await response.json() as { choices: Array<{ message: { content: string } }> };
          const content = data.choices[0]?.message?.content ?? '[]';
          try {
            mcqs = JSON.parse(content);
            if (!Array.isArray(mcqs) || mcqs.length === 0) mcqs = generateFallbackMCQs(exam);
          } catch {
            mcqs = generateFallbackMCQs(exam);
          }
        }
      }
    } catch {
      mcqs = generateFallbackMCQs(exam);
    }

    // Strip correct answers before sending to client
    const clientMcqs = mcqs.map((m, i) => ({
      id: `diag_${i}`,
      question: m.question,
      options: m.options,
      difficulty: m.difficulty,
      subject: m.subject,
    }));

    deps.logger.info('adaptive_test.started', { userId: principal.userId, exam });
    return c.json({ mcqs: clientMcqs, totalQuestions: clientMcqs.length, _answers: mcqs.map(m => m.correctIndex) });
  });

  app.post('/complete', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    if (!body || !Array.isArray(body.answers) || !Array.isArray(body.correctAnswers)) {
      throw new HTTPException(400, { message: 'answers and correctAnswers arrays required' });
    }

    const { answers, correctAnswers } = body as { answers: number[]; correctAnswers: number[] };
    let correct = 0;
    const total = Math.min(answers.length, correctAnswers.length);
    for (let i = 0; i < total; i++) {
      if (answers[i] === correctAnswers[i]) correct++;
    }

    const scorePct = total > 0 ? Math.round((correct / total) * 100) : 0;

    // Compute skill level
    let skillLevel: 'beginner' | 'intermediate' | 'advanced';
    if (scorePct >= 70) skillLevel = 'advanced';
    else if (scorePct >= 40) skillLevel = 'intermediate';
    else skillLevel = 'beginner';

    // Generate study plan based on skill level
    const studyPlan = generateStudyPlan(skillLevel);

    // Save to user profile
    await deps.users.updateProfile(principal.userId, {
      adaptiveTestScore: scorePct,
      skillLevel,
      studyPlan,
      adaptiveTestCompletedAt: new Date().toISOString(),
    });

    deps.logger.info('adaptive_test.completed', {
      userId: principal.userId,
      score: scorePct,
      skillLevel,
    });

    return c.json({
      score: scorePct,
      correct,
      total,
      skillLevel,
      studyPlan,
    });
  });

  return app;
}

function generateStudyPlan(skillLevel: 'beginner' | 'intermediate' | 'advanced') {
  const plans = {
    beginner: {
      dailyHours: 2,
      focusAreas: ['Build strong fundamentals', 'NCERT thoroughly', 'Daily practice MCQs'],
      weeklyGoals: ['Complete 1 chapter reading', '50 MCQs daily', 'Review weak subjects'],
      tips: ['Start with basics, don\'t skip steps', 'Use Nexipedia for concept clarity', 'Take notes while reading'],
    },
    intermediate: {
      dailyHours: 3,
      focusAreas: ['Strengthen weak topics', 'Previous year papers', 'Timed practice'],
      weeklyGoals: ['Complete 2 chapters', '100 MCQs daily', 'One mock test per week'],
      tips: ['Focus on accuracy over speed initially', 'Analyze mock test results', 'Revise weak areas twice a week'],
    },
    advanced: {
      dailyHours: 4,
      focusAreas: ['Advanced problem solving', 'Speed + accuracy', 'Full-length mocks'],
      weeklyGoals: ['2 full mock tests', '150+ MCQs daily', 'Revision of entire syllabus in 30 days'],
      tips: ['Focus on time management', 'Target 95%+ accuracy', 'Practice previous 10 years papers'],
    },
  };
  return plans[skillLevel];
}

function generateFallbackMCQs(exam: string): DiagnosticMCQ[] {
  // Generic diagnostic questions that work for most exams
  return [
    { id: '1', question: 'What is the SI unit of force?', options: ['Newton', 'Joule', 'Watt', 'Pascal'], correctIndex: 0, difficulty: 'easy', subject: 'Physics' },
    { id: '2', question: 'Which gas is most abundant in Earth\'s atmosphere?', options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Argon'], correctIndex: 1, difficulty: 'easy', subject: 'Science' },
    { id: '3', question: 'Who wrote the Indian national anthem?', options: ['Bankim Chandra', 'Rabindranath Tagore', 'Sarojini Naidu', 'Subhash Bose'], correctIndex: 1, difficulty: 'easy', subject: 'GK' },
    { id: '4', question: 'What is the chemical formula of water?', options: ['H2O', 'CO2', 'NaCl', 'H2SO4'], correctIndex: 0, difficulty: 'easy', subject: 'Chemistry' },
    { id: '5', question: 'The Fundamental Rights in Indian Constitution are borrowed from?', options: ['UK', 'USA', 'France', 'Ireland'], correctIndex: 1, difficulty: 'medium', subject: 'Polity' },
    { id: '6', question: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Saturn'], correctIndex: 1, difficulty: 'medium', subject: 'Science' },
    { id: '7', question: 'Solve: If x + 5 = 12, find x', options: ['5', '6', '7', '8'], correctIndex: 2, difficulty: 'medium', subject: 'Maths' },
    { id: '8', question: 'The Battle of Plassey was fought in which year?', options: ['1757', '1857', '1947', '1664'], correctIndex: 0, difficulty: 'medium', subject: 'History' },
    { id: '9', question: 'What is the derivative of x² with respect to x?', options: ['x', '2x', '2', 'x²'], correctIndex: 1, difficulty: 'hard', subject: 'Maths' },
    { id: '10', question: 'Article 370 was related to which state?', options: ['Punjab', 'Kashmir', 'Assam', 'Goa'], correctIndex: 1, difficulty: 'hard', subject: 'Polity' },
  ];
}
