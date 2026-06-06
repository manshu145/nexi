'use client';

/**
 * Lightweight product-analytics client.
 *
 * Buffers events and flushes in batches (every 8s, on 20 events, or when the
 * tab is hidden) to POST /v1/analytics/events. Uses authedFetch so events are
 * attributed to the logged-in user; disabled until auth is known so we never
 * fire unauthenticated 401s. Fire-and-forget — failures are dropped silently.
 */

import { authedFetch } from './api';

interface BufferedEvent { type: string; props?: Record<string, string> }

let buffer: BufferedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let enabled = false;

export function setAnalyticsEnabled(v: boolean): void {
  enabled = v;
}

export function track(type: string, props?: Record<string, string>): void {
  if (!enabled) return;
  buffer.push(props ? { type, props } : { type });
  if (buffer.length >= 20) { void flush(); return; }
  if (!timer) timer = setTimeout(() => void flush(), 8000);
}

export async function flush(keepalive = false): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  try {
    await authedFetch('/v1/analytics/events', {
      method: 'POST',
      body: JSON.stringify({ events: batch }),
      keepalive,
    });
  } catch {
    /* analytics is best-effort — drop on failure */
  }
}
