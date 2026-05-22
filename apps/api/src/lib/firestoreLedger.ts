import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import type { CreditEvent, UserId } from '@nexigrate/shared';
import type { LedgerStore } from '../routes/credits.js';

/**
 * Firestore-backed implementation of the credit ledger.
 *
 * Storage layout:
 *
 *   credit_events/{eventId}        -- raw, append-only event documents
 *
 * All writes happen inside a Firestore transaction so duplicate idempotency
 * keys (a retry under contention) cannot create two events. The engine
 * has already enforced idempotency against the snapshot it was given;
 * this transaction closes the read-modify-write race window between two
 * replicas racing the same retry.
 */

const COLLECTION = 'credit_events';

export class FirestoreLedgerStore implements LedgerStore {
  constructor(private readonly db: Firestore) {}

  async read(userId: UserId): Promise<ReadonlyArray<CreditEvent>> {
    const snap = await this.db
      .collection(COLLECTION)
      .where('userId', '==', userId)
      .orderBy('occurredAt', 'asc')
      .orderBy(FieldPath.documentId(), 'asc')
      .get();
    return snap.docs.map((d) => d.data() as CreditEvent);
  }

  async append(event: CreditEvent): Promise<void> {
    await this.db.runTransaction(async (tx) => {
      const dup = await tx.get(
        this.db
          .collection(COLLECTION)
          .where('userId', '==', event.userId)
          .where('idempotencyKey', '==', event.idempotencyKey)
          .limit(1),
      );
      if (!dup.empty) return; // silent no-op -- the engine returned 'duplicate'
      tx.create(this.db.collection(COLLECTION).doc(event.id), event);
    });
  }
}
