/**
 * EmailMarketingStore — Firestore-backed email configuration, logging,
 * and campaign management for the admin email marketing system.
 *
 * Collections:
 *   - emailLogs/{id}        — every email sent (to, subject, type, status, timestamp)
 *   - emailConfig/settings  — global config (enabled types, sender addresses)
 *   - emailConfig/templates — per-type templates (subject + body overrides)
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { Logger } from '../logger.js';

// ─── Types ────────────────────────────────────────────────────────────

export type EmailType =
  | 'welcome'
  | 'streak_reminder'
  | 'payment_receipt'
  | 'forgot_password'
  | 'plan_expiry'
  | 'cancellation'
  | 'admin_broadcast'
  | 'custom';

export type EmailStatus = 'sent' | 'failed' | 'queued' | 'bounced';

export interface EmailLogEntry {
  id: string;
  to: string;
  subject: string;
  type: EmailType;
  status: EmailStatus;
  senderEmail: string;
  senderName: string;
  messageId?: string;
  error?: string;
  sentAt: string;
  metadata?: Record<string, unknown>;
}

export interface EmailTypeConfig {
  type: EmailType;
  label: string;
  description: string;
  enabled: boolean;
  senderEmail: string;
  senderName: string;
}

export interface EmailTemplate {
  type: EmailType;
  subject: string;
  body: string;
  updatedAt: string;
}

export interface EmailMarketingConfig {
  /** Which email types are enabled */
  types: EmailTypeConfig[];
  /** Default transactional sender */
  transactionalSender: { email: string; name: string };
  /** Marketing sender (admin@nexigrate.com) */
  marketingSender: { email: string; name: string };
  updatedAt: string;
}

export interface CampaignSegment {
  type: 'all' | 'free' | 'paid' | 'custom';
  /** For 'custom', a list of specific emails */
  emails?: string[];
}

// ─── Default config ───────────────────────────────────────────────────

export const DEFAULT_EMAIL_TYPES: EmailTypeConfig[] = [
  { type: 'welcome', label: 'Welcome / Signup', description: 'Sent when a user signs up or first logs in', enabled: true, senderEmail: 'hello@nexigrate.com', senderName: 'Nexigrate' },
  { type: 'streak_reminder', label: 'Streak Reminder', description: 'Daily 7pm IST reminder for users whose streak is at risk', enabled: true, senderEmail: 'hello@nexigrate.com', senderName: 'Nexigrate' },
  { type: 'payment_receipt', label: 'Payment Receipt', description: 'Sent after successful plan purchase', enabled: true, senderEmail: 'hello@nexigrate.com', senderName: 'Nexigrate' },
  { type: 'forgot_password', label: 'Forgot Password', description: 'Password reset email (Firebase handles delivery)', enabled: true, senderEmail: 'hello@nexigrate.com', senderName: 'Nexigrate' },
  { type: 'plan_expiry', label: 'Plan Expiry Warning', description: 'Sent before plan expires to encourage renewal', enabled: true, senderEmail: 'hello@nexigrate.com', senderName: 'Nexigrate' },
  { type: 'cancellation', label: 'Cancellation Confirmation', description: 'Sent when user cancels their subscription', enabled: true, senderEmail: 'hello@nexigrate.com', senderName: 'Nexigrate' },
  { type: 'admin_broadcast', label: 'Admin Broadcast', description: 'Bulk campaigns sent by admin to user segments', enabled: true, senderEmail: 'admin@nexigrate.com', senderName: 'Nexigrate Team' },
  { type: 'custom', label: 'Custom / One-off', description: 'Ad-hoc emails sent to specific users', enabled: true, senderEmail: 'admin@nexigrate.com', senderName: 'Nexigrate Team' },
];

export const DEFAULT_CONFIG: EmailMarketingConfig = {
  types: DEFAULT_EMAIL_TYPES,
  transactionalSender: { email: 'hello@nexigrate.com', name: 'Nexigrate' },
  marketingSender: { email: 'admin@nexigrate.com', name: 'Nexigrate Team' },
  updatedAt: new Date().toISOString(),
};

// ─── Store interface ──────────────────────────────────────────────────

