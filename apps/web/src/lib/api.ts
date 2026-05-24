'use client';

import type {
  Chapter,
  ChapterDraft,
  ChapterDraftStatus,
  ChapterRead,
  CreditBalance,
  ExamDate,
  ExamSlug,
  MCQ,
  McqDraft,
  McqDraftStatus,
  McqDifficulty,
  MockTest,
  MockTestSession,
  ProgressSnapshot,
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
// Chapter (Phase 9-10) -- AI-generated chapter content
// ============================================================================

/** Slim chapter shape returned by the public list endpoint (no section bodies). */
export interface ChapterSummary {
  id: string;
  exam: ExamSlug;
  subject: string;
  slug: string;
  classLevel: string;
  title: string;
  summary: string;
  estimatedReadMinutes: number;
  source: string;
  sectionCount: number;
  /** Phase 12: true if the student has tapped "Mark as read". */
  isRead?: boolean;
}

export type AdminChapterDraftStatus = ChapterDraftStatus;
export type AdminChapterDraft = ChapterDraft;
export type PublishedChapter = Chapter;

export interface GenerateChapterRequest {
  exam: ExamSlug | string;
  subject: string;
  /** Stable kebab-case slug, e.g. 'units-and-measurements'. */
  slug: string;
  /** Human-readable title fed to the AI prompt. */
  chapterTitle: string;
  classLevel: string;
  sourceHint?: string;
  targetReadMinutes?: number;
}

export interface GenerateChapterResponse {
  draft: AdminChapterDraft;
  verifierDisagreement: boolean;
}

export interface ChapterEditPayload {
  title?: string;
  summary?: string;
  source?: string;
  sections?: Array<{
    id: string;
    heading: string;
    body: string;
    order: number;
  }>;
}

// ============================================================================
// Chapter MCQ test (Phase 11)
// ============================================================================

export interface ChapterTestStartResponse {
  sessionId: string;
  day: string;
  exam: ExamSlug;
  subject: string;
  chapterSlug: string;
  /** Total time budget in seconds (count * seconds-per-question). */
  durationSeconds: number;
  /** Same shape as DailyMcqResponse.mcqs (no answers / explanations). */
  mcqs: Omit<MCQ, 'correctOption' | 'explanation'>[];
}

// ---------- mock test (Phase 13) -------------------------------------------

export interface MockTestStartResponse {
  session: MockTestSession;
  durationMinutes: number;
  mcqs: Omit<MCQ, 'correctOption' | 'explanation'>[];
}

export interface MockTestCompleteResponse {
  session: MockTestSession;
  passed: boolean;
  bonusAwarded: number;
  balance: number;
  explanations: { mcqId: string; correctOption: string; explanation: string }[];
  alreadySubmitted?: boolean;
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

    // ----- chapter pipeline (Phase 9-10)
    async generateChapter(
      input: GenerateChapterRequest,
    ): Promise<GenerateChapterResponse> {
      const res = await authedFetch('/v1/admin/chapters/generate', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return res.json() as Promise<GenerateChapterResponse>;
    },

    async listChapterDrafts(
      opts: {
        status?: AdminChapterDraftStatus;
        exam?: ExamSlug | string;
        subject?: string;
        limit?: number;
      } = {},
    ): Promise<{ drafts: AdminChapterDraft[] }> {
      const params = new URLSearchParams();
      if (opts.status) params.set('status', opts.status);
      if (opts.exam) params.set('exam', String(opts.exam));
      if (opts.subject) params.set('subject', opts.subject);
      if (opts.limit) params.set('limit', String(opts.limit));
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await authedFetch(`/v1/admin/chapter-drafts${qs}`);
      return res.json() as Promise<{ drafts: AdminChapterDraft[] }>;
    },

    async getChapterDraft(id: string): Promise<{ draft: AdminChapterDraft }> {
      const res = await authedFetch(
        `/v1/admin/chapter-drafts/${encodeURIComponent(id)}`,
      );
      return res.json() as Promise<{ draft: AdminChapterDraft }>;
    },

    async editChapterDraft(
      id: string,
      edits: ChapterEditPayload,
    ): Promise<{ draft: AdminChapterDraft }> {
      const res = await authedFetch(
        `/v1/admin/chapter-drafts/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: JSON.stringify(edits) },
      );
      return res.json() as Promise<{ draft: AdminChapterDraft }>;
    },

    async approveChapterDraft(
      id: string,
    ): Promise<{ draft: AdminChapterDraft; chapter: PublishedChapter }> {
      const res = await authedFetch(
        `/v1/admin/chapter-drafts/${encodeURIComponent(id)}/approve`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      return res.json() as Promise<{
        draft: AdminChapterDraft;
        chapter: PublishedChapter;
      }>;
    },

    async rejectChapterDraft(
      id: string,
      rejectionReason: string,
    ): Promise<{ draft: AdminChapterDraft }> {
      const res = await authedFetch(
        `/v1/admin/chapter-drafts/${encodeURIComponent(id)}/reject`,
        { method: 'POST', body: JSON.stringify({ rejectionReason }) },
      );
      return res.json() as Promise<{ draft: AdminChapterDraft }>;
    },

    async regenerateChapterDraft(
      id: string,
    ): Promise<{ draft: AdminChapterDraft }> {
      const res = await authedFetch(
        `/v1/admin/chapter-drafts/${encodeURIComponent(id)}/regenerate`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      return res.json() as Promise<{ draft: AdminChapterDraft }>;
    },
  },

  // ----- chapters (student-facing)
  chapters: {
    async list(
      opts: { exam?: ExamSlug | string; subject?: string } = {},
    ): Promise<{ chapters: ChapterSummary[] }> {
      const params = new URLSearchParams();
      if (opts.exam) params.set('exam', String(opts.exam));
      if (opts.subject) params.set('subject', opts.subject);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await authedFetch(`/v1/chapters${qs}`);
      return res.json() as Promise<{ chapters: ChapterSummary[] }>;
    },

    async get(
      exam: string,
      subject: string,
      slug: string,
    ): Promise<{ chapter: PublishedChapter; isRead: boolean; readAt: string | null }> {
      const res = await authedFetch(
        `/v1/chapters/${encodeURIComponent(exam)}/${encodeURIComponent(subject)}/${encodeURIComponent(slug)}`,
      );
      return res.json() as Promise<{
        chapter: PublishedChapter;
        isRead: boolean;
        readAt: string | null;
      }>;
    },

    async markRead(
      exam: string,
      subject: string,
      slug: string,
    ): Promise<{ read: ChapterRead }> {
      const res = await authedFetch(
        `/v1/chapters/${encodeURIComponent(exam)}/${encodeURIComponent(subject)}/${encodeURIComponent(slug)}/mark-read`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      return res.json() as Promise<{ read: ChapterRead }>;
    },
  },

  // ----- exam dates (Phase 12)
  async listExamDates(exam: ExamSlug | string): Promise<{ exam: string; dates: ExamDate[] }> {
    const res = await authedFetch(
      `/v1/exam-dates?exam=${encodeURIComponent(String(exam))}`,
    );
    return res.json() as Promise<{ exam: string; dates: ExamDate[] }>;
  },

  // ----- progress snapshot (Phase 12)
  async getProgress(
    exam?: ExamSlug | string,
  ): Promise<ProgressSnapshot> {
    const qs = exam ? `?exam=${encodeURIComponent(String(exam))}` : '';
    const res = await authedFetch(`/v1/users/me/progress${qs}`);
    return res.json() as Promise<ProgressSnapshot>;
  },

  // ----- chapter MCQ test (Phase 11)
  async startChapterTest(input: {
    exam: ExamSlug | string;
    subject: string;
    chapterSlug: string;
    count?: number;
  }): Promise<ChapterTestStartResponse> {
    const res = await authedFetch('/v1/mcqs/chapter-test/start', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.json() as Promise<ChapterTestStartResponse>;
  },

  // ----- mock tests (Phase 13)
  mockTests: {
    async list(
      exam?: ExamSlug | string,
    ): Promise<{ mockTests: MockTest[] }> {
      const qs = exam ? `?exam=${encodeURIComponent(String(exam))}` : '';
      const res = await authedFetch(`/v1/mock-tests${qs}`);
      return res.json() as Promise<{ mockTests: MockTest[] }>;
    },

    async get(id: string): Promise<{ mockTest: MockTest }> {
      const res = await authedFetch(
        `/v1/mock-tests/${encodeURIComponent(id)}`,
      );
      return res.json() as Promise<{ mockTest: MockTest }>;
    },

    async start(id: string): Promise<MockTestStartResponse> {
      const res = await authedFetch(
        `/v1/mock-tests/${encodeURIComponent(id)}/start`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      return res.json() as Promise<MockTestStartResponse>;
    },

    async complete(
      sessionId: string,
      body: { answers: { mcqId: string; chosen: AnswerKey | null }[] },
    ): Promise<MockTestCompleteResponse> {
      const res = await authedFetch(
        `/v1/mock-test-sessions/${encodeURIComponent(sessionId)}/complete`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      return res.json() as Promise<MockTestCompleteResponse>;
    },
  },
};

export { ApiError };
