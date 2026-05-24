/**
 * Phase F — Current affairs daily quiz types.
 *
 * Every day, 20 MCQs are auto-generated from the published current affairs
 * digest. All students take the same quiz. Fastest correct completion wins.
 */

export interface CurrentAffairsQuizQuestion {
  id: string;
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correctOption: 'A' | 'B' | 'C' | 'D';
  /** Which digest item this question was derived from. */
  sourceHeadline: string;
  category: string;
}

export interface CurrentAffairsQuiz {
  id: string;
  /** IST date (YYYY-MM-DD) this quiz is for. */
  date: string;
  questions: CurrentAffairsQuizQuestion[];
  /** Total time allowed in seconds. Default 600 (10 minutes). */
  timeLimitSeconds: number;
  createdAt: string;
}

export interface CurrentAffairsQuizAttempt {
  id: string;
  quizId: string;
  quizDate: string;
  userId: string;
  userName: string;
  /** Answers keyed by question id. */
  answers: Record<string, string>;
  score: number;
  totalQuestions: number;
  /** Time taken in seconds to complete the quiz. */
  timeTakenSeconds: number;
  completedAt: string;
}

export interface QuizLeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  score: number;
  timeTakenSeconds: number;
  completedAt: string;
}

export interface QuizWinner {
  userId: string;
  userName: string;
  score: number;
  timeTakenSeconds: number;
  date: string;
}
