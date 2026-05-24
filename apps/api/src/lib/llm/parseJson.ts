/**
 * Robust JSON parser for LLM responses.
 *
 * Three failure modes we see in production with Gemini / OpenAI / Groq when
 * they're asked to return JSON:
 *
 *   1. Markdown fences. The model wraps the JSON in ```json ... ```.
 *   2. Trailing or leading commentary. The model says "Here is the
 *      review:\n\n{...}\n\nLet me know if you have questions.".
 *   3. Truncation. The response hits maxTokens mid-object and the JSON is
 *      structurally incomplete -- a trailing comma, a half-written string,
 *      or just a missing closing brace.
 *
 * `safeParseLlmJson` handles (1) and (2) by extracting the first balanced
 * `{...}` substring. It cannot recover from (3) -- truncation produces
 * genuinely-broken JSON -- but the caller can detect that case and bump
 * maxTokens / log the head of the response.
 *
 * Returns null on any failure. Never throws.
 */
export function safeParseLlmJson<T>(raw: string): T | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;

  // Strip the leading "```json", "```", and trailing "```" that some models
  // emit even when the prompt forbids markdown fences.
  const stripped = raw
    .replace(/^\s*```(?:json|JSON)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  // Fast path: the whole string is already a JSON object.
  if (stripped.startsWith('{') && stripped.endsWith('}')) {
    try {
      return JSON.parse(stripped) as T;
    } catch {
      // fall through to the brace-balancing path
    }
  }

  // General case: find the first balanced `{...}` substring. We walk the
  // characters tracking string state (so braces inside string literals
  // don't bump the depth counter) and brace depth.
  const start = stripped.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        const candidate = stripped.slice(start, i + 1);
        try {
          return JSON.parse(candidate) as T;
        } catch {
          return null;
        }
      }
    }
  }

  // Reached EOF before the outermost object closed -- truncation. Caller
  // should bump maxTokens and retry; we surface null and let them log.
  return null;
}
