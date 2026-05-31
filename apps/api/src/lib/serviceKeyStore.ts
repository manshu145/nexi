/**
 * ServiceKeyStore — Firestore-backed third-party API key configuration.
 *
 * PR-37 — extends the PR-29 AI Providers pattern to non-AI third-party
 * services so the founder can rotate Razorpay / Resend / WhatsApp / FCM
 * keys from the admin panel without redeploying or touching GitHub
 * Secrets.
 *
 * Founder lock (30 May 2026):
 *   "Razorpay our baki jitne bhi kam ke our APIs hai unko bhi dalne ka
 *    option dena admin me yr"
 *
 * Why a separate store from `aiProviderStore`:
 *   - Different shape per service (Razorpay needs key_id + secret +
 *     webhook secret; Resend needs just an API key + from-email; WhatsApp
 *     needs token + phone-number-id; FCM needs server-side service-
 *     account JSON).
 *   - No model-resolver semantics: each service has at most one
 *     configuration, no preference chain or auto-fallback.
 *   - The admin UI surfaces them on a separate page so the AI Providers
 *     page stays focused on its own multi-provider chain logic.
 *
 * Trust model: keys live in Firestore as plain strings. Firestore IAM
 * rules already restrict the entire `serviceKeys` collection to admin
 * SDK access only (the same rule that protects `aiProviders`). KMS
 * encryption-at-rest is a separate follow-up.
 *
 * Cache layer: a 60-second snapshot of the entire serviceKeys
 * collection is held in memory so the billing webhook + email
 * sender don't issue a Firestore round-trip on every request.
 *
 * Stored in Firestore at `serviceKeys/{serviceId}` so the right-to-
 * erasure walk in lib/userData.ts intentionally does NOT touch this
 * collection (it's platform config, not user data).
 */

import type { Firestore } from 'firebase-admin/firestore';

/**
 * Discriminated set of services we persist keys for. Adding a new
 * service is a 3-step process:
 *   1. Add the literal here
 *   2. Add a row to SERVICE_DEFINITIONS below
 *   3. Wire up a `get<Service>Config()` helper in this file
 */
export type ServiceId = 'razorpay' | 'resend' | 'whatsapp' | 'fcm';

/**
 * Per-service shape. Every service has at minimum:
 *   - `enabled` — admin can pause without deleting keys.
 *   - one or more secret fields stored as plain strings.
 *   - validation status from the last 'Test connection' click.
 *
 * Optional fields are nullable in Firestore (admin clears them by
 * sending `''` from the UI; the upsert normalises).
 */
export interface ServiceKeyConfig {
  id: ServiceId;
  enabled: boolean;
  fields: Record<string, string>;
  lastValidatedAt?: string;
  lastValidationError?: string;
  updatedAt: string;
  createdAt: string;
}

/**
 * Static metadata describing each service: human label, list of fields
 * the admin must fill, signup URL, and an optional 'public field' list
 * (fields that aren't secrets and can be returned unmasked — e.g.
 * Razorpay key_id is a public identifier, the secret isn't). The admin
 * UI uses this to render the form and decide which fields to mask.
 */
export interface ServiceDefinition {
  id: ServiceId;
  label: string;
  description: string;
  /** Documentation / dashboard URL the admin can click through to. */
  consoleUrl: string;
  /** URL to grab a fresh key. */
  signupUrl: string;
  /** Each field has an id, label, optional placeholder, and `secret` flag. */
  fields: Array<{
    id: string;
    label: string;
    placeholder?: string;
    secret: boolean;
    minLength?: number;
    helpText?: string;
  }>;
  /** Optional one-line tier / status for the admin card header. */
  tierLabel?: 'Active' | 'Future-ready';
}

