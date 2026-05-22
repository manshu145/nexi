'use client';

import type { CreditBalance, ExamSlug, MCQ } from '@nexigrate/shared';
import { getFirebaseAuthClient } from './firebase';

/**
 * Typed client for @nexigrate/api.
 *
 * Auto-attaches the Firebase ID token on every call. Forwards the user's
 * email / display name / photo / provider as headers so the api can populate
 * the user profile on first contact (`GET /v1/users/me`).
 */

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

// ---------- methods ---------------------------------------------------------

export const api = {
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

  async getBalance(): Promise<CreditBalance> {
    const res = await authedFetch('/v1/credits/balance');
    return res.json() as Promise<CreditBalance>;
  },

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
};

export { ApiError };
