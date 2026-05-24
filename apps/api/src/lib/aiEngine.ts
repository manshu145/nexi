/**
 * AI Engine — central AI orchestration layer.
 *
 * Handles all AI content generation: MCQs, chapters, syllabus, assessment,
 * current affairs, and chat. Uses OpenAI (GPT-4o-mini) as primary and
 * Gemini as fallback/secondary for specific tasks.
 */

export interface AIConfig {
  openaiApiKey: string;
  geminiApiKey: string;
}

export interface GeneratedMcq {
  question: string;
  options: { key: 'A' | 'B' | 'C' | 'D'; text: string }[];
  correctOption: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  subject: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface GeneratedChapter {
  title: string;
  subject: string;
  topic: string;
  sections: { heading: string; content: string }[];
  keyPoints: string[];
  summary: string;
}

export interface SyllabusItem {
  subject: string;
  topics: { id: string; title: string; order: number }[];
}

export interface AssessmentResult {
  score: number;
  total: number;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  weakSubjects: string[];
  strongSubjects: string[];
  recommendations: string[];
}

export interface CurrentAffairsItem {
  title: string;
  summary: string;
  category: 'polity' | 'economy' | 'science' | 'international' | 'sports' | 'environment' | 'defence' | 'technology';
  date: string;
  examRelevance: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function createAIEngine(config: AIConfig) {
  async function callOpenAI(prompt: string, systemPrompt: string, temperature = 0.7): Promise<string> {
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
        temperature,
        max_tokens: 4000,
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => 'unknown');
      throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }
    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content ?? '';
  }