export const SERVICE_DEFINITIONS: ServiceDefinition[] = [
  {
    id: 'razorpay',
    label: 'Razorpay (Payments)',
    description: 'Indian payment gateway used for plan purchases. Live mode keys go here; test keys go in env vars only.',
    consoleUrl: 'https://dashboard.razorpay.com/',
    signupUrl: 'https://dashboard.razorpay.com/app/keys',
    fields: [
      { id: 'keyId', label: 'Key ID', placeholder: 'rzp_live_… or rzp_test_…', secret: false, minLength: 8, helpText: 'Public identifier — safe to show.' },
      { id: 'keySecret', label: 'Key Secret', placeholder: 'Paste from Razorpay dashboard', secret: true, minLength: 16 },
      { id: 'webhookSecret', label: 'Webhook Secret', placeholder: 'Optional — only if webhook configured', secret: true },
    ],
    tierLabel: 'Active',
  },
  {
    id: 'resend',
    label: 'Resend (Transactional Email)',
    description: 'Sends signup emails, password reset, billing receipts, support replies, and admin broadcasts.',
    consoleUrl: 'https://resend.com/emails',
    signupUrl: 'https://resend.com/api-keys',
    fields: [
      { id: 'apiKey', label: 'API Key', placeholder: 're_…', secret: true, minLength: 20 },
      { id: 'fromEmail', label: 'From email', placeholder: 'hello@nexigrate.com', secret: false, helpText: 'Must be on a verified domain.' },
      { id: 'fromName', label: 'From name', placeholder: 'Nexigrate', secret: false },
    ],
    tierLabel: 'Active',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp Business (Meta Cloud API)',
    description: 'WhatsApp notifications and 2FA. Optional — if not configured, those flows fall back to email/SMS.',
    consoleUrl: 'https://business.facebook.com/wa/manage/',
    signupUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
    fields: [
      { id: 'token', label: 'Access Token', placeholder: 'EAAL… (long lived)', secret: true, minLength: 30 },
      { id: 'phoneNumberId', label: 'Phone Number ID', placeholder: '15-digit numeric ID', secret: false, minLength: 8 },
    ],
    tierLabel: 'Future-ready',
  },
  {
    id: 'fcm',
    label: 'Firebase Cloud Messaging (Push)',
    description: 'Push notifications for current-affairs digests, streak reminders. VAPID key is required for web push token registration.',
    consoleUrl: 'https://console.firebase.google.com/project/nexigrate-prod/settings/cloudmessaging',
    signupUrl: 'https://firebase.google.com/docs/cloud-messaging/server',
    fields: [
      { id: 'vapidKey', label: 'Web Push VAPID Key', placeholder: 'BN4x… (from Cloud Messaging → Web Push certificates → Key pair)', secret: false, minLength: 30, helpText: 'Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Generate key pair → Copy the key.' },
      { id: 'projectId', label: 'Project ID', placeholder: 'nexigrate-prod', secret: false },
      { id: 'serviceAccountJson', label: 'Service Account JSON', placeholder: 'Paste the full JSON from Firebase console → Service accounts', secret: true, minLength: 100, helpText: 'The full JSON blob — yes, the whole thing. Used to mint FCM access tokens server-side.' },
    ],
    tierLabel: 'Active',
  },
];

export function getServiceDefinition(id: ServiceId): ServiceDefinition | undefined {
  return SERVICE_DEFINITIONS.find(d => d.id === id);
}

export interface ServiceKeyStore {
  getAll(): Promise<ServiceKeyConfig[]>;
  get(id: ServiceId): Promise<ServiceKeyConfig | null>;
  upsert(id: ServiceId, patch: Partial<ServiceKeyConfig>): Promise<ServiceKeyConfig>;
  /**
   * Read a single field with env fallback. Used by service-specific
   * helpers (`getRazorpayConfig` etc.) so callers don't have to re-do
   * the precedence dance themselves.
   */
  getField(id: ServiceId, fieldId: string, envFallback?: string): Promise<string | null>;
  /**
   * Bulk read all configured fields for a service merged with env
   * fallbacks. Returns an object whose keys are the field ids declared
   * in SERVICE_DEFINITIONS.
   */
  getMergedFields(id: ServiceId, envFallbacks?: Record<string, string | undefined>): Promise<Record<string, string>>;
}

/**
 * In-memory implementation — only used when Firestore is unavailable
 * (local dev, tests). Kept feature-parity with the Firestore version
 * so a missing FIREBASE_SERVICE_ACCOUNT_JSON in development doesn't
 * silently change behaviour.
 */
export class InMemoryServiceKeyStore implements ServiceKeyStore {
  private docs = new Map<ServiceId, ServiceKeyConfig>();

  async getAll(): Promise<ServiceKeyConfig[]> {
    return [...this.docs.values()];
  }

  async get(id: ServiceId): Promise<ServiceKeyConfig | null> {
    return this.docs.get(id) ?? null;
  }

  async upsert(id: ServiceId, patch: Partial<ServiceKeyConfig>): Promise<ServiceKeyConfig> {
    const existing = this.docs.get(id);
    const now = new Date().toISOString();
    const next: ServiceKeyConfig = {
      id,
      enabled: 'enabled' in patch ? (patch.enabled ?? true) : (existing?.enabled ?? true),
      fields: { ...(existing?.fields ?? {}), ...(patch.fields ?? {}) },
      lastValidatedAt: 'lastValidatedAt' in patch ? patch.lastValidatedAt : existing?.lastValidatedAt,
      lastValidationError: 'lastValidationError' in patch ? patch.lastValidationError : existing?.lastValidationError,
      updatedAt: now,
      createdAt: existing?.createdAt ?? now,
    };
    this.docs.set(id, next);
    return next;
  }

