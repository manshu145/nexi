import { Hono } from 'hono';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { CareerProfileStore, CareerProfilePatch } from '../lib/careerProfileStore.js';
import { profileCompleteness } from '../lib/careerProfileStore.js';
import type { JobRepository, SavedJobStore, JobQuery } from '../lib/jobStore.js';
import { ACTIVE_JOB_STATUSES } from '../lib/jobStore.js';
import type { EligibilityCache } from '../lib/eligibilityCache.js';
import {
  evaluateFit,
  evaluateJobEligibility,
  isStatutorySector,
  type ApplicationStatus,
  type CareerProfile,
  type EligibilityResult,
  type FitResult,
  type Job,
  type JobSector,
} from '@nexigrate/shared';

/**
 * Jobs & Eligibility routes.
 *
 *   GET    /v1/jobs/career-profile          → profile + completeness
 *   PATCH  /v1/jobs/career-profile          → merge a patch, bump version
 *   DELETE /v1/jobs/career-profile          → erase (DPDP)
 *
 *   GET    /v1/jobs                         → filtered feed
 *   GET    /v1/jobs/for-you                 → eligibility-first feed
 *   GET    /v1/jobs/saved                   → saved + applied tracker
 *   GET    /v1/jobs/:jobId                  → one job
 *   GET    /v1/jobs/:jobId/eligibility      → full per-rule verdict
 *   POST   /v1/jobs/:jobId/save             → save
 *   DELETE /v1/jobs/:jobId/save             → unsave
 *   POST   /v1/jobs/:jobId/application-status → funnel tracking
 *
 * ── Cost posture ──────────────────────────────────────────────────────────
 * NONE of these endpoints call an LLM. Eligibility is deterministic, so a
 * feed request costs one Firestore query plus microseconds of arithmetic per
 * job. Static routes are registered before the `:jobId` dynamic route so
 * "saved" / "for-you" are never captured as an id.
 */

export interface JobsRoutesDeps {
  profiles: CareerProfileStore;
  jobs: JobRepository;
  saved: SavedJobStore;
  cache: EligibilityCache;
  logger: Logger;
}

// ─── Validation ───────────────────────────────────────────────────────────

const educationSchema = z.object({
  id: z.string().optional(),
  level: z.enum(['CLASS_8', 'CLASS_10', 'CLASS_12', 'ITI', 'DIPLOMA', 'BACHELORS', 'MASTERS', 'PROFESSIONAL', 'PHD', 'OTHER']),
  degree: z.string().max(120).optional(),
  discipline: z.string().max(120).optional(),
  institution: z.string().max(200).optional(),
  boardOrUniversity: z.string().max(200).optional(),
  graduationYear: z.coerce.number().int().min(1950).max(2100).optional(),
  resultDate: z.string().optional(),
  percentage: z.coerce.number().min(0).max(100).optional(),
  cgpa: z.coerce.number().min(0).max(10).optional(),
  cgpaScale: z.coerce.number().min(1).max(100).optional(),
  completed: z.boolean(),
  resultAwaited: z.boolean().optional(),
  subjects: z.array(z.string().max(80)).max(30).optional(),
});

const experienceSchema = z.object({
  id: z.string().optional(),
  role: z.string().min(1).max(150),
  company: z.string().max(200).optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  current: z.boolean().optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'APPRENTICESHIP', 'FREELANCE', 'GOVERNMENT']),
  skills: z.array(z.string().max(60)).max(50).optional(),
  sector: z.string().max(80).optional(),
  managerial: z.boolean().optional(),
});

const examSchema = z.object({
  id: z.string().optional(),
  exam: z.string().min(1).max(60),
  score: z.coerce.number().optional(),
  percentile: z.coerce.number().min(0).max(100).optional(),
  rank: z.coerce.number().int().min(1).optional(),
  year: z.coerce.number().int().min(1950).max(2100).optional(),
  validUntil: z.string().optional(),
  qualified: z.boolean().optional(),
});

