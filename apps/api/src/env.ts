import { z } from 'zod';

// Cloud Run always sets K_SERVICE and K_REVISION. Use this to auto-detect
// production environment even when NODE_ENV isn't explicitly set.
const isCloudRun = !!(process.env['K_SERVICE'] || process.env['K_REVISION']);
const defaultPersistence = (process.env['NODE_ENV'] === 'production' || isCloudRun) ? 'firestore' : 'memory';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8080),
  PERSISTENCE: z.enum(['firestore', 'memory']).default(defaultPersistence as 'firestore' | 'memory'),
  // Firebase — Cloud Run uses GCP_PROJECT_ID, local uses FIREBASE_PROJECT_ID
  FIREBASE_PROJECT_ID: z.string().optional().default(''),
  GCP_PROJECT_ID: z.string().optional().default(''),
  FIREBASE_CLIENT_EMAIL: z.string().optional().default(''),
  FIREBASE_PRIVATE_KEY: z.string().optional().default(''),
  // AI — optional so server starts even without keys (returns 503 on AI endpoints)
  OPENAI_API_KEY: z.string().optional().default(''),
  GEMINI_API_KEY: z.string().optional().default(''),
  /** Gemini Live API model for the real-time AI interviewer (Elite feature).
   *  Override to a native-audio model later for richer voice. */
  GEMINI_LIVE_MODEL: z.string().optional().default('gemini-2.0-flash-live-001'),
  GEMINI_PRO_API_KEY: z.string().optional().default(''),
  GROQ_API_KEY: z.string().optional().default(''),
  GOOGLE_TTS_API_KEY: z.string().optional().default(''),
  // Payments — optional
  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),
  RESEND_API_KEY: z.string().optional().default(''),
  // WhatsApp Business API
  WHATSAPP_TOKEN: z.string().optional().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  SUPER_ADMIN_EMAIL: z.string().default('manshu.ibc24@gmail.com'),
  // IMPORTANT: Override this in production with a strong random secret (32+ chars).
  // The default is intentionally weak so local dev works out-of-the-box, but
  // Cloud Run deployments MUST set CRON_SECRET via env var or Secret Manager.
  CRON_SECRET: z.string().optional().default('nexigrate-cron-2026-dev-only'),
  // Mailbox: base inbound address users reply to. Per-thread replies use
  // plus-addressing (support+<threadId>@domain) routed via Resend Inbound.
  MAILBOX_INBOUND_ADDRESS: z.string().optional().default('support@nexigrate.com'),
  // Shared secret for verifying Resend webhooks (delivery + inbound). Passed
  // as ?token=... on the webhook URL. Falls back to CRON_SECRET if unset.
  RESEND_WEBHOOK_SECRET: z.string().optional().default(''),
  // Weekly content freshness: cached AI chapter content older than this many
  // days is considered stale. It is served instantly (no user wait) but
  // regenerated in the background, and the weekly cron proactively refreshes
  // the stalest batch. Keeps study content current with the latest syllabus.
  CONTENT_REFRESH_DAYS: z.coerce.number().min(1).default(7),
  // Max chapters the weekly refresh cron regenerates per run (cost + Cloud
  // Run request-timeout guard; regeneration is sequential). Override per-run
  // with ?limit= for manual admin sweeps.
  CONTENT_REFRESH_BATCH: z.coerce.number().min(1).default(25),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000,https://app.nexigrate.com,https://nexigrate.com').transform((s) => s.split(',')),
});

export type Env = z.infer<typeof envSchema> & { resolvedProjectId: string };

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Environment validation failed:\n${formatted}`);
  }
  // Resolve project ID from either FIREBASE_PROJECT_ID or GCP_PROJECT_ID.
  // On Cloud Run, GCP_PROJECT_ID is set via --set-env-vars in deploy,
  // and GOOGLE_CLOUD_PROJECT is always set by the platform itself.
  const resolvedProjectId = result.data.FIREBASE_PROJECT_ID || result.data.GCP_PROJECT_ID || process.env['GOOGLE_CLOUD_PROJECT'] || 'nexigrate-prod';
  return { ...result.data, resolvedProjectId, FIREBASE_PROJECT_ID: resolvedProjectId };
}
