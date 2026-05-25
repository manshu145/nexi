import Groq from 'groq-sdk';
import OpenAI from 'openai';
import type { Env } from '../env.js';
import type { Logger } from '../logger.js';

export interface MCQOption { key: 'A' | 'B' | 'C' | 'D'; text: string; }
export interface GeneratedMCQ { id: string; question: string; options: MCQOption[]; correctOption: 'A' | 'B' | 'C' | 'D'; explanation: string; difficulty: 'easy' | 'medium' | 'hard'; subject?: string; topic?: string; }
export interface AssessmentResult { score: number; total: number; level: 'beginner' | 'intermediate' | 'advanced'; message: string; messageHi: string; }

export interface GeneratedSyllabus {
  exam: string;
  examName: string;
  subjects: { slug: string; name: string; nameHi: string; icon: string; chapters: { slug: string; name: string; nameHi: string; order: number; estimatedMinutes: number; }[]; }[];
}

export interface AIEngine {
  generateAssessmentQuestions(examSlug: string, language: 'en' | 'hi', count?: number): Promise<GeneratedMCQ[]>;
  scoreAssessment(questions: GeneratedMCQ[], answers: { questionId: string; chosen: string | null }[]): Promise<AssessmentResult>;
  generateChapterContent(chapter: string, subject: string, exam: string, language: 'en' | 'hi'): Promise<string>;
  generateChapterMCQs(chapter: string, subject: string, exam: string, language: 'en' | 'hi', count?: number): Promise<GeneratedMCQ[]>;
  generateMermaidDiagram(chapter: string, subject: string, exam: string): Promise<string>;
  generateSyllabus(examSlug: string, examName: string, level: string): Promise<GeneratedSyllabus>;
  generateSelectionDiagram(selectedText: string, subject: string, language: 'en' | 'hi'): Promise<string>;
  generateCurrentAffairsQuiz(headlines: string, count?: number): Promise<GeneratedMCQ[]>;
  translateToHindi(items: { headline: string; summary: string }[]): Promise<{ headline: string; summary: string }[]>;
}

export function createAIEngine(env: Env, logger: Logger): AIEngine {
  const groq = env.GROQ_API_KEY ? new Groq({ apiKey: env.GROQ_API_KEY }) : null;
  const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

  return {
    async generateAssessmentQuestions(examSlug, language = 'en', count = 15) {
      const langInstr = language === 'hi' ? 'Generate all questions and options in Hindi (Devanagari script).' : 'Generate all questions and options in English.';
      const prompt = `You are an expert Indian competitive exam question creator.\n\nGenerate exactly ${count} MCQs for "${examSlug}" exam.\n${langInstr}\n\nRequirements:\n- Mix: 5 easy, 5 medium, 5 hard\n- 4 options (A-D), correct answer, brief explanation\n- Different subjects/topics\n\nRespond ONLY with JSON:\n{"questions":[{"id":"q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"easy","subject":"...","topic":"..."}]}`;
      try {
        if (!groq) throw new Error('GROQ_API_KEY not configured');
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

    async generateChapterContent(chapter, subject, exam, language = 'en') {
      const langInstr = language === 'hi' ? 'Write the entire chapter in Hindi (Devanagari). Simple, student-friendly language.' : 'Write in clear, student-friendly English.';
      const prompt = `You are an expert Indian education content writer.\n\nWrite a chapter on "${chapter}" (subject: ${subject}, exam: ${exam}).\n${langInstr}\n\nRequirements:\n- 800-1200 words, Markdown format\n- Sections: Introduction, Key Concepts (with examples), Important Points, Summary\n- Use ## headings\n- Include real-world Indian examples\n- Exam-focused: highlight frequently-asked areas\n- For science/math: include formulas in $...$\n\nWrite ONLY the Markdown content.`;
      try {
        if (!openai) throw new Error("OPENAI_API_KEY not configured"); const c = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.6, max_tokens: 3000 });
        const content = c.choices[0]?.message?.content ?? '';
        logger.info('ai.chapter_generated', { chapter, subject, exam, language, words: content.split(/\s+/).length });
        return content;
      } catch (err) { logger.error('ai.chapter_error', { error: err instanceof Error ? err.message : String(err) }); throw new Error('Failed to generate chapter content'); }
    },

    async generateChapterMCQs(chapter, subject, exam, language = 'en', count = 10) {
      const langInstr = language === 'hi' ? 'Generate in Hindi (Devanagari).' : 'Generate in English.';
      const prompt = `Generate exactly ${count} MCQs for chapter "${chapter}" (${subject}, ${exam}).\n${langInstr}\nMix: 3 easy, 4 medium, 3 hard. 4 options each. Include explanation.\n\nJSON only:\n{"questions":[{"id":"q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"easy","subject":"${subject}","topic":"${chapter}"}]}`;
      try {
        if (!groq) throw new Error("GROQ_API_KEY not configured"); const c = await groq.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 4096, response_format: { type: 'json_object' } });
        const parsed = JSON.parse(c.choices[0]?.message?.content ?? '{}') as { questions: GeneratedMCQ[] };
        logger.info('ai.chapter_mcqs', { chapter, count: parsed.questions?.length ?? 0 });
        return parsed.questions ?? [];
      } catch (err) { logger.error('ai.chapter_mcqs_error', { error: err instanceof Error ? err.message : String(err) }); throw new Error('Failed to generate chapter MCQs'); }
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

    async generateCurrentAffairsQuiz(headlines: string, count = 20) {
      const prompt = `You are a current affairs quiz generator for Indian competitive exams (UPSC, SSC, Banking).\n\nBased on today's news headlines below, generate exactly ${count} MCQs.\n\nHeadlines:\n${headlines.slice(0, 3000)}\n\nRequirements:\n- Questions should test factual recall from these headlines\n- 4 options (A-D), one correct answer\n- Mix difficulty: 7 easy, 8 medium, 5 hard\n- Include brief explanation for correct answer\n- Cover different categories (national, international, economy, science, sports)\n\nRespond ONLY with JSON:\n{"questions":[{"id":"ca-q1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOption":"A","explanation":"...","difficulty":"easy","subject":"current-affairs","topic":"national"}]}`;

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
