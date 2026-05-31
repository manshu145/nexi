'use client';
import type { ExamSlug } from '@nexigrate/shared';
import { getFirebaseAuthClient } from './firebase';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

class ApiError extends Error { constructor(public readonly status: number, message: string) { super(message); } }

export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const auth = getFirebaseAuthClient();
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, 'not signed in');
  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  // Lock §1.5 fix (PR-14): identity headers are no longer set client-side.
  // The backend reads email / name / picture / sign-in provider from the
  // verified Firebase ID token claims (`auth.verifyIdToken` in
  // apps/api/src/auth.ts), so a forged X-User-Email or X-User-Name header
  // would have no effect anyway. Sending them was both useless and a foot-
  // gun -- a future refactor could have started trusting them again
  // without anyone noticing the original threat model. Removed.
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (!res.ok) { let msg = `${res.status}`; try { const b = await res.json() as {error?:string}; if (b?.error) msg = b.error; } catch {} throw new ApiError(res.status, msg); }
  return res;
}

/**
 * Generate a cryptographically-random idempotency key (UUID v4).
 * Use this for any mutation that you want to safely retry — the server will
 * dedupe based on this key for ~24 hours.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback for older browsers — RFC4122-shaped pseudo-random.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface StoredUser { id: string; email: string; name: string; phone: string|null; photoURL: string|null; language: 'en'|'hi'; targetExam: ExamSlug|null; classLevel: string|null; board: string|null; school: string|null; dob: string|null; aim: string|null; onboardingScore: number|null; onboardingLevel: 'beginner'|'intermediate'|'advanced'|null; credits: number; plan: 'free'|'scholar'|'aspirant'|'achiever'; planExpiresAt: string|null; planCancelledAt: string|null; onboardingPlanChosen?: boolean; currentStreak: number; bestStreak: number; lastDailyAt: string|null; isVerified: boolean; phoneVerified?: boolean; role: 'student'|'admin'; createdAt: string; }
export interface MeResponse { user: StoredUser; dailyStreak: { streak: number; creditsEarned: number }; }
export interface MCQOption { key: 'A'|'B'|'C'|'D'; text: string; }
export interface GeneratedMCQ { id: string; question: string; options: MCQOption[]; correctOption: 'A'|'B'|'C'|'D'; explanation: string; difficulty: 'easy'|'medium'|'hard'; subject?: string; topic?: string; }
export interface AssessmentResult { score: number; total: number; level: 'beginner'|'intermediate'|'advanced'; message: string; messageHi: string; weakAreas?: string[]; strongAreas?: string[]; }

export interface SyllabusChapter { slug: string; name: string; nameHi: string; order: number; estimatedMinutes: number; }
export interface SyllabusSubject { slug: string; name: string; nameHi: string; icon: string; chapters: SyllabusChapter[]; }
export interface SyllabusTree { exam: string; examName: string; subjects: SyllabusSubject[]; }
export interface StudyProgress { userId: string; exam: string; completedChapters: string[]; chapterScores: Record<string, number>; currentChapter: string | null; overallPercent: number; }
export interface ChapterContent { exam: string; subject: string; chapter: string; language: string; content: string; generatedAt: string; generatedBy: string; userLevel?: 'beginner' | 'intermediate' | 'advanced'; contentPersonalizedFor?: 'beginner' | 'intermediate' | 'advanced'; }

// Blog (lock §5.3)
export interface BlogPost {
  id: string; slug: string;
  title: string; titleHi?: string;
  excerpt: string; excerptHi?: string;
  body: string; bodyHi?: string;
  status: 'draft' | 'published' | 'archived';
  seoTitle?: string; seoDescription?: string; ogImage?: string;
  tags: string[]; authorName: string;
  createdAt: string; updatedAt: string; publishedAt?: string;
}
export interface BlogPostListItem {
  id: string; slug: string; title: string; status: 'draft' | 'published' | 'archived';
  excerpt: string; tags: string[]; authorName: string;
  createdAt: string; updatedAt: string; publishedAt?: string;
}
export interface BlogPostInput {
  slug: string; title: string; titleHi?: string;
  excerpt: string; excerptHi?: string;
  body: string; bodyHi?: string;
  seoTitle?: string; seoDescription?: string; ogImage?: string;
  tags?: string[]; authorName?: string;
}
export interface CompleteResult { progress: StudyProgress; nextChapter: string | null; unlocked: boolean; creditsAwarded: number; passed: boolean; }

export const api = {
  async me(): Promise<MeResponse> { return (await authedFetch('/v1/users/me')).json() as Promise<MeResponse>; },
  async recordPwaInstall(): Promise<void> { await authedFetch('/v1/users/me/pwa-install', { method: 'POST', body: JSON.stringify({}) }); },
  async updateProfile(data: Record<string, unknown>) { return (await authedFetch('/v1/users/me', { method: 'PATCH', body: JSON.stringify(data) })).json() as Promise<{user:StoredUser}>; },
  async saveOnboarding(data: Record<string, unknown>) { return (await authedFetch('/v1/users/me/onboarding', { method: 'POST', body: JSON.stringify(data) })).json() as Promise<{user:StoredUser}>; },
  async markPlanChosen(chosenPlan: 'free'|'scholar'|'aspirant'|'achiever') {
    return (await authedFetch('/v1/users/me/onboarding/plan-chosen', {
      method: 'POST',
      body: JSON.stringify({ chosenPlan }),
    })).json() as Promise<{ user: StoredUser; chosenPlan: string }>;
  },
  async getAssessmentQuestions(examSlug: string, language: 'en'|'hi') { return (await authedFetch('/v1/assessment/questions', { method: 'POST', body: JSON.stringify({ examSlug, language }) })).json() as Promise<{questions:GeneratedMCQ[]}>; },
  async submitAssessment(questions: GeneratedMCQ[], answers: {questionId:string;chosen:string|null}[]) { return (await authedFetch('/v1/assessment/submit', { method: 'POST', body: JSON.stringify({ questions, answers }) })).json() as Promise<AssessmentResult>; },
  async getStage1Questions(examSlug: string, language: 'en'|'hi', opts?: { signal?: AbortSignal }) {
    return (await authedFetch('/v1/assessment/questions', {
      method: 'POST',
      body: JSON.stringify({ examSlug, language }),
      ...(opts?.signal ? { signal: opts.signal } : {}),
    })).json() as Promise<{questions:GeneratedMCQ[]}>;
  },
  async getStage2Questions(
    examSlug: string,
    language: 'en'|'hi',
    stage1Results: {questions:GeneratedMCQ[]; answers:{questionId:string;chosen:string|null}[]},
    opts?: { signal?: AbortSignal },
  ) {
    return (await authedFetch('/v1/assessment/stage2', {
      method: 'POST',
      body: JSON.stringify({ examSlug, language, stage1Results }),
      ...(opts?.signal ? { signal: opts.signal } : {}),
    })).json() as Promise<{questions:GeneratedMCQ[]}>;
  },
  async getStage3Questions(
    examSlug: string,
    language: 'en'|'hi',
    stage1Results: {questions:GeneratedMCQ[]; answers:{questionId:string;chosen:string|null}[]},
    stage2Results: {questions:GeneratedMCQ[]; answers:{questionId:string;chosen:string|null}[]},
    opts?: { signal?: AbortSignal },
  ) {
    return (await authedFetch('/v1/assessment/stage3', {
      method: 'POST',
      body: JSON.stringify({ examSlug, language, stage1Results, stage2Results }),
      ...(opts?.signal ? { signal: opts.signal } : {}),
    })).json() as Promise<{questions:GeneratedMCQ[]}>;
  },
  async submitMultiStageAssessment(stage1: {questions:GeneratedMCQ[]; answers:{questionId:string;chosen:string|null}[]}, stage2: {questions:GeneratedMCQ[]; answers:{questionId:string;chosen:string|null}[]}, stage3: {questions:GeneratedMCQ[]; answers:{questionId:string;chosen:string|null}[]}) { return (await authedFetch('/v1/assessment/submit', { method: 'POST', body: JSON.stringify({ multiStage: true, stage1, stage2, stage3 }) })).json() as Promise<AssessmentResult>; },

  // Study
  async getSyllabus(examSlug: string) { return (await authedFetch(`/v1/study/syllabus/${examSlug}`)).json() as Promise<{syllabus:SyllabusTree}>; },
  async getChapterContent(exam: string, subject: string, chapter: string, lang: 'en'|'hi' = 'en') { return (await authedFetch(`/v1/study/${exam}/${subject}/${chapter}?lang=${lang}`)).json() as Promise<{chapter:ChapterContent; userLevel?:string; contentPersonalizedFor?:string}>; },
  async getChapterQuiz(exam: string, subject: string, chapter: string, lang: 'en'|'hi' = 'en') { return (await authedFetch(`/v1/study/${exam}/${subject}/${chapter}/quiz?lang=${lang}`)).json() as Promise<{questions:GeneratedMCQ[]}>; },
  async getChapterDiagram(exam: string, subject: string, chapter: string) { return (await authedFetch(`/v1/study/${exam}/${subject}/${chapter}/diagram`)).json() as Promise<{mermaid:string}>; },
  async visualizeSelection(text: string, subject: string, language: 'en'|'hi') { return (await authedFetch('/v1/study/visualize', { method: 'POST', body: JSON.stringify({ text, subject, language }) })).json() as Promise<{mermaid:string}>; },
  async visualizeChapter(examSlug: string, subjectSlug: string, chapterSlug: string, type: 'diagram'|'mindmap'|'flowchart'|'timeline'|'image') { return (await authedFetch('/v1/study/visualize', { method: 'POST', body: JSON.stringify({ examSlug, subjectSlug, chapterSlug, type }) })).json() as Promise<{visualization:{type:'mermaid'|'image'; content:string}}>; },
  async completeChapter(exam: string, subject: string, chapter: string, score: number) { return (await authedFetch(`/v1/study/${exam}/${subject}/${chapter}/complete`, { method: 'POST', body: JSON.stringify({ score }) })).json() as Promise<CompleteResult>; },
  async getStudyProgress(examSlug: string) { return (await authedFetch(`/v1/study/progress/${examSlug}`)).json() as Promise<{progress:StudyProgress}>; },

  // Current Affairs
  async getCurrentAffairs(lang: 'en' | 'hi' = 'en') { return (await authedFetch(`/v1/current-affairs?lang=${lang}`)).json() as Promise<CurrentAffairsResponse>; },
  async getCurrentAffairsDetail(id: string, lang: 'en' | 'hi' = 'en') { return (await authedFetch(`/v1/current-affairs/${id}?lang=${lang}`)).json() as Promise<{item: CurrentAffairsItem}>; },
  async toggleNewsLike(id: string) { return (await authedFetch(`/v1/current-affairs/${id}/like`, { method: 'POST' })).json() as Promise<{liked: boolean; count: number}>; },
  async toggleNewsBookmark(id: string) { return (await authedFetch(`/v1/current-affairs/${id}/bookmark`, { method: 'POST' })).json() as Promise<{bookmarked: boolean}>; },
  async getNewsBookmarks() { return (await authedFetch('/v1/current-affairs/bookmarks')).json() as Promise<{bookmarks: string[]}>; },
  async getCurrentAffairsQuiz(lang: 'en' | 'hi' = 'en') { return (await authedFetch(`/v1/current-affairs/quiz?lang=${lang}`)).json() as Promise<{date:string; questions:GeneratedMCQ[]}>; },
  async submitCurrentAffairsQuiz(answers: number[], timeTaken: number) { return (await authedFetch('/v1/current-affairs/quiz/submit', { method: 'POST', body: JSON.stringify({ answers, timeTaken }) })).json() as Promise<QuizSubmitResult>; },
  async getCurrentAffairsLeaderboard() { return (await authedFetch('/v1/current-affairs/leaderboard')).json() as Promise<LeaderboardResponse>; },

  // Chat
  async sendChat(message: string, sessionId?: string, attachments?: { type: 'image' | 'file'; name: string; data: string; mimeType?: string }[], model?: 'gpt4o' | 'groq' | 'gemini') { return (await authedFetch('/v1/chat', { method: 'POST', body: JSON.stringify({ message, sessionId, attachments, model }) })).json() as Promise<{sessionId:string; response:string; title:string}>; },
  async generateImage(topic: string) { return (await authedFetch('/v1/chat/generate-image', { method: 'POST', body: JSON.stringify({ topic }) })).json() as Promise<{type: 'mermaid' | 'image'; content: string; fallback?: boolean; message?: string}>; },
  async getChatHistory() { return (await authedFetch('/v1/chat/history')).json() as Promise<{sessions:ChatSessionSummary[]}>; },
  async getChatSession(sessionId: string) { return (await authedFetch(`/v1/chat/history/${sessionId}`)).json() as Promise<{session:ChatSession}>; },
  async deleteChatSession(sessionId: string) { return (await authedFetch(`/v1/chat/history/${sessionId}`, { method: 'DELETE' })).json() as Promise<{success:boolean}>; },
  async deleteAllChatSessions() { return (await authedFetch('/v1/chat/history/all', { method: 'DELETE' })).json() as Promise<{success:boolean}>; },

  // Credits
  async getCreditsBalance() {
    return (await authedFetch('/v1/credits/balance')).json() as Promise<{
      credits: number;
      plan: string;
      earnRates: Record<string, number>;
      spendRates: Record<string, number>;
    }>;
  },
  /**
   * Append-only ledger history for the current user. Most-recent first.
   * Pass `before` (ISO timestamp from the oldest event you've already seen)
   * to load the next page; the server caps `limit` to 200.
   */
  async getCreditEvents(opts?: { limit?: number; before?: string }) {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.before) params.set('before', opts.before);
    const qs = params.toString();
    return (await authedFetch(`/v1/credits/events${qs ? `?${qs}` : ''}`)).json() as Promise<{
      events: CreditEvent[];
      limit: number;
    }>;
  },
  async getReferralStats() { return (await authedFetch('/v1/credits/referral')).json() as Promise<ReferralStats>; },
  async applyReferral(referralCode: string) { return (await authedFetch('/v1/credits/referral/apply', { method: 'POST', body: JSON.stringify({ referralCode }) })).json() as Promise<{success:boolean; bonusCredits?:number; message?:string}>; },
  async completeReferral() { return (await authedFetch('/v1/credits/referral/complete', { method: 'POST' })).json() as Promise<{completed:boolean}>; },

  // Billing
  async getPlans() { return (await authedFetch('/v1/billing/plans')).json() as Promise<{plans:Plan[]}>; },
  async createOrder(planId: string, period: 'monthly'|'yearly', couponCode?: string) {
    return (await authedFetch('/v1/billing/order', {
      method: 'POST',
      body: JSON.stringify({ planId, period, couponCode }),
    })).json() as Promise<{orderId:string; amount:number; currency:string; key:string; keyId?:string; period:'monthly'|'yearly'}>;
  },
  async verifyPayment(data: {razorpay_order_id:string; razorpay_payment_id:string; razorpay_signature:string}, idempotencyKey?: string) {
    return (await authedFetch('/v1/billing/verify', {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      body: JSON.stringify(data),
    })).json() as Promise<{success:boolean; plan:string; expiresAt:string; period:'monthly'|'yearly'}>;
  },
  async getSubscription() { return (await authedFetch('/v1/billing/subscription')).json() as Promise<{plan:string; planExpiresAt:string|null; planCancelledAt:string|null; isActive:boolean; isCancelled:boolean; daysRemaining:number; credits:number}>; },
  async cancelSubscription(reason?: string) {
    return (await authedFetch('/v1/billing/cancel', {
      method: 'POST',
      body: JSON.stringify({ reason: reason ?? '' }),
    })).json() as Promise<{success:boolean; alreadyCancelled:boolean; plan:string; planExpiresAt:string|null; planCancelledAt:string}>;
  },
  /**
   * PR-34c (audit #26): the backend has stored every completed payment in
   * `billingOrders` since the Razorpay integration shipped, but the web
   * app never had a page to read them. Returns the most-recent 10
   * completed payments for the signed-in user. Amount is in paise — the
   * UI divides by 100 before rendering ₹ symbols.
   */
  async getBillingHistory() {
    return (await authedFetch('/v1/billing/history')).json() as Promise<{
      payments: Array<{
        orderId: string;
        amount: number; currency: string;
        planId: string; period: 'monthly' | 'yearly';
        status: string;
        completedAt?: string;
        couponCode?: string;
        paymentId?: string;
      }>;
    }>;
  },
  /**
   * PR-34c (audit #27): create a tracked support ticket. Pre-PR-34c the
   * /support page only had AI chat — students could not actually reach a
   * human, so /admin/support was forever empty. Server stores in
   * `supportTickets` collection, admin replies via /v1/admin/support.
   */
  async createSupportTicket(subject: string, message: string) {
    return (await authedFetch('/v1/support/ticket', {
      method: 'POST',
      body: JSON.stringify({ subject, message }),
    })).json() as Promise<{ ticket: { id: string; subject: string; status: string; createdAt: string } }>;
  },
  /**
   * PR-34c (audit #28): list the signed-in user's own tickets so they
   * can read admin replies and the full message thread. Read-only on
   * student side — replying is admin-only for now.
   */
  async listMyTickets() {
    return (await authedFetch('/v1/support/tickets')).json() as Promise<{
      tickets: Array<{
        id: string; userId: string; subject: string; status: string;
        messages: Array<{ role: 'user' | 'admin'; content: string; timestamp: string }>;
        createdAt: string;
      }>;
    }>;
  },

  // ─── DPDP §3.4 — right to access + right to erasure ─────────────────────
  /**
   * Triggers a download of every user-scoped record we hold for the
   * signed-in user (the user doc itself plus every collection in the
   * server's USER_DATA_COLLECTIONS map). The browser receives a
   * Content-Disposition: attachment response so it pops a save dialog
   * with filename "nexigrate-data-YYYY-MM-DD.json".
   */
  async exportMyData(): Promise<{ blob: Blob; filename: string }> {
    const res = await authedFetch('/v1/users/me/export-data');
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Failed to export data: ${res.status} ${body.slice(0, 200)}`);
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') ?? '';
    const m = cd.match(/filename="([^"]+)"/);
    const filename = m?.[1] ?? `nexigrate-data-${new Date().toISOString().slice(0, 10)}.json`;
    return { blob, filename };
  },

  /**
   * Permanently delete the signed-in user's account and every record we
   * hold for them (right-to-erasure).
   */
  async deleteAccount(): Promise<{
    success: boolean;
    partial: boolean;
    collectionsDeleted: string[];
    failedCollections: string[];
    totalDocs: number;
    message: string;
  }> {
    return (await authedFetch('/v1/users/me', { method: 'DELETE' })).json();
  },

  // ─── Mock tests (lock §5.5) ─────────────────────────────────────────────
  /**
   * Kick off mock-test generation. Server can take 30-90s when Groq is the
   * only working provider (PR-18 batches 30 questions into 6×5 calls). The
   * caller passes an AbortController.signal so the page can enforce a
   * 90-second client-side ceiling and surface a clean "took too long"
   * error instead of an indefinite spinner. `authedFetch` already accepts
   * `init.signal` because RequestInit's signal field is forwarded as-is to
   * the underlying fetch — see PR-32.
   */
  async startMockTest(
    input: { examSlug: string; language?: 'en' | 'hi'; questionCount?: number; durationMinutes?: number },
    opts?: { signal?: AbortSignal },
  ) {
    return (await authedFetch('/v1/mock-tests/start', {
      method: 'POST', body: JSON.stringify(input),
      ...(opts?.signal ? { signal: opts.signal } : {}),
    })).json() as Promise<{
      attemptId: string; examSlug: string; language: 'en' | 'hi';
      durationMinutes: number; total: number; startedAt: string; creditCost: number;
      questions: Array<{ id: string; question: string; options: { key: 'A'|'B'|'C'|'D'; text: string }[]; difficulty?: string; subject?: string; topic?: string }>;
    }>;
  },
  async getMockTest(id: string) {
    return (await authedFetch(`/v1/mock-tests/${encodeURIComponent(id)}`)).json() as Promise<{
      id: string; examSlug: string; language: 'en'|'hi'; status: 'in_progress'|'submitted'|'expired';
      startedAt: string; durationMinutes: number; submittedAt: string|null;
      total: number; score: number|null; percentage: number|null;
      subjectBreakdown: Record<string, { correct: number; total: number }>|null;
      questions: Array<{ id: string; question: string; options: { key: 'A'|'B'|'C'|'D'; text: string }[]; difficulty?: string; subject?: string; topic?: string; correctOption?: 'A'|'B'|'C'|'D'; explanation?: string }>;
      answers?: Record<string, 'A'|'B'|'C'|'D'|null>;
      creditCost: number;
    }>;
  },
  async submitMockTest(id: string, answers: Array<{ questionId: string; chosen: 'A'|'B'|'C'|'D'|null }>) {
    return (await authedFetch(`/v1/mock-tests/${encodeURIComponent(id)}/submit`, {
      method: 'POST', body: JSON.stringify({ answers }),
    })).json() as Promise<{
      id: string; score: number; total: number; percentage: number;
      subjectBreakdown: Record<string, { correct: number; total: number }>;
      submittedAt: string;
      questions: Array<{ id: string; question: string; options: { key: 'A'|'B'|'C'|'D'; text: string }[]; correctOption: 'A'|'B'|'C'|'D'; explanation: string; difficulty?: string; subject?: string; topic?: string }>;
      answers: Record<string, 'A'|'B'|'C'|'D'|null>;
    }>;
  },
  async getMockTestHistory() {
    return (await authedFetch('/v1/mock-tests/history')).json() as Promise<{
      attempts: Array<{
        id: string; examSlug: string; language: 'en'|'hi'; status: 'in_progress'|'submitted'|'expired';
        startedAt: string; submittedAt: string|null; total: number;
        score: number|null; percentage: number|null; durationMinutes: number;
      }>;
    }>;
  },

  // Session tracking
  async startSession() { return (await authedFetch('/v1/users/me/session/start', { method: 'POST' })).json() as Promise<{sessionId:string; startedAt:string}>; },
  async pingSession() { return (await authedFetch('/v1/users/me/session/ping', { method: 'POST' })).json() as Promise<{ok:boolean}>; },
  async endSession() { return (await authedFetch('/v1/users/me/session/end', { method: 'POST' })).json() as Promise<{ok:boolean}>; },

  // ─── Streak leaderboard (lock §5.4) ──────────────────────────────────
  async getStreakLeaderboard(limit = 20) {
    return (await authedFetch(`/v1/users/streak-leaderboard?limit=${limit}`)).json() as Promise<{
      leaderboard: Array<{
        userId: string; name: string; photoURL: string | null;
        currentStreak: number; bestStreak: number; targetExam: string | null;
      }>;
    }>;
  },

  // ─── Blog (lock §5.3) — admin-only mutations ─────────────────────────
  async listBlogPosts(opts?: { status?: 'draft' | 'published' | 'archived'; limit?: number }) {
    const qs = new URLSearchParams();
    if (opts?.status) qs.set('status', opts.status);
    if (opts?.limit) qs.set('limit', String(opts.limit));
    const url = `/v1/admin/blog/posts${qs.toString() ? `?${qs}` : ''}`;
    return (await authedFetch(url)).json() as Promise<{ posts: BlogPostListItem[] }>;
  },
  async getBlogPost(id: string) {
    return (await authedFetch(`/v1/admin/blog/posts/${id}`)).json() as Promise<{ post: BlogPost }>;
  },
  async createBlogPost(input: BlogPostInput) {
    return (await authedFetch(`/v1/admin/blog/posts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    })).json() as Promise<{ post: BlogPost }>;
  },
  async updateBlogPost(id: string, patch: Partial<BlogPostInput>) {
    return (await authedFetch(`/v1/admin/blog/posts/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })).json() as Promise<{ post: BlogPost }>;
  },
  async publishBlogPost(id: string) {
    return (await authedFetch(`/v1/admin/blog/posts/${id}/publish`, { method: 'POST' })).json() as Promise<{ post: BlogPost }>;
  },
  async unpublishBlogPost(id: string) {
    return (await authedFetch(`/v1/admin/blog/posts/${id}/unpublish`, { method: 'POST' })).json() as Promise<{ post: BlogPost }>;
  },
  async deleteBlogPost(id: string) {
    return (await authedFetch(`/v1/admin/blog/posts/${id}`, { method: 'DELETE' })).json() as Promise<{ success: boolean }>;
  },
  /**
   * Generate a markdown blog draft via AI. Admin types topic + outline,
   * gets back markdown to paste into the editor.
   */
  async generateBlogDraft(input: { topic: string; outline?: string; language?: 'en' | 'hi'; targetExam?: string }) {
    return (await authedFetch(`/v1/admin/blog/draft`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    })).json() as Promise<{ body: string }>;
  },

  // ─── Public boot data (no auth required) ───────────────────────────────
  // Mirrors the server's PublicRoutes shape: branding info plus the live
  // signup-bonus preview so splash screens / marketing copy don't have to
  // hard-code the welcome credit count.
  async getBranding(): Promise<BrandingInfo> {
    const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';
    const res = await fetch(`${API_URL}/v1/branding`, {
      // Browser-side cache hint matches the server's Cache-Control header.
      // No Authorization header -- this route is intentionally public.
      cache: 'default',
    });
    if (!res.ok) throw new Error(`branding: ${res.status}`);
    return (await res.json()) as BrandingInfo;
  },
  /**
   * Best-effort error report. Does NOT throw -- the caller is the React
   * error boundary and we don't want a follow-up exception to mask the
   * original stack. Sends without auth so a render crash that broke the
   * Firebase client can still phone home.
   */
  async reportClientError(err: { message: string; stack?: string; route?: string; digest?: string; userId?: string }): Promise<void> {
    const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';
    try {
      await fetch(`${API_URL}/v1/logs/error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: err.message.slice(0, 2000),
          stack: err.stack?.slice(0, 8000),
          route: err.route?.slice(0, 500),
          digest: err.digest?.slice(0, 200),
          userId: err.userId?.slice(0, 128),
        }),
      });
    } catch {
      // Swallow -- nothing useful we can do at this layer.
    }
  },

  // ─── Admin: platform configuration ─────────────────────────────────────
  // The plan matrix (price + features) and credit-reward rate tables both
  // live in `platformConfig/*` Firestore docs. Reads return the live merged
  // values (Firestore overrides on top of the locked PR-03 defaults from
  // shared). PATCH writes a partial -- only fields you include are
  // overwritten.
  async adminGetPlans() {
    return (await authedFetch('/v1/admin/plans')).json() as Promise<{ plans: AdminPlan[] }>;
  },
  async adminUpdatePlan(planId: string, patch: Partial<AdminPlanPatch>) {
    return (await authedFetch(`/v1/admin/plans/${planId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })).json() as Promise<{ success: boolean; plan: AdminPlan }>;
  },
  async adminGetCreditRewards() {
    return (await authedFetch('/v1/admin/credit-rewards')).json() as Promise<{
      earn: Record<string, number>;
      spend: Record<string, number>;
    }>;
  },
  async adminUpdateCreditRewards(patch: { earn?: Record<string, number>; spend?: Record<string, number> }) {
    return (await authedFetch('/v1/admin/credit-rewards', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })).json() as Promise<{
      success: boolean;
      earn: Record<string, number>;
      spend: Record<string, number>;
    }>;
  },

  // ─── Admin: AI Providers (PR-29) ─────────────────────────────────────
  // Replaces the old fake "API Config" page. Each provider in the
  // registry has its own per-doc Firestore config; the admin can save
  // a key, optionally pin a model, validate against the live API, and
  // clear an auto-resolver blacklist after fixing a key. Responses
  // never include the raw key — only `maskedKey` (last 4 + dots).
  async listAIProviders() {
    return (await authedFetch('/v1/admin/ai-providers')).json() as Promise<{ providers: ProviderConfigResponse[] }>;
  },
  async getAIProvider(id: string) {
    return (await authedFetch(`/v1/admin/ai-providers/${encodeURIComponent(id)}`)).json() as Promise<{ provider: ProviderConfigResponse }>;
  },
  async updateAIProvider(id: string, patch: { apiKey?: string; enabled?: boolean; pinnedModel?: string | null }) {
    return (await authedFetch(`/v1/admin/ai-providers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })).json() as Promise<{ provider: ProviderConfigResponse }>;
  },
  async validateAIProvider(id: string, opts?: { apiKey?: string; model?: string }) {
    return (await authedFetch(`/v1/admin/ai-providers/${encodeURIComponent(id)}/validate`, {
      method: 'POST',
      body: JSON.stringify(opts ?? {}),
    })).json() as Promise<{
      result: {
        ok: boolean;
        latencyMs: number;
        model?: string;
        sample?: string;
        error?: string;
      };
    }>;
  },
  async clearProviderBlacklist(id: string) {
    return (await authedFetch(`/v1/admin/ai-providers/${encodeURIComponent(id)}/clear-blacklist`, {
      method: 'POST',
    })).json() as Promise<{ provider: ProviderConfigResponse }>;
  },

  // ─── PR-40: Team RBAC ──────────────────────────────────────────────
  async adminGetTeamInvites() {
    return (await authedFetch('/v1/admin/team')).json() as Promise<{ invites: Array<{ id: string; email: string; role: 'admin' | 'editor' | 'viewer'; invitedBy: string; acceptedAt?: string | null; createdAt: string }> }>;
  },
  async adminCreateTeamInvite(email: string, role: 'editor' | 'viewer') {
    const res = await authedFetch('/v1/admin/team/invite', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Failed' }));
      throw new Error((data as { error?: string }).error ?? 'Failed to create invite');
    }
    return res.json() as Promise<{ invite: { id: string; email: string; role: string } }>;
  },
  async adminRevokeTeamInvite(id: string) {
    return (await authedFetch(`/v1/admin/team/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })).json() as Promise<{ ok: boolean }>;
  },

  // ─── PR-40: Push token registration ───────────────────────────────
  async registerPushToken(token: string, platform: 'web' | 'android' | 'ios') {
    return (await authedFetch('/v1/users/push-token', {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    })).json() as Promise<{ ok: boolean }>;
  },
};

export interface CurrentAffairsItem { id: string; headline: string; body: string; category: string; sources: string[]; summary: string; factChecked: boolean; date: string; publishedAt: string; }
export interface LeaderboardEntry { userId: string; userName: string; score: number; timeTaken: number; date: string; }
export interface CurrentAffairsResponse { date: string; items: CurrentAffairsItem[]; yesterdayWinner: LeaderboardEntry | null; userLikes?: string[]; userBookmarks?: string[]; likeCounts?: Record<string, number>; isFromYesterday?: boolean; }
export interface QuizSubmitResult { score: number; correct: number; total: number; timeTaken: number; rank: number; }
export interface LeaderboardResponse { date: string; leaderboard: LeaderboardEntry[]; yesterdayWinner: LeaderboardEntry | null; }

export interface ChatMessage { role: 'user' | 'assistant'; content: string; timestamp: string; }
export interface ChatSession { id: string; userId: string; title: string; messages: ChatMessage[]; createdAt: string; updatedAt: string; }
export interface ChatSessionSummary { id: string; title: string; createdAt: string; updatedAt: string; messageCount: number; }
export interface Plan { id: string; name: string; nameHi: string; price: number; yearlyPrice: number; dailyMcq: number; mockTests: number; aiTutor: boolean; currentAffairs: boolean; essayGrading: boolean; }
export interface ReferralStats { code: string; referralUrl: string; totalReferrals: number; pendingReferrals: number; completedReferrals: number; totalEarned: number; }

/**
 * Splash-screen / marketing-flavoured boot data. Server source:
 * `apps/api/src/routes/public.ts` (route GET /v1/branding).
 */
export interface BrandingInfo {
  siteName: string;
  siteNameHi: string;
  logoUrl: string;
  favicon: string;
  tagline: string;
  taglineHi: string;
  supportEmail: string;
  signupBonusPreview: number;
  currency: string;
}

/**
 * Plan row as returned by the admin endpoints. Extends the public PlanConfig
 * shape with a `subscribers` count so the editor table can show how many
 * users are on each tier today.
 */
export interface AdminPlanFeatures {
  dailyMCQ: number;
  mockTests: number;
  aiTutor: boolean;
  currentAffairs: boolean;
  essayGrading: boolean;
  chaptersPerDay: number;
  creditDeduction: boolean;
}

export interface AdminPlan {
  id: 'free' | 'scholar' | 'aspirant' | 'achiever';
  name: string;
  nameHi: string;
  price: number;
  yearlyPrice: number;
  isActive: boolean;
  comingSoon: boolean;
  features: AdminPlanFeatures;
  subscribers: number;
}

/** Partial shape for PATCH /v1/admin/plans/:planId. */
export interface AdminPlanPatch {
  name: string;
  nameHi: string;
  price: number;
  yearlyPrice: number;
  isActive: boolean;
  comingSoon: boolean;
  features: Partial<AdminPlanFeatures>;
}

/**
 * One row in the credit ledger as the backend serialises it.
 * Discriminated on `event.kind`: 'earn' rows carry a `source`, 'spend' rows
 * carry a `reason`, and 'expire' rows are emitted by the nightly sweeper.
 */
export type CreditEarnSource =
  | 'signup_verified'
  | 'daily_login'
  | 'chapter_complete'
  | 'mcq_pass'
  | 'mcq_fail_attempted'
  | 'streak_7d'
  | 'streak_30d'
  | 'referral_signup'
  | 'referral_retained_7d'
  | 'referral_bonus'
  | 'admin_grant'
  | 'subscription_grant';

export type CreditSpendReason =
  | 'read_chapter'
  | 'focus_session_1h'
  | 'mock_test'
  | 'ai_tutor_question'
  | 'concept_video'
  | 'long_answer_grading'
  | 'admin_revoke';

export type CreditEventKind =
  | { kind: 'earn'; source: CreditEarnSource }
  | { kind: 'spend'; reason: CreditSpendReason }
  | { kind: 'expire' };

export interface CreditEvent {
  id: string;
  userId: string;
  /** Positive for earn, negative for spend or expire. */
  amount: number;
  event: CreditEventKind;
  sourceRef: string | null;
  occurredAt: string;
  createdAt: string;
  expiresAt: string | null;
}

export { ApiError };



/**
 * Provider config row as returned by /v1/admin/ai-providers (PR-29).
 *
 * Mirrors `serializeProvider()` in apps/api/src/routes/admin.ts. The
 * `maskedKey` is the only key material ever sent over the wire — the
 * raw key is never serialised. The runtime auto-resolver writes
 * `blacklist` entries when it sees deprecation errors mid-call; admin
 * can clear them via `clearProviderBlacklist` after fixing a key.
 */
export interface ProviderModelOption {
  id: string;
  label: string;
  tier: 'flash' | 'pro' | 'image';
  recommended: boolean;
  costPer1kUsd: number | null;
}

export interface ProviderBlacklistEntry {
  model: string;
  until: string;
  reason?: string;
}

export interface ProviderConfigResponse {
  id: string;
  label: string;
  description: string;
  tier: 1 | 2;
  enabled: boolean;
  hasKey: boolean;
  /** Empty string when no key configured. */
  maskedKey: string;
  pinnedModel: string | null;
  pinnedModelFailureCount: number;
  lastValidatedAt: string | null;
  lastValidationLatencyMs: number | null;
  lastValidationError: string | null;
  /** Currently-active (unexpired) blacklist entries from the resolver. */
  blacklist: ProviderBlacklistEntry[];
  /** Last successfully-used model id (1-hour cache hint). */
  knownGoodModel: string | null;
  knownGoodAt: string | null;
  models: ProviderModelOption[];
  signupUrl: string;
  billingUrl: string;
  keyExamplePrefix: string;
}
