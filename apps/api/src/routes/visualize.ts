import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';

/**
 * AI Visualization endpoint.
 * Takes a topic/section text, returns a Mermaid diagram or SVG description
 * that the frontend renders with a "nexigrate" watermark.
 *
 * POST /v1/visualize — generates a diagram for a given text section
 */
export interface VisualizeDeps {
  logger: Logger;
  openaiApiKey?: string;
}

const VIZ_SYSTEM_PROMPT = `You are a visual learning assistant for Indian students.
Given a section of educational text, create a Mermaid diagram that helps visualize the key concepts.
Use flowchart, mindmap, or sequence diagram format as appropriate.

Rules:
- Keep it simple and readable
- Maximum 15 nodes
- Use short labels (max 30 chars)
- Return ONLY the Mermaid code, no markdown fences, no explanation
- Use flowchart TD for processes, mindmap for topic overviews, sequenceDiagram for procedures`;

export function makeVisualizeRoutes(deps: VisualizeDeps): Hono {
  const app = new Hono();

  app.post('/', async (c) => {
    requireAuth(c);
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.text !== 'string' || !body.text.trim()) {
      throw new HTTPException(400, { message: 'text field required' });
    }

    const { text, title } = body as { text: string; title?: string };

    let mermaidCode: string;

    if (deps.openaiApiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${deps.openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            temperature: 0.3,
            max_tokens: 800,
            messages: [
              { role: 'system', content: VIZ_SYSTEM_PROMPT },
              { role: 'user', content: `Topic: ${title || 'Educational content'}\n\nText:\n${text.slice(0, 2000)}` },
            ],
          }),
        });

        if (!response.ok) {
          deps.logger.warn('visualize.openai_failed', { status: response.status });
          mermaidCode = generateFallbackDiagram(title || 'Topic');
        } else {
          const data = await response.json() as { choices: Array<{ message: { content: string } }> };
          mermaidCode = data.choices[0]?.message?.content?.trim() ?? generateFallbackDiagram(title || 'Topic');
          // Strip markdown fences if present
          mermaidCode = mermaidCode.replace(/^```mermaid\s*\n?/i, '').replace(/\n?```\s*$/i, '');
        }
      } catch {
        mermaidCode = generateFallbackDiagram(title || 'Topic');
      }
    } else {
      mermaidCode = generateFallbackDiagram(title || 'Topic');
    }

    deps.logger.info('visualize.generated', { titleLen: (title || '').length, textLen: text.length });

    return c.json({
      mermaid: mermaidCode,
      watermark: 'nexigrate',
      generatedAt: new Date().toISOString(),
    });
  });

  return app;
}

function generateFallbackDiagram(title: string): string {
  return `mindmap
  root((${title.slice(0, 25)}))
    Key Concept 1
      Detail A
      Detail B
    Key Concept 2
      Detail C
      Detail D
    Key Concept 3
      Example 1
      Example 2`;
}
