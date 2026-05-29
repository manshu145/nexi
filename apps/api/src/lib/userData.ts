/**
 * User-data lifecycle helpers — DPDP compliance (lock §3.4).
 *
 * Single source of truth for which collections in our Firestore schema
 * are scoped to a single user. Used by:
 *   - GET    /v1/users/me/export-data  (right to access)
 *   - DELETE /v1/users/me              (right to erasure)
 *
 * Adding a new user-scoped collection? Append it here and BOTH the export
 * and erasure paths automatically pick it up. That's the whole point of
 * keeping this map centralised — DPDP rules require feature parity across
 * "give me everything" and "delete everything", and a stale list silently
 * leaving data behind is a regulatory risk.
 *
 * Skipped collections (intentionally NOT in this list because they are
 * not personal data of the requesting user):
 *   - announcements, adminLogs, aiCallLogs, errorLogs, emailLogs
 *   - currentAffairs, syllabi, syllabusCache, visualizationCache,
 *     chapter_content, chapterMCQPool, newsLikeCounts, newsFeeds
 *   - announcements, system, platformConfig, coupons, emailTemplates
 *
 * These are either platform-wide (cache, config, content) or admin-side
 * audit records that DPDP exempts as legitimate-interest processing.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { UserId } from '@nexigrate/shared';
import type { Logger } from '../logger.js';

/**
 * Each entry tells the helper how to find the user's documents:
 *  - `name`: Firestore collection name
 *  - `userField`: which field in each doc carries the user id. For
 *    referrals we have to scan twice (referrerId + inviteeId) so the
 *    type allows multiple field names.
 *  - `subcollectionOf`: if this collection is actually a SUB-collection
 *    of `users/{uid}/<name>`, record the parent so we walk it correctly.
 */
export interface UserDataCollection {
  name: string;
  userField?: string | string[];
  subcollectionOf?: 'users';
}

export const USER_DATA_COLLECTIONS: readonly UserDataCollection[] = [
  // Subcollections under users/{uid}/...
  { name: 'chatHistory', subcollectionOf: 'users' },
  { name: 'history',     subcollectionOf: 'users' },
  { name: 'progress',    subcollectionOf: 'users' },
  { name: 'results',     subcollectionOf: 'users' },
  { name: 'sessions',    subcollectionOf: 'users' },

  // Top-level collections with a userId-style field
  { name: 'studyProgress',       userField: 'userId' },
  { name: 'chatSessions',        userField: 'userId' },
  { name: 'mockTestResults',     userField: 'userId' },
  { name: 'quizResults',         userField: 'userId' },
  { name: 'dailyQuizzes',        userField: 'userId' },
  { name: 'newsLikes',           userField: 'userId' },
  { name: 'newsBookmarks',       userField: 'userId' },
  { name: 'subscriptionEvents',  userField: 'userId' },
  { name: 'billingOrders',       userField: ['userId', 'uid'] },
  { name: 'usedCoupons',         userField: 'userId' },
  { name: 'essaySubmissions',    userField: 'userId' },
  { name: 'supportTickets',      userField: 'userId' },
  { name: 'creditLedger',        userField: 'userId' },
  { name: 'mockTestAttempts',    userField: 'userId' },
  { name: 'referrals',           userField: ['referrerId', 'inviteeId'] },
  { name: 'referralCodes',       userField: 'userId' },
  { name: 'activityLog',         userField: 'userId' },
] as const;

const FIRESTORE_BATCH_LIMIT = 400; // safe under the 500 hard cap, leaves headroom for the user doc

export interface ExportPayload {
  exportedAt: string;
  schemaVersion: 1;
  user: Record<string, unknown> | null;
  data: Record<string, Record<string, unknown>[]>;
  failedCollections: string[];
}

/**
 * Read every user-scoped document across the schema and return a single
 * JSON-serialisable object. Errors per collection are collected into
 * `failedCollections` so a partial outage doesn't fail the whole export
 * — DPDP "right to access" should always return SOMETHING the user can
 * download, even if a single collection is temporarily unreachable.
 */
