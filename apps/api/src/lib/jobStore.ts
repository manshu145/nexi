/**
 * Job repository, saved jobs, application tracking, and the eligibility
 * verdict cache.
 *
 * ── The cost-safety design (Phase 7 of the spec) ──────────────────────────
 *
 * The naive feed is `every user × every job`, which explodes. Instead:
 *
 *   1. CHEAP DB FILTER    narrow by status/sector/state/deadline in Firestore
 *   2. DETERMINISTIC PASS run the pure engine over that small set (µs each)
 *   3. CACHE              key on user:profileVersion:job:jobVersion
 *
 * Because the cache key embeds both versions, a profile edit or a corrigendum
 * invalidates exactly the affected entries with no sweep to run, and a stale
 * verdict is structurally impossible to serve.
 *
 * ── Repository abstraction ────────────────────────────────────────────────
 * `JobRepository` is deliberately narrow so a dedicated search backend can
 * replace the Firestore query layer later without touching the rule engine.
 * Eligibility logic never sees a Firestore type.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type {
  ApplicationStatus,
  Job,
  JobApplicationRecord,
  JobSector,
  JobStatus,
} from '@nexigrate/shared';

export const JOBS_COLLECTION = 'jobs';
export const JOB_APPLICATIONS_COLLECTION = 'jobApplications';
export const JOB_SOURCES_COLLECTION = 'jobSources';

/** Composite id so one user cannot have two records for the same job. */
export function applicationId(userId: string, jobId: string): string {
  return `${userId}__${jobId}`;
}

// ─── Query surface ────────────────────────────────────────────────────────

export interface JobQuery {
  /** Defaults to the open-ish states so closed vacancies leave the feed. */
  statuses?: JobStatus[];
  sectors?: JobSector[];
  /** State slug; pass null explicitly to mean "national only". */
  state?: string | null;
  /** Only jobs whose deadline is on or after this ISO date. */
  deadlineAfter?: string;
  /** Free-text match against title + organization (client-side contains). */
  search?: string;
  limit?: number;
  /** Opaque cursor — the last jobId of the previous page. */
  cursor?: string;
}

/** Statuses that should appear in a normal feed. */
export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = ['UPCOMING', 'OPEN', 'CLOSING_SOON'];

export interface JobPage {
  jobs: Job[];
  /** Cursor for the next page, or null when exhausted. */
  nextCursor: string | null;
}

export interface JobRepository {
  getById(jobId: string): Promise<Job | null>;
  getManyByIds(jobIds: string[]): Promise<Job[]>;
  /**
   * Cheap, index-friendly candidate set. Intentionally does NOT evaluate
   * eligibility — that is the engine's job, run over this result.
   */
  query(query: JobQuery): Promise<JobPage>;
  /** Upsert used by ingestion. Returns whether the record actually changed. */
  upsert(job: Job): Promise<{ created: boolean; versionBumped: boolean }>;
  /** Look up by source identity for cross-run dedup. */
  findBySourceHash(sourceId: string, sourceHash: string): Promise<Job | null>;
  findBySourceJobId(sourceId: string, sourceJobId: string): Promise<Job | null>;
}

export interface SavedJobStore {
  save(userId: string, jobId: string): Promise<JobApplicationRecord>;
  unsave(userId: string, jobId: string): Promise<void>;
  setStatus(
    userId: string,
    jobId: string,
    status: ApplicationStatus,
    notes?: string,
  ): Promise<JobApplicationRecord>;
  get(userId: string, jobId: string): Promise<JobApplicationRecord | null>;
  listForUser(userId: string, statuses?: ApplicationStatus[]): Promise<JobApplicationRecord[]>;
}

// ─── Firestore job repository ─────────────────────────────────────────────

export class FirestoreJobRepository implements JobRepository {
  constructor(private readonly db: Firestore) {}

  private col() {
    return this.db.collection(JOBS_COLLECTION);
  }

  async getById(jobId: string): Promise<Job | null> {
    const snap = await this.col().doc(jobId).get();
    return snap.exists ? (snap.data() as Job) : null;
  }

