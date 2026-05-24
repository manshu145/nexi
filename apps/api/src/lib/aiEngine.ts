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

export interface AdaptiveQuestion {
  question: string;
  options: { key: 'A' | 'B' | 'C' | 'D'; text: string }[];
  correctOption: 'A' | 'B' | 'C' | 'D';
  difficulty: McqDifficulty;
  subject: string;
  topic: string;
}

export interface AssessmentResult {
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  score: number;
  totalQuestions: number;
  subjectScores: { subject: string; score: number; total: number }[];
  weakSubjects: string[];
  strongSubjects: string[];
  studyPlan: string[];
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
    async generateMcqs(
      ctx: StudentContext,
      count: number = 10,
      subject?: string,
    ): Promise<GeneratedMcq[]> {
      const difficultyMap: Record<string, string> = {
        beginner: 'easy',
        intermediate: 'medium',
        advanced: 'hard',
      };
      const difficulty = difficultyMap[ctx.skillLevel] ?? 'medium';
      const lang = ctx.language === 'hi' ? 'Hindi' : 'English';
      const subjectHint =
        subject || (ctx.weakSubjects.length > 0 ? ctx.weakSubjects[0] : 'general');

      const prompt = `Generate ${count} multiple choice questions for ${ctx.exam} exam preparation.
Subject focus: ${subjectHint}
Difficulty: ${difficulty}
Language: ${lang}
Student skill level: ${ctx.skillLevel}

Return JSON: { "mcqs": [{ "question": "...", "options": [{"key": "A", "text": "..."}, {"key": "B", "text": "..."}, {"key": "C", "text": "..."}, {"key": "D", "text": "..."}], "correctOption": "A|B|C|D", "explanation": "...", "subject": "...", "difficulty": "${difficulty}" }] }`;

      const systemPrompt = `You are an expert Indian exam preparation teacher. Generate high-quality MCQs appropriate for the student's level. Each question must have exactly 4 options, one correct answer, and a clear explanation. Questions must be factually accurate and exam-relevant.`;

      const raw = await callOpenAI(prompt, systemPrompt);
      const parsed = JSON.parse(raw) as { mcqs?: GeneratedMcq[] };
      return parsed.mcqs ?? [];
    },

    async generateChapter(ctx: StudentContext, topic: string): Promise<GeneratedChapter> {
      const lang = ctx.language === 'hi' ? 'Hindi' : 'English';
      const prompt = `Create a detailed study chapter on "${topic}" for ${ctx.exam} exam preparation.
Student level: ${ctx.skillLevel}
Language: ${lang}

The chapter should be:
- Appropriate for ${ctx.skillLevel} level students
- Include real-world examples
- Be exam-focused with key points highlighted
- Have clear explanations

Return JSON: { "title": "...", "sections": [{ "heading": "...", "content": "..." }], "summary": "...", "keyPoints": ["..."] }`;

      const systemPrompt = `You are an expert educator creating study material for Indian students. Write in a clear, engaging style appropriate for the student's level. Use analogies and examples from Indian context.`;

      const raw = await callOpenAI(prompt, systemPrompt);
      return JSON.parse(raw) as GeneratedChapter;
    },

    async generateNexipediaArticle(
      topic: string,
      language: 'en' | 'hi',
    ): Promise<NexipediaArticle> {
      const lang = language === 'hi' ? 'Hindi' : 'English';
      const prompt = `Create a comprehensive encyclopedia article about "${topic}" in ${lang}.
      
This should be like Wikipedia but more student-friendly. Include:
- A clear summary
- Multiple sections covering all aspects
- Suggest image search queries for each section
- Suggest a YouTube search query for educational video
- Suggest a diagram/infographic description

Return JSON: { "title": "...", "summary": "...", "sections": [{ "heading": "...", "content": "...", "imageQuery": "..." }], "relatedTopics": ["..."], "youtubeQuery": "...", "diagramPrompt": "..." }`;

      const systemPrompt = `You are creating an educational encyclopedia. Write comprehensive, accurate, well-structured articles. Each section should be detailed (200-400 words). Cover historical context, current relevance, key facts, and exam-relevant points.`;

      const raw = await callOpenAI(prompt, systemPrompt);
      return JSON.parse(raw) as NexipediaArticle;
    },