  async getField(id: ServiceId, fieldId: string, envFallback?: string): Promise<string | null> {
    const cfg = this.docs.get(id);
    if (cfg && cfg.enabled !== false) {
      const v = cfg.fields[fieldId];
      if (typeof v === 'string' && v.length > 0) return v;
    }
    if (envFallback && envFallback.length > 0) return envFallback;
    return null;
  }

  async getMergedFields(id: ServiceId, envFallbacks?: Record<string, string | undefined>): Promise<Record<string, string>> {
    const cfg = this.docs.get(id);
    const def = getServiceDefinition(id);
    if (!def) return {};
    const out: Record<string, string> = {};
    for (const f of def.fields) {
      const adminVal = cfg?.enabled !== false ? cfg?.fields[f.id] : undefined;
      const envVal = envFallbacks?.[f.id];
      const val = adminVal && adminVal.length > 0 ? adminVal : (envVal ?? '');
      if (val.length > 0) out[f.id] = val;
    }
    return out;
  }
}

/**
 * Firestore implementation with the same 60s in-memory cache used by
 * AIProviderStore. The cache is invalidated on every upsert so the
 * admin's saved key is visible to the next request immediately on the
 * same instance, and to other Cloud Run instances within 60 seconds.
 */
const COLLECTION = 'serviceKeys';
const CACHE_TTL_MS = 60_000;

export class FirestoreServiceKeyStore implements ServiceKeyStore {
  private cache: { byId: Map<ServiceId, ServiceKeyConfig>; expiresAt: number } | null = null;

  constructor(private readonly db: Firestore) {}

  private collection() {
    return this.db.collection(COLLECTION);
  }

  private async ensureCache(): Promise<{ byId: Map<ServiceId, ServiceKeyConfig>; expiresAt: number }> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) return this.cache;
    const snap = await this.collection().get();
    const byId = new Map<ServiceId, ServiceKeyConfig>();
    for (const doc of snap.docs) {
      const id = doc.id as ServiceId;
      const data = doc.data() as Partial<ServiceKeyConfig>;
      byId.set(id, this.fromFirestore(id, data));
    }
    this.cache = { byId, expiresAt: now + CACHE_TTL_MS };
    return this.cache;
  }

  private fromFirestore(id: ServiceId, data: Partial<ServiceKeyConfig>): ServiceKeyConfig {
    return {
      id,
      enabled: data.enabled ?? true,
      fields: data.fields ?? {},
      lastValidatedAt: data.lastValidatedAt,
      lastValidationError: data.lastValidationError,
      updatedAt: data.updatedAt ?? new Date().toISOString(),
      createdAt: data.createdAt ?? new Date().toISOString(),
    };
  }

  private invalidateCache() { this.cache = null; }

  async getAll(): Promise<ServiceKeyConfig[]> {
    const cache = await this.ensureCache();
    return [...cache.byId.values()];
  }

  async get(id: ServiceId): Promise<ServiceKeyConfig | null> {
    const cache = await this.ensureCache();
    return cache.byId.get(id) ?? null;
  }

  async upsert(id: ServiceId, patch: Partial<ServiceKeyConfig>): Promise<ServiceKeyConfig> {
    const cache = await this.ensureCache();
    const existing = cache.byId.get(id) ?? this.fromFirestore(id, {});
    const now = new Date().toISOString();
    const mergedFields = { ...existing.fields, ...(patch.fields ?? {}) };
    // Strip empty-string fields so admin's "clear this" intent is honoured.
    for (const k of Object.keys(mergedFields)) {
      if (typeof mergedFields[k] !== 'string' || mergedFields[k]!.length === 0) {
        delete mergedFields[k];
      }
    }
    const next: ServiceKeyConfig = {
      id,
      enabled: 'enabled' in patch ? (patch.enabled ?? true) : existing.enabled,
      fields: mergedFields,
      lastValidatedAt: 'lastValidatedAt' in patch ? patch.lastValidatedAt : existing.lastValidatedAt,
      lastValidationError: 'lastValidationError' in patch ? patch.lastValidationError : existing.lastValidationError,
      updatedAt: now,
      createdAt: existing.createdAt || now,
    };
    cache.byId.set(id, next);
    this.invalidateCache(); // force fresh read on next call (60s TTL is too long for fresh writes)
    // For cleared fields we want Firestore-side delete so a cold start picks up the absence.
    const writePayload: Record<string, unknown> = { ...next };
    const { FieldValue } = await import('firebase-admin/firestore');
    const clearableTopLevel: Array<keyof ServiceKeyConfig> = ['lastValidatedAt', 'lastValidationError'];
    for (const key of clearableTopLevel) {
      if (key in patch && patch[key] === undefined) {
        writePayload[key as string] = FieldValue.delete();
      }
    }
    // Strip undefined to satisfy the Firestore Admin SDK.
    for (const k of Object.keys(writePayload)) {
      if (writePayload[k] === undefined) delete writePayload[k];
    }
    await this.collection().doc(id).set(writePayload, { merge: true });
    return next;
  }

  async getField(id: ServiceId, fieldId: string, envFallback?: string): Promise<string | null> {
    const cfg = await this.get(id);
    if (cfg && cfg.enabled !== false) {
      const v = cfg.fields[fieldId];
      if (typeof v === 'string' && v.length > 0) return v;
    }
    if (envFallback && envFallback.length > 0) return envFallback;
    return null;
  }

  async getMergedFields(id: ServiceId, envFallbacks?: Record<string, string | undefined>): Promise<Record<string, string>> {
    const cfg = await this.get(id);
    const def = getServiceDefinition(id);
    if (!def) return {};
    const out: Record<string, string> = {};
    for (const f of def.fields) {
      const adminVal = cfg?.enabled !== false ? cfg?.fields[f.id] : undefined;
      const envVal = envFallbacks?.[f.id];
      const val = adminVal && adminVal.length > 0 ? adminVal : (envVal ?? '');
      if (val.length > 0) out[f.id] = val;
    }
    return out;
  }
}

