/**
 * Waitlist endpoint.
 *
 * POST /api/waitlist
 *   { email: string, exam: string, company?: string }
 *
 * Storage: Cloudflare KV namespace bound as `WAITLIST_KV`.
 *   - Key:   `waitlist:<sha256(email)>` so we never store raw email as the key
 *   - Value: JSON blob with email, exam, ip-hash, ua, ts, source, referer
 *
 * Behaviour:
 *   - 200  on new signup (`ok: true, duplicate: false`)
 *   - 200  on existing signup (`ok: true, duplicate: true`) — we still tell
 *          the user it succeeded so we don't leak email enumeration
 *   - 400  on invalid input
 *   - 429  on rate limit
 *   - 500  on KV failure (degrades to an in-memory log so dev still works)
 *
 * The endpoint is intentionally tiny and self-contained — no external network
 * calls, so it stays well inside Cloudflare's free CPU budget.
 */
import type { APIContext, APIRoute } from 'astro';
import { z } from 'zod';
import { EXAMS } from '~/data/exams';

export const prerender = false;

// --- types ---------------------------------------------------------------

interface WaitlistEnv {
  WAITLIST_KV?: KVNamespace;
}

interface WaitlistEntry {
  email: string;
  exam: string;
  ts: string;
  ipHash: string;
  ua: string;
  source: string;
  referer: string;
}

// --- validation ----------------------------------------------------------

const validExamIds = new Set<string>([...EXAMS.map((e) => e.id), 'undecided']);

const Body = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(5)
    .max(254)
    .email(),
  exam: z
    .string()
    .trim()
    .refine((v) => validExamIds.has(v), { message: 'unknown exam' }),
  company: z.string().optional(), // honeypot
});

// --- helpers -------------------------------------------------------------

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function getEnv(context: APIContext): WaitlistEnv {
  // Astro Cloudflare adapter exposes runtime via `locals.runtime.env`.
  const runtime = (context.locals as { runtime?: { env?: WaitlistEnv } }).runtime;
  return runtime?.env ?? {};
}

function getClientIp(request: Request): string {
  // Cloudflare populates this. Fall back to anonymous string in dev.
  return request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

// --- handler -------------------------------------------------------------

export const POST: APIRoute = async (context) => {
  const { request } = context;

  // Parse JSON safely.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonResponse(400, { ok: false, error: 'Invalid JSON body.' });
  }

  // Validate.
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(400, {
      ok: false,
      error: 'Please enter a valid email and pick a target exam.',
    });
  }
  const { email, exam, company } = parsed.data;

  // Honeypot: bots fill `company`. Pretend success so they go away.
  if (company && company.trim().length > 0) {
    return jsonResponse(200, { ok: true, duplicate: false });
  }

  const env = getEnv(context);
  const kv = env.WAITLIST_KV;

  const ip = getClientIp(request);
  const ipHash = (await sha256(ip)).slice(0, 16);
  const emailHash = await sha256(email);
  const key = `waitlist:${emailHash}`;
  const rateKey = `rl:ip:${ipHash}`;

  // If KV is missing (local dev without a binding), degrade gracefully.
  if (!kv) {
    console.warn('[waitlist] WAITLIST_KV not bound; signup not persisted', { email, exam });
    return jsonResponse(200, { ok: true, duplicate: false, persisted: false });
  }

  // Per-IP rate limit: max 8 attempts / hour. Cheap KV-based counter; sloppy
  // but good enough at this scale.
  try {
    const current = Number((await kv.get(rateKey)) ?? '0');
    if (current >= 8) {
      return jsonResponse(429, { ok: false, error: 'Too many attempts. Try again later.' });
    }
    // Best-effort write; ignore failures.
    await kv.put(rateKey, String(current + 1), { expirationTtl: 60 * 60 });
  } catch (err) {
    console.warn('[waitlist] rate-limit KV error', err);
  }

  // Duplicate check.
  try {
    const existing = await kv.get(key);
    if (existing) {
      return jsonResponse(200, { ok: true, duplicate: true });
    }
  } catch (err) {
    console.error('[waitlist] KV read error', err);
    return jsonResponse(500, { ok: false, error: 'Storage error. Please try again.' });
  }

  const entry: WaitlistEntry = {
    email,
    exam,
    ts: new Date().toISOString(),
    ipHash,
    ua: request.headers.get('user-agent')?.slice(0, 200) ?? '',
    source: 'marketing',
    referer: request.headers.get('referer')?.slice(0, 200) ?? '',
  };

  try {
    await kv.put(key, JSON.stringify(entry));
  } catch (err) {
    console.error('[waitlist] KV write error', err);
    return jsonResponse(500, { ok: false, error: 'Storage error. Please try again.' });
  }

  return jsonResponse(200, { ok: true, duplicate: false });
};

// Reject other methods explicitly so we don't accidentally answer GETs.
export const ALL: APIRoute = () =>
  new Response(JSON.stringify({ ok: false, error: 'Method not allowed.' }), {
    status: 405,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      allow: 'POST',
    },
  });
