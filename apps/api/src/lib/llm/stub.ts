import type { z } from 'zod';
import { LLMError, type GenerateOptions, type LLMClient } from './types.js';

/**
 * Test/dev stub LLM client.
 *
 * Lets tests inject canned responses without hitting the real APIs and lets
 * a fresh checkout boot the orchestrator without any LLM keys configured.
 *
 * Construct with a function that takes the GenerateOptions and returns the
 * response value (must conform to the schema), or throw inside the function
 * to simulate provider errors.
 */
export class StubLLMClient implements LLMClient {
  constructor(
    public readonly modelId: string,
    private readonly responder: (opts: GenerateOptions<unknown>) => unknown | Promise<unknown>,
  ) {}

  async generate<T>(opts: GenerateOptions<T>): Promise<T> {
    let raw: unknown;
    try {
      raw = await this.responder(opts as GenerateOptions<unknown>);
    } catch (err) {
      throw new LLMError(
        `stub: responder threw: ${err instanceof Error ? err.message : String(err)}`,
        err,
        this.modelId,
      );
    }
    const result = (opts.schema as z.ZodSchema<T>).safeParse(raw);
    if (!result.success) {
      throw new LLMError(
        `stub: responder output failed schema: ${result.error.message}`,
        result.error,
        this.modelId,
      );
    }
    return result.data;
  }
}
