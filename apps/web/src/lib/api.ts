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

export interface StoredUser { id: string; email: string; name: string; phone: string|null; photoURL: string|null; language: 'en'|'hi'; targetExam: ExamSlug|null; classLevel: string|null; board: string|null; school: string|null; dob: string|null; aim: string|null; onboardingScore: number|null; onboardingLevel: 'beginner'|'intermediate'|'advanced'|null; credits: number; plan: 'free'|'scholar'|'aspirant'|'achiever'; currentStreak: number; bestStreak: number; lastDailyAt: string|null; isVerified: boolean; role: 'student'|'admin'; createdAt: string; }
export interface MeResponse { user: StoredUser; dailyStreak: { streak: number; creditsEarned: number }; }
export interface MCQOption { key: 'A'|'B'|'C'|'D'; text: string; }
export interface GeneratedMCQ { id: string; question: string; options: MCQOption[]; correctOption: 'A'|'B'|'C'|'D'; explanation: string; difficulty: 'easy'|'medium'|'hard'; subject?: string; topic?: string; }
export interface AssessmentResult { score: number; total: number; level: 'beginner'|'intermediate'|'advanced'; message: string; messageHi: string; }

export interface SyllabusChapter { slug: string; name: string; nameHi: string; order: number; estimatedMinutes: number; }
export interface SyllabusSubject { slug: string; name: string; nameHi: string; icon: string; chapters: SyllabusChapter[]; }
export interface SyllabusTree { exam: string; examName: string; subjects: SyllabusSubject[]; }
export interface StudyProgress { userId: string; exam: string; completedChapters: string[]; chapterScores: Record<string, number>; currentChapter: string | null; overallPercent: number; }
export interface ChapterContent { exam: string; subject: string; chapter: string; language: string; content: string; generatedAt: string; generatedBy: string; }
export interface CompleteResult { progress: StudyProgress; nextChapter: string | null; unlocked: boolean; creditsAwarded: number; passed: boolean; }

