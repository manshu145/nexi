import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';

/**
 * Current Affairs Quiz — daily 20-question timed quiz from the digest.
 * The user who takes minimum time with highest score shows on everyone's
 * current affairs panel next day as "previous day winner".
 *
 * GET  /v1/current-affairs-quiz/today     → today's 20 questions (stripped answers)
 * POST /v1/current-affairs-quiz/submit    → submit answers with time taken
 * GET  /v1/current-affairs-quiz/leaderboard → today's top 10 + yesterday's winner
 */
export interface CaQuizDeps {
  logger: Logger;
}

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  category: string;
  source: string;
}

interface QuizAttempt {
  userId: string;
  userName: string;
  score: number;
  totalQuestions: number;
  timeTakenSeconds: number;
  submittedAt: string;
}

// In-memory store (would be Firestore in production)
const quizStore = {
  // Daily quiz questions keyed by YYYY-MM-DD
  questions: new Map<string, QuizQuestion[]>(),
  // Attempts keyed by YYYY-MM-DD
  attempts: new Map<string, QuizAttempt[]>(),
  // Yesterday's winner
  yesterdayWinner: null as QuizAttempt | null,
};

function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function yesterdayIST(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// Generate daily quiz (in production, derived from published current affairs digest)
function generateDailyQuiz(): QuizQuestion[] {
  return [
    { id: 'caq_1', question: 'Which ministry launched the PM Surya Ghar scheme?', options: ['Ministry of Power', 'Ministry of New & Renewable Energy', 'Ministry of Housing', 'NITI Aayog'], correctIndex: 1, category: 'national', source: 'PIB' },
    { id: 'caq_2', question: 'India\'s GDP growth rate for FY2025-26 is projected at?', options: ['6.0%', '6.5%', '7.0%', '7.5%'], correctIndex: 1, category: 'economy', source: 'RBI Bulletin' },
    { id: 'caq_3', question: 'Which country recently joined BRICS as a new member?', options: ['Indonesia', 'Saudi Arabia', 'Turkey', 'Nigeria'], correctIndex: 1, category: 'international', source: 'MEA' },
    { id: 'caq_4', question: 'The Gaganyaan mission is scheduled for launch in?', options: ['2025', '2026', '2027', '2028'], correctIndex: 1, category: 'science-tech', source: 'ISRO' },
    { id: 'caq_5', question: 'Which state topped the NITI Aayog SDG Index 2025?', options: ['Kerala', 'Tamil Nadu', 'Goa', 'Himachal Pradesh'], correctIndex: 0, category: 'national', source: 'NITI Aayog' },
    { id: 'caq_6', question: 'The 2026 Union Budget allocated how much for education?', options: ['₹1.12 lakh crore', '₹1.25 lakh crore', '₹1.48 lakh crore', '₹1.62 lakh crore'], correctIndex: 2, category: 'economy', source: 'Ministry of Finance' },
    { id: 'caq_7', question: 'Which organization won the 2025 Nobel Peace Prize?', options: ['UNHCR', 'WHO', 'UNICEF', 'WFP'], correctIndex: 3, category: 'international', source: 'Nobel Committee' },
    { id: 'caq_8', question: 'India\'s first underwater metro opened in which city?', options: ['Mumbai', 'Kolkata', 'Chennai', 'Hyderabad'], correctIndex: 1, category: 'national', source: 'PIB' },
    { id: 'caq_9', question: 'The Semiconductor Mission targets how many fabs by 2030?', options: ['2', '3', '5', '8'], correctIndex: 2, category: 'science-tech', source: 'MeitY' },
    { id: 'caq_10', question: 'Which Indian athlete won gold at the 2025 World Athletics?', options: ['Neeraj Chopra', 'Avinash Sable', 'Murali Sreeshankar', 'Tajinderpal Toor'], correctIndex: 0, category: 'sports', source: 'SAI' },
    { id: 'caq_11', question: 'The Digital Personal Data Protection Act came into force in?', options: ['January 2025', 'March 2025', 'June 2025', 'August 2025'], correctIndex: 2, category: 'national', source: 'MeitY' },
    { id: 'caq_12', question: 'Which river got National River status in 2025?', options: ['Yamuna', 'Godavari', 'Brahmaputra', 'Krishna'], correctIndex: 2, category: 'environment', source: 'MoEFCC' },
    { id: 'caq_13', question: 'RBI repo rate as of May 2026 stands at?', options: ['5.50%', '6.00%', '6.25%', '6.50%'], correctIndex: 1, category: 'economy', source: 'RBI' },
    { id: 'caq_14', question: 'India signed a Free Trade Agreement with which bloc in 2025?', options: ['EU', 'ASEAN', 'EFTA', 'Mercosur'], correctIndex: 2, category: 'economy', source: 'Ministry of Commerce' },
    { id: 'caq_15', question: 'Which state launched the first AI-powered governance system?', options: ['Telangana', 'Karnataka', 'Andhra Pradesh', 'Tamil Nadu'], correctIndex: 0, category: 'science-tech', source: 'State Gov' },
    { id: 'caq_16', question: 'The One Nation One Election report was submitted by?', options: ['Law Commission', 'Ram Nath Kovind Committee', 'Election Commission', 'NITI Aayog'], correctIndex: 1, category: 'national', source: 'PIB' },
    { id: 'caq_17', question: 'India\'s total installed solar capacity crossed which milestone in 2025?', options: ['50 GW', '75 GW', '100 GW', '125 GW'], correctIndex: 2, category: 'environment', source: 'MNRE' },
    { id: 'caq_18', question: 'Which Indian city was named UNESCO Creative City of Literature?', options: ['Varanasi', 'Kozhikode', 'Jaipur', 'Mysuru'], correctIndex: 1, category: 'national', source: 'UNESCO' },
    { id: 'caq_19', question: 'The Unified Pension Scheme covers how many government employees?', options: ['10 lakh', '23 lakh', '45 lakh', '80 lakh'], correctIndex: 1, category: 'national', source: 'DoPT' },
    { id: 'caq_20', question: 'Which satellite was launched under the NISAR mission?', options: ['Earth observation SAR satellite', 'Communication satellite', 'Navigation satellite', 'Weather satellite'], correctIndex: 0, category: 'science-tech', source: 'ISRO/NASA' },
  ];
}

export function makeCaQuizRoutes(deps: CaQuizDeps): Hono {
  const app = new Hono();

  app.get('/today', async (c) => {
    requireAuth(c);
    const today = todayIST();

    // Get or generate today's quiz
    if (!quizStore.questions.has(today)) {
      quizStore.questions.set(today, generateDailyQuiz());
    }
    const questions = quizStore.questions.get(today)!;

    // Strip correct answers
    const clientQuestions = questions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      category: q.category,
      source: q.source,
    }));

    return c.json({
      date: today,
      questions: clientQuestions,
      totalQuestions: 20,
      timeLimitSeconds: 600, // 10 minutes for 20 questions
    });
  });

  app.post('/submit', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    if (!body || !Array.isArray(body.answers) || typeof body.timeTakenSeconds !== 'number') {
      throw new HTTPException(400, { message: 'answers array and timeTakenSeconds required' });
    }

    const today = todayIST();
    const questions = quizStore.questions.get(today);
    if (!questions) {
      throw new HTTPException(404, { message: 'No quiz available for today' });
    }

    // Check if already submitted today
    const todayAttempts = quizStore.attempts.get(today) ?? [];
    const existing = todayAttempts.find((a) => a.userId === principal.userId);
    if (existing) {
      return c.json({ alreadySubmitted: true, attempt: existing });
    }

    // Score the quiz
    const { answers, timeTakenSeconds, userName } = body as {
      answers: number[];
      timeTakenSeconds: number;
      userName?: string;
    };

    let score = 0;
    for (let i = 0; i < Math.min(answers.length, questions.length); i++) {
      if (answers[i] === questions[i].correctIndex) score++;
    }

    const attempt: QuizAttempt = {
      userId: principal.userId,
      userName: userName || 'Anonymous',
      score,
      totalQuestions: questions.length,
      timeTakenSeconds: Math.max(1, Math.min(timeTakenSeconds, 600)),
      submittedAt: new Date().toISOString(),
    };

    todayAttempts.push(attempt);
    quizStore.attempts.set(today, todayAttempts);

    deps.logger.info('ca_quiz.submitted', {
      userId: principal.userId,
      score,
      time: timeTakenSeconds,
    });

    return c.json({
      score,
      totalQuestions: questions.length,
      timeTakenSeconds: attempt.timeTakenSeconds,
      rank: getRank(today, attempt),
      correctAnswers: questions.map((q) => q.correctIndex),
    });
  });

  app.get('/leaderboard', async (c) => {
    requireAuth(c);
    const today = todayIST();
    const yesterday = yesterdayIST();

    const todayAttempts = quizStore.attempts.get(today) ?? [];
    const yesterdayAttempts = quizStore.attempts.get(yesterday) ?? [];

    // Sort: highest score first, then fastest time
    const sorted = [...todayAttempts].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timeTakenSeconds - b.timeTakenSeconds;
    });

    // Yesterday's winner
    const yesterdaySorted = [...yesterdayAttempts].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timeTakenSeconds - b.timeTakenSeconds;
    });

    return c.json({
      today: {
        date: today,
        top10: sorted.slice(0, 10).map((a, i) => ({
          rank: i + 1,
          userName: a.userName,
          score: a.score,
          totalQuestions: a.totalQuestions,
          timeTakenSeconds: a.timeTakenSeconds,
        })),
        totalParticipants: todayAttempts.length,
      },
      yesterdayWinner: yesterdaySorted[0]
        ? {
            userName: yesterdaySorted[0].userName,
            score: yesterdaySorted[0].score,
            timeTakenSeconds: yesterdaySorted[0].timeTakenSeconds,
          }
        : null,
    });
  });

  return app;
}

function getRank(date: string, attempt: QuizAttempt): number {
  const attempts = quizStore.attempts.get(date) ?? [];
  const sorted = [...attempts].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.timeTakenSeconds - b.timeTakenSeconds;
  });
  return sorted.findIndex((a) => a.userId === attempt.userId) + 1;
}
