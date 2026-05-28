import type { Firestore } from 'firebase-admin/firestore';
import type { Logger } from '../logger.js';
import type { Env } from '../env.js';

export interface AdminStats {
  totalUsers: number;
  dau: number;
  mau: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  revenueToday: number;
  revenue7d: number;
  revenue30d: number;
  revenueTotal: number;
  aiCallsToday: number;
  aiCallsThisWeek: number;
  aiCostToday: number;
  activeSessions: number;
  pwaInstalls: number;
  apiHealth: { openai: 'ok' | 'error' | 'unconfigured'; groq: 'ok' | 'error' | 'unconfigured'; gemini: 'ok' | 'error' | 'unconfigured'; razorpay: 'ok' | 'error' | 'unconfigured' };
}

export interface UserActivity {
  userId: string;
  chapterOpens: { chapter: string; subject: string; exam: string; timestamp: string }[];
  mockTests: { chapter: string; score: number; timestamp: string }[];
  chatSessions: { sessionId: string; messageCount: number; firstMessage: string; timestamp: string }[];
  totalTimeOnPlatform: number;
  creditHistory: { amount: number; reason: string; timestamp: string }[];
}

export interface ErrorLog {
  id: string;
  message: string;
  stack?: string;
  route?: string;
  userId?: string;
  timestamp: string;
  severity: 'critical' | 'warning' | 'info';
}

export interface AICallLog {
  id: string;
  model: string;
  tokens: number;
  cost: number;
  latencyMs: number;
  userId?: string;
  timestamp: string;
  status?: 'success' | 'error';
  endpoint?: string;
  provider?: string;
  error?: string;
  requestPreview?: string;
  responsePreview?: string;
}

export interface ActiveSession {
  userId: string;
  userName: string;
  exam: string;
  lastActiveAt: string;
  plan: string;
}

export interface AdminStore {
  getFullStats(): Promise<AdminStats>;
  getUserActivity(uid: string): Promise<UserActivity>;
  getErrorLogs(page?: number, limit?: number): Promise<{ logs: ErrorLog[]; total: number }>;
  getAICallLogs(page?: number, limit?: number): Promise<{ logs: AICallLog[]; total: number }>;
  getActiveSessions(): Promise<ActiveSession[]>;
  logError(error: ErrorLog): Promise<void>;
  logAICall(log: Omit<AICallLog, 'id'>): Promise<void>;
  updateSessionPing(uid: string): Promise<void>;
  startSession(uid: string): Promise<string>;
  endSession(uid: string, sessionId: string): Promise<void>;
  getAPIHealth(env: Env): Promise<AdminStats['apiHealth']>;
  // SEO
  getSeoSettings(): Promise<Record<string, any>>;
  saveSeoSettings(settings: Record<string, any>): Promise<void>;
  // Email templates
  getEmailTemplates(): Promise<EmailTemplate[]>;
  saveEmailTemplate(template: EmailTemplate): Promise<void>;
  deleteEmailTemplate(id: string): Promise<void>;
  // Announcements
  saveAnnouncement(announcement: Record<string, any>): Promise<void>;
  getAnnouncements(): Promise<Record<string, any>[]>;
  deleteAnnouncement(id: string): Promise<void>;
  // Revenue
  getRevenue(): Promise<{ payments: Record<string, any>[]; total: number }>;
  // Support tickets
  getSupportTickets(): Promise<Record<string, any>[]>;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
}

export class InMemoryAdminStore implements AdminStore {
  private errorLogs: ErrorLog[] = [];
  private aiCallLogs: AICallLog[] = [];
  private sessions = new Map<string, { startedAt: string; lastPing: string }>();
  private seoSettings: Record<string, any> = {};
  private emailTemplates: EmailTemplate[] = [];
  private announcements: Record<string, any>[] = [];