export interface EmailMarketingStore {
  /** Log an email send event */
  logEmail(entry: Omit<EmailLogEntry, 'id'>): Promise<string>;
  /** Get email logs with pagination */
  getLogs(opts?: { page?: number; limit?: number; type?: EmailType; status?: EmailStatus }): Promise<{ logs: EmailLogEntry[]; total: number }>;
  /** Get email config (types + senders) */
  getConfig(): Promise<EmailMarketingConfig>;
  /** Update email config */
  updateConfig(patch: Partial<EmailMarketingConfig>): Promise<EmailMarketingConfig>;
  /** Get template for a specific email type */
  getTemplate(type: EmailType): Promise<EmailTemplate | null>;
  /** Save/update template for a type */
  saveTemplate(template: EmailTemplate): Promise<void>;
  /** Get all templates */
  getAllTemplates(): Promise<EmailTemplate[]>;
  /** Check if an email type is enabled */
  isTypeEnabled(type: EmailType): Promise<boolean>;
  /** Get sender config for a type */
  getSenderForType(type: EmailType): Promise<{ email: string; name: string }>;
}

// ─── Firestore implementation ─────────────────────────────────────────

const LOGS_COLLECTION = 'emailLogs';
const CONFIG_COLLECTION = 'emailConfig';
const CONFIG_DOC = 'settings';
const TEMPLATES_DOC = 'templates';

export class FirestoreEmailMarketingStore implements EmailMarketingStore {
  private configCache: { data: EmailMarketingConfig; expiresAt: number } | null = null;
  private templatesCache: { data: EmailTemplate[]; expiresAt: number } | null = null;
  private readonly CACHE_TTL = 60_000; // 60s

  constructor(
    private readonly db: Firestore,
    private readonly logger: Logger,
  ) {}

  async logEmail(entry: Omit<EmailLogEntry, 'id'>): Promise<string> {
    try {
      const ref = await this.db.collection(LOGS_COLLECTION).add({
        ...entry,
        sentAt: entry.sentAt || new Date().toISOString(),
      });
      return ref.id;
    } catch (err) {
      this.logger.error('emailMarketing.log_failed', {
        error: err instanceof Error ? err.message : String(err),
        to: entry.to,
        type: entry.type,
      });
      return '';
    }
  }

  async getLogs(opts?: { page?: number; limit?: number; type?: EmailType; status?: EmailStatus }): Promise<{ logs: EmailLogEntry[]; total: number }> {
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 50;

    try {
      let query = this.db.collection(LOGS_COLLECTION).orderBy('sentAt', 'desc') as any;
      if (opts?.type) query = query.where('type', '==', opts.type);
      if (opts?.status) query = query.where('status', '==', opts.status);

      // Get total count (approximation via limit)
      const countSnap = await query.limit(1000).get();
      const total = countSnap.size;

      // Paginate
      const offset = (page - 1) * limit;
      const snap = await query.offset(offset).limit(limit).get();
      const logs: EmailLogEntry[] = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as EmailLogEntry));

