'use client';

import type { CreditBalance, ExamSlug, MCQ } from '@nexigrate/shared';
import { getFirebaseAuthClient } from './firebase';

const API_BASE_URL =
  process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://localhost:9090';

class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const auth = getFirebaseAuthClient();
  const user = auth.currentUser;
  if (!user) throw new Error('not signed in');
  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (user.email) headers.set('X-User-Email', user.email);
  if (user.displayName) headers.set('X-User-Name', user.displayName);
  if (user.photoURL) headers.set('X-User-Photo', user.photoURL);
  headers.set(
    'X-User-Provider',
    user.providerData[0]?.providerId === 'phone' ? 'phone' : 'google',
  );

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // ignore parse failure
    }
    throw new ApiError(res.status, message);
  }
  return res;
}

// ---------- types -----------------------------------------------------------

export interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string;
    photoPath: string | null;
    isVerified: boolean;
    targetExam?: ExamSlug | null;
    currentStreak?: number;
    bestStreak?: number;
    lastDailyAt?: string | null;
    skillLevel?: 'beginner' | 'intermediate' | 'advanced';
    weakSubjects?: string[];
    strongSubjects?: string[];
    language?: 'en' | 'hi';
  };
}

export interface DailyMcqResponse {
  sessionId: string;
  day: string;
  exam: ExamSlug;
  mcqs: Omit<MCQ, 'correctOption' | 'explanation'>[];
}

export type AnswerKey = 'A' | 'B' | 'C' | 'D';

export interface CompleteSessionRequest {
  answers: { mcqId: string; chosen: AnswerKey | null }[];
}

export interface CompleteSessionResponse {
  sessionId: string;
  score: number;
  total: number;
  passed: boolean;
  correctMcqIds: string[];
  explanations: { mcqId: string; correctOption: AnswerKey; explanation: string }[];
  creditsAwarded: number;
  balance: number;
}