  async getFullStats(): Promise<AdminStats> {
    return { totalUsers: 0, dau: 0, mau: 0, newUsersToday: 0, newUsersThisWeek: 0, revenueToday: 0, revenue7d: 0, revenue30d: 0, revenueTotal: 0, aiCallsToday: this.aiCallLogs.filter(l => l.timestamp.startsWith(new Date().toISOString().split('T')[0]!)).length, aiCallsThisWeek: this.aiCallLogs.length, aiCostToday: 0, activeSessions: this.sessions.size, pwaInstalls: 0, apiHealth: { openai: 'unconfigured', groq: 'unconfigured', gemini: 'unconfigured', razorpay: 'unconfigured' } };
  }
  async getUserActivity(_uid: string): Promise<UserActivity> { return { userId: _uid, chapterOpens: [], mockTests: [], chatSessions: [], totalTimeOnPlatform: 0, creditHistory: [] }; }
  async getErrorLogs(page = 1, limit = 20) { const start = (page - 1) * limit; return { logs: this.errorLogs.slice(start, start + limit), total: this.errorLogs.length }; }
  async getAICallLogs(page = 1, limit = 20) { const start = (page - 1) * limit; return { logs: this.aiCallLogs.slice(start, start + limit), total: this.aiCallLogs.length }; }
  async getActiveSessions(): Promise<ActiveSession[]> { return []; }
  async logError(error: ErrorLog) { this.errorLogs.unshift(error); if (this.errorLogs.length > 500) this.errorLogs.pop(); }
  async logAICall(log: Omit<AICallLog, 'id'>) { this.aiCallLogs.unshift({ ...log, id: crypto.randomUUID() }); if (this.aiCallLogs.length > 1000) this.aiCallLogs.pop(); }
  async updateSessionPing(uid: string) { const s = this.sessions.get(uid); if (s) s.lastPing = new Date().toISOString(); }
  async startSession(uid: string) { const id = crypto.randomUUID(); this.sessions.set(uid, { startedAt: new Date().toISOString(), lastPing: new Date().toISOString() }); return id; }
  async endSession(uid: string, _sessionId: string) { this.sessions.delete(uid); }
  async getAPIHealth(env: Env): Promise<AdminStats['apiHealth']> {
    return {
      openai: env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 5 ? 'ok' : 'unconfigured',
      groq: env.GROQ_API_KEY && env.GROQ_API_KEY.length > 5 ? 'ok' : 'unconfigured',
      gemini: env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 5 ? 'ok' : 'unconfigured',
      razorpay: env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_ID.length > 5 ? 'ok' : 'unconfigured',
    };
  }
  async getSeoSettings() { return this.seoSettings; }
  async saveSeoSettings(settings: Record<string, any>) { this.seoSettings = { ...this.seoSettings, ...settings }; }
  async getEmailTemplates() { return this.emailTemplates; }
  async saveEmailTemplate(t: EmailTemplate) { this.emailTemplates.push(t); }
  async deleteEmailTemplate(id: string) { this.emailTemplates = this.emailTemplates.filter(t => t.id !== id); }
  async saveAnnouncement(announcement: Record<string, any>) { this.announcements.unshift(announcement); }
  async getAnnouncements() { return this.announcements; }
  async deleteAnnouncement(id: string) { this.announcements = this.announcements.filter(a => a.id !== id); }
  async getRevenue() { return { payments: [], total: 0 }; }
  async getSupportTickets() { return []; }
}

export class FirestoreAdminStore implements AdminStore {
  constructor(private readonly db: Firestore) {}

  async getFullStats(): Promise<AdminStats> {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]!;
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

    // Get user counts — deduplicate by unique doc ID
    const usersSnap = await this.db.collection('users').get();
    const uniqueUids = new Set(usersSnap.docs.map(d => d.id));
    const totalUsers = uniqueUids.size;
    let dau = 0, newUsersToday = 0, newUsersThisWeek = 0;
    const tenMinAgo = new Date(now.getTime() - 10 * 60000).toISOString();
    let activeSessions = 0;

    usersSnap.forEach(doc => {
      const data = doc.data();
      if (data.lastDailyAt?.startsWith(todayStr)) dau++;
      if (data.createdAt?.startsWith(todayStr)) newUsersToday++;
      if (data.createdAt > weekAgo) newUsersThisWeek++;
      if (data.lastActiveAt && data.lastActiveAt > tenMinAgo) activeSessions++;
    });

    // Get revenue
    let revenueToday = 0, revenue7d = 0, revenue30d = 0, revenueTotal = 0;
    try {
      const paymentsSnap = await this.db.collection('payments').where('status', '==', 'verified').get();
      paymentsSnap.forEach(doc => {
        const p = doc.data();
        const amount = p.amount || 0;
        revenueTotal += amount;
        if (p.createdAt > monthAgo) revenue30d += amount;
        if (p.createdAt > weekAgo) revenue7d += amount;
        if (p.createdAt?.startsWith(todayStr)) revenueToday += amount;
      });
    } catch { /* payments collection may not exist */ }

    // AI calls today
    let aiCallsToday = 0, aiCallsThisWeek = 0, aiCostToday = 0;
    try {
      const aiSnap = await this.db.collection('aiCallLogs').where('timestamp', '>=', todayStr).limit(500).get();
      aiCallsToday = aiSnap.size;
      aiSnap.forEach(doc => { aiCostToday += doc.data().cost || 0; });
      const aiWeekSnap = await this.db.collection('aiCallLogs').where('timestamp', '>=', weekAgo).limit(1000).get();
      aiCallsThisWeek = aiWeekSnap.size;
    } catch { /* collection may not exist */ }

    // PWA installs counter
    let pwaInstalls = 0;
    try {
      const statsDoc = await this.db.collection('platformConfig').doc('stats').get();
      if (statsDoc.exists) pwaInstalls = statsDoc.data()?.pwaInstalls ?? 0;
    } catch { /* */ }

