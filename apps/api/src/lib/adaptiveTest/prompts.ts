/**
 * Phase C — AI prompts for the adaptive onboarding test + study plan generation.
 */

export function adaptiveTestGenerationPrompt(exam: string, classLevel: string, language: string): {
  system: string;
  user: string;
} {
  return {
    system: `You are an expert Indian education assessor. Generate exactly 10 multiple-choice questions to evaluate a student's current knowledge level.

RULES:
- Questions should span easy (3), medium (4), and hard (3) difficulty
- Cover the key subjects relevant to the exam
- Each question must have exactly 4 options (A, B, C, D) with one correct answer
- Include a brief explanation for each answer
- Questions should be in ${language === 'hi' ? 'Hindi' : language === 'hinglish' ? 'Hinglish (Hindi + English mix)' : 'English'}
- Source from NCERT / official syllabi only

OUTPUT FORMAT (strict JSON):
{
  "questions": [
    {
      "id": "q1",
      "question": "...",
      "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "correctOption": "A",
      "difficulty": "easy",
      "subject": "physics",
      "explanation": "..."
    }
  ]
}`,
    user: `Generate a 10-question diagnostic test for a student preparing for ${exam} at ${classLevel || 'their current level'}. The test should quickly assess their baseline knowledge across core subjects for this exam.`,
  };
}

export function studyPlanGenerationPrompt(
  exam: string,
  classLevel: string,
  score: number,
  totalQuestions: number,
  subjectScores: Record<string, { correct: number; total: number }>,
  language: string,
): { system: string; user: string } {
  const subjectSummary = Object.entries(subjectScores)
    .map(([subj, s]) => `${subj}: ${s.correct}/${s.total}`)
    .join(', ');

  return {
    system: `You are an expert education mentor for Indian students. Based on a diagnostic test result, generate a personalized 4-week study plan.

RULES:
- Identify weak areas and prioritize them
- Include daily goals (hours, topics, practice questions)
- Reference NCERT chapters and specific topics
- Be encouraging but honest about gaps
- Plan should be in ${language === 'hi' ? 'Hindi' : language === 'hinglish' ? 'Hinglish (Hindi + English mix)' : 'English'}
- Include weekly milestones

OUTPUT FORMAT (strict JSON):
{
  "overallLevel": "beginner" | "intermediate" | "advanced",
  "score": <number 0-100>,
  "strengths": ["subject1", "subject2"],
  "weaknesses": ["subject3", "subject4"],
  "weeklyPlan": [
    {
      "week": 1,
      "focus": "...",
      "dailyHours": 3,
      "topics": ["topic1", "topic2"],
      "practiceGoal": "20 MCQs + 2 long answers"
    }
  ],
  "recommendedChapters": ["chapter-slug-1", "chapter-slug-2"],
  "motivationalNote": "..."
}`,
    user: `Student diagnostic result for ${exam} (${classLevel}):
- Overall score: ${score}/${totalQuestions} (${Math.round((score / totalQuestions) * 100)}%)
- Subject breakdown: ${subjectSummary}

Generate a personalized 4-week study plan that addresses their weak areas while building on their strengths.`,
  };
}
