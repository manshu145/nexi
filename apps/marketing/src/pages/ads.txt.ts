/**
 * Dynamic ads.txt served at nexigrate.com/ads.txt
 *
 * Fetches the content from the API's admin-managed SEO settings so the
 * founder can update the ads.txt from the admin panel without redeploying
 * the marketing site. Falls back to empty (valid but no ads authorized)
 * if the API is unreachable.
 *
 * Cache: Cloudflare edge caches this for 5 minutes (via Cache-Control),
 * so Google's AdSense crawler sees fast responses without hammering the API.
 */
import type { APIRoute } from 'astro';

const API_BASE = 'https://api.nexigrate.com';

export const GET: APIRoute = async () => {
  let content = '';
  try {
    const res = await fetch(`${API_BASE}/ads.txt`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      content = await res.text();
    }
  } catch {
    // API unreachable — serve empty ads.txt (valid, means no ads authorized)
  }

  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
