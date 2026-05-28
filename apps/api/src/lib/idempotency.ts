/**
 * Idempotency store — ensures repeated requests with the same key
 * return the same response without re-executing the underlying work.
 *
 * Use cases:
 *  - /v1/billing/verify (browser retry on flaky network)
 *  - /v1/billing/webhook (Razorpay retries failed deliveries)
 *  - any state-changing endpoint that can be safely deduped
 *
 * Storage:
 *  - Firestore: collection `idempotency`, doc id = `${scope}__${key}` (sanitised)
 *  - InMemory: Map (process-local — only safe for tests / single-instance dev)
 *
 * Records are written with a `ttlAt` timestamp. To auto-delete after 24h, run
 * once against the project (one-time setup, not in this PR):
 *
 *   gcloud firestore fields ttls update ttlAt \
 *     --collection-group=idempotency \
 *     --enable-ttl \
 *     --project=nexigrate-prod
 *
 * Until that command is run, records accumulate but are still treated as
 * expired by the in-process `get()` check, so correctness is preserved.
 */

import type { Firestore } from 'firebase-admin/firestore';

export interface IdempotencyRecord<T = unknown> {
  key: string;
  scope: string;            // e.g. 'billing.verify', 'billing.webhook'
  response: T;
  status: 'completed' | 'failed';
  createdAt: string;
  ttlAt: string;            // Firestore TTL field — auto-deleted after this time
}

export interface IdempotencyStore {
  /** Returns the cached record for a key, or null if none exists. */
  get<T = unknown>(scope: string, key: string): Promise<IdempotencyRecord<T> | null>;
  /** Caches a response for a key. Overwrites if exists (last-write-wins). */
  put<T = unknown>(scope: string, key: string, response: T, status?: 'completed' | 'failed'): Promise<void>;
}

const TTL_HOURS = 24;
const COL = 'idempotency';

function ttlIso(): string {
  return new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000).toISOString();
}

function docId(scope: string, key: string): string {
  // Firestore doc IDs cannot contain '/' or be longer than 1500 bytes;
  // we sanitise just in case a caller passes an unusual key.
  return `${scope}__${key}`.replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 1500);
}

export class FirestoreIdempotencyStore implements IdempotencyStore {
  constructor(private readonly db: Firestore) {}

  async get<T>(scope: string, key: string): Promise<IdempotencyRecord<T> | null> {
    const snap = await this.db.collection(COL).doc(docId(scope, key)).get();
    if (!snap.exists) return null;
    const data = snap.data() as IdempotencyRecord<T>;
    // Defensive: if ttl already passed (TTL policy not yet purged), treat as missing.
    if (data.ttlAt && new Date(data.ttlAt).getTime() < Date.now()) return null;
    return data;
  }

  async put<T>(scope: string, key: string, response: T, status: 'completed' | 'failed' = 'completed'): Promise<void> {
    const record: IdempotencyRecord<T> = {
      key,
      scope,
      response,
      status,
      createdAt: new Date().toISOString(),
      ttlAt: ttlIso(),
    };
    await this.db.collection(COL).doc(docId(scope, key)).set(record);
  }
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private map = new Map<string, IdempotencyRecord<unknown>>();

  async get<T>(scope: string, key: string): Promise<IdempotencyRecord<T> | null> {
    const k = docId(scope, key);
    const r = this.map.get(k);
    if (!r) return null;
    if (new Date(r.ttlAt).getTime() < Date.now()) {
      this.map.delete(k);
      return null;
    }
    return r as IdempotencyRecord<T>;
  }

  async put<T>(scope: string, key: string, response: T, status: 'completed' | 'failed' = 'completed'): Promise<void> {
    this.map.set(docId(scope, key), {
      key, scope, response, status,
      createdAt: new Date().toISOString(),
      ttlAt: ttlIso(),
    });
  }
}
