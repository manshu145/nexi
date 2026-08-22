import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { AIEngine } from '../lib/aiEngine.js';
import type { PlatformConfigStore } from '../lib/platformConfigStore.js';
import type { FeatureUsageStore } from '../lib/featureUsageStore.js';
import type { Firestore } from 'firebase-admin/firestore';
import { PlanGate, FeatureKey, effectivePlanId } from '../lib/planGate.js';

export interface EssayRoutesDeps {
  users: UserStore;
  aiEngine: AIEngine;
  logger: Logger;
  db: Firestore | null;
  // Admin-editable plan matrix (essaysPerDay cap) + per-day usage counter.
  // Optional so tests/dev without Firestore still construct the routes;
  // enforcement is fail-open when either is missing.
  config?: PlatformConfigStore;
  usage?: FeatureUsageStore;
}

export function makeEssayRoutes(deps: EssayRoutesDeps): Hono {
  const app = new Hono();
  // Central gate — expiry-aware essaysPerDay cap. Fail-open if not wired.
  const planGate = deps.config && deps.usage
    ? new PlanGate({ config: deps.config, usage: deps.usage, logger: deps.logger })
    : null;

  // GET /v1/essay/usage — get user's essay usage for TODAY (IST day).
  // The per-day cap comes from the admin-editable plan matrix
  // (features.essaysPerDay; -1 = unlimited, 0 = not included). This replaces
  // the old hardcoded 2/week (free) and 15/month (paid) numbers, which
  // ignored /admin/plans entirely and used an inconsistent period.
  app.get('/usage', async (c) => {
    const principal = requireAuth(c);
    const user = await deps.users.get(principal.userId);
    if (!user) throw new HTTPException(404, { message: 'User not found' });

    const plan = user.plan ?? 'free';
    let limit = -1; // default to unlimited if config is unreachable (fail-open)
    if (planGate) {
      const l = await planGate.getFeatureLimit(user, FeatureKey.ESSAY_GRADING);
      limit = l === 'unlimited' ? -1 : l;
    } else if (deps.config) {
      try {
        const plans = await deps.config.getPlans();
        limit = plans[effectivePlanId(user)]?.features?.essaysPerDay ?? -1;
      } catch { /* keep unlimited fallback */ }
    }

    let used = 0;
    if (deps.usage && limit >= 0) {
      used = await deps.usage.getCount(principal.userId, 'essay');
    }

    return c.json({ used, limit, period: 'day', plan });
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

    // Variety: without a seed + rotating theme, Groq returns the SAME
    // question every time (founder report: "har baar yahi question").
    // A random seed + a randomly-picked focus area forces a fresh topic
    // on each call.
    const FOCUS_AREAS = ['polity & governance', 'economy & banking', 'environment & ecology', 'science & technology', 'social issues', 'international relations', 'history & culture', 'agriculture & rural development', 'education & health', 'ethics & society'];
    const focus = FOCUS_AREAS[Math.floor(Math.random() * FOCUS_AREAS.length)];
    const seed = Math.random().toString(36).slice(2, 8);

    const prompt = `Generate ONE essay/answer-writing question for ${exam} exam (student level: ${level}).
${langInstr}
Variation seed: ${seed} — produce a DIFFERENT question from previous ones.
Lean the question towards this theme: ${focus} (but keep it relevant to the ${exam} syllabus).
The question should be:
- Fresh and specific (avoid generic "role of technology in agriculture" type repeats)
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
      // Lock §3.8: ~$0.002 for a question generation via Groq.
      await deps.aiEngine.recordAICost(principal.userId, 0.002);
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

    // Per-day essay-grading quota via the central gate (expiry-aware
    // essaysPerDay; -1 = unlimited, 0 = not included). We keep HTTP 429 (the
    // essay page already handles it) but return the structured upgrade body
    // so the limit prompt is consistent. Fail-open: enforce() never throws.
    let essayCommit: () => Promise<void> = async () => {};
    if (planGate) {
      const lang = (user.language ?? 'en') as 'en' | 'hi';
      const gate = await planGate.enforce(user, FeatureKey.ESSAY_GRADING, lang);
      if (!gate.ok) {
        deps.logger.info('essay.limit_hit', { userId: principal.userId, reason: gate.body.error, plan: gate.body.plan });
        return c.json({ ...gate.body }, 429);
      }
      essayCommit = gate.commit;
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
        { exam, level: user.onboardingLevel ?? 'beginner', language },
        'gpt4o'
      );
      // Lock §3.8: ~$0.02 for long-form grading via GPT-4o.
      await deps.aiEngine.recordAICost(principal.userId, 0.02);

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

      // Count this grading against the per-day quota (only on success, so a
      // failed/parse-error grading doesn't burn the user's daily allowance).
      await essayCommit();

      deps.logger.info('essay.graded', { userId: principal.userId, score: feedback.overallScore, wordCount });
      return c.json({ feedback });
    } catch (err) {
      deps.logger.error('essay.grade_error', { error: err instanceof Error ? err.message : String(err) });
      throw new HTTPException(503, { message: 'Grading failed. Please try again.' });
    }
  });

  return app;
}