  async getManyByIds(jobIds: string[]): Promise<Job[]> {
    if (jobIds.length === 0) return [];
    // getAll is a single round trip, unlike N separate gets.
    const refs = jobIds.map((id) => this.col().doc(id));
    const snaps = await this.db.getAll(...refs);
    return snaps.filter((s) => s.exists).map((s) => s.data() as Job);
  }

  async query(query: JobQuery): Promise<JobPage> {
    const limit = Math.min(query.limit ?? 100, 300);
    const statuses = query.statuses ?? [...ACTIVE_JOB_STATUSES];

    // Firestore allows only one array-membership filter per query, and we
    // want `status IN [...]` for the feed, so sector/state narrowing happens
    // with equality filters when a single value is supplied and in-process
    // otherwise. This keeps us on simple indexes.
    let ref = this.col().where('status', 'in', statuses.slice(0, 10)) as FirebaseFirestore.Query;

    if (query.sectors?.length === 1) {
      ref = ref.where('sector', '==', query.sectors[0]);
    }
    if (query.state !== undefined && query.sectors?.length !== 1) {
      ref = ref.where('state', '==', query.state);
    }

    // Order by deadline so "closing soon" naturally sorts first, with a
    // documentId tiebreaker so the cursor is stable.
    ref = ref.orderBy('applicationDeadline', 'asc').orderBy('__name__', 'asc');

    if (query.cursor) {
      const cursorSnap = await this.col().doc(query.cursor).get();
      if (cursorSnap.exists) ref = ref.startAfter(cursorSnap);
    }

    // Over-fetch a little because some filters are applied in-process.
    const snap = await ref.limit(limit * 2).get();
    let jobs = snap.docs.map((d) => d.data() as Job);

    if (query.sectors?.length && query.sectors.length > 1) {
      const wanted = new Set(query.sectors);
      jobs = jobs.filter((j) => wanted.has(j.sector));
    }
    if (query.state !== undefined && query.sectors?.length === 1) {
      jobs = jobs.filter((j) => (j.state ?? null) === query.state);
    }
    if (query.deadlineAfter) {
      jobs = jobs.filter((j) => !j.applicationDeadline || j.applicationDeadline >= query.deadlineAfter!);
    }
    if (query.search) {
      const needle = query.search.toLowerCase();
      jobs = jobs.filter(
        (j) =>
          j.title.toLowerCase().includes(needle) ||
          j.organization.toLowerCase().includes(needle),
      );
    }

    const page = jobs.slice(0, limit);
    const nextCursor = jobs.length > limit ? (page[page.length - 1]?.jobId ?? null) : null;
    return { jobs: page, nextCursor };
  }

  async upsert(job: Job): Promise<{ created: boolean; versionBumped: boolean }> {
    const ref = this.col().doc(job.jobId);
    return this.db.runTransaction(async (txn) => {
      const snap = await txn.get(ref);
      if (!snap.exists) {
        txn.set(ref, { ...job, version: Math.max(1, job.version) });
        return { created: true, versionBumped: false };
      }
      const existing = snap.data() as Job;

      // Trust ladder: never let a lower-trust source overwrite a
      // higher-trust record's eligibility rules. A news aggregator must not
      // be able to change a statutory age limit sourced from the official
      // notification PDF.
      const { TRUST_PRECEDENCE } = await import('@nexigrate/shared');
      const incomingTrust = TRUST_PRECEDENCE[job.sourceTrustLevel] ?? 0;
      const existingTrust = TRUST_PRECEDENCE[existing.sourceTrustLevel] ?? 0;
      if (incomingTrust < existingTrust) {
        // Refresh only liveness metadata.
        txn.set(
          ref,
          { lastSeenAt: job.lastSeenAt ?? new Date().toISOString() },
          { merge: true },
        );
        return { created: false, versionBumped: false };
      }

      // Unchanged content: touch liveness only. This is the guard that stops
      // ingestion from re-spending AI tokens on an unchanged notification.
      if (existing.sourceHash === job.sourceHash) {
        txn.set(
          ref,
          {
            lastSeenAt: job.lastSeenAt ?? new Date().toISOString(),
            lastVerifiedAt: job.lastVerifiedAt ?? new Date().toISOString(),
            status: job.status,
          },
          { merge: true },
        );
        return { created: false, versionBumped: false };
      }

      // Content changed → new version, preserving history via the version
      // counter rather than overwriting silently.
      txn.set(ref, {
        ...job,
        version: existing.version + 1,
        createdAt: existing.createdAt,
      });
      return { created: false, versionBumped: true };
    });
  }

