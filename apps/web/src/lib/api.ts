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
  NexipediaArticle,
  NexipediaArticleDraft,
  NexipediaArticleStatus,
  NexipediaArticleSummary,
  NexipediaCategory,
  CurrentAffairsDigest,
  CurrentAffairsDigestDraft,
  CurrentAffairsDigestStatus,
  CurrentAffairsDigestSummary,
  LongAnswerAttempt,
  LongAnswerAttemptSummary,
  LongAnswerLength,
  LongAnswerQuestion,
  ProgressSnapshot,
  Announcement,
  AnnouncementSummary,
  Broadcast,
  BroadcastSummary,
  SupportTicket,
  TicketMessage,
  TicketWithMessages,
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

// ---------- nexipedia (Phase 14) -------------------------------------------

export type AdminNexipediaArticleStatus = NexipediaArticleStatus;
export type AdminNexipediaDraft = NexipediaArticleDraft;
export type PublishedNexipediaArticle = NexipediaArticle;

export interface GenerateNexipediaArticleRequest {
  /** Stable kebab-case slug, unique across the corpus. */
  slug: string;
  title: string;
  category: NexipediaCategory;
  outlineHint?: string;
  sourceHint?: string;
  targetReadMinutes?: number;
}

export interface GenerateNexipediaArticleResponse {
  draft: AdminNexipediaDraft;
  verifierDisagreement: boolean;
}

export interface NexipediaArticleEditPayload {
  title?: string;
  summary?: string;
  source?: string;
  relatedExams?: ExamSlug[] | string[];
  sections?: Array<{
    id: string;
    heading: string;
    body: string;
    order: number;
  }>;
}

// ---------- referrals (Phase 16) ------------------------------------------
export interface ReferralMeResponse {
  code: string;
  shareUrl: string;
  stats: {
    totalReferred: number;
    rewarded: number;
    retained: number;
    creditsEarned: number;
  };
  perReferralReward: {
    signup: number;
    retained: number;
  };
}

export interface ReferralAttributeResponse {
  referral: {
    id: string;
    referrerUserId: string;
    referredUserId: string;
    code: string;
    status: 'pending' | 'rewarded' | 'retained' | 'reverted';
    signedUpAt: string;
    verifiedAt: string | null;
    retainedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  firstTime: boolean;
}

// ---------- admin user management (Phase 20) ------------------------------

export interface AdminUserListRow {
  id: string;
  email: string;
  name: string;
  photoPath: string | null;
  targetExam: ExamSlug | null;
  isVerified: boolean;
  currentStreak: number;
  bestStreak: number;
  createdAt: string;
}

export interface AdminUserDetail {
  user: {
    id: string;
    email: string;
    name: string;
    photoPath: string | null;
    targetExam?: ExamSlug | null;
    isVerified: boolean;
    isMinor: boolean;
    locale: string;
    currentStreak?: number;
    bestStreak?: number;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
  };
  balance: {
    userId: string;
    total: number;
    expiringSoon: number;
    lastEventId: string | null;
    computedAt: string;
  };
  recentLedger: Array<{
    id: string;
    userId: string;
    amount: number;
    event:
      | { kind: 'earn'; source: string }
      | { kind: 'spend'; reason: string }
      | { kind: 'expire' };
    occurredAt: string;
    createdAt: string;
    expiresAt: string | null;
    sourceRef: string | null;
  }>;
  recentAttempts: Array<{
    id: string;
    userId: string;
    sessionId: string;
    mcqId: string;
    exam: ExamSlug;
    subject: string;
    chapter: string;
    isCorrect: boolean;
    attemptedAt: string;
  }>;
  referralStats: {
    totalReferred: number;
    rewarded: number;
    retained: number;
  };
  subscription: unknown | null;
}

export interface AdminGrantCreditsResponse {
  result:
    | { kind: 'awarded'; event: { id: string; amount: number; expiresAt: string | null } }
    | { kind: 'duplicate' };
  balance: {
    userId: string;
    total: number;
    expiringSoon: number;
    lastEventId: string | null;
    computedAt: string;
  };
  audit: AuditLogEntry;
}

export type AuditAction =
  | 'admin.users.grant_credits'
  | 'admin.users.revoke_credits'
  | 'admin.users.suspend'
  | 'admin.users.unsuspend'
  | 'admin.team.add_admin'
  | 'admin.team.revoke_admin'
  | 'admin.content.approve'
  | 'admin.content.reject';

export interface AuditLogEntry {
  id: string;
  occurredAt: string;
  actorUid: string;
  actorEmail: string | null;
  action: AuditAction;
  targetId: string | null;
  metadata: Record<string, unknown>;
}

export interface AdminAnalyticsOverview {
  users: {
    recentTotal: number;
    last24h: number;
    last7d: number;
    last30d: number;
    verifiedInRecent: number;
    examBreakdown: Record<string, number>;
  };
  content: {
    publishedChapters: number;
    publishedNexipediaArticles: number;
  };
  asOf: string;
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

