'use client';

import type { CreditBalance, ExamSlug, MCQ } from '@nexigrate/shared';
import { getFirebaseAuthClient } from './firebase';

/**
 * Typed client for @nexigrate/api.
 *
 * Auto-attaches the Firebase ID token on every call. Forwards user identity
 * headers so the api can populate the user profile on first contact.
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
      /* ignore parse failure */
    }
    throw new ApiError(res.status, message);
  }
  return res;
}

// ============================================================================
// Student-facing types (existing)
// ============================================================================

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

// ============================================================================
// Admin / MCQ-draft types (Phase 4 M5 + Phase 5)
// ============================================================================

export type DraftStatus = 'pending' | 'approved' | 'rejected';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface AdminMcqDraft {
  id: string;
  prompt?: {
    exam: string;
    subject: string;
    chapter: string;
    sourceText?: string;
    sourceCitation?: string;
    requestedDifficulty?: Difficulty;
  };
  generationContext?: {
    exam: string;
    subject: string;
    chapter: string;
    sourceText?: string;
    sourceCitation?: string;
    requestedDifficulty?: Difficulty;
  };
  candidates?: Array<{
    modelId?: string;
    providerId?: string;
    output: {
      question: string;
      options: { key: AnswerKey; text: string }[];
      correctOption: AnswerKey;
      explanation: string;
    } | null;
    errorMessage?: string | null;
    durationMs?: number;
  }>;
  content?: {
    question: string;
    options: { key: AnswerKey; text: string }[];
    correctOption: AnswerKey;
    explanation: string;
  };
  verifier?: {
    approved: boolean;
    confidence: number;
    reasoning?: string;
    issues?: string[];
    modelId?: string;
  } | null;
  verifications?: Array<{
    modelId?: string;
    providerId?: string;
    agreesCorrect?: boolean;
    score?: number;
    reasoning?: string;
  }>;
  chosenCandidateIndex?: number | null;
  status: DraftStatus;
  publishedMcqId?: string | null;
  requestedBy?: string;
  requestedAt?: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
}

export interface GenerateDraftRequest {
  exam: ExamSlug | string;
  subject: string;
  chapter: string;
  sourceText: string;
  sourceCitation: string;
  difficulty?: Difficulty;
}

// ============================================================================
// Public api object
// ============================================================================

export const api = {
  // ----- student
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

  // ----- admin
  admin: {
    async listDrafts(opts: { status?: DraftStatus; limit?: number } = {}): Promise<{
      drafts: AdminMcqDraft[];
    }> {
      const params = new URLSearchParams();
      if (opts.status) params.set('status', opts.status);
      if (opts.limit) params.set('limit', String(opts.limit));
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await authedFetch(`/v1/admin/mcq-drafts${qs}`);
      return res.json() as Promise<{ drafts: AdminMcqDraft[] }>;
    },

    async getDraft(id: string): Promise<{ draft: AdminMcqDraft }> {
      const res = await authedFetch(
        `/v1/admin/mcq-drafts/${encodeURIComponent(id)}`,
      );
      return res.json() as Promise<{ draft: AdminMcqDraft }>;
    },

    async generateDraft(input: GenerateDraftRequest): Promise<{ draft: AdminMcqDraft }> {
      const res = await authedFetch('/v1/admin/mcq-drafts/generate', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return res.json() as Promise<{ draft: AdminMcqDraft }>;
    },

    async approveDraft(id: string, note?: string): Promise<{ mcq: unknown }> {
      const res = await authedFetch(
        `/v1/admin/mcq-drafts/${encodeURIComponent(id)}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({ note: note ?? '' }),
        },
      );
      return res.json() as Promise<{ mcq: unknown }>;
    },

    async rejectDraft(id: string, note: string): Promise<{ draft: AdminMcqDraft }> {
      const res = await authedFetch(
        `/v1/admin/mcq-drafts/${encodeURIComponent(id)}/reject`,
        {
          method: 'POST',
          body: JSON.stringify({ note }),
        },
      );
      return res.json() as Promise<{ draft: AdminMcqDraft }>;
    },
  },
};

export { ApiError };