const profilePatchSchema = z.object({
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD').optional(),
  nationality: z.string().max(60).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'TRANSGENDER', 'PREFER_NOT_TO_SAY']).optional(),
  currentState: z.string().max(60).optional(),
  domicileState: z.string().max(60).optional(),
  domicileDistrict: z.string().max(80).optional(),
  preferredLocations: z.array(z.string().max(80)).max(20).optional(),
  willingToRelocate: z.boolean().optional(),
  workPreference: z.array(z.enum(['ONSITE', 'HYBRID', 'REMOTE'])).max(3).optional(),
  category: z.enum(['GENERAL', 'EWS', 'OBC', 'OBC_NCL', 'SC', 'ST']).optional(),
  flags: z.array(z.enum(['PWBD', 'EX_SERVICEMAN', 'WOMEN', 'DEPARTMENTAL', 'SPORTS_QUOTA', 'NCC', 'DOMICILE_LOCAL'])).max(10).optional(),
  disabilityPercentage: z.coerce.number().min(0).max(100).optional(),
  education: z.array(educationSchema).max(20).optional(),
  experience: z.array(experienceSchema).max(30).optional(),
  skills: z.array(z.string().max(60)).max(100).optional(),
  exams: z.array(examSchema).max(30).optional(),
  physical: z
    .object({
      heightCm: z.coerce.number().min(50).max(280).optional(),
      weightKg: z.coerce.number().min(10).max(400).optional(),
      chestCm: z.coerce.number().min(30).max(250).optional(),
      chestExpandedCm: z.coerce.number().min(30).max(250).optional(),
    })
    .optional(),
  speeds: z
    .object({
      typingWpmEnglish: z.coerce.number().min(0).max(400).optional(),
      typingWpmHindi: z.coerce.number().min(0).max(400).optional(),
      shorthandWpm: z.coerce.number().min(0).max(400).optional(),
    })
    .optional(),
  languages: z.array(z.string().max(40)).max(20).optional(),
  hasDrivingLicence: z.boolean().optional(),
  drivingLicenceClasses: z.array(z.string().max(20)).max(10).optional(),
  employmentExchangeRegistered: z.boolean().optional(),
  inGovernmentService: z.boolean().optional(),
  sensitiveDataConsent: z
    .object({
      granted: z.boolean(),
      grantedAt: z.string().optional(),
      purpose: z.string().max(300),
    })
    .optional(),
});

const APPLICATION_STATUSES = [
  'SAVED', 'STARTED_APPLICATION', 'APPLIED', 'EXAM_SCHEDULED',
  'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN', 'NOT_INTERESTED',
] as const;

const statusSchema = z.object({
  status: z.enum(APPLICATION_STATUSES),
  notes: z.string().max(2000).optional(),
});

// ─── Response shaping ─────────────────────────────────────────────────────

/**
 * Card-sized job payload plus the user's verdict.
 *
 * `eligibility.rules` is omitted from list responses — the full per-rule
 * table can be dozens of rows per job and would bloat a 100-job feed. The
 * detail endpoint returns it in full.
 */
interface JobCard {
  jobId: string;
  sector: JobSector;
  organization: string;
  title: string;
  locations: string[];
  state: string | null;
  employmentType: string;
  salary?: Job['salary'];
  applicationDeadline?: string;
  officialJobUrl: string;
  officialApplyUrl?: string;
  status: Job['status'];
  sourceTrustLevel: Job['sourceTrustLevel'];
  lastVerifiedAt?: string;
  vacancyTotal?: number;
  /** Days remaining, negative when past. Null when no deadline is published. */
  daysLeft: number | null;
  eligibility: {
    status: EligibilityResult['status'];
    /** The single most useful blocker for the card. */
    primaryBlocker?: string;
    missingProfileFields: string[];
  };
  /** Present only for non-statutory sectors. */
  fit?: {
    canApply: boolean;
    score: number;
    band: FitResult['band'];
    missing: string[];
    preferredMissing: string[];
  };
  applicationStatus?: ApplicationStatus;
}

function daysLeft(deadline: string | undefined, now: Date): number | null {
  if (!deadline) return null;
  const end = new Date(deadline);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
}