  async findBySourceHash(sourceId: string, sourceHash: string): Promise<Job | null> {
    const snap = await this.col()
      .where('sourceId', '==', sourceId)
      .where('sourceHash', '==', sourceHash)
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0]!.data() as Job);
  }

  async findBySourceJobId(sourceId: string, sourceJobId: string): Promise<Job | null> {
    const snap = await this.col()
      .where('sourceId', '==', sourceId)
      .where('sourceJobId', '==', sourceJobId)
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0]!.data() as Job);
  }
}

// ─── In-memory job repository ─────────────────────────────────────────────

export class InMemoryJobRepository implements JobRepository {
  private docs = new Map<string, Job>();

  /** Test helper: seed without upsert semantics. */
  seed(jobs: Job[]): void {
    for (const j of jobs) this.docs.set(j.jobId, j);
  }

  async getById(jobId: string): Promise<Job | null> {
    return this.docs.get(jobId) ?? null;
  }

  async getManyByIds(jobIds: string[]): Promise<Job[]> {
    return jobIds.map((id) => this.docs.get(id)).filter((j): j is Job => !!j);
  }

  async query(query: JobQuery): Promise<JobPage> {
    const limit = Math.min(query.limit ?? 100, 300);
    const statuses = new Set(query.statuses ?? ACTIVE_JOB_STATUSES);
    let jobs = [...this.docs.values()].filter((j) => statuses.has(j.status));

    if (query.sectors?.length) {
      const wanted = new Set(query.sectors);
      jobs = jobs.filter((j) => wanted.has(j.sector));
    }
    if (query.state !== undefined) {
      jobs = jobs.filter((j) => (j.state ?? null) === query.state);
    }
    if (query.deadlineAfter) {
      jobs = jobs.filter((j) => !j.applicationDeadline || j.applicationDeadline >= query.deadlineAfter!);
    }
    if (query.search) {
      const needle = query.search.toLowerCase();
      jobs = jobs.filter(
        (j) => j.title.toLowerCase().includes(needle) || j.organization.toLowerCase().includes(needle),
      );
    }

    jobs.sort((a, b) => (a.applicationDeadline ?? '9999').localeCompare(b.applicationDeadline ?? '9999'));

    let start = 0;
    if (query.cursor) {
      const idx = jobs.findIndex((j) => j.jobId === query.cursor);
      if (idx >= 0) start = idx + 1;
    }
    const page = jobs.slice(start, start + limit);
    const nextCursor = start + limit < jobs.length ? (page[page.length - 1]?.jobId ?? null) : null;
    return { jobs: page, nextCursor };
  }

  async upsert(job: Job): Promise<{ created: boolean; versionBumped: boolean }> {
    const existing = this.docs.get(job.jobId);
    if (!existing) {
      this.docs.set(job.jobId, { ...job, version: Math.max(1, job.version) });
      return { created: true, versionBumped: false };
    }
    const { TRUST_PRECEDENCE } = await import('@nexigrate/shared');
    if ((TRUST_PRECEDENCE[job.sourceTrustLevel] ?? 0) < (TRUST_PRECEDENCE[existing.sourceTrustLevel] ?? 0)) {
      this.docs.set(job.jobId, { ...existing, lastSeenAt: job.lastSeenAt ?? new Date().toISOString() });
      return { created: false, versionBumped: false };
    }
    if (existing.sourceHash === job.sourceHash) {
      this.docs.set(job.jobId, {
        ...existing,
        lastSeenAt: job.lastSeenAt ?? new Date().toISOString(),
        status: job.status,
      });
      return { created: false, versionBumped: false };
    }
    this.docs.set(job.jobId, { ...job, version: existing.version + 1, createdAt: existing.createdAt });
    return { created: false, versionBumped: true };
  }

  async findBySourceHash(sourceId: string, sourceHash: string): Promise<Job | null> {
    return (
      [...this.docs.values()].find((j) => j.sourceId === sourceId && j.sourceHash === sourceHash) ?? null
    );
  }

