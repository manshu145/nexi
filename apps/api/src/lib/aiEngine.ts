import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { buildChapterVerifier, type VerificationVerdict, type VerifyChapterFn } from '@nexigrate/ai-pipeline';
import type { Env } from '../env.js';
import type { Logger } from '../logger.js';
import type { AdminStore } from './adminStore.js';
import type { UserContext } from './chapterStore.js';

export interface MCQOption { key: 'A' | 'B' | 'C' | 'D'; text: string; }
export interface GeneratedMCQ { id: string; question: string; options: MCQOption[]; correctOption: 'A' | 'B' | 'C' | 'D'; explanation: string; difficulty: 'easy' | 'medium' | 'hard'; subject?: string; topic?: string; }
export interface AssessmentResult { score: number; total: number; level: 'beginner' | 'intermediate' | 'advanced'; message: string; messageHi: string; weakAreas?: string[]; strongAreas?: string[]; }

export interface GeneratedSyllabus {
  exam: string;
  examName: string;
  subjects: { slug: string; name: string; nameHi: string; icon: string; chapters: { slug: string; name: string; nameHi: string; order: number; estimatedMinutes: number; }[]; }[];
}

export type VisualizationType = 'diagram' | 'mindmap' | 'flowchart' | 'timeline' | 'image';
export interface VisualizationResult { type: 'mermaid' | 'image'; content: string; /* mermaid code or image URL */ }

export interface StageResults {
  questions: GeneratedMCQ[];
  answers: { questionId: string; chosen: string | null }[];
}

export interface AIEngine {
  generateAssessmentQuestions(examSlug: string, language: 'en' | 'hi', count?: number): Promise<GeneratedMCQ[]>;
  generateStage1Questions(examSlug: string, language: 'en' | 'hi'): Promise<GeneratedMCQ[]>;
  generateStage2Questions(examSlug: string, language: 'en' | 'hi', stage1Results: StageResults): Promise<GeneratedMCQ[]>;
  generateStage3Questions(examSlug: string, language: 'en' | 'hi', stage1Results: StageResults, stage2Results: StageResults): Promise<GeneratedMCQ[]>;
  scoreAssessment(questions: GeneratedMCQ[], answers: { questionId: string; chosen: string | null }[]): Promise<AssessmentResult>;
  scoreMultiStageAssessment(stage1: StageResults, stage2: StageResults, stage3: StageResults): Promise<AssessmentResult>;
  generateChapterContent(chapter: string, subject: string, exam: string, language: 'en' | 'hi', userContext?: UserContext): Promise<string>;
  generateChapterMCQs(chapter: string, subject: string, exam: string, language: 'en' | 'hi', count?: number, seed?: string, chapterContent?: string, userLevel?: 'beginner' | 'intermediate' | 'advanced'): Promise<GeneratedMCQ[]>;
  generateMermaidDiagram(chapter: string, subject: string, exam: string): Promise<string>;
  generateVisualization(topic: string, subject: string, exam: string, type: VisualizationType): Promise<VisualizationResult>;
  generateSyllabus(examSlug: string, examName: string, level: string): Promise<GeneratedSyllabus>;
  generateSelectionDiagram(selectedText: string, subject: string, language: 'en' | 'hi'): Promise<string>;
  generateCurrentAffairsQuiz(headlines: string, count?: number, language?: 'en' | 'hi'): Promise<GeneratedMCQ[]>;
  translateToHindi(items: { headline: string; summary: string }[]): Promise<{ headline: string; summary: string }[]>;
  chat(messages: { role: 'user' | 'assistant'; content: string }[], userContext: { exam: string; level: string; language: 'en' | 'hi' }, preferredModel?: 'gpt4o' | 'groq' | 'gemini'): Promise<string>;
}

/** Helper to log AI calls to adminStore for system logs visibility */
function logAICallToStore(
  adminStore: AdminStore | null,
  model: string,
  tokens: number,
  cost: number,
  latencyMs: number,
  userId?: string,
  extra?: { status?: 'success' | 'error'; endpoint?: string; provider?: string; error?: string; requestPreview?: string; responsePreview?: string }
) {
  if (!adminStore) return;
  adminStore.logAICall({
    model, tokens, cost, latencyMs, userId, timestamp: new Date().toISOString(),
    status: extra?.status ?? 'success',
    endpoint: extra?.endpoint,
    provider: extra?.provider,
    error: extra?.error,
    requestPreview: extra?.requestPreview?.slice(0, 300),
    responsePreview: extra?.responsePreview?.slice(0, 500),
  }).catch(() => {});
}

/** Estimate token count from text length */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Estimate cost based on model and tokens */
function estimateCost(model: string, tokens: number): number {
  const rates: Record<string, number> = {
    'gpt-4o': 0.000005,
    'dall-e-3': 0.04,
    'llama-3.3-70b-versatile': 0.0000008,
    'gemini-1.5-flash': 0.0000001,
    'gemini-2.0-flash-exp': 0.0000002,
  };
  return (rates[model] ?? 0.000001) * tokens;
}