export interface GeneratedMcq {
  question: string;
  options: { key: string; text: string }[];
  correctOption: string;
  explanation: string;
  subject: string;
  difficulty: string;
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

export interface AdaptiveResponse {
  sessionId: string;
  round: number;
  totalRounds: number;
  questions: {
    question: string;
    options: { key: string; text: string }[];
    subject: string;
    topic: string;
  }[];
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

export interface StudyPlan {
  skillLevel: string;
  weakSubjects: string[];
  strongSubjects: string[];
  studyPlan: string[];
  recommendations: string[];
}

// ---------- methods ---------------------------------------------------------

export const api = {
  // User
  async me(): Promise<MeResponse> {
    const res = await authedFetch('/v1/users/me');
    return res.json() as Promise<MeResponse>;
  },

  async setOnboarding(targetExam: ExamSlug): Promise<MeResponse> {
    const res = await authedFetch('/v1/users/me/onboarding', {
      method: 'POST',
      body: JSON.stringify({ targetExam }),
    });
    return res.json() as Promise<MeResponse>;
  },

  async setLanguage(language: 'en' | 'hi'): Promise<MeResponse> {
    const res = await authedFetch('/v1/users/me/language', {
      method: 'POST',
      body: JSON.stringify({ language }),
    });
    return res.json() as Promise<MeResponse>;
  },

  async updateProfile(data: Record<string, unknown>): Promise<MeResponse> {
    const res = await authedFetch('/v1/users/me/profile', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json() as Promise<MeResponse>;
  },

  async getStudyPlan(): Promise<StudyPlan> {
    const res = await authedFetch('/v1/users/me/study-plan');
    return res.json() as Promise<StudyPlan>;
  },

  // Credits
  async getBalance(): Promise<CreditBalance> {
    const res = await authedFetch('/v1/credits/balance');
    return res.json() as Promise<CreditBalance>;
  },

  // MCQ
  async getDaily(): Promise<DailyMcqResponse> {
    const res = await authedFetch('/v1/mcqs/daily');
    return res.json() as Promise<DailyMcqResponse>;
  },

  async completeSession(
    sessionId: string,
    body: CompleteSessionRequest,
  ): Promise<CompleteSessionResponse> {
    const res = await authedFetch(
      `/v1/mcq-sessions/${encodeURIComponent(sessionId)}/complete`,
      { method: 'POST', body: JSON.stringify(body) },
    );
    return res.json() as Promise<CompleteSessionResponse>;
  },

  // Adaptive Test
  async startAdaptiveTest(exam: string): Promise<AdaptiveResponse> {
    const res = await authedFetch('/v1/adaptive/start', {
      method: 'POST',
      body: JSON.stringify({ exam }),
    });
    return res.json() as Promise<AdaptiveResponse>;
  },

  async submitAdaptiveRound(sessionId: string, answers: { questionIndex: number; chosen: string | null }[]): Promise<AdaptiveResponse & { complete?: boolean; result?: AssessmentResult }> {
    const res = await authedFetch('/v1/adaptive/submit-round', {
      method: 'POST',
      body: JSON.stringify({ sessionId, answers }),
    });
    return res.json() as Promise<AdaptiveResponse & { complete?: boolean; result?: AssessmentResult }>;
  },

  // AI Personalized Content
  async generateMcqs(subject?: string, count?: number): Promise<{ mcqs: GeneratedMcq[] }> {
    const res = await authedFetch('/v1/ai/mcqs', {
      method: 'POST',
      body: JSON.stringify({ subject, count }),
    });
    return res.json() as Promise<{ mcqs: GeneratedMcq[] }>;
  },

  async generateChapter(topic: string): Promise<{ chapter: GeneratedChapter }> {
    const res = await authedFetch('/v1/ai/chapter', {
      method: 'POST',
      body: JSON.stringify({ topic }),
    });
    return res.json() as Promise<{ chapter: GeneratedChapter }>;
  },

  async generateMockTest(subject?: string): Promise<{ id: string; mcqs: GeneratedMcq[]; durationMinutes: number; totalQuestions: number }> {
    const res = await authedFetch('/v1/ai/mock-test', {
      method: 'POST',
      body: JSON.stringify({ subject }),
    });
    return res.json() as Promise<{ id: string; mcqs: GeneratedMcq[]; durationMinutes: number; totalQuestions: number }>;
  },

  async searchNexipedia(topic: string): Promise<{ article: NexipediaArticle }> {
    const res = await authedFetch('/v1/ai/nexipedia', {
      method: 'POST',
      body: JSON.stringify({ topic }),
    });
    return res.json() as Promise<{ article: NexipediaArticle }>;
  },

  async visualize(content: string): Promise<{ diagram: string; title: string }> {
    const res = await authedFetch('/v1/ai/visualize', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    return res.json() as Promise<{ diagram: string; title: string }>;
  },

  async chatWithMentor(message: string): Promise<{ reply: string }> {
    const res = await authedFetch('/v1/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
    return res.json() as Promise<{ reply: string }>;
  },

  // Billing
  async createBillingOrder(input: {
    plan: 'scholar' | 'aspirant' | 'achiever';
    interval: 'monthly' | 'yearly';
  }): Promise<{
    orderId: string;
    amount: number;
    currency: 'INR';
    keyId: string;
    plan: string;
    interval: string;
  }> {
    const res = await authedFetch('/v1/billing/create-order', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.json() as Promise<{
      orderId: string;
      amount: number;
      currency: 'INR';
      keyId: string;
      plan: string;
      interval: string;
    }>;
  },

  async verifyBilling(input: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    plan: 'scholar' | 'aspirant' | 'achiever';
    interval: 'monthly' | 'yearly';
  }): Promise<{ subscription: unknown }> {
    const res = await authedFetch('/v1/billing/verify', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.json() as Promise<{ subscription: unknown }>;
  },

  async getSubscription(): Promise<{ subscription: unknown | null }> {
    const res = await authedFetch('/v1/billing/subscription');
    return res.json() as Promise<{ subscription: unknown | null }>;
  },
};

export { ApiError };
