import type { ExamSlug, McqDifficulty } from '@nexigrate/shared';

export interface AIEngineConfig {
  openaiApiKey: string;
  geminiApiKey: string;
  groqApiKey: string;
}

export interface StudentContext {
  exam: ExamSlug;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  weakSubjects: string[];
  language: 'en' | 'hi';
}

export interface GeneratedMcq {
  question: string;
  options: { key: 'A' | 'B' | 'C' | 'D'; text: string }[];
  correctOption: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  subject: string;
  difficulty: McqDifficulty;
}

export interface GeneratedChapter {
  title: string;
  sections: { heading: string; content: string }[];
  summary: string;
  keyPoints: string[];
}

export interface NexipediaArticle {
  title: string;
  summary: string;
  sections: { heading: string; content: string; imageQuery?: string }[];
  relatedTopics: string[];
  youtubeQuery: string;
  diagramPrompt: string;
}

export function createAIEngine(config: AIEngineConfig) {
  async function callOpenAI(prompt: string, systemPrompt: string): Promise<string> {
    if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY not configured');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message.content ?? '{}';
  }

  async function callGemini(prompt: string): Promise<string> {
    if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY not configured');
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
    const data = (await res.json()) as {
      candidates: { content: { parts: { text: string }[] } }[];
    };
    return data.candidates[0]?.content.parts[0]?.text ?? '{}';
  }

  return {
    async generateMcqs(ctx: StudentContext, count: number = 10, subject?: string): Promise<GeneratedMcq[]> {
      const difficultyMap: Record<string, string> = { beginner: 'easy', intermediate: 'medium', advanced: 'hard' };
      const difficulty = difficultyMap[ctx.skillLevel] ?? 'medium';
      const lang = ctx.language === 'hi' ? 'Hindi' : 'English';
      const subjectHint = subject || (ctx.weakSubjects.length > 0 ? ctx.weakSubjects[0] : 'general');

      const prompt = `Generate ${count} MCQs for ${ctx.exam} exam.\nSubject: ${subjectHint}\nDifficulty: ${difficulty}\nLanguage: ${lang}\nReturn JSON: { "mcqs": [{ "question": "...", "options": [{"key": "A", "text": "..."}, {"key": "B", "text": "..."}, {"key": "C", "text": "..."}, {"key": "D", "text": "..."}], "correctOption": "A|B|C|D", "explanation": "...", "subject": "...", "difficulty": "${difficulty}" }] }`;
      const systemPrompt = `You are an expert Indian exam preparation teacher. Generate high-quality, factually accurate MCQs.`;

      const raw = await callOpenAI(prompt, systemPrompt);
      const parsed = JSON.parse(raw) as { mcqs?: GeneratedMcq[] };
      return parsed.mcqs ?? [];
    },

    async generateChapter(ctx: StudentContext, topic: string): Promise<GeneratedChapter> {
      const lang = ctx.language === 'hi' ? 'Hindi' : 'English';
      const prompt = `Create a study chapter on "${topic}" for ${ctx.exam} exam.\nStudent level: ${ctx.skillLevel}\nLanguage: ${lang}\nReturn JSON: { "title": "...", "sections": [{ "heading": "...", "content": "..." }], "summary": "...", "keyPoints": ["..."] }`;
      const systemPrompt = `You are an expert educator creating study material for Indian students. Write clearly with Indian context examples.`;

      const raw = await callOpenAI(prompt, systemPrompt);
      return JSON.parse(raw) as GeneratedChapter;
    },

    async generateNexipediaArticle(topic: string, language: 'en' | 'hi'): Promise<NexipediaArticle> {
      const lang = language === 'hi' ? 'Hindi' : 'English';
      const prompt = `Create a comprehensive encyclopedia article about "${topic}" in ${lang}.\nReturn JSON: { "title": "...", "summary": "...", "sections": [{ "heading": "...", "content": "...", "imageQuery": "..." }], "relatedTopics": ["..."], "youtubeQuery": "...", "diagramPrompt": "..." }`;
      const systemPrompt = `You are creating an educational encyclopedia. Write comprehensive, student-friendly articles (200-400 words per section).`;

      const raw = await callOpenAI(prompt, systemPrompt);
      return JSON.parse(raw) as NexipediaArticle;
    },

    callGemini,
  };
}

export type AIEngine = ReturnType<typeof createAIEngine>;