  async findBySourceJobId(sourceId: string, sourceJobId: string): Promise<Job | null> {
    return (
      [...this.docs.values()].find((j) => j.sourceId === sourceId && j.sourceJobId === sourceJobId) ?? null
    );
  }
}

// ─── Saved jobs / application tracking ────────────────────────────────────

export class FirestoreSavedJobStore implements SavedJobStore {
  constructor(private readonly db: Firestore) {}

  private col() {
    return this.db.collection(JOB_APPLICATIONS_COLLECTION);
  }

  async save(userId: string, jobId: string): Promise<JobApplicationRecord> {
    return this.setStatus(userId, jobId, 'SAVED');
  }

  async unsave(userId: string, jobId: string): Promise<void> {
    await this.col().doc(applicationId(userId, jobId)).delete();
  }

  async setStatus(
    userId: string,
    jobId: string,
    status: ApplicationStatus,
    notes?: string,
  ): Promise<JobApplicationRecord> {
    const ref = this.col().doc(applicationId(userId, jobId));
    const now = new Date().toISOString();
    const snap = await ref.get();
    const existing = snap.exists ? (snap.data() as JobApplicationRecord) : null;

    const record: JobApplicationRecord = {
      jobId,
      userId,
      status,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(existing?.savedAt ? { savedAt: existing.savedAt } : status === 'SAVED' ? { savedAt: now } : {}),
      // Stamp appliedAt the first time the user says they applied, and keep
      // it stable through later funnel stages.
      ...(existing?.appliedAt
        ? { appliedAt: existing.appliedAt }
        : status === 'APPLIED'
          ? { appliedAt: now }
          : {}),
      ...(notes !== undefined ? { notes } : existing?.notes ? { notes: existing.notes } : {}),
    };
    await ref.set(record, { merge: true });
    return record;
  }

  async get(userId: string, jobId: string): Promise<JobApplicationRecord | null> {
    const snap = await this.col().doc(applicationId(userId, jobId)).get();
    return snap.exists ? (snap.data() as JobApplicationRecord) : null;
  }

  async listForUser(userId: string, statuses?: ApplicationStatus[]): Promise<JobApplicationRecord[]> {
    // Single-field equality + in-process status filter avoids needing a
    // composite index for every status combination.
    const snap = await this.col().where('userId', '==', userId).get();
    let rows = snap.docs.map((d) => d.data() as JobApplicationRecord);
    if (statuses?.length) {
      const wanted = new Set(statuses);
      rows = rows.filter((r) => wanted.has(r.status));
    }
    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return rows;
  }
}

export class InMemorySavedJobStore implements SavedJobStore {
  private docs = new Map<string, JobApplicationRecord>();

  async save(userId: string, jobId: string): Promise<JobApplicationRecord> {
    return this.setStatus(userId, jobId, 'SAVED');
  }

  async unsave(userId: string, jobId: string): Promise<void> {
    this.docs.delete(applicationId(userId, jobId));
  }

  async setStatus(
    userId: string,
    jobId: string,
    status: ApplicationStatus,
    notes?: string,
  ): Promise<JobApplicationRecord> {
    const key = applicationId(userId, jobId);
    const existing = this.docs.get(key);
    const now = new Date().toISOString();
    const record: JobApplicationRecord = {
      jobId,
      userId,
      status,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(existing?.savedAt ? { savedAt: existing.savedAt } : status === 'SAVED' ? { savedAt: now } : {}),
      ...(existing?.appliedAt
        ? { appliedAt: existing.appliedAt }
        : status === 'APPLIED'
          ? { appliedAt: now }
          : {}),
      ...(notes !== undefined ? { notes } : existing?.notes ? { notes: existing.notes } : {}),
    };
    this.docs.set(key, record);
    return record;
  }

  async get(userId: string, jobId: string): Promise<JobApplicationRecord | null> {
    return this.docs.get(applicationId(userId, jobId)) ?? null;
  }

  async listForUser(userId: string, statuses?: ApplicationStatus[]): Promise<JobApplicationRecord[]> {
    let rows = [...this.docs.values()].filter((r) => r.userId === userId);
    if (statuses?.length) {
      const wanted = new Set(statuses);
      rows = rows.filter((r) => wanted.has(r.status));
    }
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}
