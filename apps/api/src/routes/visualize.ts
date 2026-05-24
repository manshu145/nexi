import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';

/**
 * AI Visualization endpoint.
 * Uses Gemini Flash for fast, cheap diagram generation.
 * Falls back to OpenAI if Gemini key not available.
 *
 * POST /v1/visualize — generates a Mermaid diagram for a given text section
 */
export interface VisualizeDeps {
  logger: Logger;
  openaiApiKey?: string;
  geminiApiKey?: string;
}

const VIZ_SYSTEM_PROMPT = `You are a visual learning assistant for Indian students preparing for exams.
Given educational text, create a clear Mermaid diagram that visualizes the key concepts.

STRICT RULES:
1. Return ONLY valid Mermaid code — no markdown fences, no backticks, no explanation
2. Use flowchart TD for processes/hierarchies, mindmap for topic overviews
3. Maximum 12 nodes — keep it readable
4. Node labels: max 25 characters, simple English
5. Do NOT use special characters like quotes, semicolons, or HTML in node labels
6. Do NOT end lines with semicolons
7. Use simple arrow syntax: A --> B or A --- B
8. For mindmap: indent with 2 spaces per level

Example good output:
flowchart TD
  A[Units of Measurement] --> B[SI System]
  A --> C[CGS System]
  B --> D[Meter]
  B --> E[Kilogram]
  B --> F[Second]
  C --> G[Centimeter]
  C --> H[Gram]`;

export function makeVisualizeRoutes(deps: VisualizeDeps): Hono {
  const app = new Hono();

  app.post('/', async (c) => {
    requireAuth(c);
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.text !== 'string' || !body.text.trim()) {
      throw new HTTPException(400, { message: 'text field required' });
    }

    const { text, title } = body as { text: string; title?: string };
    const userPrompt = `Topic: ${title || 'Educational content'}\n\nText to visualize:\n${text.slice(0, 2000)}`;

    let mermaidCode: string;

    // Priority: Gemini Flash (faster + cheaper) > OpenAI > fallback
    if (deps.geminiApiKey) {
      mermaidCode = await generateWithGemini(deps.geminiApiKey, userPrompt, deps.logger);
    } else if (deps.openaiApiKey) {
      mermaidCode = await generateWithOpenAI(deps.openaiApiKey, userPrompt, deps.logger);
    } else {
      mermaidCode = generateFallbackDiagram(title || 'Topic', text);
    }

    // Clean up common AI output issues
    mermaidCode = cleanMermaidOutput(mermaidCode);

    deps.logger.info('visualize.generated', {
      titleLen: (title || '').length,
      textLen: text.length,
      provider: deps.geminiApiKey ? 'gemini' : deps.openaiApiKey ? 'openai' : 'fallback',
    });

    return c.json({
      mermaid: mermaidCode,
      watermark: 'nexigrate',
      generatedAt: new Date().toISOString(),
    });
  });

  return app;
}

async function generateWithGemini(apiKey: string, userPrompt: string, logger: Logger): Promise<string> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { role: 'system', parts: [{ text: VIZ_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 600,
        },
      }),
    });

    if (!res.ok) {
      logger.warn('visualize.gemini_failed', { status: res.status });
      return '';
    }

    const data = await res.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  } catch (e) {
    logger.warn('visualize.gemini_error', { error: e instanceof Error ? e.message : 'unknown' });
    return '';
  }
}

async function generateWithOpenAI(apiKey: string, userPrompt: string, logger: Logger): Promise<string> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 600,
        messages: [
          { role: 'system', content: VIZ_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      logger.warn('visualize.openai_failed', { status: res.status });
      return '';
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content?.trim() ?? '';
  } catch (e) {
    logger.warn('visualize.openai_error', { error: e instanceof Error ? e.message : 'unknown' });
    return '';
  }
}

function cleanMermaidOutput(code: string): string {
  if (!code) return generateFallbackDiagram('Topic', '');
  // Remove markdown fences
  code = code.replace(/^```mermaid\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  code = code.replace(/^```\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  // Remove trailing semicolons
  code = code.replace(/;\s*$/gm, '');
  // Remove empty lines at start/end
  code = code.trim();
  // Basic validation: must start with a known diagram type
  const validStarts = ['flowchart', 'graph', 'mindmap', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'pie', 'gantt'];
  const firstWord = code.split(/\s/)[0]?.toLowerCase() ?? '';
  if (!validStarts.some(s => firstWord.startsWith(s))) {
    return generateFallbackDiagram('Topic', '');
  }
  return code;
}

function generateFallbackDiagram(title: string, text: string): string {
  // Extract key terms from the text for a more relevant fallback
  const words = (text || title).split(/\s+/).filter(w => w.length > 5).slice(0, 6);
  const concepts = words.length >= 3
    ? words.slice(0, 6).map(w => w.replace(/[^a-zA-Z]/g, '').slice(0, 20))
    : ['Concept 1', 'Concept 2', 'Concept 3', 'Concept 4', 'Concept 5'];

  return `mindmap
  root((${title.slice(0, 20) || 'Topic'}))
    ${concepts[0] || 'Key Idea 1'}
      Detail A
      Detail B
    ${concepts[1] || 'Key Idea 2'}
      Detail C
      Detail D
    ${concepts[2] || 'Key Idea 3'}
      Example 1
      Example 2`;
}