// ─── Service-specific config readers ────────────────────────────────────

/**
 * Razorpay config with admin DB primary + env fallback. Returns null
 * when both sources are empty so callers can render a clean
 * "configure in admin panel" error instead of a 500.
 */
export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
}

export async function getRazorpayConfig(
  store: ServiceKeyStore,
  env: { RAZORPAY_KEY_ID?: string; RAZORPAY_KEY_SECRET?: string; RAZORPAY_WEBHOOK_SECRET?: string },
): Promise<RazorpayConfig | null> {
  const merged = await store.getMergedFields('razorpay', {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
  });
  if (!merged['keyId'] || !merged['keySecret']) return null;
  return {
    keyId: merged['keyId'],
    keySecret: merged['keySecret'],
    webhookSecret: merged['webhookSecret'],
  };
}

export interface ResendConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
}

export async function getResendConfig(
  store: ServiceKeyStore,
  env: { RESEND_API_KEY?: string; RESEND_FROM_EMAIL?: string; RESEND_FROM_NAME?: string },
): Promise<ResendConfig | null> {
  const merged = await store.getMergedFields('resend', {
    apiKey: env.RESEND_API_KEY,
    fromEmail: env.RESEND_FROM_EMAIL,
    fromName: env.RESEND_FROM_NAME,
  });
  if (!merged['apiKey']) return null;
  return {
    apiKey: merged['apiKey'],
    fromEmail: merged['fromEmail'] || 'hello@nexigrate.com',
    fromName: merged['fromName'] || 'Nexigrate',
  };
}

export interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
}

export async function getWhatsAppConfig(
  store: ServiceKeyStore,
  env: { WHATSAPP_TOKEN?: string; WHATSAPP_PHONE_NUMBER_ID?: string },
): Promise<WhatsAppConfig | null> {
  const merged = await store.getMergedFields('whatsapp', {
    token: env.WHATSAPP_TOKEN,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
  });
  if (!merged['token'] || !merged['phoneNumberId']) return null;
  return {
    token: merged['token'],
    phoneNumberId: merged['phoneNumberId'],
  };
}

export interface FCMConfig {
  projectId: string;
  serviceAccountJson: string;
}

export async function getFCMConfig(
  store: ServiceKeyStore,
  env: { FCM_PROJECT_ID?: string; FCM_SERVICE_ACCOUNT_JSON?: string; FIREBASE_PROJECT_ID?: string },
): Promise<FCMConfig | null> {
  const merged = await store.getMergedFields('fcm', {
    projectId: env.FCM_PROJECT_ID || env.FIREBASE_PROJECT_ID,
    serviceAccountJson: env.FCM_SERVICE_ACCOUNT_JSON,
  });
  if (!merged['projectId'] || !merged['serviceAccountJson']) return null;
  return {
    projectId: merged['projectId'],
    serviceAccountJson: merged['serviceAccountJson'],
  };
}

/**
 * Mask helper for the admin UI — replaces all but the last 4 chars of
 * a secret with bullets. Used by the serialiseService() function in
 * admin.ts so the response NEVER carries the full secret back.
 */
export function maskSecret(value: string | undefined): string | undefined {
  if (!value || value.length === 0) return undefined;
  if (value.length <= 4) return '•'.repeat(value.length);
  const tail = value.slice(-4);
  return `••••••••${tail}`;
}