  async setOnboarding(payload: Record<string, unknown>): Promise<MeResponse> {
    const res = await authedFetch('/v1/users/me/onboarding', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.json() as Promise<MeResponse>;
  },

  async getBalance(): Promise<CreditBalance> {
    const res = await authedFetch('/v1/credits/balance');
    return res.json() as Promise<CreditBalance>;
  },

  // ----- adaptive test -----
  adaptiveTest: {
    async start() {
      const res = await authedFetch('/v1/users/me/adaptive-test/start', { method: 'POST' });
      return res.json() as Promise<{ mcqs: Array<{ id: string; question: string; options: string[]; difficulty: string; subject: string }>; totalQuestions: number; _answers: number[] }>;
    },
    async complete(answers: number[], correctAnswers: number[]) {
      const res = await authedFetch('/v1/users/me/adaptive-test/complete', {
        method: 'POST',
        body: JSON.stringify({ answers, correctAnswers }),
      });
      return res.json() as Promise<{ score: number; correct: number; total: number; skillLevel: string; studyPlan: Record<string, unknown> }>;
    },
  },

  // ----- visualize (Phase H)
  async visualize(text: string, title?: string) {
    const res = await authedFetch('/v1/visualize', {
      method: 'POST',
      body: JSON.stringify({ text, title }),
    });
    return res.json() as Promise<{ mermaid: string; watermark: string; generatedAt: string }>;
  },

  // ----- text-to-speech (Phase I)
  tts: {
    async synthesize(text: string, language?: string) {
      const res = await authedFetch('/v1/tts/synthesize', {
        method: 'POST',
        body: JSON.stringify({ text, language }),
      });
      return res.json() as Promise<{ mode: string; text?: string; language?: string; audioBase64?: string; format?: string }>;
    },
    async languages() {
      const res = await authedFetch('/v1/tts/languages');
      return res.json() as Promise<{ languages: Array<{ code: string; name: string }> }>;
    },
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

    // ----- scheduler (Phase E)
    scheduler: {
      async status() {
        const res = await authedFetch('/v1/admin/scheduler/status');
        return res.json() as Promise<{ paused: boolean; lastRunAt: string | null; lastRunStatus: string | null; totalGenerated: number; totalFailed: number; runsToday: number; openaiConfigured: boolean; nextScheduledRun: string }>;
      },
      async triggerDaily() {
        const res = await authedFetch('/v1/admin/scheduler/trigger-daily', { method: 'POST' });
        return res.json() as Promise<{ status: string; generated: number; failed: number; durationMs: number; examsProcessed: number }>;
      },
      async pause() {
        const res = await authedFetch('/v1/admin/scheduler/pause', { method: 'POST' });
        return res.json() as Promise<{ paused: boolean }>;
      },
      async resume() {
        const res = await authedFetch('/v1/admin/scheduler/resume', { method: 'POST' });
        return res.json() as Promise<{ paused: boolean }>;
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

    // ----- nexipedia pipeline (Phase 14)
    async generateNexipediaArticle(
      input: GenerateNexipediaArticleRequest,
    ): Promise<GenerateNexipediaArticleResponse> {
      const res = await authedFetch('/v1/admin/nexipedia/generate', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return res.json() as Promise<GenerateNexipediaArticleResponse>;
    },

    async listNexipediaDrafts(
      opts: {
        status?: AdminNexipediaArticleStatus;
        category?: NexipediaCategory;
        limit?: number;
      } = {},
    ): Promise<{ drafts: AdminNexipediaDraft[] }> {
      const params = new URLSearchParams();
      if (opts.status) params.set('status', opts.status);
      if (opts.category) params.set('category', opts.category);
      if (opts.limit) params.set('limit', String(opts.limit));
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await authedFetch(`/v1/admin/nexipedia-drafts${qs}`);
      return res.json() as Promise<{ drafts: AdminNexipediaDraft[] }>;
    },

    async getNexipediaDraft(id: string): Promise<{ draft: AdminNexipediaDraft }> {
      const res = await authedFetch(
        `/v1/admin/nexipedia-drafts/${encodeURIComponent(id)}`,
      );
      return res.json() as Promise<{ draft: AdminNexipediaDraft }>;
    },

    async editNexipediaDraft(
      id: string,
      edits: NexipediaArticleEditPayload,
    ): Promise<{ draft: AdminNexipediaDraft }> {
      const res = await authedFetch(
        `/v1/admin/nexipedia-drafts/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: JSON.stringify(edits) },
      );
      return res.json() as Promise<{ draft: AdminNexipediaDraft }>;
    },

    async approveNexipediaDraft(
      id: string,
    ): Promise<{ draft: AdminNexipediaDraft; article: PublishedNexipediaArticle }> {
      const res = await authedFetch(
        `/v1/admin/nexipedia-drafts/${encodeURIComponent(id)}/approve`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      return res.json() as Promise<{
        draft: AdminNexipediaDraft;
        article: PublishedNexipediaArticle;
      }>;
    },

    async rejectNexipediaDraft(
      id: string,
      rejectionReason: string,
    ): Promise<{ draft: AdminNexipediaDraft }> {
      const res = await authedFetch(
        `/v1/admin/nexipedia-drafts/${encodeURIComponent(id)}/reject`,
        { method: 'POST', body: JSON.stringify({ rejectionReason }) },
      );
      return res.json() as Promise<{ draft: AdminNexipediaDraft }>;
    },

    async regenerateNexipediaDraft(
      id: string,
    ): Promise<{ draft: AdminNexipediaDraft }> {
      const res = await authedFetch(
        `/v1/admin/nexipedia-drafts/${encodeURIComponent(id)}/regenerate`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      return res.json() as Promise<{ draft: AdminNexipediaDraft }>;
    },

    // ----- current-affairs pipeline (Phase 19)
    async generateCurrentAffairs(input: {
      date: string;
      rawNotes: string;
      focusHint?: string;
    }): Promise<{ draft: CurrentAffairsDigestDraft; verifierDisagreement: boolean }> {
      const res = await authedFetch('/v1/admin/current-affairs/generate', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return res.json() as Promise<{
        draft: CurrentAffairsDigestDraft;
        verifierDisagreement: boolean;
      }>;
    },

    async listCurrentAffairsDrafts(opts: {
      status?: CurrentAffairsDigestStatus;
      limit?: number;
    } = {}): Promise<{ drafts: CurrentAffairsDigestDraft[] }> {
      const params = new URLSearchParams();
      if (opts.status) params.set('status', opts.status);
      if (opts.limit) params.set('limit', String(opts.limit));
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await authedFetch(`/v1/admin/current-affairs-drafts${qs}`);
      return res.json() as Promise<{ drafts: CurrentAffairsDigestDraft[] }>;
    },

    async getCurrentAffairsDraft(
      id: string,
    ): Promise<{ draft: CurrentAffairsDigestDraft }> {
      const res = await authedFetch(
        `/v1/admin/current-affairs-drafts/${encodeURIComponent(id)}`,
      );
      return res.json() as Promise<{ draft: CurrentAffairsDigestDraft }>;
    },

    async approveCurrentAffairsDraft(
      id: string,
    ): Promise<{ draft: CurrentAffairsDigestDraft; digest: CurrentAffairsDigest }> {
      const res = await authedFetch(
        `/v1/admin/current-affairs-drafts/${encodeURIComponent(id)}/approve`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      return res.json() as Promise<{
        draft: CurrentAffairsDigestDraft;
        digest: CurrentAffairsDigest;
      }>;
    },

    async rejectCurrentAffairsDraft(
      id: string,
      rejectionReason: string,
    ): Promise<{ draft: CurrentAffairsDigestDraft }> {
      const res = await authedFetch(
        `/v1/admin/current-affairs-drafts/${encodeURIComponent(id)}/reject`,
        { method: 'POST', body: JSON.stringify({ rejectionReason }) },
      );
      return res.json() as Promise<{ draft: CurrentAffairsDigestDraft }>;
    },

    async regenerateCurrentAffairsDraft(
      id: string,
    ): Promise<{ draft: CurrentAffairsDigestDraft }> {
      const res = await authedFetch(
        `/v1/admin/current-affairs-drafts/${encodeURIComponent(id)}/regenerate`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      return res.json() as Promise<{ draft: CurrentAffairsDigestDraft }>;
    },

    // ----- long-form question CRUD (Phase 18) - admin curates by hand,
    // no AI generation for the prompts themselves.
    async listLongAnswerQuestions(
      opts: { exam?: ExamSlug | string; subject?: string; limit?: number } = {},
    ): Promise<{ questions: LongAnswerQuestion[] }> {
      const params = new URLSearchParams();
      if (opts.exam) params.set('exam', String(opts.exam));
      if (opts.subject) params.set('subject', opts.subject);
      if (opts.limit) params.set('limit', String(opts.limit));
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await authedFetch(`/v1/admin/long-answers${qs}`);
      return res.json() as Promise<{ questions: LongAnswerQuestion[] }>;
    },

    async getLongAnswerQuestion(
      id: string,
    ): Promise<{ question: LongAnswerQuestion }> {
      const res = await authedFetch(
        `/v1/admin/long-answers/${encodeURIComponent(id)}`,
      );
      return res.json() as Promise<{ question: LongAnswerQuestion }>;
    },

    async createLongAnswerQuestion(input: {
      slug: string;
      exam: ExamSlug | string;
      subject: string;
      source: string;
      prompt: string;
      expectedLength: LongAnswerLength;
      rubricNotes?: string;
      isPublished?: boolean;
    }): Promise<{ question: LongAnswerQuestion }> {
      const res = await authedFetch('/v1/admin/long-answers', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return res.json() as Promise<{ question: LongAnswerQuestion }>;
    },

    async editLongAnswerQuestion(
      id: string,
      edits: Partial<{
        exam: ExamSlug | string;
        subject: string;
        source: string;
        prompt: string;
        expectedLength: LongAnswerLength;
        rubricNotes: string;
      }>,
    ): Promise<{ question: LongAnswerQuestion }> {
      const res = await authedFetch(
        `/v1/admin/long-answers/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: JSON.stringify(edits) },
      );
      return res.json() as Promise<{ question: LongAnswerQuestion }>;
    },

    async publishLongAnswerQuestion(
      id: string,
    ): Promise<{ question: LongAnswerQuestion }> {
      const res = await authedFetch(
        `/v1/admin/long-answers/${encodeURIComponent(id)}/publish`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      return res.json() as Promise<{ question: LongAnswerQuestion }>;
    },

    async unpublishLongAnswerQuestion(
      id: string,
    ): Promise<{ question: LongAnswerQuestion }> {
      const res = await authedFetch(
        `/v1/admin/long-answers/${encodeURIComponent(id)}/unpublish`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      return res.json() as Promise<{ question: LongAnswerQuestion }>;
    },

    async deleteLongAnswerQuestion(id: string): Promise<{ ok: true }> {
      const res = await authedFetch(
        `/v1/admin/long-answers/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      );
      return res.json() as Promise<{ ok: true }>;
    },

    // ----- Phase 20 -- user management + audit + analytics

    async listUsers(opts: {
      q?: string;
      exam?: ExamSlug | string;
      limit?: number;
      beforeCreatedAt?: string;
    } = {}): Promise<{ users: AdminUserListRow[]; nextCursor: string | null }> {
      const params = new URLSearchParams();
      if (opts.q) params.set('q', opts.q);
      if (opts.exam) params.set('exam', String(opts.exam));
      if (opts.limit) params.set('limit', String(opts.limit));
      if (opts.beforeCreatedAt) params.set('beforeCreatedAt', opts.beforeCreatedAt);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await authedFetch(`/v1/admin/users${qs}`);
      return res.json() as Promise<{
        users: AdminUserListRow[];
        nextCursor: string | null;
      }>;
    },

    async getUserDetail(uid: string): Promise<AdminUserDetail> {
      const res = await authedFetch(`/v1/admin/users/${encodeURIComponent(uid)}`);
      return res.json() as Promise<AdminUserDetail>;
    },

    async grantCreditsToUser(
      uid: string,
      input: { amount: number; reason: string },
    ): Promise<AdminGrantCreditsResponse> {
      const res = await authedFetch(
        `/v1/admin/users/${encodeURIComponent(uid)}/grant-credits`,
        { method: 'POST', body: JSON.stringify(input) },
      );
      return res.json() as Promise<AdminGrantCreditsResponse>;
    },

    async listAuditLog(opts: {
      action?: AuditAction;
      actorUid?: string;
      limit?: number;
      beforeOccurredAt?: string;
    } = {}): Promise<{ entries: AuditLogEntry[]; nextCursor: string | null }> {
      const params = new URLSearchParams();
      if (opts.action) params.set('action', opts.action);
      if (opts.actorUid) params.set('actorUid', opts.actorUid);
      if (opts.limit) params.set('limit', String(opts.limit));
      if (opts.beforeOccurredAt) params.set('beforeOccurredAt', opts.beforeOccurredAt);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await authedFetch(`/v1/admin/audit${qs}`);
      return res.json() as Promise<{
        entries: AuditLogEntry[];
        nextCursor: string | null;
      }>;
    },

    async listAuditActions(): Promise<{ actions: AuditAction[] }> {
      const res = await authedFetch('/v1/admin/audit/actions');
      return res.json() as Promise<{ actions: AuditAction[] }>;
    },

    async getAnalyticsOverview(): Promise<AdminAnalyticsOverview> {
      const res = await authedFetch('/v1/admin/analytics');
      return res.json() as Promise<AdminAnalyticsOverview>;
    },

    // Phase 21: admin comms
    comms: {
      async listAnnouncements(): Promise<{ announcements: AnnouncementSummary[] }> {
        const res = await authedFetch('/v1/admin/announcements');
        return res.json() as Promise<{ announcements: AnnouncementSummary[] }>;
      },
      async getAnnouncement(id: string): Promise<Announcement> {
        const res = await authedFetch(`/v1/admin/announcements/${encodeURIComponent(id)}`);
        return res.json() as Promise<Announcement>;
      },
      async createAnnouncement(input: {
        type?: string;
        title: string;
        body: string;
        audience?: string;
        audienceExam?: string;
        expiresAt?: string | null;
      }): Promise<{ id: string }> {
        const res = await authedFetch('/v1/admin/announcements', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        return res.json() as Promise<{ id: string }>;
      },
      async updateAnnouncement(id: string, patch: Record<string, unknown>): Promise<void> {
        await authedFetch(`/v1/admin/announcements/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
      },
      async deleteAnnouncement(id: string): Promise<void> {
        await authedFetch(`/v1/admin/announcements/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
      },
      async listBroadcasts(): Promise<{ broadcasts: BroadcastSummary[] }> {
        const res = await authedFetch('/v1/admin/broadcasts');
        return res.json() as Promise<{ broadcasts: BroadcastSummary[] }>;
      },
      async getBroadcast(id: string): Promise<Broadcast> {
        const res = await authedFetch(`/v1/admin/broadcasts/${encodeURIComponent(id)}`);
        return res.json() as Promise<Broadcast>;
      },
      async createBroadcast(input: {
        channel?: string;
        subject?: string;
        body: string;
        audience?: string;
        audienceExam?: string;
      }): Promise<{ id: string }> {
        const res = await authedFetch('/v1/admin/broadcasts', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        return res.json() as Promise<{ id: string }>;
      },
      async sendBroadcast(id: string): Promise<{ ok: boolean; status: string; recipientCount: number }> {
        const res = await authedFetch(`/v1/admin/broadcasts/${encodeURIComponent(id)}/send`, {
          method: 'POST',
        });
        return res.json() as Promise<{ ok: boolean; status: string; recipientCount: number }>;
      },
      async listTickets(status?: string): Promise<{ tickets: SupportTicket[] }> {
        const qs = status ? `?status=${status}` : '';
        const res = await authedFetch(`/v1/admin/tickets${qs}`);
        return res.json() as Promise<{ tickets: SupportTicket[] }>;
      },
      async getTicket(id: string): Promise<TicketWithMessages> {
        const res = await authedFetch(`/v1/admin/tickets/${encodeURIComponent(id)}`);
        return res.json() as Promise<TicketWithMessages>;
      },
      async updateTicket(id: string, patch: Record<string, unknown>): Promise<void> {
        await authedFetch(`/v1/admin/tickets/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
      },
      async replyToTicket(ticketId: string, body: string): Promise<{ id: string }> {
        const res = await authedFetch(
          `/v1/admin/tickets/${encodeURIComponent(ticketId)}/reply`,
          { method: 'POST', body: JSON.stringify({ body }) },
        );
        return res.json() as Promise<{ id: string }>;
      },
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

  // ----- personalized recommendations (AI as teacher)
  async getRecommendations(): Promise<{
    greeting: string;
    skillLevel: string;
    focusAreas: string[];
    recommendations: Array<{
      type: string;
      title: string;
      description: string;
      action: string;
      priority: string;
      reason: string;
    }>;
    dailyGoal: { mcqs: number; readMinutes: number; mockTests: number };
    motivationalMessage: string;
  }> {
    const res = await authedFetch('/v1/users/me/recommendations');
    return res.json() as Promise<any>;
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

  // ----- nexipedia (student-facing, Phase 14)
  nexipedia: {
    async list(
      opts: { q?: string; category?: NexipediaCategory; limit?: number } = {},
    ): Promise<{ articles: NexipediaArticleSummary[] }> {
      const params = new URLSearchParams();
      if (opts.q) params.set('q', opts.q);
      if (opts.category) params.set('category', opts.category);
      if (opts.limit) params.set('limit', String(opts.limit));
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await authedFetch(`/v1/nexipedia${qs}`);
      return res.json() as Promise<{ articles: NexipediaArticleSummary[] }>;
    },

    async get(slug: string): Promise<{ article: PublishedNexipediaArticle }> {
      const res = await authedFetch(
        `/v1/nexipedia/${encodeURIComponent(slug)}`,
      );
      return res.json() as Promise<{ article: PublishedNexipediaArticle }>;
    },
  },

  // ----- AI chatbot (Phase J)
  chat: {
    async message(message: string) {
      const res = await authedFetch('/v1/chat/message', {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      return res.json() as Promise<{ response: string; escalated: boolean; timestamp: string }>;
    },
    async history() {
      const res = await authedFetch('/v1/chat/history');
      return res.json() as Promise<{ messages: Array<{ role: string; content: string; timestamp: string }> }>;
    },
  },

  // ----- current affairs quiz (Phase F)
  caQuiz: {
    async today() {
      const res = await authedFetch('/v1/current-affairs-quiz/today');
      return res.json() as Promise<{ date: string; questions: Array<{ id: string; question: string; options: string[]; category: string; source: string }>; totalQuestions: number; timeLimitSeconds: number }>;
    },
    async submit(answers: number[], timeTakenSeconds: number, userName: string) {
      const res = await authedFetch('/v1/current-affairs-quiz/submit', {
        method: 'POST',
        body: JSON.stringify({ answers, timeTakenSeconds, userName }),
      });
      return res.json() as Promise<{ score: number; totalQuestions: number; timeTakenSeconds: number; rank: number; correctAnswers: number[]; alreadySubmitted?: boolean }>;
    },
    async leaderboard() {
      const res = await authedFetch('/v1/current-affairs-quiz/leaderboard');
      return res.json() as Promise<{ today: { date: string; top10: Array<{ rank: number; userName: string; score: number; totalQuestions: number; timeTakenSeconds: number }>; totalParticipants: number }; yesterdayWinner: { userName: string; score: number; timeTakenSeconds: number } | null }>;
    },
  },

  // ----- referrals (Phase 16)
  referrals: {
    async me(): Promise<ReferralMeResponse> {
      const res = await authedFetch('/v1/users/me/referral');
      return res.json() as Promise<ReferralMeResponse>;
    },

    async attribute(code: string): Promise<ReferralAttributeResponse> {
      const res = await authedFetch('/v1/referrals/attribute', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      return res.json() as Promise<ReferralAttributeResponse>;
    },
  },

  // ----- current affairs (Phase 19)
  currentAffairs: {
    async today(): Promise<{ digest: CurrentAffairsDigest | null }> {
      const res = await authedFetch('/v1/current-affairs/today');
      return res.json() as Promise<{ digest: CurrentAffairsDigest | null }>;
    },

    async list(limit?: number): Promise<{ digests: CurrentAffairsDigestSummary[] }> {
      const qs = limit ? `?limit=${limit}` : '';
      const res = await authedFetch(`/v1/current-affairs${qs}`);
      return res.json() as Promise<{ digests: CurrentAffairsDigestSummary[] }>;
    },

    async getByDate(date: string): Promise<{ digest: CurrentAffairsDigest }> {
      const res = await authedFetch(`/v1/current-affairs/${encodeURIComponent(date)}`);
      return res.json() as Promise<{ digest: CurrentAffairsDigest }>;
    },
  },

  // ----- long-form answers (Phase 18)
  longAnswers: {
    async list(
      opts: { exam?: ExamSlug | string; subject?: string; limit?: number } = {},
    ): Promise<{ questions: LongAnswerQuestion[] }> {
      const params = new URLSearchParams();
      if (opts.exam) params.set('exam', String(opts.exam));
      if (opts.subject) params.set('subject', opts.subject);
      if (opts.limit) params.set('limit', String(opts.limit));
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await authedFetch(`/v1/long-answers${qs}`);
      return res.json() as Promise<{ questions: LongAnswerQuestion[] }>;
    },

    async get(slug: string): Promise<{ question: LongAnswerQuestion }> {
      const res = await authedFetch(
        `/v1/long-answers/${encodeURIComponent(slug)}`,
      );
      return res.json() as Promise<{ question: LongAnswerQuestion }>;
    },

    async submit(
      questionId: string,
      input: { answer: string; nonce?: string },
    ): Promise<{
      attempt: LongAnswerAttempt;
      alreadySubmitted: boolean;
      balance: number;
    }> {
      const res = await authedFetch(
        `/v1/long-answers/${encodeURIComponent(questionId)}/submit`,
        { method: 'POST', body: JSON.stringify(input) },
      );
      return res.json() as Promise<{
        attempt: LongAnswerAttempt;
        alreadySubmitted: boolean;
        balance: number;
      }>;
    },

    async myAttempts(
      limit?: number,
    ): Promise<{ attempts: LongAnswerAttemptSummary[] }> {
      const qs = limit ? `?limit=${limit}` : '';
      const res = await authedFetch(`/v1/users/me/long-answers${qs}`);
      return res.json() as Promise<{ attempts: LongAnswerAttemptSummary[] }>;
    },

    async myAttempt(
      id: string,
    ): Promise<{ attempt: LongAnswerAttempt; question: LongAnswerQuestion | null }> {
      const res = await authedFetch(
        `/v1/users/me/long-answers/${encodeURIComponent(id)}`,
      );
      return res.json() as Promise<{
        attempt: LongAnswerAttempt;
        question: LongAnswerQuestion | null;
      }>;
    },
  },

  /* ═══ Phase 21: Comms — announcements, tickets ═══ */

  announcements: {
    async list(): Promise<{ announcements: AnnouncementSummary[] }> {
      const res = await authedFetch('/v1/announcements');
      return res.json() as Promise<{ announcements: AnnouncementSummary[] }>;
    },
  },

  tickets: {
    async create(input: { subject: string; body: string }): Promise<{ id: string }> {
      const res = await authedFetch('/v1/tickets', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return res.json() as Promise<{ id: string }>;
    },
    async list(): Promise<{ tickets: SupportTicket[] }> {
      const res = await authedFetch('/v1/tickets');
      return res.json() as Promise<{ tickets: SupportTicket[] }>;
    },
    async get(id: string): Promise<TicketWithMessages> {
      const res = await authedFetch(`/v1/tickets/${encodeURIComponent(id)}`);
      return res.json() as Promise<TicketWithMessages>;
    },
    async reply(ticketId: string, body: string): Promise<{ id: string }> {
      const res = await authedFetch(
        `/v1/tickets/${encodeURIComponent(ticketId)}/reply`,
        { method: 'POST', body: JSON.stringify({ body }) },
      );
      return res.json() as Promise<{ id: string }>;
    },
  },

  // ─── On-demand AI content (personalized, no admin needed) ───────────
  ai: {
    async generateSyllabus(exam?: string, language?: 'en' | 'hi'): Promise<{ syllabus: { subject: string; topics: { id: string; title: string; order: number }[] }[] }> {
      const res = await authedFetch('/v1/ai/syllabus', { method: 'POST', body: JSON.stringify({ exam, language }) });
      return res.json() as Promise<any>;
    },
    async generateAssessment(exam: string, count?: number, language?: 'en' | 'hi'): Promise<{ mcqs: { question: string; options: { key: string; text: string }[]; correctOption: string; explanation: string; subject: string; difficulty: string }[] }> {
      const res = await authedFetch('/v1/ai/assess/generate', { method: 'POST', body: JSON.stringify({ exam, count, language }) });
      return res.json() as Promise<any>;
    },
    async submitAssessment(exam: string, mcqs: any[], answers: (string | null)[]): Promise<{ result: { score: number; total: number; skillLevel: string; weakSubjects: string[]; strongSubjects: string[]; recommendations: string[] }; progress: any }> {
      const res = await authedFetch('/v1/ai/assess/submit', { method: 'POST', body: JSON.stringify({ exam, mcqs, answers }) });
      return res.json() as Promise<any>;
    },
    async getProgress(): Promise<{ progress: any | null }> {
      const res = await authedFetch('/v1/ai/progress');
      return res.json() as Promise<any>;
    },
    async updateProgress(data: Record<string, unknown>): Promise<{ ok: boolean }> {
      const res = await authedFetch('/v1/ai/progress/update', { method: 'POST', body: JSON.stringify(data) });
      return res.json() as Promise<any>;
    },
    async generateChapter(topic: string, subject?: string, language?: string): Promise<{ chapter: { title: string; sections: { heading: string; content: string }[]; summary: string; keyPoints: string[] } }> {
      const res = await authedFetch('/v1/ai/chapter', { method: 'POST', body: JSON.stringify({ topic, subject, language }) });
      return res.json() as Promise<any>;
    },
    async generateMockTest(subject?: string, topic?: string, count?: number): Promise<{ id: string; mcqs: any[]; durationMinutes: number; totalQuestions: number }> {
      const res = await authedFetch('/v1/ai/mock-test', { method: 'POST', body: JSON.stringify({ subject, topic, count }) });
      return res.json() as Promise<any>;
    },
    async generateFinalTest(count?: number): Promise<{ id: string; mcqs: any[]; durationMinutes: number; totalQuestions: number }> {
      const res = await authedFetch('/v1/ai/final-test', { method: 'POST', body: JSON.stringify({ count }) });
      return res.json() as Promise<any>;
    },
    async getCurrentAffairs(): Promise<{ items: { title: string; summary: string; category: string; date: string; examRelevance: string }[] }> {
      const res = await authedFetch('/v1/ai/current-affairs');
      return res.json() as Promise<any>;
    },
    async chat(message: string): Promise<{ reply: string; timestamp: string }> {
      const res = await authedFetch('/v1/ai/chat', { method: 'POST', body: JSON.stringify({ message }) });
      return res.json() as Promise<any>;
    },
    async getChatHistory(): Promise<{ messages: { role: string; content: string; timestamp: string }[] }> {
      const res = await authedFetch('/v1/ai/chat/history');
      return res.json() as Promise<any>;
    },
    async clearChatHistory(): Promise<{ ok: boolean }> {
      const res = await authedFetch('/v1/ai/chat/history', { method: 'DELETE' });
      return res.json() as Promise<any>;
    },
    async generateMcqs(subject?: string, count?: number): Promise<{ mcqs: { question: string; options: { key: string; text: string }[]; correctOption: string; explanation: string; subject: string; difficulty: string }[] }> {
      const res = await authedFetch('/v1/ai/mcqs', { method: 'POST', body: JSON.stringify({ subject, count }) });
      return res.json() as Promise<any>;
    },
    async searchNexipedia(topic: string): Promise<{ article: { title: string; summary: string; sections: { heading: string; content: string; imageQuery?: string }[]; relatedTopics: string[]; youtubeQuery: string; diagramPrompt: string } }> {
      const res = await authedFetch('/v1/ai/nexipedia', { method: 'POST', body: JSON.stringify({ topic }) });
      return res.json() as Promise<any>;
    },
    async visualize(content: string): Promise<{ diagram: string; title: string }> {
      const res = await authedFetch('/v1/ai/visualize', { method: 'POST', body: JSON.stringify({ content }) });
      return res.json() as Promise<any>;
    },
  },
};

export { ApiError };

export type {
  Announcement,
  AnnouncementSummary,
  Broadcast,
  BroadcastSummary,
  SupportTicket,
  TicketMessage,
  TicketWithMessages,
};
