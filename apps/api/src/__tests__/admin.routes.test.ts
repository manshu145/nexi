import { describe, expect, it } from 'vitest';
import { asExamSlug } from '@nexigrate/shared';
import { buildApp } from '../app.js';
import type { Env } from '../env.js';
import {
  StubLLMClient,
  type LLMClient,
  type LLMTriad,
} from '../lib/llm/index.js';
import { InMemoryMcqDraftStore } from '../lib/mcqGen/index.js';
import { silentLogger } from '../logger.js';

/**
 * End-to-end tests for /v1/admin/mcq-drafts/* routes.
 *
 * Construct buildApp() with stub LLMs + an in-memory draft store. Use the
 * stub auth verifier (`stub:<userId>:admin`) so we don't need Firebase.
 */

function makeEnv(): Env {
  return {
    NODE_ENV: 'test',
    PORT: 8080,
    GCP_PROJECT_ID: 'test',
    GCP_PROJECT_NUMBER: '0',
    GCP_REGION: 'asia-south1',
    GCP_SERVICE_ACCOUNT: undefined,
    PERSISTENCE: 'memory',
    AUTH_MODE: 'stub',
    CORS_ALLOWED_ORIGINS: ['*'],
    LOG_JSON: false,
    RAZORPAY_KEY_ID: '',
    RAZORPAY_KEY_SECRET: '',
    RAZORPAY_WEBHOOK_SECRET: '',
    OPENAI_API_KEY: '',
    GEMINI_API_KEY: '',
    GROQ_API_KEY: '',
  } as unknown as Env;
}

const VALID_OUT = {
  question: 'SI unit of force?',
  options: [
    { key: 'A', text: 'newton' },
    { key: 'B', text: 'joule' },
    { key: 'C', text: 'pascal' },
    { key: 'D', text: 'watt' },
  ],
  correctOption: 'A',
  explanation: 'Force in newtons per NCERT.',
  difficulty: 'easy',
  reasoning: 'fact',
};

function liveTriad(): LLMTriad {
  const mk = (id: string): LLMClient => new StubLLMClient(id, () => VALID_OUT);
  return {
    primary: [mk('m-a'), mk('m-b'), mk('m-c')],
    verifier: new StubLLMClient('v', () => ({
      approved: true,
      confidence: 0.9,
      reasoning: 'ok',
      issues: [],
    })),
    isLive: true,
  };
}

function emptyTriad(): LLMTriad {
  const stub = new StubLLMClient('m-x', () => {
    throw new Error('not configured');
  });
  return { primary: [stub, stub, stub], verifier: stub, isLive: false };
}

const ADMIN_BEARER = 'Bearer stub:u_admin:admin';
const USER_BEARER = 'Bearer stub:u_alice';

const goodBody = {
  exam: 'jee-main',
  subject: 'physics',
  chapter: 'units-and-measurements',
  sourceText:
    'The SI base unit of force is the newton, defined as kg-m/s^2. ' +
    'It honours Sir Isaac Newton.',
  sourceCitation: 'NCERT Class 11 Physics, Ch 1',
  difficulty: 'easy',
};

describe('POST /v1/admin/mcq-drafts/generate', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const app = buildApp({
      env: makeEnv(),
      logger: silentLogger,
      drafts: new InMemoryMcqDraftStore(),
      triad: liveTriad(),
    });
    const res = await app.request('/v1/admin/mcq-drafts/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(goodBody),
    });
    expect(res.status).toBe(401);
  });

  it('rejects non-admin authenticated requests with 403', async () => {
    const app = buildApp({
      env: makeEnv(),
      logger: silentLogger,
      drafts: new InMemoryMcqDraftStore(),
      triad: liveTriad(),
    });
    const res = await app.request('/v1/admin/mcq-drafts/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: USER_BEARER },
      body: JSON.stringify(goodBody),
    });
    expect(res.status).toBe(403);
  });

  it('returns 503 when no LLM keys are configured', async () => {
    const app = buildApp({
      env: makeEnv(),
      logger: silentLogger,
      drafts: new InMemoryMcqDraftStore(),
      triad: emptyTriad(),
    });
    const res = await app.request('/v1/admin/mcq-drafts/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: ADMIN_BEARER },
      body: JSON.stringify(goodBody),
    });
    expect(res.status).toBe(503);
  });

  it('returns 400 on malformed body', async () => {
    const app = buildApp({
      env: makeEnv(),
      logger: silentLogger,
      drafts: new InMemoryMcqDraftStore(),
      triad: liveTriad(),
    });
    const res = await app.request('/v1/admin/mcq-drafts/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: ADMIN_BEARER },
      body: JSON.stringify({ exam: 'unknown-exam' }),
    });
    expect(res.status).toBe(400);
  });

  it('happy path: admin generates a draft, lists it, approves it', async () => {
    const drafts = new InMemoryMcqDraftStore();
    const app = buildApp({
      env: makeEnv(),
      logger: silentLogger,
      drafts,
      triad: liveTriad(),
    });

    // 1. Generate
    const gen = await app.request('/v1/admin/mcq-drafts/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: ADMIN_BEARER },
      body: JSON.stringify(goodBody),
    });
    expect(gen.status).toBe(200);
    const genJson = (await gen.json()) as { draft: { id: string; status: string } };
    expect(genJson.draft.status).toBe('pending');
    const draftId = genJson.draft.id;

    // 2. List pending
    const list = await app.request('/v1/admin/mcq-drafts?status=pending', {
      headers: { authorization: ADMIN_BEARER },
    });
    expect(list.status).toBe(200);
    const listJson = (await list.json()) as { drafts: { id: string }[] };
    expect(listJson.drafts.find((d) => d.id === draftId)).toBeDefined();

    // 3. Approve
    const approve = await app.request(`/v1/admin/mcq-drafts/${draftId}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: ADMIN_BEARER },
      body: JSON.stringify({ note: 'looks good' }),
    });
    expect(approve.status).toBe(200);
    const approveJson = (await approve.json()) as { mcq: { id: string; exam: string } };
    expect(approveJson.mcq.id).toBe(`mcq_${draftId}`);
    expect(approveJson.mcq.exam).toBe('jee-main');
  });

  it('rejection requires a note (400 without one)', async () => {
    const drafts = new InMemoryMcqDraftStore();
    const app = buildApp({
      env: makeEnv(),
      logger: silentLogger,
      drafts,
      triad: liveTriad(),
    });
    // generate first
    const gen = await app.request('/v1/admin/mcq-drafts/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: ADMIN_BEARER },
      body: JSON.stringify(goodBody),
    });
    const draftId = ((await gen.json()) as { draft: { id: string } }).draft.id;

    const res = await app.request(`/v1/admin/mcq-drafts/${draftId}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: ADMIN_BEARER },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