export async function exportUserData(
  db: Firestore,
  userId: UserId,
  logger: Logger,
): Promise<ExportPayload> {
  const data: Record<string, Record<string, unknown>[]> = {};
  const failed: string[] = [];

  // 1. Primary user doc.
  let userDoc: Record<string, unknown> | null = null;
  try {
    const snap = await db.collection('users').doc(userId).get();
    userDoc = snap.exists ? snap.data() ?? null : null;
  } catch (err) {
    logger.warn('users.export_user_doc_failed', { userId, error: errMsg(err) });
    failed.push('users');
  }

  // 2. Each user-scoped collection.
  for (const col of USER_DATA_COLLECTIONS) {
    try {
      if (col.subcollectionOf === 'users') {
        const snap = await db.collection('users').doc(userId).collection(col.name).get();
        data[col.name] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } else if (col.userField) {
        const fields = Array.isArray(col.userField) ? col.userField : [col.userField];
        const merged: Record<string, unknown>[] = [];
        const seenIds = new Set<string>();
        for (const field of fields) {
          const snap = await db.collection(col.name).where(field, '==', userId).get();
          for (const d of snap.docs) {
            if (seenIds.has(d.id)) continue;
            seenIds.add(d.id);
            merged.push({ id: d.id, ...d.data() });
          }
        }
        data[col.name] = merged;
      }
    } catch (err) {
      logger.warn('users.export_collection_failed', { userId, collection: col.name, error: errMsg(err) });
      failed.push(col.name);
    }
  }

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    user: userDoc,
    data,
    failedCollections: failed,
  };
}

export interface EraseResult {
  collectionsDeleted: string[];
  failedCollections: string[];
  totalDocs: number;
}

/**
 * Hard-delete every user-scoped document. The user doc itself is deleted
 * LAST so a partial failure in a downstream collection doesn't leave the
 * user signed-in with phantom data — if anything fails, the user doc
 * stays and the next /me call gives them a working session to retry
 * deletion via support.
 */
export async function eraseUserData(
  db: Firestore,
  userId: UserId,
  logger: Logger,
): Promise<EraseResult> {
  const deleted: string[] = [];
  const failed: string[] = [];
  let totalDocs = 0;

  for (const col of USER_DATA_COLLECTIONS) {
    try {
      const refs: FirebaseFirestore.DocumentReference[] = [];
      if (col.subcollectionOf === 'users') {
        const snap = await db.collection('users').doc(userId).collection(col.name).get();
        snap.docs.forEach(d => refs.push(d.ref));
        // Special case: chatHistory has a `messages` SUB-subcollection
        // (post-PR-24 schema) that must be walked + deleted before the
        // parent doc is removed. Firestore does NOT auto-cascade.
        if (col.name === 'chatHistory') {
          for (const sessionDoc of snap.docs) {
            const messagesCol = sessionDoc.ref.collection('messages');
            while (true) {
              const msgSnap = await messagesCol.limit(FIRESTORE_BATCH_LIMIT).get();
              if (msgSnap.empty) break;
              const batch = db.batch();
              msgSnap.docs.forEach(m => batch.delete(m.ref));
              await batch.commit();
              if (msgSnap.size < FIRESTORE_BATCH_LIMIT) break;
            }
          }
        }
      } else if (col.userField) {
        const fields = Array.isArray(col.userField) ? col.userField : [col.userField];
        for (const field of fields) {
          const snap = await db.collection(col.name).where(field, '==', userId).get();
          snap.docs.forEach(d => refs.push(d.ref));
        }
      }

      // Batch in chunks of FIRESTORE_BATCH_LIMIT so we never hit the 500-write hard cap.
      for (let i = 0; i < refs.length; i += FIRESTORE_BATCH_LIMIT) {
        const batch = db.batch();
        const slice = refs.slice(i, i + FIRESTORE_BATCH_LIMIT);
        for (const ref of slice) batch.delete(ref);
        await batch.commit();
      }
      if (refs.length > 0) deleted.push(col.name);
      totalDocs += refs.length;
    } catch (err) {
      logger.warn('users.erase_collection_failed', { userId, collection: col.name, error: errMsg(err) });
      failed.push(col.name);
    }
  }

  // User doc last.
  try {
    await db.collection('users').doc(userId).delete();
    deleted.push('users');
    totalDocs += 1;
  } catch (err) {
    logger.error('users.erase_user_doc_failed', { userId, error: errMsg(err) });
    failed.push('users');
  }

  return { collectionsDeleted: deleted, failedCollections: failed, totalDocs };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
}