  async function callOpenAIChat(messages: { role: string; content: string }[], temperature = 0.7): Promise<string> {
    if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY not configured');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature,
        max_tokens: 2000,
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => 'unknown');
      throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }
    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content ?? '';
  }

  function parseJSON<T>(raw: string): T {
    // Strip markdown code fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    return JSON.parse(cleaned.trim());
  }

  return {
    /**
     * Generate syllabus for an exam — returns subjects with ordered topics.
     */
    async generateSyllabus(exam: string, language: 'en' | 'hi'): Promise<SyllabusItem[]> {
      const lang = language === 'hi' ? 'Hindi' : 'English';
      const prompt = `Generate the complete syllabus for "${exam}" exam preparation in India.
Break it into subjects, and each subject into topics in logical study order.
Each topic should have a unique id (kebab-case), title, and order number.

Return JSON: { "syllabus": [{ "subject": "...", "topics": [{ "id": "topic-slug", "title": "Topic Name in ${lang}", "order": 1 }] }] }

IMPORTANT: Topic titles must be in ${lang}. Cover ALL major topics for this exam. Minimum 5 topics per subject.`;

      const systemPrompt = `You are an expert Indian competitive exam syllabus designer. Generate comprehensive, exam-board-aligned syllabi. Return ONLY valid JSON.`;
      const raw = await callOpenAI(prompt, systemPrompt, 0.3);
      const parsed = parseJSON<{ syllabus: SyllabusItem[] }>(raw);
      return parsed.syllabus;
    },

    /**
     * Generate assessment MCQs to determine student skill level.
     */
    async generateAssessmentMcqs(exam: string, count: number, language: 'en' | 'hi'): Promise<GeneratedMcq[]> {
      const lang = language === 'hi' ? 'Hindi' : 'English';
      const prompt = `Generate ${count} MCQs to assess a student's preparation level for "${exam}" exam.
Include a mix of easy (5), medium (7), and hard (${count - 12}) questions across all subjects.
Questions should cover fundamentals to advanced concepts.

Language: ${lang}
Return JSON: { "mcqs": [{ "question": "...", "options": [{"key": "A", "text": "..."}, {"key": "B", "text": "..."}, {"key": "C", "text": "..."}, {"key": "D", "text": "..."}], "correctOption": "A|B|C|D", "explanation": "brief explanation", "subject": "...", "topic": "...", "difficulty": "easy|medium|hard" }] }`;

      const systemPrompt = `Generate factual MCQs for Indian competitive exam assessment. Each question MUST have exactly one correct answer. Questions in ${lang}. Return ONLY valid JSON.`;
      const raw = await callOpenAI(prompt, systemPrompt, 0.5);
      const parsed = parseJSON<{ mcqs: GeneratedMcq[] }>(raw);
      return parsed.mcqs ?? [];
    },

    /**
     * Assess student based on their answers to generated MCQs.
     */
    assessStudent(mcqs: GeneratedMcq[], answers: (string | null)[]): AssessmentResult {
      let correct = 0;
      const subjectScores: Record<string, { correct: number; total: number }> = {};

      for (let i = 0; i < mcqs.length; i++) {
        const mcq = mcqs[i]!;
        const answer = answers[i];
        if (!subjectScores[mcq.subject]) subjectScores[mcq.subject] = { correct: 0, total: 0 };
        subjectScores[mcq.subject]!.total++;
        if (answer === mcq.correctOption) {
          correct++;
          subjectScores[mcq.subject]!.correct++;
        }
      }

      const total = mcqs.length;
      const percentage = (correct / total) * 100;
      let skillLevel: 'beginner' | 'intermediate' | 'advanced';
      if (percentage >= 70) skillLevel = 'advanced';
      else if (percentage >= 40) skillLevel = 'intermediate';
      else skillLevel = 'beginner';

      const weakSubjects: string[] = [];
      const strongSubjects: string[] = [];
      for (const [subject, scores] of Object.entries(subjectScores)) {
        const pct = (scores.correct / scores.total) * 100;
        if (pct >= 60) strongSubjects.push(subject);
        else weakSubjects.push(subject);
      }

      const recommendations: string[] = [];
      if (weakSubjects.length > 0) {
        recommendations.push(`Focus more on: ${weakSubjects.join(', ')}`);
      }
      if (skillLevel === 'beginner') {
        recommendations.push('Start with fundamentals and build up gradually');
      } else if (skillLevel === 'advanced') {
        recommendations.push('Practice advanced problems and previous year papers');
      }

      return { score: correct, total, skillLevel, weakSubjects, strongSubjects, recommendations };
    },

    /**
     * Generate a full chapter for a topic.
     */
    async generateChapter(
      exam: string,
      subject: string,
      topic: string,
      skillLevel: string,
      language: 'en' | 'hi',
    ): Promise<GeneratedChapter> {
      const lang = language === 'hi' ? 'Hindi' : 'English';
      const prompt = `Write a comprehensive study chapter on "${topic}" (Subject: ${subject}) for ${exam} exam preparation.
Student skill level: ${skillLevel}.

Adapt difficulty accordingly:
- beginner: explain from basics, use simple language, more examples
- intermediate: balanced depth, include exam tips
- advanced: focus on advanced concepts, edge cases, previous year patterns

Return JSON: {
  "title": "Chapter title in ${lang}",
  "subject": "${subject}",
  "topic": "${topic}",
  "sections": [
    { "heading": "Section heading", "content": "Detailed content with examples (use markdown for formatting)" }
  ],
  "keyPoints": ["Point 1", "Point 2", ...],
  "summary": "Brief chapter summary"
}

Write in ${lang}. Minimum 4 sections. Each section should be thorough (200+ words).`;

      const systemPrompt = `You are an expert ${exam} tutor writing study material for Indian students. Write clear, exam-focused content. Include mnemonics, tricks, and exam tips where relevant. Return ONLY valid JSON.`;
      const raw = await callOpenAI(prompt, systemPrompt, 0.6);
      return parseJSON<GeneratedChapter>(raw);
    },

    /**
     * Generate mock test MCQs for a specific chapter/topic.
     */
    async generateMockTest(
      exam: string,
      subject: string,
      topic: string,
      count: number,
      skillLevel: string,
      language: 'en' | 'hi',
    ): Promise<GeneratedMcq[]> {
      const lang = language === 'hi' ? 'Hindi' : 'English';
      const prompt = `Generate ${count} MCQs on "${topic}" (${subject}) for ${exam} exam.
Student level: ${skillLevel}. Mix difficulties but focus on ${skillLevel} level.
Language: ${lang}

Return JSON: { "mcqs": [{ "question": "...", "options": [{"key": "A", "text": "..."}, {"key": "B", "text": "..."}, {"key": "C", "text": "..."}, {"key": "D", "text": "..."}], "correctOption": "A|B|C|D", "explanation": "...", "subject": "${subject}", "topic": "${topic}", "difficulty": "easy|medium|hard" }] }`;

      const systemPrompt = `Generate exam-quality MCQs for Indian competitive exams. Each must have exactly one correct answer with clear explanation. Return ONLY valid JSON.`;
      const raw = await callOpenAI(prompt, systemPrompt, 0.5);
      const parsed = parseJSON<{ mcqs: GeneratedMcq[] }>(raw);
      return parsed.mcqs ?? [];
    },

    /**
     * Generate final comprehensive test after syllabus completion.
     */
    async generateFinalTest(
      exam: string,
      subjects: string[],
      count: number,
      language: 'en' | 'hi',
    ): Promise<GeneratedMcq[]> {
      const lang = language === 'hi' ? 'Hindi' : 'English';
      const prompt = `Generate ${count} MCQs as a FINAL comprehensive test for ${exam}.
Cover all subjects: ${subjects.join(', ')}. 
Mix of easy (20%), medium (50%), hard (30%). Test deep understanding.
Language: ${lang}

Return JSON: { "mcqs": [{ "question": "...", "options": [{"key": "A", "text": "..."}, {"key": "B", "text": "..."}, {"key": "C", "text": "..."}, {"key": "D", "text": "..."}], "correctOption": "A|B|C|D", "explanation": "...", "subject": "...", "topic": "...", "difficulty": "easy|medium|hard" }] }`;

      const systemPrompt = `Generate a comprehensive final assessment for Indian competitive exam preparation. Questions should test deep understanding across all topics. Return ONLY valid JSON.`;
      const raw = await callOpenAI(prompt, systemPrompt, 0.5);
      const parsed = parseJSON<{ mcqs: GeneratedMcq[] }>(raw);
      return parsed.mcqs ?? [];
    },

    /**
     * Generate current affairs digest.
     */
    async generateCurrentAffairs(language: 'en' | 'hi', count: number = 8): Promise<CurrentAffairsItem[]> {
      const lang = language === 'hi' ? 'Hindi' : 'English';
      const today = new Date().toISOString().split('T')[0];
      const prompt = `Generate ${count} recent current affairs items relevant for Indian competitive exams (UPSC, SSC, Banking, State PSC).
Cover categories: polity, economy, science, international, sports, environment, defence, technology.
Each item should be concise, factual, and exam-relevant.
Date reference: around ${today}.
Language: ${lang}

Return JSON: { "items": [{ "title": "Short headline", "summary": "2-3 line summary with key facts, dates, names", "category": "polity|economy|science|international|sports|environment|defence|technology", "date": "YYYY-MM-DD", "examRelevance": "Why this matters for exams (1 line)" }] }`;

      const systemPrompt = `You are a current affairs expert for Indian competitive exams. Focus on facts, figures, dates, and names that are likely to appear in MCQs. Return ONLY valid JSON. Content in ${lang}.`;
      const raw = await callOpenAI(prompt, systemPrompt, 0.6);
      const parsed = parseJSON<{ items: CurrentAffairsItem[] }>(raw);
      return parsed.items ?? [];
    },

    /**
     * Chat with Nexi AI — study-focused chatbot with history.
     */
    async chat(
      messages: ChatMessage[],
      studentContext: { exam: string; skillLevel: string; language: 'en' | 'hi' },
    ): Promise<string> {
      const lang = studentContext.language === 'hi' ? 'Hindi' : 'English';
      const systemPrompt = `You are Nexi — an intelligent AI study assistant for Indian students preparing for ${studentContext.exam}.

Your capabilities:
- Answer any academic question with detailed explanations
- Solve problems step-by-step
- Explain concepts with examples and analogies
- Help with doubt clearing
- Provide exam tips and strategies
- Create visual explanations using text diagrams when helpful

Rules:
- Always respond in ${lang}
- Be encouraging and supportive
- If a student seems stressed, be empathetic
- Stay focused on academics — gently redirect off-topic questions
- Use markdown formatting for better readability
- For math/science, show step-by-step solutions
- Student's current level: ${studentContext.skillLevel}

You are NOT just a search engine. You are a personal tutor who understands the student's level and adapts explanations accordingly.`;

      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ];

      return callOpenAIChat(apiMessages, 0.7);
    },
  };
}

export type AIEngine = ReturnType<typeof createAIEngine>;
