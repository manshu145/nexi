import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { AIEngine } from '../lib/aiEngine.js';
import type { Firestore } from 'firebase-admin/firestore';

export interface EssayRoutesDeps {
  users: UserStore;
  aiEngine: AIEngine;
  logger: Logger;
  db: Firestore | null;
}

export function makeEssayRoutes(deps: EssayRoutesDeps): Hono {
  const app = new Hono();

  // GET /v1/essay/usage — get user's essay usage this period
  app.get('/usage', async (c) => {
    const principal = requireAuth(c);
    const user = await deps.users.get(principal.userId);
    if (!user) throw new HTTPException(404, { message: 'User not found' });

    const limit = user.plan === 'free' ? 2 : 15; // free: 2/week, paid: 15/month
    let used = 0;

    if (deps.db) {
      try {
        // Count essays this period — single field query to avoid composite index requirement
        const now = new Date();
        const periodStart = user.plan === 'free'
          ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) // last 7 days
          : new Date(now.getFullYear(), now.getMonth(), 1); // month start

        const snap = await deps.db.collection('essaySubmissions')
          .where('userId', '==', principal.userId)
          .get();
        used = snap.docs.filter(d => (d.data().submittedAt ?? '') >= periodStart.toISOString()).length;
      } catch { /* fallback to 0 */ }
    }

    return c.json({ used, limit });
  });

  // POST /v1/essay/question — generate a question for user's exam
  app.post('/question', async (c) => {
    const principal = requireAuth(c);
    const user = await deps.users.get(principal.userId);
    if (!user) throw new HTTPException(404, { message: 'User not found' });

    const body = await c.req.json().catch(() => null) as { language?: string } | null;
    const exam = user.targetExam ?? 'upsc-cse';
    const level = user.onboardingLevel ?? 'beginner';
    const language = (body?.language as 'en' | 'hi') || user.language || 'en';
    const langInstr = language === 'hi' ? 'Generate the question, hints, and all text in Hindi (Devanagari script).' : 'Generate in English.';

    const prompt = `Generate ONE essay/answer-writing question for ${exam} exam (student level: ${level}).
${langInstr}
The question should be:
- Relevant to current affairs or the official syllabus
- Appropriate word limit (150-300 words depending on difficulty)
- Time appropriate (15-25 minutes)

Respond ONLY with valid JSON:
{"topic":"The full question text...","wordLimit":250,"timeMinutes":20,"examContext":"${exam}","hints":["Hint 1","Hint 2","Hint 3"]}`;

    try {
      const response = await deps.aiEngine.chat(
        [{ role: 'user', content: prompt }],
        { exam, level, language },
        'groq'
      );
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const question = JSON.parse(jsonMatch[0]);
        return c.json({ question });
      }
      throw new Error('Failed to parse question');
    } catch (err) {
      deps.logger.error('essay.question_error', { error: err instanceof Error ? err.message : String(err) });
      throw new HTTPException(503, { message: 'Failed to generate question' });
    }
  });

  // POST /v1/essay/grade — grade an answer
  app.post('/grade', async (c) => {
    const principal = requireAuth(c);
    const user = await deps.users.get(principal.userId);
    if (!user) throw new HTTPException(404, { message: 'User not found' });

    // Check usage limit
    const limit = user.plan === 'free' ? 2 : 15;
    if (deps.db) {
      const now = new Date();
      const periodStart = user.plan === 'free'
        ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        : new Date(now.getFullYear(), now.getMonth(), 1);
      const snap = await deps.db.collection('essaySubmissions')
        .where('userId', '==', principal.userId)
        .get();
      const usedCount = snap.docs.filter(d => (d.data().submittedAt ?? '') >= periodStart.toISOString()).length;
      if (usedCount >= limit) {
        throw new HTTPException(429, { message: `Essay limit reached (${limit} per ${user.plan === 'free' ? 'week' : 'month'}). Upgrade for more.` });
      }
    }

    const body = await c.req.json().catch(() => null) as { topic?: string; answer?: string; wordLimit?: number; examContext?: string; language?: string } | null;
    if (!body?.topic || !body?.answer) throw new HTTPException(400, { message: 'topic and answer required' });

    const wordCount = body.answer.trim().split(/\s+/).length;
    const exam = body.examContext ?? user.targetExam ?? 'general';
    const language = (body?.language as 'en' | 'hi') || user.language || 'en';
    const langInstr = language === 'hi' ? 'Provide all feedback text (comments, strengths, weaknesses, improvements, rewritten paragraphs) in Hindi (Devanagari script).' : '';

    const gradePrompt = `You are a strict ${exam.toUpperCase()} exam answer evaluator. Grade this answer critically and thoroughly.
${langInstr}

QUESTION: ${body.topic}
WORD LIMIT: ${body.wordLimit ?? 250} words
STUDENT'S ANSWER (${wordCount} words):
${body.answer}

Evaluate on these 6 axes (score each out of 10):
1. Content & Accuracy — factual correctness, depth of knowledge
2. Structure & Organization — intro/body/conclusion, logical flow
3. Language & Grammar — vocabulary, sentence construction, spelling
4. Relevance to Question — did they answer what was asked?
5. Examples & Evidence — real examples, data, case studies used
6. Conclusion & Recommendations — actionable insights, balanced view

Also identify:
- Top 3 strengths of this answer
- Top 3 weaknesses
- 3 specific improvement tips
- Rewrite the 2 weakest paragraphs showing how they should be written (with reason)

Respond ONLY with valid JSON:
{"overallScore":35,"maxScore":60,"breakdown":[{"axis":"Content & Accuracy","score":7,"max":10,"comment":"..."}],"strengths":["..."],"weaknesses":["..."],"improvements":["..."],"rewrittenParagraphs":[{"original":"exact student text","improved":"better version","reason":"explanation"}]}`;

    try {
      // Use GPT-4o for grading (most accurate)
      const response = await deps.aiEngine.chat(
        [{ role: 'user', content: gradePrompt }],
        { exam, level: user.onboardingLevel ?? 'beginner', language: 'en' },
        'gpt4o'
      );

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Failed to parse grading response');

      const feedback = JSON.parse(jsonMatch[0]);

      // Save submission record
      if (deps.db) {
        await deps.db.collection('essaySubmissions').add({
          userId: principal.userId,
          topic: body.topic,
          answer: body.answer,
          wordCount,
          feedback,
          submittedAt: new Date().toISOString(),
        });
      }

      deps.logger.info('essay.graded', { userId: principal.userId, score: feedback.overallScore, wordCount });
      return c.json({ feedback });
    } catch (err) {
      deps.logger.error('essay.grade_error', { error: err instanceof Error ? err.message : String(err) });
      throw new HTTPException(503, { message: 'Grading failed. Please try again.' });
    }
  });

  return app;
}