    return {
      totalUsers, dau, mau: totalUsers, newUsersToday, newUsersThisWeek,
      revenueToday, revenue7d, revenue30d, revenueTotal,
      aiCallsToday, aiCallsThisWeek, aiCostToday, activeSessions, pwaInstalls,
      apiHealth: { openai: 'ok', groq: 'ok', gemini: 'ok', razorpay: 'ok' },
    };
  }

  async getUserActivity(uid: string): Promise<UserActivity> {
    // Fetch chapter opens
    const chapterOpens: UserActivity['chapterOpens'] = [];
    try {
      const snap = await this.db.collection('users').doc(uid).collection('activityLog').orderBy('timestamp', 'desc').limit(50).get();
      snap.forEach(doc => {
        const d = doc.data();
        if (d.type === 'chapter_open') chapterOpens.push({ chapter: d.chapter, subject: d.subject, exam: d.exam, timestamp: d.timestamp });
      });
    } catch { /* */ }

    // Fetch mock tests from progress
    const mockTests: UserActivity['mockTests'] = [];
    try {
      const snap = await this.db.collection('users').doc(uid).collection('mockTestResults').orderBy('timestamp', 'desc').limit(30).get();
      snap.forEach(doc => {
        const d = doc.data();
        mockTests.push({ chapter: d.chapter || '', score: d.score || 0, timestamp: d.timestamp || '' });
      });
    } catch { /* */ }

    // Chat sessions summary
    const chatSessions: UserActivity['chatSessions'] = [];
    try {
      const snap = await this.db.collection('chatSessions').where('userId', '==', uid).limit(10).get();
      snap.forEach(doc => {
        const d = doc.data();
        chatSessions.push({ sessionId: doc.id, messageCount: d.messages?.length || 0, firstMessage: d.messages?.[0]?.content?.slice(0, 80) || '', timestamp: d.createdAt || '' });
      });
      chatSessions.sort((a, b) => (b.timestamp).localeCompare(a.timestamp));
    } catch { /* */ }

    // Credit history
    const creditHistory: UserActivity['creditHistory'] = [];
    try {
      const snap = await this.db.collection('users').doc(uid).collection('creditLedger').orderBy('timestamp', 'desc').limit(30).get();
      snap.forEach(doc => {
        const d = doc.data();
        creditHistory.push({ amount: d.amount || 0, reason: d.reason || '', timestamp: d.timestamp || '' });
      });
    } catch { /* */ }

    // Session time (rough estimate from sessions collection)
    let totalTimeOnPlatform = 0;
    try {
      const snap = await this.db.collection('sessions').doc(uid).collection('history').limit(50).get();
      snap.forEach(doc => { totalTimeOnPlatform += doc.data().duration || 0; });
    } catch { /* */ }

    return { userId: uid, chapterOpens, mockTests, chatSessions, totalTimeOnPlatform, creditHistory };
  }

  async getErrorLogs(page = 1, limit = 20): Promise<{ logs: ErrorLog[]; total: number }> {
    const logs: ErrorLog[] = [];
    try {
      const snap = await this.db.collection('errorLogs').orderBy('timestamp', 'desc').limit(limit).offset((page - 1) * limit).get();
      snap.forEach(doc => logs.push({ id: doc.id, ...doc.data() } as ErrorLog));
      const countSnap = await this.db.collection('errorLogs').count().get();
      return { logs, total: countSnap.data().count };
    } catch { return { logs: [], total: 0 }; }
  }

  async getAICallLogs(page = 1, limit = 20): Promise<{ logs: AICallLog[]; total: number }> {
    const logs: AICallLog[] = [];
    try {
      const snap = await this.db.collection('aiCallLogs').orderBy('timestamp', 'desc').limit(limit).offset((page - 1) * limit).get();
      snap.forEach(doc => logs.push({ id: doc.id, ...doc.data() } as AICallLog));
      const countSnap = await this.db.collection('aiCallLogs').count().get();
      return { logs, total: countSnap.data().count };
    } catch { return { logs: [], total: 0 }; }
  }

  async getActiveSessions(): Promise<ActiveSession[]> {
    const tenMinAgo = new Date(Date.now() - 10 * 60000).toISOString();
    const sessions: ActiveSession[] = [];
    try {
      const snap = await this.db.collection('users').where('lastActiveAt', '>=', tenMinAgo).limit(50).get();
      snap.forEach(doc => {
        const d = doc.data();
        sessions.push({ userId: doc.id, userName: d.name || d.email || 'Unknown', exam: d.targetExam || '—', lastActiveAt: d.lastActiveAt, plan: d.plan || 'free' });
      });
    } catch { /* */ }
    return sessions;
  }

  async logError(error: ErrorLog): Promise<void> {
    try { await this.db.collection('errorLogs').add(error); } catch { /* non-critical */ }
  }

  async logAICall(log: Omit<AICallLog, 'id'>): Promise<void> {
    try { await this.db.collection('aiCallLogs').add({ ...log, id: crypto.randomUUID() }); } catch { /* non-critical */ }
  }

  async updateSessionPing(uid: string): Promise<void> {
    try { await this.db.collection('users').doc(uid).set({ lastActiveAt: new Date().toISOString() }, { merge: true }); } catch { /* */ }
  }

  async startSession(uid: string): Promise<string> {
    const sessionId = crypto.randomUUID();
    try {
      await this.db.collection('sessions').doc(uid).collection('history').doc(sessionId).set({ startedAt: new Date().toISOString() });
      await this.db.collection('users').doc(uid).set({ lastActiveAt: new Date().toISOString() }, { merge: true });
    } catch { /* */ }
    return sessionId;
  }

  async endSession(uid: string, sessionId: string): Promise<void> {
    try {
      const ref = this.db.collection('sessions').doc(uid).collection('history').doc(sessionId);
      const snap = await ref.get();
      if (snap.exists) {
        const startedAt = snap.data()?.startedAt;
        const duration = startedAt ? Math.round((Date.now() - new Date(startedAt).getTime()) / 1000) : 0;
        await ref.set({ endedAt: new Date().toISOString(), duration }, { merge: true });
      }
    } catch { /* */ }
  }

  async getAPIHealth(env: Env): Promise<AdminStats['apiHealth']> {
    const health: AdminStats['apiHealth'] = {
      openai: env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 5 ? 'ok' : 'unconfigured',
      groq: env.GROQ_API_KEY && env.GROQ_API_KEY.length > 5 ? 'ok' : 'unconfigured',
      gemini: env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 5 ? 'ok' : 'unconfigured',
      razorpay: env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_ID.length > 5 ? 'ok' : 'unconfigured',
    };

    // Quick health pings (with timeout)
    const timeout = (ms: number) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

    if (health.openai === 'ok') {
      try { await Promise.race([fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, method: 'GET' }), timeout(5000)]); } 
      catch { health.openai = 'error'; }
    }
    if (health.groq === 'ok') {
      try { await Promise.race([fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` }, method: 'GET' }), timeout(5000)]); }
      catch { health.groq = 'error'; }
    }
    if (health.gemini === 'ok') {
      try { const r = await Promise.race([fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`), timeout(5000)]) as Response; if (!r.ok) health.gemini = 'error'; }
      catch { health.gemini = 'error'; }
    }

    return health;
  }

  async getSeoSettings(): Promise<Record<string, any>> {
    try {
      const snap = await this.db.collection('system').doc('seoSettings').get();
      return snap.exists ? (snap.data() ?? {}) : {};
    } catch { return {}; }
  }

  async saveSeoSettings(settings: Record<string, any>): Promise<void> {
    await this.db.collection('system').doc('seoSettings').set(settings, { merge: true });
  }

  async getEmailTemplates(): Promise<EmailTemplate[]> {
    try {
      const snap = await this.db.collection('emailTemplates').orderBy('createdAt', 'desc').limit(50).get();
      return snap.docs.map(d => d.data() as EmailTemplate);
    } catch { return []; }
  }

  async saveEmailTemplate(t: EmailTemplate): Promise<void> {
    await this.db.collection('emailTemplates').doc(t.id).set(t);
  }

  async deleteEmailTemplate(id: string): Promise<void> {
    await this.db.collection('emailTemplates').doc(id).delete();
  }

  async saveAnnouncement(announcement: Record<string, any>): Promise<void> {
    await this.db.collection('announcements').doc(announcement.id).set(announcement);
  }

  async getAnnouncements(): Promise<Record<string, any>[]> {
    try {
      const snap = await this.db.collection('announcements').orderBy('createdAt', 'desc').limit(50).get();
      return snap.docs.map(d => d.data());
    } catch { return []; }
  }

  async deleteAnnouncement(id: string): Promise<void> {
    await this.db.collection('announcements').doc(id).delete();
  }

  async getRevenue(): Promise<{ payments: Record<string, any>[]; total: number }> {
    try {
      const snap = await this.db.collection('billingOrders').where('status', '==', 'completed').limit(100).get();
      const payments = snap.docs.map(d => d.data()).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
      const total = payments.reduce((sum, p) => sum + ((p.amount || 0) / 100), 0);
      return { payments, total };
    } catch { return { payments: [], total: 0 }; }
  }

  async getSupportTickets(): Promise<Record<string, any>[]> {
    try {
      const snap = await this.db.collection('supportTickets').orderBy('createdAt', 'desc').limit(50).get();
      return snap.docs.map(d => d.data());
    } catch { return []; }
  }
}
