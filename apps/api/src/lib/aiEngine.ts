import Groq from 'groq-sdk';
import OpenAI from 'openai';
import type { Env } from '../env.js';
import type { Logger } from '../logger.js';

export interface MCQOption { key: 'A' | 'B' | 'C' | 'D'; text: string; }
export interface GeneratedMCQ { id: string; question: string; options: MCQOption[]; correctOption: 'A' | 'B' | 'C' | 'D'; explanation: string; difficulty: 'easy' | 'medium' | 'hard'; subject?: string; topic?: string; }
export interface AssessmentResult { score: number; total: number; level: 'beginner' | 'intermediate' | 'advanced'; message: string; messageHi: string; }

export interface AIEngine {
  generateAssessmentQuestions(examSlug: string, language: 'en' | 'hi', count?: number): Promise<GeneratedMCQ[]>;
  scoreAssessment(questions: GeneratedMCQ[], answers: { questionId: string; chosen: string | null }[]): Promise<AssessmentResult>;
  generateChapterContent(chapter: string, subject: string, exam: string, language: 'en' | 'hi'): Promise<string>;
  generateChapterMCQs(chapter: string, subject: string, exam: string, language: 'en' | 'hi', count?: number): Promise<GeneratedMCQ[]>;
  generateMermaidDiagram(chapter: string, subject: string, exam: string): Promise<string>;
}

export function createAIEngine(env: Env, logger: Logger): AIEngine {
  const groq = new Groq({ apiKey: env.GROQ_API_KEY });
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  return {
    async generateAssessmentQuestions(examSlug, language = 'en', count = 15) {
      const langInstr = language === 'hi' ? 'Generate all questions and options in Hindi (Devanagari script).' : 'Generate all questions and options in English.';
      const prompt = `You are an expert Indian competitive exam question creator.\n\nGenerate exactly ${count} MCQs for "${examSlug}" exam.\n${langInstr}\n\nRequirements:\n- Mix: 5 easy, 5 medium, 5 hard\n- 4 options (A-D), correct answer, brief explanation\n- Different subjects/topics\n\nRespond ONLY with JSON:\n{"questions":[{"id":"q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"easy","subject":"...","topic":"..."}]}`;
      try {
        const completion = await groq.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 4096, response_format: { type: 'json_object' } });
        const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as { questions: GeneratedMCQ[] };
        logger.info('ai.questions_generated', { examSlug, language, count: parsed.questions?.length ?? 0 });
        return parsed.questions ?? [];
      } catch (err) { logger.error('ai.questions_error', { error: err instanceof Error ? err.message : String(err) }); throw new Error('Failed to generate assessment questions'); }
    },

    async scoreAssessment(questions, answers) {
      let correct = 0;
      for (const a of answers) { const q = questions.find((qq) => qq.id === a.questionId); if (q && a.chosen === q.correctOption) correct++; }
      const total = questions.length;
      const pct = (correct / total) * 100;
      try {
        const prompt = `Student scored ${correct}/${total} (${pct.toFixed(1)}%) on Indian competitive exam assessment.\nAssign level and provide encouraging message.\nRespond ONLY JSON: {"level":"beginner"|"intermediate"|"advanced","message":"English (1-2 sentences)","messageHi":"Hindi Devanagari"}`;
        const completion = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 300, response_format: { type: 'json_object' } });
        const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as { level: 'beginner'|'intermediate'|'advanced'; message: string; messageHi: string };
        logger.info('ai.scored', { correct, total, level: parsed.level });
        return { score: correct, total, ...parsed };
      } catch (err) {
        logger.error('ai.score_error', { error: err instanceof Error ? err.message : String(err) });
        const level: 'beginner'|'intermediate'|'advanced' = pct >= 70 ? 'advanced' : pct >= 40 ? 'intermediate' : 'beginner';
        return { score: correct, total, level, message: `You scored ${correct}/${total}. Level: ${level}. Let's start!`, messageHi: `आपने ${correct}/${total} अंक प्राप्त किए। स्तर: ${level}। शुरू करते हैं!` };
      }
    },

    async generateChapterContent(chapter, subject, exam, language = 'en') {
      const langInstr = language === 'hi' ? 'Write the entire chapter in Hindi (Devanagari). Simple, student-friendly language.' : 'Write in clear, student-friendly English.';
      const prompt = `You are an expert Indian education content writer.\n\nWrite a chapter on "${chapter}" (subject: ${subject}, exam: ${exam}).\n${langInstr}\n\nRequirements:\n- 800-1200 words, Markdown format\n- Sections: Introduction, Key Concepts (with examples), Important Points, Summary\n- Use ## headings\n- Include real-world Indian examples\n- Exam-focused: highlight frequently-asked areas\n- For science/math: include formulas in $...$\n\nWrite ONLY the Markdown content.`;
      try {
        const c = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.6, max_tokens: 3000 });
        const content = c.choices[0]?.message?.content ?? '';
        logger.info('ai.chapter_generated', { chapter, subject, exam, language, words: content.split(/\s+/).length });
        return content;
      } catch (err) { logger.error('ai.chapter_error', { error: err instanceof Error ? err.message : String(err) }); throw new Error('Failed to generate chapter content'); }
    },

    async generateChapterMCQs(chapter, subject, exam, language = 'en', count = 10) {
      const langInstr = language === 'hi' ? 'Generate in Hindi (Devanagari).' : 'Generate in English.';
      const prompt = `Generate exactly ${count} MCQs for chapter "${chapter}" (${subject}, ${exam}).\n${langInstr}\nMix: 3 easy, 4 medium, 3 hard. 4 options each. Include explanation.\n\nJSON only:\n{"questions":[{"id":"q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"easy","subject":"${subject}","topic":"${chapter}"}]}`;
      try {
        const c = await groq.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 4096, response_format: { type: 'json_object' } });
        const parsed = JSON.parse(c.choices[0]?.message?.content ?? '{}') as { questions: GeneratedMCQ[] };
        logger.info('ai.chapter_mcqs', { chapter, count: parsed.questions?.length ?? 0 });
        return parsed.questions ?? [];
      } catch (err) { logger.error('ai.chapter_mcqs_error', { error: err instanceof Error ? err.message : String(err) }); throw new Error('Failed to generate chapter MCQs'); }
    },

    async generateMermaidDiagram(chapter, subject, exam) {
      const prompt = `Create a Mermaid.js flowchart (graph TD) that visually explains key concepts of "${chapter}" (${subject}, ${exam}).\n\nMax 12 nodes. Valid Mermaid syntax only. No markdown fences.\nExample:\ngraph TD\n    A[Concept] --> B[Detail]\n    A --> C[Another]`;
      try {
        const c = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 800 });
        const raw = c.choices[0]?.message?.content ?? '';
        const cleaned = raw.replace(/```mermaid\n?/g, '').replace(/```\n?/g, '').trim();
        logger.info('ai.mermaid', { chapter, subject, exam });
        return cleaned;
      } catch (err) { logger.error('ai.mermaid_error', { error: err instanceof Error ? err.message : String(err) }); throw new Error('Failed to generate diagram'); }
    },
  };
}