      return { logs, total };
    } catch (err) {
      this.logger.error('emailMarketing.get_logs_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { logs: [], total: 0 };
    }
  }

  async getConfig(): Promise<EmailMarketingConfig> {
    const now = Date.now();
    if (this.configCache && this.configCache.expiresAt > now) {
      return this.configCache.data;
    }

    try {
      const doc = await this.db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC).get();
      if (doc.exists) {
        const data = doc.data() as EmailMarketingConfig;
        // Merge with defaults so new types added in code are always present
        const mergedTypes = DEFAULT_EMAIL_TYPES.map(def => {
          const saved = data.types?.find(t => t.type === def.type);
          return saved ? { ...def, ...saved } : def;
        });
        const config: EmailMarketingConfig = {
          types: mergedTypes,
          transactionalSender: data.transactionalSender ?? DEFAULT_CONFIG.transactionalSender,
          marketingSender: data.marketingSender ?? DEFAULT_CONFIG.marketingSender,
          updatedAt: data.updatedAt ?? new Date().toISOString(),
        };
        this.configCache = { data: config, expiresAt: now + this.CACHE_TTL };
        return config;
      }
    } catch (err) {
      this.logger.error('emailMarketing.get_config_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Return defaults
    this.configCache = { data: DEFAULT_CONFIG, expiresAt: now + this.CACHE_TTL };
    return DEFAULT_CONFIG;
  }

  async updateConfig(patch: Partial<EmailMarketingConfig>): Promise<EmailMarketingConfig> {
    const current = await this.getConfig();
    const next: EmailMarketingConfig = {
      types: patch.types ?? current.types,
      transactionalSender: patch.transactionalSender ?? current.transactionalSender,
      marketingSender: patch.marketingSender ?? current.marketingSender,
      updatedAt: new Date().toISOString(),
    };

    await this.db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC).set(next, { merge: true });
    this.configCache = null; // invalidate
    return next;
  }

  async getTemplate(type: EmailType): Promise<EmailTemplate | null> {
    try {
      const doc = await this.db.collection(CONFIG_COLLECTION).doc(TEMPLATES_DOC).get();
      if (!doc.exists) return null;
      const data = doc.data() as Record<string, EmailTemplate>;
      return data[type] ?? null;
    } catch {
      return null;
    }
  }

  async saveTemplate(template: EmailTemplate): Promise<void> {
    await this.db.collection(CONFIG_COLLECTION).doc(TEMPLATES_DOC).set(
      { [template.type]: { ...template, updatedAt: new Date().toISOString() } },
      { merge: true },
    );
    this.templatesCache = null;
  }

  async getAllTemplates(): Promise<EmailTemplate[]> {
    const now = Date.now();
    if (this.templatesCache && this.templatesCache.expiresAt > now) {
      return this.templatesCache.data;
    }

    try {
      const doc = await this.db.collection(CONFIG_COLLECTION).doc(TEMPLATES_DOC).get();
      if (!doc.exists) return [];
      const data = doc.data() as Record<string, EmailTemplate>;
      const templates = Object.values(data).filter(t => t && t.type);
      this.templatesCache = { data: templates, expiresAt: now + this.CACHE_TTL };
      return templates;
    } catch {
      return [];
    }
  }

  async isTypeEnabled(type: EmailType): Promise<boolean> {
    const config = await this.getConfig();
    const typeConfig = config.types.find(t => t.type === type);
    return typeConfig?.enabled ?? true;
  }

  async getSenderForType(type: EmailType): Promise<{ email: string; name: string }> {
    const config = await this.getConfig();
    const typeConfig = config.types.find(t => t.type === type);
    if (typeConfig) {
      return { email: typeConfig.senderEmail, name: typeConfig.senderName };
    }
    // Fallback based on type category
    if (type === 'admin_broadcast' || type === 'custom') {
      return config.marketingSender;
    }
    return config.transactionalSender;
  }
}

// ─── In-memory implementation (for tests / no-Firestore) ──────────────

export class InMemoryEmailMarketingStore implements EmailMarketingStore {
  private logs: EmailLogEntry[] = [];
  private config: EmailMarketingConfig = { ...DEFAULT_CONFIG };
  private templates = new Map<EmailType, EmailTemplate>();

  async logEmail(entry: Omit<EmailLogEntry, 'id'>): Promise<string> {
    const id = crypto.randomUUID();
    this.logs.unshift({ ...entry, id });
    return id;
  }

  async getLogs(opts?: { page?: number; limit?: number; type?: EmailType; status?: EmailStatus }): Promise<{ logs: EmailLogEntry[]; total: number }> {
    let filtered = [...this.logs];
    if (opts?.type) filtered = filtered.filter(l => l.type === opts.type);
    if (opts?.status) filtered = filtered.filter(l => l.status === opts.status);
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 50;
    const offset = (page - 1) * limit;
    return { logs: filtered.slice(offset, offset + limit), total: filtered.length };
  }

  async getConfig(): Promise<EmailMarketingConfig> { return this.config; }

  async updateConfig(patch: Partial<EmailMarketingConfig>): Promise<EmailMarketingConfig> {
    this.config = { ...this.config, ...patch, updatedAt: new Date().toISOString() };
    return this.config;
  }

  async getTemplate(type: EmailType): Promise<EmailTemplate | null> {
    return this.templates.get(type) ?? null;
  }

  async saveTemplate(template: EmailTemplate): Promise<void> {
    this.templates.set(template.type, template);
  }

  async getAllTemplates(): Promise<EmailTemplate[]> {
    return [...this.templates.values()];
  }

  async isTypeEnabled(type: EmailType): Promise<boolean> {
    const typeConfig = this.config.types.find(t => t.type === type);
    return typeConfig?.enabled ?? true;
  }

  async getSenderForType(type: EmailType): Promise<{ email: string; name: string }> {
    const typeConfig = this.config.types.find(t => t.type === type);
    if (typeConfig) return { email: typeConfig.senderEmail, name: typeConfig.senderName };
    if (type === 'admin_broadcast' || type === 'custom') return this.config.marketingSender;
    return this.config.transactionalSender;
  }
}
