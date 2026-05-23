import type { Env } from '../../env.js';
import { GeminiClient } from './gemini.js';
import { GroqClient } from './groq.js';
import { OpenAIClient } from './openai.js';
import { StubLLMClient } from './stub.js';
import type { LLMClient } from './types.js';

export * from './types.js';
export { OpenAIClient, GeminiClient, GroqClient, StubLLMClient };

/**
 * Factory: returns three LLM clients (OpenAI, Gemini, Groq) plus a verifier
 * client. Falls back to stub clients (deterministic canned responses) when
 * the corresponding API key is missing -- so a fresh checkout still boots
 * and the admin route returns a useful 503 instead of crashing the server.
 */
export interface LLMTriad {
  primary: LLMClient[]; // generators (3 different models for cross-check)
  verifier: LLMClient; // judge that cross-checks the primaries
  /** True iff at least one real (non-stub) client is wired. */
  isLive: boolean;
}

export function makeLLMTriad(env: {
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
}): LLMTriad {
  const primary: LLMClient[] = [];
  let isLive = false;

  if (env.OPENAI_API_KEY) {
    primary.push(new OpenAIClient(env.OPENAI_API_KEY));
    isLive = true;
  } else {
    primary.push(makeUnavailableStub('openai:gpt-4o-mini'));
  }

  if (env.GEMINI_API_KEY) {
    primary.push(new GeminiClient(env.GEMINI_API_KEY));
    isLive = true;
  } else {
    primary.push(makeUnavailableStub('gemini:gemini-2.5-flash'));
  }

  if (env.GROQ_API_KEY) {
    primary.push(new GroqClient(env.GROQ_API_KEY));
    isLive = true;
  } else {
    primary.push(makeUnavailableStub('groq:llama-3.3-70b-versatile'));
  }

  // Verifier: prefer OpenAI's gpt-4o (more capable) for tie-breaking, fall back
  // to gpt-4o-mini, then gemini, then groq, then stub.
  const verifier: LLMClient = env.OPENAI_API_KEY
    ? new OpenAIClient(env.OPENAI_API_KEY, 'gpt-4o')
    : env.GEMINI_API_KEY
      ? new GeminiClient(env.GEMINI_API_KEY)
      : env.GROQ_API_KEY
        ? new GroqClient(env.GROQ_API_KEY)
        : makeUnavailableStub('verifier:none');

  return { primary, verifier, isLive };
}

/**
 * Build a triad from the parsed Env object (loaded by env.ts). Convenience
 * for app.ts; tests construct the triad directly with stub clients.
 */
export function makeLLMTriadFromEnv(env: Env): LLMTriad {
  return makeLLMTriad({
    OPENAI_API_KEY: env.OPENAI_API_KEY || undefined,
    GEMINI_API_KEY: env.GEMINI_API_KEY || undefined,
    GROQ_API_KEY: env.GROQ_API_KEY || undefined,
  });
}

function makeUnavailableStub(modelId: string): LLMClient {
  return new StubLLMClient(modelId, () => {
    throw new Error(`${modelId}: API key not configured (set the corresponding GitHub Secret)`);
  });
}
