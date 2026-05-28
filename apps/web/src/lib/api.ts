'use client';
import type { ExamSlug } from '@nexigrate/shared';
import { getFirebaseAuthClient } from './firebase';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

class ApiError extends Error { constructor(public readonly status: number, message: string) { super(message); } }

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const auth = getFirebaseAuthClient();
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, 'not signed in');
  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  if (user.email) headers.set('X-User-Email', user.email);
  if (user.displayName) headers.set('X-User-Name', user.displayName);
  if (user.photoURL) headers.set('X-User-Photo', user.photoURL);
  headers.set('X-User-Provider', user.providerData[0]?.providerId === 'phone' ? 'phone' : 'google');
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

export interface StoredUser { id: string; email: string; name: string; phone: string|null; photoURL: string|null; language: 'en'|'hi'; targetExam: ExamSlug|null; classLevel: string|null; board: string|null; school: string|null; dob: string|null; aim: string|null; onboardingScore: number|null; onboardingLevel: 'beginner'|'intermediate'|'advanced'|null; credits: number; plan: 'free'|'scholar'|'aspirant'|'achiever'; planExpiresAt: string|null; planCancelledAt: string|null; onboardingPlanChosen?: boolean; currentStreak: number; bestStreak: number; lastDailyAt: string|null; isVerified: boolean; role: 'student'|'admin'; createdAt: string; }
export interface MeResponse { user: StoredUser; dailyStreak: { streak: number; creditsEarned: number }; }
export interface MCQOption { key: 'A'|'B'|'C'|'D'; text: string; }
export interface GeneratedMCQ { id: string; question: string; options: MCQOption[]; correctOption: 'A'|'B'|'C'|'D'; explanation: string; difficulty: 'easy'|'medium'|'hard'; subject?: string; topic?: string; }
export interface AssessmentResult { score: number; total: number; level: 'beginner'|'intermediate'|'advanced'; message: string; messageHi: string; weakAreas?: string[]; strongAreas?: string[]; }

export interface SyllabusChapter { slug: string; name: string; nameHi: string; order: number; estimatedMinutes: number; }
export interface SyllabusSubject { slug: string; name: string; nameHi: string; icon: string; chapters: SyllabusChapter[]; }
export interface SyllabusTree { exam: string; examName: string; subjects: SyllabusSubject[]; }
export interface StudyProgress { userId: string; exam: string; completedChapters: string[]; chapterScores: Record<string, number>; currentChapter: string | null; overallPercent: number; }
export interface ChapterContent { exam: string; subject: string; chapter: string; language: string; content: string; generatedAt: string; generatedBy: string; userLevel?: 'beginner' | 'intermediate' | 'advanced'; contentPersonalizedFor?: 'beginner' | 'intermediate' | 'advanced'; }
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
  async getStage1Questions(examSlug: string, language: 'en'|'hi') { return (await authedFetch('/v1/assessment/questions', { method: 'POST', body: JSON.stringify({ examSlug, language }) })).json() as Promise<{questions:GeneratedMCQ[]}>; },
  async getStage2Questions(examSlug: string, language: 'en'|'hi', stage1Results: {questions:GeneratedMCQ[]; answers:{questionId:string;chosen:string|null}[]}) { return (await authedFetch('/v1/assessment/stage2', { method: 'POST', body: JSON.stringify({ examSlug, language, stage1Results }) })).json() as Promise<{questions:GeneratedMCQ[]}>; },
  async getStage3Questions(examSlug: string, language: 'en'|'hi', stage1Results: {questions:GeneratedMCQ[]; answers:{questionId:string;chosen:string|null}[]}, stage2Results: {questions:GeneratedMCQ[]; answers:{questionId:string;chosen:string|null}[]}) { return (await authedFetch('/v1/assessment/stage3', { method: 'POST', body: JSON.stringify({ examSlug, language, stage1Results, stage2Results }) })).json() as Promise<{questions:GeneratedMCQ[]}>; },
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

  // Session tracking
  async startSession() { return (await authedFetch('/v1/users/me/session/start', { method: 'POST' })).json() as Promise<{sessionId:string; startedAt:string}>; },
  async pingSession() { return (await authedFetch('/v1/users/me/session/ping', { method: 'POST' })).json() as Promise<{ok:boolean}>; },
  async endSession() { return (await authedFetch('/v1/users/me/session/end', { method: 'POST' })).json() as Promise<{ok:boolean}>; },

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
};

export interface CurrentAffairsItem { id: string; headline: string; body: string; category: string; sources: string[]; summary: string; factChecked: boolean; date: string; publishedAt: string; }
export interface LeaderboardEntry { userId: string; userName: string; score: number; timeTaken: number; date: string; }
export interface CurrentAffairsResponse { date: string; items: CurrentAffairsItem[]; yesterdayWinner: LeaderboardEntry | null; userLikes?: string[]; userBookmarks?: string[]; likeCounts?: Record<string, number>; }
export interface QuizSubmitResult { score: number; correct: number; total: number; timeTaken: number; rank: number; }
export interface LeaderboardResponse { date: string; leaderboard: LeaderboardEntry[]; yesterdayWinner: LeaderboardEntry | null; }

export interface ChatMessage { role: 'user' | 'assistant'; content: string; timestamp: string; }
export interface ChatSession { id: string; userId: string; title: string; messages: ChatMessage[]; createdAt: string; updatedAt: string; }
export interface ChatSessionSummary { id: string; title: string; createdAt: string; updatedAt: string; messageCount: number; }
export interface Plan { id: string; name: string; nameHi: string; price: number; yearlyPrice: number; dailyMcq: number; mockTests: number; aiTutor: boolean; currentAffairs: boolean; essayGrading: boolean; }
export interface ReferralStats { code: string; referralUrl: string; totalReferrals: number; pendingReferrals: number; completedReferrals: number; totalEarned: number; }

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