function toCard(
  job: Job,
  eligibility: EligibilityResult,
  now: Date,
  fit?: FitResult,
  applicationStatus?: ApplicationStatus,
): JobCard {
  return {
    jobId: job.jobId,
    sector: job.sector,
    organization: job.organization,
    title: job.title,
    locations: job.locations,
    state: job.state ?? null,
    employmentType: job.employmentType,
    ...(job.salary ? { salary: job.salary } : {}),
    ...(job.applicationDeadline ? { applicationDeadline: job.applicationDeadline } : {}),
    officialJobUrl: job.officialJobUrl,
    ...(job.officialApplyUrl ? { officialApplyUrl: job.officialApplyUrl } : {}),
    status: job.status,
    sourceTrustLevel: job.sourceTrustLevel,
    ...(job.lastVerifiedAt ? { lastVerifiedAt: job.lastVerifiedAt } : {}),
    ...(job.vacancies?.total !== undefined ? { vacancyTotal: job.vacancies.total } : {}),
    daysLeft: daysLeft(job.applicationDeadline, now),
    eligibility: {
      status: eligibility.status,
      ...(eligibility.blockingReasons[0] ? { primaryBlocker: eligibility.blockingReasons[0] } : {}),
      missingProfileFields: eligibility.missingProfileFields,
    },
    ...(fit
      ? {
          fit: {
            canApply: fit.canApply,
            score: fit.score,
            band: fit.band,
            missing: fit.missing,
            preferredMissing: fit.preferredMissing,
          },
        }
      : {}),
    ...(applicationStatus ? { applicationStatus } : {}),
  };
}

/** Feed ordering: actionable first, then most urgent deadline. */
const STATUS_RANK: Record<EligibilityResult['status'], number> = {
  ELIGIBLE: 0,
  CONDITIONALLY_ELIGIBLE: 1,
  PROFILE_INCOMPLETE: 2,
  MANUAL_REVIEW: 3,
  NOT_ELIGIBLE: 4,
};

// ─── Routes ───────────────────────────────────────────────────────────────

