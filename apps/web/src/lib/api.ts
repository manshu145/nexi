'use client';

import type {
  CreditBalance,
  ExamSlug,
  MCQ,
  McqDraft,
  McqDraftStatus,
  McqDifficulty,
} from '@nexigrate/shared';
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
// Admin RBAC types
// ============================================================================

export type AdminRole = 'super_admin' | 'admin' | 'content_admin' | 'support_admin';

export interface AdminMeResponse {
  uid: string;
  email: string | null;
  role: AdminRole | null;
}

export interface AdminUserRecord {
  uid: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface AdminRoleDescriptor {
  id: AdminRole;
  name: string;
  description: string;
}

// ============================================================================
// Admin / MCQ-draft types -- match the backend's flat McqDraft shape
// ============================================================================

export type DraftStatus = McqDraftStatus;
export type Difficulty = McqDifficulty;

export type AdminMcqDraft = McqDraft;

export interface GenerateDraftRequest {
  exam: ExamSlug | string;
  subject: string;
  chapter: string;
  classLevel: string;
  difficulty: Difficulty;
  count?: number;
  sourceHint?: string;
}

export interface GenerateDraftResponse {
  created: AdminMcqDraft[];
  errors: { index: number; error: string }[];
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
    auth: {
      async me(): Promise<AdminMeResponse> {
        const res = await authedFetch('/v1/admin/auth/me');
        return res.json() as Promise<AdminMeResponse>;
      },

      async listAdmins(): Promise<{ admins: AdminUserRecord[] }> {
        const res = await authedFetch('/v1/admin/auth/admins');
        return res.json() as Promise<{ admins: AdminUserRecord[] }>;
      },

      async addAdmin(input: {
        email: string;
        role: 'admin' | 'content_admin' | 'support_admin';
      }): Promise<{ admin: AdminUserRecord; resetLink: string | null }> {
        const res = await authedFetch('/v1/admin/auth/admins', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        return res.json() as Promise<{
          admin: AdminUserRecord;
          resetLink: string | null;
        }>;
      },

      async revokeAdmin(uid: string): Promise<{ admin: AdminUserRecord }> {
        const res = await authedFetch(
          `/v1/admin/auth/admins/${encodeURIComponent(uid)}`,
          { method: 'DELETE' },
        );
        return res.json() as Promise<{ admin: AdminUserRecord }>;
      },

      async listRoles(): Promise<{ roles: AdminRoleDescriptor[] }> {
        const res = await authedFetch('/v1/admin/auth/roles');
        return res.json() as Promise<{ roles: AdminRoleDescriptor[] }>;
      },
    },

    async listDrafts(opts: {
      status?: DraftStatus;
      exam?: ExamSlug | string;
      limit?: number;
    } = {}): Promise<{ drafts: AdminMcqDraft[] }> {
      const params = new URLSearchParams();
      if (opts.status) params.set('status', opts.status);
      if (opts.exam) params.set('exam', String(opts.exam));
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

    async generateDrafts(input: GenerateDraftRequest): Promise<GenerateDraftResponse> {
      const res = await authedFetch('/v1/admin/mcq-drafts/generate', {
        method: 'POST',
        body: JSON.stringify({ count: 1, ...input }),
      });
      return res.json() as Promise<GenerateDraftResponse>;
    },

    async approveDraft(
      id: string,
    ): Promise<{ draft: AdminMcqDraft; mcq?: MCQ }> {
      const res = await authedFetch(
        `/v1/admin/mcq-drafts/${encodeURIComponent(id)}/approve`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      return res.json() as Promise<{ draft: AdminMcqDraft; mcq?: MCQ }>;
    },

    async rejectDraft(
      id: string,
      rejectionReason: string,
    ): Promise<{ draft: AdminMcqDraft }> {
      const res = await authedFetch(
        `/v1/admin/mcq-drafts/${encodeURIComponent(id)}/reject`,
        { method: 'POST', body: JSON.stringify({ rejectionReason }) },
      );
      return res.json() as Promise<{ draft: AdminMcqDraft }>;
    },
  },
};

export { ApiError };
