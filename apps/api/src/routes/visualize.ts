/**
 * Phase H — AI visualization endpoint.
 *
 *   POST /v1/visualize — generates a diagram (Mermaid/SVG) for a given text/topic.
 *
 * Uses Gemini (or OpenAI) to generate structured diagram descriptions.
 * The frontend renders Mermaid diagrams client-side with a watermark overlay.
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { LLMClient } from '../lib/llm/index.js';
import type { Logger } from '../logger.js';

export interface VisualizeDeps {
  generator: LLMClient;
  logger: Logger;
}

export type VisualizationType = 'mindmap' | 'flowchart' | 'diagram' | 'timeline' | 'concept-map';

const VISUALIZATION_PROMPT = `You are an expert educational diagram creator. Given a topic or text, generate a Mermaid.js diagram that visualizes the key concepts, relationships, or processes.

RULES:
- Output ONLY valid Mermaid.js syntax (no markdown fences, no explanation)
- Choose the best diagram type: mindmap, flowchart, graph, sequenceDiagram, or timeline
- Keep it clear and readable (max 15-20 nodes)
- Use simple labels (no complex formatting)
- Optimize for educational understanding
- For Hindi/Hinglish topics, use romanized labels

OUTPUT: Raw Mermaid.js code only. Nothing else.`;

export function makeVisualizeRoutes(deps: VisualizeDeps): Hono {
  const { generator, logger } = deps;
  const app = new Hono();

  app.post('/', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json<{
      text?: string;
      topic?: string;
      type?: VisualizationType;
    }>().catch(() => null);

    if (!body || (!body.text && !body.topic)) {
      throw new HTTPException(400, { message: 'text or topic required' });
    }

    const inputText = body.text || body.topic || '';
    const vizType = body.type || 'diagram';

    logger.info('visualize.start', {
      userId: principal.userId,
      type: vizType,
      inputLength: inputText.length,
    });

    try {
      const res = await generator.complete({
        promptName: 'visualize',
        system: VISUALIZATION_PROMPT,
        user: `Create a ${vizType} for this educational content:\n\n${inputText.slice(0, 2000)}`,
        temperature: 0.3,
        maxTokens: 1500,
        json: false,
      });

      // Clean up response — strip any markdown fences if model adds them
      let mermaid = res.content.trim();
      if (mermaid.startsWith('```mermaid')) {
        mermaid = mermaid.slice(10);
      } else if (mermaid.startsWith('```')) {
        mermaid = mermaid.slice(3);
      }
      if (mermaid.endsWith('```')) {
        mermaid = mermaid.slice(0, -3);
      }
      mermaid = mermaid.trim();

      logger.info('visualize.success', {
        userId: principal.userId,
        type: vizType,
        outputLength: mermaid.length,
      });

      return c.json({
        mermaid,
        type: vizType,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.error('visualize.failed', {
        userId: principal.userId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new HTTPException(500, { message: 'visualization generation failed' });
    }
  });

  return app;
}
