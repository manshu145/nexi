'use client';

import type { ExamSlug } from '@nexigrate/shared';
import { getFirebaseAuthClient } from './firebase';

const API_BASE_URL =
  process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8080';

class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const auth = getFirebaseAuthClient();
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, 'not signed in');
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

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  photoURL: string | null;
  language: 'en' | 'hi';
  targetExam: ExamSlug | null;
  classLevel: string | null;
  board: string | null;
  school: string | null;
  dob: string | null;
  aim: string | null;
  onboardingScore: number | null;
  onboardingLevel: 'beginner' | 'intermediate' | 'advanced' | null;
  credits: number;
  plan: 'free' | 'scholar' | 'aspirant' | 'achiever';
  currentStreak: number;
  bestStreak: number;
  lastDailyAt: string | null;
  isVerified: boolean;
  role: 'student' | 'admin';
  createdAt: string;
}

export interface MeResponse {
  user: StoredUser;
  dailyStreak: { streak: number; creditsEarned: number };
}

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

// ---------- methods ---------------------------------------------------------

export const api = {
  async me(): Promise<MeResponse> {
    const res = await authedFetch('/v1/users/me');
    return res.json() as Promise<MeResponse>;
  },

  async updateProfile(data: Record<string, unknown>): Promise<{ user: StoredUser }> {
    const res = await authedFetch('/v1/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res.json() as Promise<{ user: StoredUser }>;
  },

  async saveOnboarding(data: Record<string, unknown>): Promise<{ user: StoredUser }> {
    const res = await authedFetch('/v1/users/me/onboarding', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json() as Promise<{ user: StoredUser }>;
  },

  async getAssessmentQuestions(examSlug: string, language: 'en' | 'hi'): Promise<{ questions: GeneratedMCQ[] }> {
    const res = await authedFetch('/v1/assessment/questions', {
      method: 'POST',
      body: JSON.stringify({ examSlug, language }),
    });
    return res.json() as Promise<{ questions: GeneratedMCQ[] }>;
  },

  async submitAssessment(
    questions: GeneratedMCQ[],
    answers: { questionId: string; chosen: string | null }[],
  ): Promise<AssessmentResult> {
    const res = await authedFetch('/v1/assessment/submit', {
      method: 'POST',
      body: JSON.stringify({ questions, answers }),
    });
    return res.json() as Promise<AssessmentResult>;
  },
};

export { ApiError };