export function makeJobsRoutes(deps: JobsRoutesDeps): Hono {
  const app = new Hono();

  /**
   * Evaluate one job for a user, using the cache when the verdict is still
   * addressable under the current profile+job versions.
   */
  function evaluate(profile: CareerProfile, job: Job, now: Date): EligibilityResult {
    const cached = deps.cache.get(profile.userId, profile.profileVersion, job.jobId, job.version);
    if (cached) return cached;
    const result = evaluateJobEligibility(profile, job, { now });
    deps.cache.set(profile.userId, profile.profileVersion, job.jobId, job.version, result);
    return result;
  }

  function fitFor(profile: CareerProfile, job: Job, now: Date): FitResult | undefined {
    if (isStatutorySector(job.sector)) return undefined;
    return evaluateFit(profile, job.eligibilityRules, job, { now });
  }

  // ── Career profile ──────────────────────────────────────────────────────

  app.get('/career-profile', async (c) => {
    const { userId } = requireAuth(c);
    const profile = await deps.profiles.getOrEmpty(userId);
    return c.json({ profile, completeness: profileCompleteness(profile) });
  });

  app.patch('/career-profile', async (c) => {
    const { userId } = requireAuth(c);
    const body = await c.req.json().catch(() => ({}));
    const parsed = profilePatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    }

    // Reservation/disability data is only accepted with recorded consent, so
    // a client cannot quietly push sensitive fields.
    const patch = parsed.data as CareerProfilePatch;
    const touchesSensitive =
      patch.category !== undefined ||
      patch.flags !== undefined ||
      patch.disabilityPercentage !== undefined;
    if (touchesSensitive) {
      const existing = await deps.profiles.get(userId);
      const alreadyConsented = existing?.sensitiveDataConsent?.granted === true;
      const grantingNow = patch.sensitiveDataConsent?.granted === true;
      if (!alreadyConsented && !grantingNow) {
        throw new HTTPException(400, {
          message:
            'Category and related fields are used only to compute age relaxations and reserved-seat eligibility. Please grant consent before saving them.',
        });
      }
      if (grantingNow && !patch.sensitiveDataConsent?.grantedAt) {
        patch.sensitiveDataConsent = {
          ...patch.sensitiveDataConsent!,
          grantedAt: new Date().toISOString(),
        };
      }
    }

    const profile = await deps.profiles.update(userId, patch);
    deps.logger.info('jobs.profile_updated', {
      userId,
      profileVersion: profile.profileVersion,
      fields: Object.keys(patch),
    });
    return c.json({ profile, completeness: profileCompleteness(profile) });
  });

  app.delete('/career-profile', async (c) => {
    const { userId } = requireAuth(c);
    await deps.profiles.delete(userId);
    deps.logger.info('jobs.profile_deleted', { userId });
    return c.json({ success: true });
  });

  // ── Feed ────────────────────────────────────────────────────────────────

  /** Shared query parsing for the feed endpoints. */
  function readQuery(c: Context): JobQuery & { eligibleOnly: boolean } {
    const q = c.req.query();
    const sectors = q['sector']
      ? (q['sector'].split(',').map((s: string) => s.trim().toUpperCase()) as JobSector[])
      : undefined;
    const limit = q['limit'] ? Math.min(Math.max(Number(q['limit']) || 50, 1), 100) : 50;
    return {
      ...(sectors?.length ? { sectors } : {}),
      ...(q['state'] !== undefined ? { state: q['state'] === 'national' ? null : q['state'] } : {}),
      ...(q['search'] ? { search: q['search'] } : {}),
      ...(q['cursor'] ? { cursor: q['cursor'] } : {}),
      statuses: [...ACTIVE_JOB_STATUSES],
      limit,
      eligibleOnly: q['eligibleOnly'] === 'true',
    };
  }

  app.get('/', async (c) => {
    const { userId } = requireAuth(c);
    const now = new Date();
    const { eligibleOnly, ...query } = readQuery(c);

    const [profile, page] = await Promise.all([
      deps.profiles.getOrEmpty(userId),
      deps.jobs.query(query),
    ]);

    const tracked = await deps.saved.listForUser(userId);
    const trackedById = new Map(tracked.map((t) => [t.jobId, t.status]));

    let cards = page.jobs.map((job) =>
      toCard(job, evaluate(profile, job, now), now, fitFor(profile, job, now), trackedById.get(job.jobId)),
    );
    if (eligibleOnly) {
      cards = cards.filter(
        (card) => card.eligibility.status === 'ELIGIBLE' || card.eligibility.status === 'CONDITIONALLY_ELIGIBLE',
      );
    }

    return c.json({
      jobs: cards,
      nextCursor: page.nextCursor,
      profileComplete: profileCompleteness(profile).percent,
    });
  });

  /**
   * Eligibility-first feed: same candidate set, ordered so actionable
   * vacancies surface first, plus the counts the dashboard card needs.
   */
  app.get('/for-you', async (c) => {
    const { userId } = requireAuth(c);
    const now = new Date();
    const { eligibleOnly: _ignored, ...query } = readQuery(c);

    const [profile, page] = await Promise.all([
      deps.profiles.getOrEmpty(userId),
      deps.jobs.query(query),
    ]);
    const tracked = await deps.saved.listForUser(userId);
    const trackedById = new Map(tracked.map((t) => [t.jobId, t.status]));

    const cards = page.jobs
      .map((job) =>
        toCard(job, evaluate(profile, job, now), now, fitFor(profile, job, now), trackedById.get(job.jobId)),
      )
      // Hide anything the user has explicitly dismissed.
      .filter((card) => card.applicationStatus !== 'NOT_INTERESTED')
      .sort((a, b) => {
        const rank = STATUS_RANK[a.eligibility.status] - STATUS_RANK[b.eligibility.status];
        if (rank !== 0) return rank;
        // Within a status band, a private role with a better fit ranks higher.
        if (a.fit && b.fit && a.fit.score !== b.fit.score) return b.fit.score - a.fit.score;
        const aDays = a.daysLeft ?? Number.MAX_SAFE_INTEGER;
        const bDays = b.daysLeft ?? Number.MAX_SAFE_INTEGER;
        return aDays - bDays;
      });

    const summary = {
      total: cards.length,
      eligible: cards.filter((x) => x.eligibility.status === 'ELIGIBLE').length,
      conditional: cards.filter((x) => x.eligibility.status === 'CONDITIONALLY_ELIGIBLE').length,
      needsProfile: cards.filter((x) => x.eligibility.status === 'PROFILE_INCOMPLETE').length,
      notEligible: cards.filter((x) => x.eligibility.status === 'NOT_ELIGIBLE').length,
      strongPrivateMatches: cards.filter((x) => x.fit?.band === 'STRONG').length,
    };

    return c.json({
      jobs: cards,
      nextCursor: page.nextCursor,
      summary,
      completeness: profileCompleteness(profile),
    });
  });

  /** Saved + application tracker. Registered before `:jobId`. */
  app.get('/saved', async (c) => {
    const { userId } = requireAuth(c);
    const now = new Date();
    const statusFilter = c.req.query('status');
    const statuses = statusFilter
      ? (statusFilter.split(',').map((s) => s.trim().toUpperCase()) as ApplicationStatus[])
      : undefined;

    const records = await deps.saved.listForUser(userId, statuses);
    if (records.length === 0) return c.json({ jobs: [] });

    const [profile, jobs] = await Promise.all([
      deps.profiles.getOrEmpty(userId),
      deps.jobs.getManyByIds(records.map((r) => r.jobId)),
    ]);
    const byId = new Map(jobs.map((j) => [j.jobId, j]));

    const cards = records
      .map((record) => {
        const job = byId.get(record.jobId);
        if (!job) return null;
        return toCard(job, evaluate(profile, job, now), now, fitFor(profile, job, now), record.status);
      })
      .filter((x): x is JobCard => x !== null);

    return c.json({ jobs: cards });
  });

  // ── Single job ──────────────────────────────────────────────────────────

  app.get('/:jobId', async (c) => {
    const { userId } = requireAuth(c);
    const jobId = c.req.param('jobId');
    const job = await deps.jobs.getById(jobId);
    if (!job) throw new HTTPException(404, { message: 'job not found' });

    const now = new Date();
    const profile = await deps.profiles.getOrEmpty(userId);
    const eligibility = evaluate(profile, job, now);
    const fit = fitFor(profile, job, now);
    const record = await deps.saved.get(userId, jobId);

    return c.json({
      job,
      eligibility,
      ...(fit ? { fit } : {}),
      applicationStatus: record?.status ?? null,
      daysLeft: daysLeft(job.applicationDeadline, now),
    });
  });

  /**
   * Full per-rule verdict. Separate from the job payload so the UI can
   * re-check after a profile edit without re-fetching the whole record.
   */
  app.get('/:jobId/eligibility', async (c) => {
    const { userId } = requireAuth(c);
    const jobId = c.req.param('jobId');
    const job = await deps.jobs.getById(jobId);
    if (!job) throw new HTTPException(404, { message: 'job not found' });

    const now = new Date();
    const profile = await deps.profiles.getOrEmpty(userId);
    const eligibility = evaluate(profile, job, now);
    const fit = fitFor(profile, job, now);

    return c.json({
      jobId,
      jobVersion: job.version,
      eligibility,
      ...(fit ? { fit } : {}),
      // Surfaced so the UI can label provenance and warn appropriately.
      sourceTrustLevel: job.sourceTrustLevel,
      sourceDocuments: job.sourceDocuments ?? [],
    });
  });

  // ── Save / track ────────────────────────────────────────────────────────

  app.post('/:jobId/save', async (c) => {
    const { userId } = requireAuth(c);
    const jobId = c.req.param('jobId');
    const job = await deps.jobs.getById(jobId);
    if (!job) throw new HTTPException(404, { message: 'job not found' });
    const record = await deps.saved.save(userId, jobId);
    return c.json({ record });
  });

  app.delete('/:jobId/save', async (c) => {
    const { userId } = requireAuth(c);
    await deps.saved.unsave(userId, c.req.param('jobId'));
    return c.json({ success: true });
  });

  app.post('/:jobId/application-status', async (c) => {
    const { userId } = requireAuth(c);
    const jobId = c.req.param('jobId');
    const body = await c.req.json().catch(() => ({}));
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `status must be one of ${APPLICATION_STATUSES.join(', ')}`,
      });
    }
    const job = await deps.jobs.getById(jobId);
    if (!job) throw new HTTPException(404, { message: 'job not found' });

    const record = await deps.saved.setStatus(userId, jobId, parsed.data.status, parsed.data.notes);
    deps.logger.info('jobs.application_status', { userId, jobId, status: parsed.data.status });
    return c.json({ record });
  });

  return app;
}
