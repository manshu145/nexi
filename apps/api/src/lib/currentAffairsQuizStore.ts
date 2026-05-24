/**
 * Phase F — Store for current affairs daily quiz + attempts + leaderboard.
 */
import type { Firestore } from 'firebase-admin/firestore';
import type {
  CurrentAffairsQuiz,
  CurrentAffairsQuizAttempt,
  QuizLeaderboardEntry,
  QuizWinner,
} from '@nexigrate/shared';

export interface CurrentAffairsQuizStore {
  saveQuiz(quiz: CurrentAffairsQuiz): Promise<void>;
  getQuizByDate(date: string): Promise<CurrentAffairsQuiz | null>;
  saveAttempt(attempt: CurrentAffairsQuizAttempt): Promise<void>;
  getAttempt(quizId: string, userId: string): Promise<CurrentAffairsQuizAttempt | null>;
  getLeaderboard(quizDate: string, limit?: number): Promise<QuizLeaderboardEntry[]>;
  getWinner(date: string): Promise<QuizWinner | null>;
}

export class InMemoryCurrentAffairsQuizStore implements CurrentAffairsQuizStore {
  private quizzes: CurrentAffairsQuiz[] = [];
  private attempts: CurrentAffairsQuizAttempt[] = [];

  async saveQuiz(quiz: CurrentAffairsQuiz) {
    const idx = this.quizzes.findIndex((q) => q.date === quiz.date);
    if (idx >= 0) this.quizzes[idx] = quiz;
    else this.quizzes.push(quiz);
  }

  async getQuizByDate(date: string) {
    return this.quizzes.find((q) => q.date === date) ?? null;
  }

  async saveAttempt(attempt: CurrentAffairsQuizAttempt) {
    this.attempts.push(attempt);
  }

  async getAttempt(quizId: string, userId: string) {
    return this.attempts.find((a) => a.quizId === quizId && a.userId === userId) ?? null;
  }

  async getLeaderboard(quizDate: string, limit = 20): Promise<QuizLeaderboardEntry[]> {
    const dateAttempts = this.attempts
      .filter((a) => a.quizDate === quizDate)
      .sort((a, b) => {
        // Sort by score desc, then time asc
        if (b.score !== a.score) return b.score - a.score;
        return a.timeTakenSeconds - b.timeTakenSeconds;
      })
      .slice(0, limit);

    return dateAttempts.map((a, i) => ({
      rank: i + 1,
      userId: a.userId,
      userName: a.userName,
      score: a.score,
      timeTakenSeconds: a.timeTakenSeconds,
      completedAt: a.completedAt,
    }));
  }

  async getWinner(date: string): Promise<QuizWinner | null> {
    const lb = await this.getLeaderboard(date, 1);
    if (lb.length === 0) return null;
    const top = lb[0]!;
    return {
      userId: top.userId,
      userName: top.userName,
      score: top.score,
      timeTakenSeconds: top.timeTakenSeconds,
      date,
    };
  }
}

export class FirestoreCurrentAffairsQuizStore implements CurrentAffairsQuizStore {
  constructor(private db: Firestore) {}

  private quizCol() { return this.db.collection('ca_quizzes'); }
  private attemptCol() { return this.db.collection('ca_quiz_attempts'); }

  async saveQuiz(quiz: CurrentAffairsQuiz) {
    await this.quizCol().doc(quiz.id).set(quiz);
  }

  async getQuizByDate(date: string) {
    const snap = await this.quizCol().where('date', '==', date).limit(1).get();
    if (snap.empty) return null;
    return snap.docs[0]!.data() as CurrentAffairsQuiz;
  }

  async saveAttempt(attempt: CurrentAffairsQuizAttempt) {
    await this.attemptCol().doc(attempt.id).set(attempt);
  }

  async getAttempt(quizId: string, userId: string) {
    const snap = await this.attemptCol()
      .where('quizId', '==', quizId)
      .where('userId', '==', userId)
      .limit(1)
      .get();
    if (snap.empty) return null;
    return snap.docs[0]!.data() as CurrentAffairsQuizAttempt;
  }

  async getLeaderboard(quizDate: string, limit = 20): Promise<QuizLeaderboardEntry[]> {
    // Fetch top scorers, then sort by time within same score
    const snap = await this.attemptCol()
      .where('quizDate', '==', quizDate)
      .orderBy('score', 'desc')
      .orderBy('timeTakenSeconds', 'asc')
      .limit(limit)
      .get();

    return snap.docs.map((d, i) => {
      const a = d.data() as CurrentAffairsQuizAttempt;
      return {
        rank: i + 1,
        userId: a.userId,
        userName: a.userName,
        score: a.score,
        timeTakenSeconds: a.timeTakenSeconds,
        completedAt: a.completedAt,
      };
    });
  }

  async getWinner(date: string): Promise<QuizWinner | null> {
    const lb = await this.getLeaderboard(date, 1);
    if (lb.length === 0) return null;
    const top = lb[0]!;
    return {
      userId: top.userId,
      userName: top.userName,
      score: top.score,
      timeTakenSeconds: top.timeTakenSeconds,
      date,
    };
  }
}
