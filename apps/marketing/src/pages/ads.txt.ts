/**
 * Dynamic ads.txt — nexigrate.com/ads.txt
 *
 * Fetches content from the API (admin-managed via SEO panel) so the
 * founder can update ads.txt without redeploying the marketing site.
 * Falls back to empty (valid, no ads authorized) if the API is down.
 */
import type { APIRoute } from 'astro';

const API_BASE = 'https://api.nexigrate.com';

export const GET: APIRoute = async () => {
  let content = '';
  try {
    const res = await fetch(`${API_BASE}/ads.txt`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) content = await res.text();
  } catch {
    // API unreachable — serve empty ads.txt
  }

  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
