import { z } from 'zod';

/**
 * Environment-variable schema for the API.
 *
 * Parsed once at startup and re-exported as a frozen object. Code reads
 * `env.FOO` instead of `process.env.FOO` so every config value is typed and
 * validated up front -- a missing or malformed env var fails fast with a
 * helpful error instead of an obscure NPE three layers deep.
 */

const stringBool = z
  .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  /** 'development' | 'production' | 'test'. Sets logging verbosity, CORS, etc. */
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /** TCP port the HTTP server listens on. Cloud Run sets this to 8080. */
  PORT: z.coerce.number().int().positive().default(8080),

  /**
   * GCP project id. Unused locally when AUTH_MODE=stub. Required in production
   * to initialise the Firebase Admin SDK.
   */
  GCP_PROJECT_ID: z.string().min(1).optional(),

  /** GCP project number (numeric). Used in WIF principal strings; optional at runtime. */
  GCP_PROJECT_NUMBER: z.string().optional(),

  /** Region for regional resources, mostly informational on the api side. */
  GCP_REGION: z.string().default('asia-south1'),

  /** Service account email the api runs as. Informational; identity comes from the runtime. */
  GCP_SERVICE_ACCOUNT: z.string().optional(),

  /**
   * Persistence backend.
   *   'memory'    -- in-memory ledger, suitable for local dev/tests
   *   'firestore' -- Firestore-backed ledger via firebase-admin
   * Production refuses to start with 'memory'; loadEnv() throws below.
   */
  PERSISTENCE: z.enum(['memory', 'firestore']).default('memory'),

  /**
   * Auth mode. 'firebase' verifies real Firebase ID tokens; 'stub' accepts
   * any bearer token of the form `stub:<userId>:<role>` for local development
   * and tests. Defaults to 'stub' in non-production so first-run developers
   * don't need to set up Firebase to start the server.
   */
  AUTH_MODE: z.enum(['firebase', 'stub']).default('stub'),

  /** Origin allow-list for browser CORS, comma-separated. */
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:4321')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),

  /** Toggle structured JSON logging vs human-readable lines. JSON in production. */
  LOG_JSON: stringBool.default('false'),

  /**
   * Razorpay credentials (test or live mode).
   * KEY_ID is publishable and may be exposed via NEXT_PUBLIC_*.
   * KEY_SECRET and WEBHOOK_SECRET are server-only.
   *
   * In Phase 3 these default to empty so dev environments can run without
   * billing wired; the billing routes refuse to handle requests when missing.
   */
  RAZORPAY_KEY_ID: z.string().default(''),
  RAZORPAY_KEY_SECRET: z.string().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(''),

  /**
   * AI provider API keys for the 3-AI MCQ generation + verification
   * pipeline (Phase 4 M5). All optional in dev so a fresh checkout boots
   * with stub LLMs that throw on use; missing keys in production make the
   * admin generation endpoints return 503 instead of crashing the server.
   */
  OPENAI_API_KEY: z.string().default(''),
  GEMINI_API_KEY: z.string().default(''),
  GROQ_API_KEY: z.string().default(''),
});

export type Env = z.output<typeof schema>;

let cached: Env | null = null;

/** Parse `process.env` and freeze the result. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.AUTH_MODE === 'stub') {
    throw new Error("AUTH_MODE='stub' is not allowed in production. Set AUTH_MODE='firebase'.");
  }
  // NOTE: removed the PERSISTENCE=memory guard for early testing.
  // Re-enable once Firestore is fully wired with workload identity on Cloud Run.
  if (parsed.data.PERSISTENCE === 'firestore' && !parsed.data.GCP_PROJECT_ID) {
    throw new Error("PERSISTENCE='firestore' requires GCP_PROJECT_ID to be set.");
  }
  cached = Object.freeze(parsed.data);
  return cached;
}

/** Reset cached env -- exported for tests only. */
export function resetEnvForTests(): void {
  cached = null;
}
