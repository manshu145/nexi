import Groq from 'groq-sdk';
import OpenAI from 'openai';
import type { Env } from '../env.js';
import type { Logger } from '../logger.js';

export interface MCQOption {
  key: 'A' | 'B' | 'C' | 'D';
  text: string;
}

export interface GeneratedMCQ {
  id: string;
  question: string;
  options: MCQOption[];
  correctOption: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  subject?: string;
  topic?: string;
}

export interface AssessmentResult {
  score: number;
  total: number;
  level: 'beginner' | 'intermediate' | 'advanced';
  message: string;
  messageHi: string;
}

export interface AIEngine {
  generateAssessmentQuestions(examSlug: string, language: 'en' | 'hi', count?: number): Promise<GeneratedMCQ[]>;
  scoreAssessment(questions: GeneratedMCQ[], answers: { questionId: string; chosen: string | null }[]): Promise<AssessmentResult>;
}

export function createAIEngine(env: Env, logger: Logger): AIEngine {
  const groq = new Groq({ apiKey: env.GROQ_API_KEY });
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  return {
    async generateAssessmentQuestions(examSlug, language = 'en', count = 15) {
      const langInstruction = language === 'hi'
        ? 'Generate all questions and options in Hindi (Devanagari script).'
        : 'Generate all questions and options in English.';

      const prompt = `You are an expert Indian competitive exam question creator.

Generate exactly ${count} multiple choice questions for the "${examSlug}" exam.
${langInstruction}

Requirements:
- Mix of difficulty: 5 easy, 5 medium, 5 hard
- Each question must have exactly 4 options (A, B, C, D)
- Include the correct answer and a brief explanation
- Cover different subjects/topics relevant to the exam

Respond ONLY with valid JSON in this exact format:
{
  "questions": [
    {
      "id": "q1",
      "question": "...",
      "options": [
        { "key": "A", "text": "..." },
        { "key": "B", "text": "..." },
        { "key": "C", "text": "..." },
        { "key": "D", "text": "..." }
      ],
      "correctOption": "A",
      "explanation": "...",
      "difficulty": "easy",
      "subject": "...",
      "topic": "..."
    }
  ]
}`;

      try {
        const completion = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 4096,
          response_format: { type: 'json_object' },
        });

        const content = completion.choices[0]?.message?.content ?? '{}';
        const parsed = JSON.parse(content) as { questions: GeneratedMCQ[] };
        logger.info('ai.assessment_questions_generated', { examSlug, language, count: parsed.questions?.length ?? 0 });
        return parsed.questions ?? [];
      } catch (err) {
        logger.error('ai.assessment_questions_error', { error: err instanceof Error ? err.message : String(err) });
        throw new Error('Failed to generate assessment questions');
      }
    },

    async scoreAssessment(questions, answers) {
      let correct = 0;
      for (const answer of answers) {
        const q = questions.find((qq) => qq.id === answer.questionId);
        if (q && answer.chosen === q.correctOption) correct++;
      }

      const total = questions.length;
      const percentage = (correct / total) * 100;

      try {
        const prompt = `A student took an assessment for an Indian competitive exam.
They scored ${correct}/${total} (${percentage.toFixed(1)}%).

Based on this performance, assign a level and provide an encouraging message.

Respond ONLY with valid JSON:
{
  "level": "beginner" | "intermediate" | "advanced",
  "message": "English encouraging message (1-2 sentences)",
  "messageHi": "Same message in Hindi (Devanagari)"
}`;

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.5,
          max_tokens: 300,
          response_format: { type: 'json_object' },
        });

        const content = completion.choices[0]?.message?.content ?? '{}';
        const parsed = JSON.parse(content) as { level: 'beginner' | 'intermediate' | 'advanced'; message: string; messageHi: string };
        logger.info('ai.assessment_scored', { correct, total, level: parsed.level });
        return { score: correct, total, level: parsed.level, message: parsed.message, messageHi: parsed.messageHi };
      } catch (err) {
        logger.error('ai.assessment_score_error', { error: err instanceof Error ? err.message : String(err) });
        let level: 'beginner' | 'intermediate' | 'advanced';
        if (percentage >= 70) level = 'advanced';
        else if (percentage >= 40) level = 'intermediate';
        else level = 'beginner';
        return {
          score: correct,
          total,
          level,
          message: `You scored ${correct}/${total}. Your level is ${level}. Let's start learning!`,
          messageHi: `आपने ${correct}/${total} अंक प्राप्त किए। आपका स्तर ${level} है। चलिए सीखना शुरू करते हैं!`,
        };
      }
    },
  };
}