export const api = {
  async me(): Promise<MeResponse> { return (await authedFetch('/v1/users/me')).json() as Promise<MeResponse>; },
  async updateProfile(data: Record<string, unknown>) { return (await authedFetch('/v1/users/me', { method: 'PATCH', body: JSON.stringify(data) })).json() as Promise<{user:StoredUser}>; },
  async saveOnboarding(data: Record<string, unknown>) { return (await authedFetch('/v1/users/me/onboarding', { method: 'POST', body: JSON.stringify(data) })).json() as Promise<{user:StoredUser}>; },
  async getAssessmentQuestions(examSlug: string, language: 'en'|'hi') { return (await authedFetch('/v1/assessment/questions', { method: 'POST', body: JSON.stringify({ examSlug, language }) })).json() as Promise<{questions:GeneratedMCQ[]}>; },
  async submitAssessment(questions: GeneratedMCQ[], answers: {questionId:string;chosen:string|null}[]) { return (await authedFetch('/v1/assessment/submit', { method: 'POST', body: JSON.stringify({ questions, answers }) })).json() as Promise<AssessmentResult>; },

  // Study
  async getSyllabus(examSlug: string) { return (await authedFetch(`/v1/study/syllabus/${examSlug}`)).json() as Promise<{syllabus:SyllabusTree}>; },
  async getChapterContent(exam: string, subject: string, chapter: string, lang: 'en'|'hi' = 'en') { return (await authedFetch(`/v1/study/${exam}/${subject}/${chapter}?lang=${lang}`)).json() as Promise<{chapter:ChapterContent}>; },
  async getChapterQuiz(exam: string, subject: string, chapter: string, lang: 'en'|'hi' = 'en') { return (await authedFetch(`/v1/study/${exam}/${subject}/${chapter}/quiz?lang=${lang}`)).json() as Promise<{questions:GeneratedMCQ[]}>; },
  async getChapterDiagram(exam: string, subject: string, chapter: string) { return (await authedFetch(`/v1/study/${exam}/${subject}/${chapter}/diagram`)).json() as Promise<{mermaid:string}>; },
  async visualizeSelection(text: string, subject: string, language: 'en'|'hi') { return (await authedFetch('/v1/study/visualize', { method: 'POST', body: JSON.stringify({ text, subject, language }) })).json() as Promise<{mermaid:string}>; },
  async completeChapter(exam: string, subject: string, chapter: string, score: number) { return (await authedFetch(`/v1/study/${exam}/${subject}/${chapter}/complete`, { method: 'POST', body: JSON.stringify({ score }) })).json() as Promise<CompleteResult>; },
  async getStudyProgress(examSlug: string) { return (await authedFetch(`/v1/study/progress/${examSlug}`)).json() as Promise<{progress:StudyProgress}>; },

  // Current Affairs
  async getCurrentAffairs(lang: 'en' | 'hi' = 'en') { return (await authedFetch(`/v1/current-affairs?lang=${lang}`)).json() as Promise<CurrentAffairsResponse>; },
  async getCurrentAffairsQuiz(lang: 'en' | 'hi' = 'en') { return (await authedFetch(`/v1/current-affairs/quiz?lang=${lang}`)).json() as Promise<{date:string; questions:GeneratedMCQ[]}>; },
  async submitCurrentAffairsQuiz(answers: number[], timeTaken: number) { return (await authedFetch('/v1/current-affairs/quiz/submit', { method: 'POST', body: JSON.stringify({ answers, timeTaken }) })).json() as Promise<QuizSubmitResult>; },
  async getCurrentAffairsLeaderboard() { return (await authedFetch('/v1/current-affairs/leaderboard')).json() as Promise<LeaderboardResponse>; },

  // Chat
  async sendChat(message: string, sessionId?: string) { return (await authedFetch('/v1/chat', { method: 'POST', body: JSON.stringify({ message, sessionId }) })).json() as Promise<{sessionId:string; response:string; title:string}>; },
  async getChatHistory() { return (await authedFetch('/v1/chat/history')).json() as Promise<{sessions:ChatSessionSummary[]}>; },
  async getChatSession(sessionId: string) { return (await authedFetch(`/v1/chat/history/${sessionId}`)).json() as Promise<{session:ChatSession}>; },
  async deleteChatSession(sessionId: string) { return (await authedFetch(`/v1/chat/history/${sessionId}`, { method: 'DELETE' })).json() as Promise<{success:boolean}>; },

  // Credits
  async getCreditsBalance() { return (await authedFetch('/v1/credits/balance')).json() as Promise<{credits:number; plan:string}>; },
  async earnCredits(type: string) { return (await authedFetch('/v1/credits/earn', { method: 'POST', body: JSON.stringify({ type }) })).json() as Promise<{credited:number; balance:number; message?:string}>; },

  // Billing
  async getPlans() { return (await authedFetch('/v1/billing/plans')).json() as Promise<{plans:Plan[]}>; },
  async createOrder(planId: string, period: 'monthly'|'yearly') { return (await authedFetch('/v1/billing/order', { method: 'POST', body: JSON.stringify({ planId, period }) })).json() as Promise<{orderId:string; amount:number; currency:string; key:string}>; },
  async verifyPayment(data: {razorpay_order_id:string; razorpay_payment_id:string; razorpay_signature:string; planId:string; period:'monthly'|'yearly'}) { return (await authedFetch('/v1/billing/verify', { method: 'POST', body: JSON.stringify(data) })).json() as Promise<{success:boolean; plan:string; expiresAt:string}>; },
  async getSubscription() { return (await authedFetch('/v1/billing/subscription')).json() as Promise<{plan:string; planExpiresAt:string|null; credits:number}>; },
};

export interface CurrentAffairsItem { id: string; headline: string; body: string; category: string; sources: string[]; summary: string; factChecked: boolean; date: string; publishedAt: string; }
export interface LeaderboardEntry { userId: string; userName: string; score: number; timeTaken: number; date: string; }
export interface CurrentAffairsResponse { date: string; items: CurrentAffairsItem[]; yesterdayWinner: LeaderboardEntry | null; }
export interface QuizSubmitResult { score: number; correct: number; total: number; timeTaken: number; rank: number; }
export interface LeaderboardResponse { date: string; leaderboard: LeaderboardEntry[]; yesterdayWinner: LeaderboardEntry | null; }

export interface ChatMessage { role: 'user' | 'assistant'; content: string; timestamp: string; }
export interface ChatSession { id: string; userId: string; title: string; messages: ChatMessage[]; createdAt: string; updatedAt: string; }
export interface ChatSessionSummary { id: string; title: string; createdAt: string; updatedAt: string; messageCount: number; }
export interface Plan { id: string; name: string; nameHi: string; price: number; yearlyPrice: number; dailyMcq: number; mockTests: number; aiTutor: boolean; currentAffairs: boolean; essayGrading: boolean; }

export { ApiError };
