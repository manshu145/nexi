import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8080),
  PERSISTENCE: z.enum(['firestore', 'memory']).default('memory'),

  // Firebase
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().optional().default(''),
  FIREBASE_PRIVATE_KEY: z.string().optional().default(''),

  // AI
  OPENAI_API_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  GROQ_API_KEY: z.string().min(1),
  GOOGLE_TTS_API_KEY: z.string().optional().default(''),

  // Payments
  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),

  // Email
  RESEND_API_KEY: z.string().optional().default(''),

  // Admin
  SUPER_ADMIN_EMAIL: z.string().email().default('manshu.ibc24@gmail.com'),

  // CORS
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) => s.split(',')),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${formatted}`);
  }
  return result.data;
}