export function createAIEngine(env: Env, logger: Logger, adminStore?: AdminStore | null): AIEngine {
  // Log which AI providers are available at startup
  const hasGroq = !!(env.GROQ_API_KEY && env.GROQ_API_KEY.length > 5);
  const hasOpenai = !!(env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 5);
  const hasGemini = !!(env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 5);
  logger.info('ai.providers_init', {
    groq: hasGroq, openai: hasOpenai, gemini: hasGemini,
    groqKeyLen: env.GROQ_API_KEY?.length ?? 0,
    openaiKeyLen: env.OPENAI_API_KEY?.length ?? 0,
    geminiKeyLen: env.GEMINI_API_KEY?.length ?? 0,
  });
  const groq = hasGroq ? new Groq({ apiKey: env.GROQ_API_KEY }) : null;
  const openai = hasOpenai ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;
  const store = adminStore ?? null;

  /**
   * 3-Layer AI verifier (lock §5.2 + marketing §2.4 claim).
   *
   * Built once at engine construction, reused for every chapter generation.
   * The verifier is fail-open by design: if Gemini is down AND OpenAI is
   * down, it returns `{ verified: true, confidence: 0.5, verifier: 'fallback' }`
   * so a paying student does NOT get blocked on infrastructure issues. The
   * caller logs the fallback verdict so we can chase outages.
   *
   * Cost: ~$0.0005 per chapter via Gemini Flash (verifier) on top of the
   * ~$0.05 GPT-4o generation -- a 1% increment in exchange for making the
   * "verified by 3-layer AI detection" marketing claim true in code.
   *
   * If Gemini is missing entirely (e.g. a half-configured staging env)
   * the verifier is `null` and the route falls back to the legacy
   * single-provider path with a warning logged at startup.
   */
  const chapterVerifier: VerifyChapterFn | null = hasGemini
    ? buildChapterVerifier({
        geminiApiKey: env.GEMINI_API_KEY ?? '',
        openaiApiKey: hasOpenai ? env.OPENAI_API_KEY : undefined,
      })
    : null;
  if (!chapterVerifier) {
    logger.warn('ai.verifier_disabled', {
      reason: 'GEMINI_API_KEY missing; chapters will ship without cross-check',
    });
  }

  /**
   * Multi-provider question generator with the resilience properties the
   * assessment endpoint actually needs in production:
   *
   *   - Token budget headroom: 8192 instead of the previous 4096. Hindi
   *     responses (Devanagari script + GSM-7-style multi-byte handling
   *     by tokenizers) commonly double the token count of the same
   *     content in English. 10 detailed MCQs plus explanations plus
   *     subject + topic fields tipped past 4096 frequently for Stage 1
   *     in Hindi -- the response would silently truncate mid-JSON, the
   *     `JSON.parse` would throw, every provider would hit the same
   *     wall, and the route would 503 with the now-infamous "AI service
   *     may be busy" message.
   *
   *   - Best-effort partial recovery: when JSON.parse fails on a
   *     truncated response, we try to find the LAST complete `}` before
   *     the truncation and re-parse that prefix. If we get back >=5
   *     questions for Stage 1 (which has 10 target), we return what we
   *     have rather than burning the full provider chain on the same
   *     bug. The user gets a slightly shorter assessment instead of an
   *     error.
   *
   *   - Useful errors: the thrown message now lists which provider hit
   *     which failure mode, so admin /admin/logs can diagnose at a
   *     glance instead of seeing "Failed: Groq: <error>; OpenAI: <error>;
   *     Gemini failed" with no structure.
   */
  async function _generateQuestions(prompt: string, endpoint: string, examSlug: string, language: string): Promise<GeneratedMCQ[]> {
    const errors: string[] = [];
    const MAX_TOKENS = 8192;
    const MIN_USABLE_QUESTIONS = 5;

    /** Try to extract a usable questions array from a possibly-truncated response. */
    function recoverQuestions(raw: string): GeneratedMCQ[] | null {
      // Fast path: clean JSON.
      try {
        const parsed = JSON.parse(raw) as { questions?: GeneratedMCQ[] };
        if (parsed.questions && parsed.questions.length >= MIN_USABLE_QUESTIONS) return parsed.questions;
        if (parsed.questions && parsed.questions.length > 0) return parsed.questions; // Better than nothing.
      } catch { /* fall through to recovery */ }

      // Truncated path: walk back from the end to find a balanced JSON
      // substring. We start from the last `}` and try parsing
      // progressively shorter prefixes that close any open question
      // objects + array.
      const lastObjEnd = raw.lastIndexOf('}');
      if (lastObjEnd < 0) return null;
      // Heuristic: close the array + outer object after the last full
      // question we can see. Find the position of the last `,` before
      // the truncation, snip there, append `]}` to close cleanly.
      const head = raw.slice(0, lastObjEnd + 1);
      const candidates = [head + ']}', head + '}'];
      for (const candidate of candidates) {
        try {
          const parsed = JSON.parse(candidate) as { questions?: GeneratedMCQ[] };
          if (parsed.questions && parsed.questions.length >= MIN_USABLE_QUESTIONS) return parsed.questions;
        } catch { /* try next */ }
      }
      // Last resort: regex out individual question objects.
      const matches = raw.match(/\{\s*"id"[^}]*"correctOption"\s*:\s*"[A-D]"[^}]*\}/g);
      if (matches && matches.length >= MIN_USABLE_QUESTIONS) {
        const recovered: GeneratedMCQ[] = [];
        for (const m of matches) {
          try { recovered.push(JSON.parse(m) as GeneratedMCQ); } catch { /* skip malformed */ }
        }
        if (recovered.length >= MIN_USABLE_QUESTIONS) return recovered;
      }
      return null;
    }

    // ── Provider 1: Groq (fastest path) ──────────────────────────────
    if (groq) {
      try {
        const completion = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: MAX_TOKENS,
          response_format: { type: 'json_object' },
        });
        const raw = completion.choices[0]?.message?.content ?? '';
        const finishReason = completion.choices[0]?.finish_reason ?? 'unknown';
        const recovered = recoverQuestions(raw);
        if (recovered) {
          const tokens = estimateTokens(raw);
          logAICallToStore(store, 'llama-3.3-70b-versatile', tokens, estimateCost('llama-3.3-70b-versatile', tokens), 0, undefined, { status: 'success', endpoint, provider: 'groq', requestPreview: prompt.slice(0, 200), responsePreview: raw.slice(0, 300) });
          logger.info('ai.questions_generated', { provider: 'groq', endpoint, examSlug, language, count: recovered.length, finishReason });
          return recovered;
        }
        errors.push(`Groq returned ${raw.length} chars, no parseable questions (finish=${finishReason})`);
      } catch (err) {
        errors.push(`Groq: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      errors.push('Groq not configured');
    }

    // ── Provider 2: OpenAI (slower, more reliable) ───────────────────
    if (openai) {
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: MAX_TOKENS,
          response_format: { type: 'json_object' },
        });
        const raw = completion.choices[0]?.message?.content ?? '';
        const finishReason = completion.choices[0]?.finish_reason ?? 'unknown';
        const recovered = recoverQuestions(raw);
        if (recovered) {
          logger.info('ai.questions_generated', { provider: 'openai', endpoint, examSlug, language, count: recovered.length, finishReason });
          return recovered;
        }
        errors.push(`OpenAI returned ${raw.length} chars, no parseable questions (finish=${finishReason})`);
      } catch (err) {
        errors.push(`OpenAI: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      errors.push('OpenAI not configured');
    }

    // ── Provider 3: Gemini (final fallback) ──────────────────────────
    if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 5) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: MAX_TOKENS },
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }> };
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          const finishReason = data.candidates?.[0]?.finishReason ?? 'unknown';
          // Gemini sometimes wraps JSON in ```json ... ``` fences.
          const stripped = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
          const recovered = recoverQuestions(stripped);
          if (recovered) {
            logger.info('ai.questions_generated', { provider: 'gemini', endpoint, examSlug, language, count: recovered.length, finishReason });
            return recovered;
          }
          errors.push(`Gemini returned ${rawText.length} chars, no parseable questions (finish=${finishReason})`);
        } else {
          errors.push(`Gemini HTTP ${res.status}`);
        }
      } catch (err) {
        errors.push(`Gemini: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      errors.push('Gemini not configured');
    }

    logger.error('ai.questions_all_failed', { errors, endpoint, examSlug, language });
    logAICallToStore(store, 'all-providers', 0, 0, 0, undefined, {
      status: 'error',
      endpoint,
      error: errors.join(' | '),
      requestPreview: prompt.slice(0, 200),
    });
    throw new Error(`All AI providers failed for ${endpoint} (${examSlug}/${language}): ${errors.join(' | ')}`);
  }

  return {
    async generateAssessmentQuestions(examSlug, language = 'en', count = 15) {
      const langInstr = language === 'hi' ? 'Generate all questions and options in Hindi (Devanagari script).' : 'Generate all questions and options in English.';
      const prompt = `You are an expert Indian competitive exam question creator.\n\nGenerate exactly ${count} MCQs for "${examSlug}" exam.\n${langInstr}\n\nRequirements:\n- Mix: 5 easy, 5 medium, 5 hard\n- 4 options (A-D), correct answer, brief explanation\n- Different subjects/topics\n\nRespond ONLY with JSON:\n{"questions":[{"id":"q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"easy","subject":"...","topic":"..."}]}`;
      // Delegate to the resilient internal helper so the legacy 15-question
      // endpoint inherits the larger token budget and partial-recovery
      // behaviour added in the assessment-AI-resilience hotfix.
      return _generateQuestions(prompt, 'generateAssessmentQuestions', examSlug, language);
    },

    async generateStage1Questions(examSlug, language = 'en') {
      const langInstr = language === 'hi' ? 'Generate all questions and options in Hindi (Devanagari script).' : 'Generate all questions and options in English.';
      const prompt = `You are an expert Indian competitive exam question creator.\n\nGenerate exactly 10 MCQs for "${examSlug}" exam — Stage 1 Core Subjects assessment.\n${langInstr}\n\nBased on the exam "${examSlug}", generate questions covering the OFFICIAL SYLLABUS subjects:\n- If exam is UPSC/upsc-cse: test History(2) + Geography(2) + Polity(2) + Economy(2) + Science(2)\n- If exam is NEET/neet-ug: test Physics(3) + Chemistry(4) + Biology(3)\n- If exam is JEE/jee-main: test Physics(3) + Chemistry(3) + Mathematics(4)\n- If exam is SSC CGL/ssc-cgl or Banking: test Reasoning(3) + Quant(3) + GK(2) + English(2)\n- If exam is Class 10/class-10-cbse or Class 12/class-12-cbse: test Math(3) + Science(3) + Social Science(2) + English(2)\n- If exam is IT/Python/Web Dev/Data Science/digital-marketing/tally-accounting: test relevant technical topics proportionally\n- For any other exam: identify its core subjects and distribute questions ACROSS subjects proportionally\n\nRequirements:\n- Mix of easy and medium difficulty\n- 4 options (A-D), correct answer, brief explanation\n- MUST include subject and topic fields for each question\n- Questions must be relevant to the SPECIFIC exam syllabus\n\nRespond ONLY with JSON:\n{"questions":[{"id":"s1-q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"medium","subject":"history","topic":"modern-india"}]}`;
      return _generateQuestions(prompt, 'generateStage1Questions', examSlug, language);
    },

    async generateStage2Questions(examSlug, language = 'en', stage1Results) {
      // Calculate stage 1 score to determine difficulty
      let correct = 0;
      for (const a of stage1Results.answers) {
        const q = stage1Results.questions.find(qq => qq.id === a.questionId);
        if (q && a.chosen === q.correctOption) correct++;
      }
      const stage1Pct = (correct / stage1Results.questions.length) * 100;
      let difficulty: string;
      if (stage1Pct >= 70) difficulty = 'hard';
      else if (stage1Pct >= 40) difficulty = 'medium';
      else difficulty = 'easy';

      const langInstr = language === 'hi' ? 'Generate all questions and options in Hindi (Devanagari script).' : 'Generate all questions and options in English.';
      const prompt = `You are an expert Indian competitive exam question creator.\n\nGenerate exactly 8 MCQs for "${examSlug}" exam — Stage 2 Difficulty Calibration.\n${langInstr}\n\nThe student scored ${correct}/${stage1Results.questions.length} (${stage1Pct.toFixed(0)}%) in Stage 1.\nBased on this performance, generate ${difficulty.toUpperCase()} level questions.\n\nRequirements:\n- All 8 questions should be ${difficulty} difficulty\n- Cover multiple subjects from the exam syllabus\n- ${difficulty === 'hard' ? 'Analytical, require deep understanding. All 4 options plausible.' : difficulty === 'medium' ? 'Application-based, require careful thought. 2 close options.' : 'Factual recall, straightforward. Clear correct answer.'}\n- 4 options (A-D), correct answer, brief explanation\n- Include subject and topic fields\n\nRespond ONLY with JSON:\n{"questions":[{"id":"s2-q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"${difficulty}","subject":"...","topic":"..."}]}`;
      return _generateQuestions(prompt, 'generateStage2Questions', examSlug, language);
    },

    async generateStage3Questions(examSlug, language = 'en', stage1Results, _stage2Results) {
      // Identify weakest subjects from stage 1
      const subjectScores: Record<string, { correct: number; total: number }> = {};
      for (const q of stage1Results.questions) {
        const subj = q.subject ?? 'general';
        if (!subjectScores[subj]) subjectScores[subj] = { correct: 0, total: 0 };
        subjectScores[subj]!.total++;
        const ans = stage1Results.answers.find(a => a.questionId === q.id);
        if (ans && ans.chosen === q.correctOption) subjectScores[subj]!.correct++;
      }

      // Find 2 weakest subjects
      const sorted = Object.entries(subjectScores)
        .map(([subj, scores]) => ({ subj, pct: (scores.correct / scores.total) * 100 }))
        .sort((a, b) => a.pct - b.pct);
      const weakSubjects = sorted.slice(0, 2).map(s => s.subj);

      const langInstr = language === 'hi' ? 'Generate all questions and options in Hindi (Devanagari script).' : 'Generate all questions and options in English.';
      const prompt = `You are an expert Indian competitive exam question creator.\n\nGenerate exactly 5 MCQs for "${examSlug}" exam — Stage 3 Weak Area Deep Dive.\n${langInstr}\n\nThe student's weakest subjects are: ${weakSubjects.join(', ')}.\nGenerate targeted questions on these weak areas to better understand the gaps.\n\nRequirements:\n- Focus on: ${weakSubjects.join(' and ')}\n- 2-3 questions on the weakest subject, rest on the second weakest\n- Mix of easy and medium difficulty (to identify exact gaps)\n- 4 options (A-D), correct answer, brief explanation\n- Include subject and topic fields\n\nRespond ONLY with JSON:\n{"questions":[{"id":"s3-q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"medium","subject":"...","topic":"..."}]}`;
      return _generateQuestions(prompt, 'generateStage3Questions', examSlug, language);
    },

    async scoreMultiStageAssessment(stage1, stage2, stage3) {
      // Calculate per-stage scores
      const scoreStage = (sr: StageResults) => {
        let correct = 0;
        for (const a of sr.answers) {
          const q = sr.questions.find(qq => qq.id === a.questionId);
          if (q && a.chosen === q.correctOption) correct++;
        }
        return { correct, total: sr.questions.length, pct: sr.questions.length > 0 ? (correct / sr.questions.length) * 100 : 0 };
      };

      const s1 = scoreStage(stage1);
      const s2 = scoreStage(stage2);
      const s3 = scoreStage(stage3);

      // Weighted average: stage1 40%, stage2 40%, stage3 20%
      const totalPct = (s1.pct * 0.4) + (s2.pct * 0.4) + (s3.pct * 0.2);
      const totalCorrect = s1.correct + s2.correct + s3.correct;
      const totalQuestions = s1.total + s2.total + s3.total;

      // Determine level
      const level: 'beginner' | 'intermediate' | 'advanced' = totalPct > 70 ? 'advanced' : totalPct >= 40 ? 'intermediate' : 'beginner';

      // Identify weak and strong areas from stage 1 subjects
      const subjectScores: Record<string, { correct: number; total: number }> = {};
      for (const q of stage1.questions) {
        const subj = q.subject ?? 'general';
        if (!subjectScores[subj]) subjectScores[subj] = { correct: 0, total: 0 };
        subjectScores[subj]!.total++;
        const ans = stage1.answers.find(a => a.questionId === q.id);
        if (ans && ans.chosen === q.correctOption) subjectScores[subj]!.correct++;
      }
      // Also count stage3 subjects
      for (const q of stage3.questions) {
        const subj = q.subject ?? 'general';
        if (!subjectScores[subj]) subjectScores[subj] = { correct: 0, total: 0 };
        subjectScores[subj]!.total++;
        const ans = stage3.answers.find(a => a.questionId === q.id);
        if (ans && ans.chosen === q.correctOption) subjectScores[subj]!.correct++;
      }

      const weakAreas: string[] = [];
      const strongAreas: string[] = [];
      for (const [subj, scores] of Object.entries(subjectScores)) {
        const pct = (scores.correct / scores.total) * 100;
        if (pct < 40) weakAreas.push(subj);
        else if (pct > 70) strongAreas.push(subj);
      }

      // Generate message
      try {
        const prompt = `Student completed a 3-stage assessment for Indian competitive exam.\nTotal weighted score: ${totalPct.toFixed(1)}% (${totalCorrect}/${totalQuestions} questions correct)\nLevel assigned: ${level}\nWeak areas: ${weakAreas.join(', ') || 'none'}\nStrong areas: ${strongAreas.join(', ') || 'none'}\n\nProvide an encouraging message about their performance. Respond ONLY JSON:\n{"message":"English (2-3 sentences)","messageHi":"Hindi Devanagari (2-3 sentences)"}`;
        if (openai) {
          const completion = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 300, response_format: { type: 'json_object' } });
          const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as { message: string; messageHi: string };
          return { score: totalCorrect, total: totalQuestions, level, message: parsed.message, messageHi: parsed.messageHi, weakAreas, strongAreas };
        }
      } catch (err) {
        logger.error('ai.multi_stage_score_error', { error: err instanceof Error ? err.message : String(err) });
      }

      // Fallback message
      return {
        score: totalCorrect,
        total: totalQuestions,
        level,
        message: `You scored ${totalCorrect}/${totalQuestions} (${totalPct.toFixed(0)}%). Level: ${level}. Let's personalize your learning!`,
        messageHi: `आपने ${totalCorrect}/${totalQuestions} अंक प्राप्त किए (${totalPct.toFixed(0)}%)। स्तर: ${level}। चलिए आपकी पढ़ाई को व्यक्तिगत बनाते हैं!`,
        weakAreas,
        strongAreas,
      };
    },

    async scoreAssessment(questions, answers) {
      let correct = 0;
      for (const a of answers) { const q = questions.find((qq) => qq.id === a.questionId); if (q && a.chosen === q.correctOption) correct++; }
      const total = questions.length;
      const pct = (correct / total) * 100;
      try {
        const prompt = `Student scored ${correct}/${total} (${pct.toFixed(1)}%) on Indian competitive exam assessment.\nAssign level and provide encouraging message.\nRespond ONLY JSON: {"level":"beginner"|"intermediate"|"advanced","message":"English (1-2 sentences)","messageHi":"Hindi Devanagari"}`;
        if (!openai) throw new Error("OPENAI_API_KEY not configured"); const completion = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 300, response_format: { type: 'json_object' } });
        const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as { level: 'beginner'|'intermediate'|'advanced'; message: string; messageHi: string };
        logger.info('ai.scored', { correct, total, level: parsed.level });
        return { score: correct, total, ...parsed };
      } catch (err) {
        logger.error('ai.score_error', { error: err instanceof Error ? err.message : String(err) });
        const level: 'beginner'|'intermediate'|'advanced' = pct >= 70 ? 'advanced' : pct >= 40 ? 'intermediate' : 'beginner';
        return { score: correct, total, level, message: `You scored ${correct}/${total}. Level: ${level}. Let's start!`, messageHi: `आपने ${correct}/${total} अंक प्राप्त किए। स्तर: ${level}। शुरू करते हैं!` };
      }
    },

    async generateChapterContent(chapter, subject, exam, language = 'en', userContext?) {
      const langInstr = language === 'hi' ? 'Write the entire chapter in Hindi (Devanagari). Simple, student-friendly language.' : 'Write in clear, student-friendly English.';

      // Build personalization section based on user level
      let personalizationInstr = '';
      const level = userContext?.onboardingLevel ?? 'intermediate';

      if (level === 'beginner') {
        const weakAreasStr = userContext?.weakAreas?.length ? `The student's weak areas are: ${userContext.weakAreas.join(', ')} — be extra careful to build strong basics in these areas.` : '';
        personalizationInstr = `This student is a BEGINNER — they are new to this topic.
Writing style: Simple language, avoid jargon, explain every term.
Structure: Start with 'What is this?', use many examples from daily life, include memory tricks and mnemonics, use simple analogies.
Length: 600-800 words. Language: ${language === 'hi' ? 'Hindi' : 'English'}.
${weakAreasStr}
End with: 3 key takeaways in bullet points.`;
      } else if (level === 'advanced') {
        const strongAreasStr = userContext?.strongAreas?.length ? `Student's strong areas: ${userContext.strongAreas.join(', ')} — use these as reference points.` : '';
        personalizationInstr = `This student is ADVANCED — high level of preparation.
Writing style: Analytical and deep, assume strong foundational knowledge.
Structure: Advanced concepts, critical analysis, inter-topic connections, recent developments, previous year questions with approach strategy, common mistakes to avoid at advanced level.
Length: 1000-1200 words. Language: ${language === 'hi' ? 'Hindi' : 'English'}.
${strongAreasStr}
End with: Examiner perspective and scoring strategy.`;
      } else {
        // intermediate
        const completedStr = userContext?.completedChapters?.length ? `The student has already completed: ${userContext.completedChapters.slice(0, 10).join(', ')} — build connections to those topics where relevant.` : '';
        personalizationInstr = `This student has basic knowledge — INTERMEDIATE level.
Writing style: Clear and direct, some technical terms with brief explanation.
Structure: Quick concept recap, deeper explanation, exam-relevant facts and figures, previous year question patterns.
Length: 800-1000 words. Language: ${language === 'hi' ? 'Hindi' : 'English'}.
${completedStr}
End with: Important facts to remember for exam.`;
      }

      const prompt = `You are an expert Indian education content writer.\nYou are generating educational content for ${exam}.\nThis content must strictly follow the official ${exam} syllabus.\nOnly cover topics that are part of the official curriculum.\nGround all factual content in NCERT textbooks where applicable.\nDo not add topics outside the official syllabus.\n\nGenerate a chapter on "${chapter}" (subject: ${subject}) for ${exam} preparation.\n${langInstr}\n\n${personalizationInstr}\n\nAdditional Requirements:\n- Use Markdown format with ## headings for each major section\n- Use ## headings generously — each sub-topic should have its own ## heading\n- Include real-world Indian examples\n- Exam-focused: highlight frequently-asked areas\n- For science/math: include formulas in $...$\n- Reference NCERT concepts and terminology where applicable\n- Be thorough and cover every aspect needed for this level.\n\nWrite ONLY the Markdown content.`;
      const startTime = performance.now();

      // Inner: one attempt at the primary generator. Pulled out so we
      // can call it twice if the verifier flags low confidence on the
      // first pass (regenerate-with-feedback loop).
      async function generateOnce(extraInstr?: string): Promise<string> {
        if (!openai) throw new Error('OPENAI_API_KEY not configured');
        const finalPrompt = extraInstr ? `${prompt}\n\nADDITIONAL CONSTRAINTS FROM VERIFIER:\n${extraInstr}` : prompt;
        const c = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: finalPrompt }],
          temperature: 0.6,
          max_tokens: 8000,
        });
        return c.choices[0]?.message?.content ?? '';
      }

      try {
        // Layer 1: primary generation.
        let content = await generateOnce();
        let verdict: VerificationVerdict | null = null;
        let regenerated = false;

        // Layer 2: cross-check via @nexigrate/ai-pipeline.
        if (chapterVerifier && content.trim().length >= 100) {
          verdict = await chapterVerifier(content, {
            exam,
            subject,
            chapter,
            language,
            level: userContext?.onboardingLevel ?? 'intermediate',
          });

          // Regenerate ONCE if confidence is below threshold AND the
          // verifier produced concrete issues we can feed back. Capped
          // at a single retry so we never burn 3x cost on a chronic
          // hallucination -- in that case we ship with the warning and
          // let the admin dashboard surface the low-confidence row.
          if (!verdict.verified && verdict.issues.length > 0 && verdict.confidence < 0.7) {
            const feedback = verdict.issues
              .map((i) => `- ${i.kind}: ${i.message}${i.excerpt ? ` (excerpt: "${i.excerpt}")` : ''}`)
              .join('\n');
            const retryHint = `Your previous draft had these issues, fix them:\n${feedback}`;
            const retried = await generateOnce(retryHint);
            if (retried.trim().length >= 100) {
              content = retried;
              regenerated = true;
              verdict = await chapterVerifier(content, {
                exam, subject, chapter, language,
                level: userContext?.onboardingLevel ?? 'intermediate',
              });
            }
          }
        }

        const tokens = estimateTokens(content + prompt);
        const latencyMs = Math.round(performance.now() - startTime);
        logAICallToStore(store, 'gpt-4o', tokens, estimateCost('gpt-4o', tokens), latencyMs, undefined, {
          status: 'success',
          endpoint: 'generateChapterContent',
          provider: 'openai',
          requestPreview: prompt.slice(0, 200),
          responsePreview: content.slice(0, 300),
        });
        // The verifier verdict is logged separately so the admin can
        // see, per-chapter, which were verified vs which shipped on the
        // verifier's fallback path. Issues are summarised, not the full
        // raw response (that's only useful for one-off debugging and
        // would bloat the log store).
        if (verdict) {
          logger.info('ai.chapter_verified', {
            chapter,
            subject,
            exam,
            language,
            verifier: verdict.verifier,
            verified: verdict.verified,
            confidence: verdict.confidence,
            issueCount: verdict.issues.length,
            issueKinds: verdict.issues.map((i) => i.kind),
            verifierLatencyMs: verdict.latencyMs,
            regenerated,
          });
        }
        logger.info('ai.chapter_generated', {
          chapter,
          subject,
          exam,
          language,
          words: content.split(/\s+/).length,
          regenerated,
        });
        return content;
      } catch (err) {
        logger.error('ai.chapter_error', { error: err instanceof Error ? err.message : String(err) });
        throw new Error('Failed to generate chapter content');
      }
    },

    async generateChapterMCQs(chapter, subject, exam, language = 'en', count = 10, seed?: string, chapterContent?: string, userLevel?: 'beginner' | 'intermediate' | 'advanced') {
      const langInstr = language === 'hi' ? 'Generate in Hindi (Devanagari).' : 'Generate in English.';
      const seedInstr = seed ? `\nVariation seed: ${seed}. Make these questions DIFFERENT from previous attempts. Use creative angles, tricky options, and less common facts from the content.` : '';
      const contentContext = chapterContent ? `\n\nIMPORTANT: Generate questions ONLY from this specific chapter content. Do NOT ask about topics not covered here:\n---\n${chapterContent.slice(0, 3000)}\n---` : '';

      // Difficulty distribution based on user level
      let difficultyMix: string;
      let difficultyStyle: string;
      if (userLevel === 'beginner') {
        difficultyMix = '6 easy, 3 medium, 1 hard';
        difficultyStyle = 'Beginner MCQs: factual recall, straightforward options, test basic understanding.';
      } else if (userLevel === 'advanced') {
        difficultyMix = '1 easy, 3 medium, 6 hard';
        difficultyStyle = 'Advanced MCQs: analysis-based, all 4 options should be plausible, require deep understanding and critical thinking.';
      } else {
        difficultyMix = '3 easy, 4 medium, 3 hard';
        difficultyStyle = 'Intermediate MCQs: application-based, 2 close options that require careful thinking.';
      }

      const prompt = `Generate exactly ${count} UNIQUE multiple choice questions for chapter "${chapter}" (${subject}, ${exam}).\n${langInstr}${seedInstr}${contentContext}\n\nRules:\n- Questions MUST be based on the chapter content provided above\n- Do NOT ask about topics not covered in the chapter\n- Each question must have exactly 4 options (A/B/C/D), one correct answer, and a brief explanation\n- Mix: ${difficultyMix}\n- ${difficultyStyle}\n- Include explanation referencing the chapter content\n\nJSON only:\n{"questions":[{"id":"q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"easy","subject":"${subject}","topic":"${chapter}"}]}`;
      const errors: string[] = [];
      if (groq) {
        try {
          const c = await groq.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 4096, response_format: { type: 'json_object' } });
          const parsed = JSON.parse(c.choices[0]?.message?.content ?? '{}') as { questions: GeneratedMCQ[] };
          if (parsed.questions?.length) { logger.info('ai.chapter_mcqs', { provider: 'groq', chapter, count: parsed.questions.length }); return parsed.questions; }
          errors.push('Groq returned empty');
        } catch (err) { errors.push(`Groq: ${err instanceof Error ? err.message : String(err)}`); }
      } else { errors.push('Groq not configured'); }
      if (openai) {
        try {
          const c = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 4096, response_format: { type: 'json_object' } });
          const parsed = JSON.parse(c.choices[0]?.message?.content ?? '{}') as { questions: GeneratedMCQ[] };
          if (parsed.questions?.length) { logger.info('ai.chapter_mcqs', { provider: 'openai', chapter, count: parsed.questions.length }); return parsed.questions; }
          errors.push('OpenAI returned empty');
        } catch (err) { errors.push(`OpenAI: ${err instanceof Error ? err.message : String(err)}`); }
      } else { errors.push('OpenAI not configured'); }
      if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 5) {
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 4096 } }) });
          if (res.ok) { const data = await res.json() as any; const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''; const jsonMatch = rawText.match(/\{[\s\S]*\}/); if (jsonMatch) { const parsed = JSON.parse(jsonMatch[0]) as { questions: GeneratedMCQ[] }; if (parsed.questions?.length) { logger.info('ai.chapter_mcqs', { provider: 'gemini', chapter, count: parsed.questions.length }); return parsed.questions; } } }
          errors.push(`Gemini failed`);
        } catch (err) { errors.push(`Gemini: ${err instanceof Error ? err.message : String(err)}`); }
      } else { errors.push('Gemini not configured'); }
      logger.error('ai.chapter_mcqs_all_failed', { errors, chapter, subject, exam });
      logAICallToStore(store, 'all-providers', 0, 0, 0, undefined, { status: 'error', endpoint: 'generateChapterMCQs', error: errors.join('; '), requestPreview: `Chapter: ${chapter}, Subject: ${subject}` });
      throw new Error(`Failed to generate chapter MCQs: ${errors.join('; ')}`);
    },

    async generateMermaidDiagram(chapter, subject, exam) {
      const prompt = `Create a Mermaid.js flowchart (graph TD) that visually explains key concepts of "${chapter}" (${subject}, ${exam}).\n\nRequirements:\n- Max 12 nodes with clear, concise labels\n- Use meaningful connections with labels on arrows where helpful\n- Group related concepts visually\n- Valid Mermaid syntax only, no markdown fences\n- Use subgraphs if the topic has distinct sub-areas\n\nExample:\ngraph TD\n    A[Main Concept] --> B[Sub-concept 1]\n    A --> C[Sub-concept 2]\n    B --> D[Detail]\n    C --> E[Detail]`;
      try {
        // Use Gemini Flash for visual/diagram tasks
        if (env.GEMINI_API_KEY) {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 800 } }),
          });
          if (res.ok) {
            const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
            const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            const cleaned = raw.replace(/```mermaid\n?/g, '').replace(/```\n?/g, '').trim();
            if (cleaned) { logger.info('ai.mermaid_gemini', { chapter, subject, exam }); return cleaned; }
          }
        }
        // Fallback to OpenAI if Gemini fails
        if (!openai) throw new Error("No AI API key configured");
        const c = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 800 });
        const raw = c.choices[0]?.message?.content ?? '';
        const cleaned = raw.replace(/```mermaid\n?/g, '').replace(/```\n?/g, '').trim();
        logger.info('ai.mermaid_openai_fallback', { chapter, subject, exam });
        return cleaned;
      } catch (err) { logger.error('ai.mermaid_error', { error: err instanceof Error ? err.message : String(err) }); throw new Error('Failed to generate diagram'); }
    },

    async generateVisualization(topic: string, subject: string, exam: string, type: VisualizationType): Promise<VisualizationResult> {
      // For image type: try DALL-E 3 first, fallback to Gemini Imagen, then fallback to diagram (never fail to user)
      if (type === 'image') {
        // Attempt 1: DALL-E 3 (OpenAI)
        if (openai) {
          try {
            const startTime = performance.now();
            const imagePrompt = `Educational diagram of "${topic}" for Indian ${exam} students. Clean, labeled, black and white, textbook style. No watermark. Simple and clear for students.`;
            const imageRes = await openai.images.generate({
              model: 'dall-e-3',
              prompt: imagePrompt,
              n: 1,
              size: '1024x1024',
              quality: 'standard',
            });
            const imageUrl = imageRes.data?.[0]?.url;
            if (imageUrl) {
              const latencyMs = Math.round(performance.now() - startTime);
              logAICallToStore(store, 'dall-e-3', 1, 0.04, latencyMs, undefined, { status: 'success', endpoint: 'generateVisualization', provider: 'openai', requestPreview: imagePrompt.slice(0, 200), responsePreview: `Image URL generated: ${imageUrl.slice(0, 80)}...` });
              logger.info('ai.visualization_image', { topic, subject, exam, provider: 'dalle3' });
              // Note: DALL-E URLs expire in ~1hr. Frontend should cache/download.
              return { type: 'image', content: imageUrl };
            }
          } catch (err) {
            logger.warn('ai.visualization_dalle_failed', { error: err instanceof Error ? err.message : String(err), topic });
          }
        }

        // Attempt 2: Gemini Imagen (gemini-2.0-flash-exp with image response modality)
        if (env.GEMINI_API_KEY) {
          try {
            const geminiImagePrompt = `Generate an educational black-and-white textbook-style diagram explaining "${topic}" for Indian ${exam} students. Clean labels, simple layout, no text watermarks.`;
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${env.GEMINI_API_KEY}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: geminiImagePrompt }] }],
                generationConfig: { temperature: 0.4, maxOutputTokens: 4096, responseModalities: ['TEXT', 'IMAGE'] },
              }),
            });
            if (res.ok) {
              const data = await res.json() as { candidates?: { content?: { parts?: { text?: string; inlineData?: { mimeType: string; data: string } }[] } }[] };
              // Check if Gemini returned inline image data
              const parts = data.candidates?.[0]?.content?.parts ?? [];
              for (const part of parts) {
                if (part.inlineData?.data) {
                  const dataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                  logger.info('ai.visualization_image', { topic, subject, exam, provider: 'gemini-imagen' });
                  return { type: 'image', content: dataUrl };
                }
              }
              logger.warn('ai.visualization_gemini_no_image_data', { topic, partsCount: parts.length });
            } else {
              const errText = await res.text().catch(() => '');
              logger.warn('ai.visualization_gemini_http_error', { status: res.status, body: errText.slice(0, 200) });
            }
          } catch (err) {
            logger.warn('ai.visualization_gemini_image_failed', { error: err instanceof Error ? err.message : String(err), topic });
          }
        }

        // Attempt 3: Fallback to detailed mermaid diagram (never show error to user)
        logger.info('ai.visualization_image_fallback_to_diagram', { topic, subject, exam });
        // Fall through to generate a detailed diagram instead
      }

      // For diagram/mindmap/flowchart/timeline, use Mermaid syntax via Gemini/OpenAI
      let mermaidType: string;
      let mermaidExample: string;
      switch (type) {
        case 'mindmap':
          mermaidType = 'mindmap';
          mermaidExample = `mindmap\n  root((${topic}))\n    Branch 1\n      Sub-topic A\n      Sub-topic B\n    Branch 2\n      Sub-topic C`;
          break;
        case 'timeline':
          mermaidType = 'timeline';
          mermaidExample = `timeline\n    title Timeline of ${topic}\n    section Phase 1\n      Event 1 : Description\n    section Phase 2\n      Event 2 : Description`;
          break;
        case 'flowchart':
          mermaidType = 'flowchart (graph TD)';
          mermaidExample = `graph TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Action 1]\n    B -->|No| D[Action 2]`;
          break;
        default: // 'diagram'
          mermaidType = 'flowchart (graph TD)';
          mermaidExample = `graph TD\n    A[Main Concept] --> B[Sub-concept 1]\n    A --> C[Sub-concept 2]\n    B --> D[Detail]`;
      }

      const prompt = `Create a Mermaid.js ${mermaidType} that visually explains key concepts of "${topic}" (${subject}, ${exam}).

Requirements:
- Use ${mermaidType} syntax
- Max 12-15 nodes with clear, concise labels
- Use meaningful connections with labels where helpful
- Valid Mermaid syntax ONLY, no markdown fences, no backticks
- Make it educational and easy to understand for students

Example format:
${mermaidExample}

Generate ONLY the Mermaid code, nothing else.`;

      try {
        // Use Gemini Flash for mermaid generation (cheap + fast)
        if (env.GEMINI_API_KEY) {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 1000 } }),
          });
          if (res.ok) {
            const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
            const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            const cleaned = raw.replace(/```mermaid\n?/g, '').replace(/```\n?/g, '').trim();
            if (cleaned) {
              logger.info('ai.visualization_mermaid', { type, topic, subject, exam, provider: 'gemini' });
              return { type: 'mermaid', content: cleaned };
            }
          }
        }
        // Fallback to OpenAI
        if (!openai) throw new Error('No AI API key configured');
        const c = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 1000 });
        const raw = c.choices[0]?.message?.content ?? '';
        const cleaned = raw.replace(/```mermaid\n?/g, '').replace(/```\n?/g, '').trim();
        logger.info('ai.visualization_mermaid', { type, topic, subject, exam, provider: 'openai' });
        return { type: 'mermaid', content: cleaned };
      } catch (err) {
        logger.error('ai.visualization_error', { type, error: err instanceof Error ? err.message : String(err) });
        throw new Error(`Failed to generate ${type} visualization`);
      }
    },

    async generateSyllabus(examSlug: string, examName: string, level: string) {
      const prompt = `You are an expert Indian education curriculum designer.\n\nGenerate a complete study syllabus for "${examName}" exam.\nStudent level: ${level}.\n\nRequirements:\n- 3-5 subjects relevant to this exam\n- 5-8 chapters per subject, ordered from basic to advanced\n- Each chapter: slug (kebab-case), name (English), nameHi (Hindi Devanagari), estimated study time in minutes\n- Each subject: slug, name, nameHi, icon (single emoji)\n- Order chapters logically for progressive learning\n\nRespond ONLY with valid JSON:\n{"exam":"${examSlug}","examName":"${examName}","subjects":[{"slug":"subject-slug","name":"Subject Name","nameHi":"विषय नाम","icon":"📚","chapters":[{"slug":"chapter-slug","name":"Chapter Name","nameHi":"अध्याय नाम","order":1,"estimatedMinutes":40}]}]}`;
      try {
        if (!openai) throw new Error("OPENAI_API_KEY not configured");
        const c = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.6, max_tokens: 4000, response_format: { type: 'json_object' } });
        const parsed = JSON.parse(c.choices[0]?.message?.content ?? '{}') as GeneratedSyllabus;
        logger.info('ai.syllabus_generated', { examSlug, subjects: parsed.subjects?.length ?? 0 });
        return parsed;
      } catch (err) { logger.error('ai.syllabus_error', { error: err instanceof Error ? err.message : String(err) }); throw new Error('Failed to generate syllabus'); }
    },

    async generateSelectionDiagram(selectedText: string, subject: string, language: 'en' | 'hi') {
      const langInstr = language === 'hi' ? 'Use Hindi labels in the diagram nodes.' : 'Use English labels.';
      const prompt = `Create a Mermaid.js diagram (graph TD or graph LR) that visually explains this concept from ${subject}:\n\n"${selectedText.slice(0, 500)}"\n\n${langInstr}\nRequirements:\n- Max 10 nodes with concise, clear labels\n- Show relationships/flow clearly\n- Valid Mermaid syntax only, no markdown fences\n- Use appropriate diagram type (flowchart for processes, graph for relationships)`;
      try {
        // Use Gemini Flash for visual tasks
        if (env.GEMINI_API_KEY) {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 600 } }),
          });
          if (res.ok) {
            const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
            const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            const cleaned = raw.replace(/```mermaid\n?/g, '').replace(/```\n?/g, '').trim();
            if (cleaned) { logger.info('ai.selection_diagram_gemini', { subject, language }); return cleaned; }
          }
        }
        // Fallback to OpenAI
        if (!openai) throw new Error("No AI API key configured");
        const c = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 600 });
        const raw = c.choices[0]?.message?.content ?? '';
        logger.info('ai.selection_diagram_openai_fallback', { subject, language });
        return raw.replace(/```mermaid\n?/g, '').replace(/```\n?/g, '').trim();
      } catch (err) { logger.error('ai.selection_diagram_error', { error: err instanceof Error ? err.message : String(err) }); throw new Error('Failed to generate diagram'); }
    },

    async generateCurrentAffairsQuiz(headlines: string, count = 20, language: 'en' | 'hi' = 'en') {
      const langInstr = language === 'hi' ? 'Generate ALL questions, options, and explanations in Hindi (Devanagari script).' : 'Generate in English.';
      const prompt = `You are a current affairs quiz generator for Indian competitive exams (UPSC, SSC, Banking).\n\nBased on today's news headlines below, generate exactly ${count} MCQs.\n${langInstr}\n\nHeadlines:\n${headlines.slice(0, 3000)}\n\nRequirements:\n- Questions should test factual recall from these headlines\n- 4 options (A-D), one correct answer\n- Mix difficulty: 7 easy, 8 medium, 5 hard\n- Include brief explanation for correct answer\n- Cover different categories (national, international, economy, science, sports)\n\nRespond ONLY with JSON:\n{"questions":[{"id":"ca-q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"easy","subject":"current-affairs","topic":"national"}]}`;

      // Try Groq first (fast), then OpenAI fallback, then Gemini fallback
      const errors: string[] = [];

      // Attempt 1: Groq
      if (groq) {
        try {
          const c = await groq.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.6, max_tokens: 6000, response_format: { type: 'json_object' } });
          const parsed = JSON.parse(c.choices[0]?.message?.content ?? '{}') as { questions: GeneratedMCQ[] };
          if (parsed.questions?.length) {
            logger.info('ai.ca_quiz_generated', { provider: 'groq', count: parsed.questions.length });
            return parsed.questions;
          }
          errors.push('Groq returned empty questions');
        } catch (err) {
          errors.push(`Groq: ${err instanceof Error ? err.message : String(err)}`);
          logger.warn('ai.ca_quiz_groq_failed', { error: errors[errors.length - 1] });
        }
      } else { errors.push('GROQ_API_KEY not configured'); }

      // Attempt 2: OpenAI
      if (openai) {
        try {
          const c = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.6, max_tokens: 6000, response_format: { type: 'json_object' } });
          const parsed = JSON.parse(c.choices[0]?.message?.content ?? '{}') as { questions: GeneratedMCQ[] };
          if (parsed.questions?.length) {
            logger.info('ai.ca_quiz_generated', { provider: 'openai', count: parsed.questions.length });
            return parsed.questions;
          }
          errors.push('OpenAI returned empty questions');
        } catch (err) {
          errors.push(`OpenAI: ${err instanceof Error ? err.message : String(err)}`);
          logger.warn('ai.ca_quiz_openai_failed', { error: errors[errors.length - 1] });
        }
      } else { errors.push('OPENAI_API_KEY not configured'); }

      // Attempt 3: Gemini
      if (env.GEMINI_API_KEY) {
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 6000 } }),
          });
          if (res.ok) {
            const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]) as { questions: GeneratedMCQ[] };
              if (parsed.questions?.length) {
                logger.info('ai.ca_quiz_generated', { provider: 'gemini', count: parsed.questions.length });
                return parsed.questions;
              }
            }
            errors.push('Gemini returned no parseable questions');
          } else { errors.push(`Gemini HTTP ${res.status}`); }
        } catch (err) {
          errors.push(`Gemini: ${err instanceof Error ? err.message : String(err)}`);
          logger.warn('ai.ca_quiz_gemini_failed', { error: errors[errors.length - 1] });
        }
      } else { errors.push('GEMINI_API_KEY not configured'); }

      logger.error('ai.ca_quiz_all_failed', { errors });
      throw new Error(`All AI providers failed for quiz generation: ${errors.join('; ')}`);
    },

    async chat(messages: { role: 'user' | 'assistant'; content: string }[], userContext: { exam: string; level: string; language: 'en' | 'hi' }, preferredModel?: 'gpt4o' | 'groq' | 'gemini'): Promise<string> {
      const langInstr = userContext.language === 'hi' ? 'Reply in Hindi (Devanagari script). Be concise.' : 'Reply in English. Be concise.';
      const systemPrompt = `You are Nexi, an AI study mentor for Indian competitive exam students. Student is preparing for ${userContext.exam} at ${userContext.level} level. ${langInstr}

Rules for your responses:
- When responding with code, use markdown code blocks with language identifier.
- When responding with a table, use markdown table syntax.
- When a concept can be shown as a diagram, output a Mermaid diagram in a \`\`\`mermaid code block.
- When giving a quote or important highlight, wrap it in a blockquote (> text).
- For step-by-step processes, use numbered lists.
- Always structure long responses with clear headings (## or ###).
- Be helpful, encouraging, and exam-focused. Keep answers under 300 words unless asked for detail.`;
      const chatMessages = [{ role: 'system' as const, content: systemPrompt }, ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))];

      // Determine provider order based on preferredModel
      type Provider = 'groq' | 'openai' | 'gemini';
      let providerOrder: Provider[];
      switch (preferredModel) {
        case 'gpt4o': providerOrder = ['openai', 'groq', 'gemini']; break;
        case 'gemini': providerOrder = ['gemini', 'groq', 'openai']; break;
        case 'groq': providerOrder = ['groq', 'openai', 'gemini']; break;
        default: providerOrder = ['groq', 'openai', 'gemini']; break;
      }

      for (const provider of providerOrder) {
        if (provider === 'groq' && groq) {
          try {
            const startTime = performance.now();
            const c = await groq.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: chatMessages, temperature: 0.7, max_tokens: 1500 });
            const reply = c.choices[0]?.message?.content ?? '';
            if (reply) { const tokens = estimateTokens(reply); logAICallToStore(store, 'llama-3.3-70b-versatile', tokens, estimateCost('llama-3.3-70b-versatile', tokens), Math.round(performance.now() - startTime), undefined, { status: 'success', endpoint: 'chat', provider: 'groq', requestPreview: messages[messages.length - 1]?.content?.slice(0, 200), responsePreview: reply.slice(0, 300) }); logger.info('ai.chat', { provider: 'groq', length: reply.length, preferredModel }); return reply; }
          } catch (err) { logger.warn('ai.chat_groq_failed', { error: err instanceof Error ? err.message : String(err) }); }
        }
        if (provider === 'openai' && openai) {
          try {
            const startTime = performance.now();
            const c = await openai.chat.completions.create({ model: 'gpt-4o', messages: chatMessages, temperature: 0.7, max_tokens: 1500 });
            const reply = c.choices[0]?.message?.content ?? '';
            if (reply) { const tokens = estimateTokens(reply); logAICallToStore(store, 'gpt-4o', tokens, estimateCost('gpt-4o', tokens), Math.round(performance.now() - startTime), undefined, { status: 'success', endpoint: 'chat', provider: 'openai', requestPreview: messages[messages.length - 1]?.content?.slice(0, 200), responsePreview: reply.slice(0, 300) }); logger.info('ai.chat', { provider: 'openai', length: reply.length, preferredModel }); return reply; }
          } catch (err) { logger.warn('ai.chat_openai_failed', { error: err instanceof Error ? err.message : String(err) }); }
        }
        if (provider === 'gemini' && env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 5) {
          try {
            const geminiMessages = chatMessages.map(m => m.content).join('\n\n');
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: geminiMessages }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 1500 } }),
            });
            if (res.ok) {
              const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
              const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
              if (reply) { logger.info('ai.chat', { provider: 'gemini', length: reply.length, preferredModel }); return reply; }
            }
          } catch (err) { logger.warn('ai.chat_gemini_failed', { error: err instanceof Error ? err.message : String(err) }); }
        }
      }
      throw new Error('Chat AI unavailable. Please try again.');
    },

    async translateToHindi(items: { headline: string; summary: string }[]) {
      if (items.length === 0) return [];
      const prompt = `Translate the following news items to Hindi (Devanagari script). Keep them concise and factual.\n\nItems:\n${items.map((it, i) => `${i + 1}. Headline: ${it.headline}\n   Summary: ${it.summary}`).join('\n')}\n\nRespond ONLY with valid JSON:\n{"items":[{"headline":"हिंदी headline","summary":"हिंदी summary"}]}`;

      // Try Gemini first (cheap + fast for translation)
      if (env.GEMINI_API_KEY) {
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 3000 } }),
          });
          if (res.ok) {
            const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]) as { items: { headline: string; summary: string }[] };
              if (parsed.items?.length) {
                logger.info('ai.translate_hindi', { provider: 'gemini', count: parsed.items.length });
                return parsed.items;
              }
            }
          }
        } catch (err) { logger.warn('ai.translate_gemini_failed', { error: err instanceof Error ? err.message : String(err) }); }
      }

      // Fallback: Groq
      if (groq) {
        try {
          const c = await groq.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 3000, response_format: { type: 'json_object' } });
          const parsed = JSON.parse(c.choices[0]?.message?.content ?? '{}') as { items: { headline: string; summary: string }[] };
          if (parsed.items?.length) {
            logger.info('ai.translate_hindi', { provider: 'groq', count: parsed.items.length });
            return parsed.items;
          }
        } catch (err) { logger.warn('ai.translate_groq_failed', { error: err instanceof Error ? err.message : String(err) }); }
      }

      // Fallback: OpenAI
      if (openai) {
        try {
          const c = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 3000, response_format: { type: 'json_object' } });
          const parsed = JSON.parse(c.choices[0]?.message?.content ?? '{}') as { items: { headline: string; summary: string }[] };
          if (parsed.items?.length) {
            logger.info('ai.translate_hindi', { provider: 'openai', count: parsed.items.length });
            return parsed.items;
          }
        } catch (err) { logger.warn('ai.translate_openai_failed', { error: err instanceof Error ? err.message : String(err) }); }
      }

      logger.warn('ai.translate_all_failed', { message: 'All providers failed, returning original items' });
      return items; // Return originals if all translation fails
    },
  };
}