    async generateAdaptiveQuestions(
      exam: ExamSlug,
      round: number,
      previousResults?: { correct: number; total: number },
    ): Promise<AdaptiveQuestion[]> {
      let difficulty = 'medium';
      if (previousResults) {
        const ratio = previousResults.correct / previousResults.total;
        if (ratio >= 0.8) difficulty = 'hard';
        else if (ratio <= 0.4) difficulty = 'easy';
      }

      const prompt = `Generate 5 assessment questions for ${exam} exam.
Round: ${round} of 3
Difficulty: ${difficulty}
Cover different subjects relevant to this exam.

Return JSON: { "questions": [{ "question": "...", "options": [{"key": "A", "text": "..."}, {"key": "B", "text": "..."}, {"key": "C", "text": "..."}, {"key": "D", "text": "..."}], "correctOption": "A|B|C|D", "difficulty": "${difficulty}", "subject": "...", "topic": "..." }] }`;

      const systemPrompt = `You are assessing a student's knowledge level for ${exam}. Generate questions that accurately gauge understanding across core subjects.`;

      const raw = await callOpenAI(prompt, systemPrompt);
      const parsed = JSON.parse(raw) as { questions?: AdaptiveQuestion[] };
      return parsed.questions ?? [];
    },

    async assessStudent(
      _exam: ExamSlug,
      answers: { question: AdaptiveQuestion; chosen: string | null }[],
    ): Promise<AssessmentResult> {
      let correct = 0;
      const subjectMap: Record<string, { correct: number; total: number }> = {};

      for (const a of answers) {
        const subj = a.question.subject;
        if (!subjectMap[subj]) subjectMap[subj] = { correct: 0, total: 0 };
        subjectMap[subj]!.total++;
        if (a.chosen === a.question.correctOption) {
          correct++;
          subjectMap[subj]!.correct++;
        }
      }

      const total = answers.length;
      const ratio = total > 0 ? correct / total : 0;
      const skillLevel: 'beginner' | 'intermediate' | 'advanced' =
        ratio >= 0.7 ? 'advanced' : ratio >= 0.4 ? 'intermediate' : 'beginner';

      const subjectScores = Object.entries(subjectMap).map(([subject, s]) => ({
        subject,
        score: s.correct,
        total: s.total,
      }));

      const weakSubjects = subjectScores
        .filter((s) => s.total > 0 && s.score / s.total < 0.5)
        .map((s) => s.subject);
      const strongSubjects = subjectScores
        .filter((s) => s.total > 0 && s.score / s.total >= 0.7)
        .map((s) => s.subject);

      const studyPlan =
        weakSubjects.length > 0
          ? weakSubjects.map((s) => `Focus on ${s} — start with basics and build up`)
          : ['Great foundation! Move to advanced problem-solving'];

      return {
        skillLevel,
        score: correct,
        totalQuestions: total,
        subjectScores,
        weakSubjects,
        strongSubjects,
        studyPlan,
      };
    },

    async generateCurrentAffairs(
      rawNews: string,
      language: 'en' | 'hi',
    ): Promise<{ items: { title: string; summary: string; category: string; examRelevance: string; source: string }[] }> {
      const lang = language === 'hi' ? 'Hindi' : 'English';
      const prompt = `From these news items, create a current affairs digest for exam preparation in ${lang}:

${rawNews}

Return JSON: { "items": [{ "title": "...", "summary": "...", "category": "polity|economy|science|international|sports|environment", "examRelevance": "why this matters for exams", "source": "..." }] }`;

      const systemPrompt = `You are creating exam-relevant current affairs digest for Indian competitive exam students. Focus on facts, dates, and exam-important details.`;

      const raw = await callOpenAI(prompt, systemPrompt);
      return JSON.parse(raw) as { items: { title: string; summary: string; category: string; examRelevance: string; source: string }[] };
    },

    async generateQuizFromCA(
      items: { title: string; summary: string }[],
      count: number = 20,
    ): Promise<GeneratedMcq[]> {
      const prompt = `From these current affairs items, generate ${count} MCQs:
${JSON.stringify(items.slice(0, 10))}

Return JSON: { "mcqs": [{ "question": "...", "options": [{"key": "A", "text": "..."}, {"key": "B", "text": "..."}, {"key": "C", "text": "..."}, {"key": "D", "text": "..."}], "correctOption": "A|B|C|D", "explanation": "...", "subject": "current-affairs", "difficulty": "medium" }] }`;

      const systemPrompt = `Generate factual MCQs based on current affairs. Each question must have exactly one correct answer that can be verified from the provided news items.`;

      const raw = await callOpenAI(prompt, systemPrompt);
      const parsed = JSON.parse(raw) as { mcqs?: GeneratedMcq[] };
      return parsed.mcqs ?? [];
    },

    callGemini,
  };
}

export type AIEngine = ReturnType<typeof createAIEngine>;
