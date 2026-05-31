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
  CRON_SECRET: z.string().optional().default('nexigrate-cron-2026'),
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
