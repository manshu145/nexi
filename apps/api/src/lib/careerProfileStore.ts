/**
 * Career Profile persistence.
 *
 * One document per user at `careerProfiles/{userId}`. This is the "fill it
 * once, reuse it for every vacancy" record that drives eligibility — the
 * whole point of the Jobs feature is that a student never re-answers the
 * same age/degree/domicile question for the 40th notification.
 *
 * ── Two invariants this store enforces ───────────────────────────────────
 *
 * 1. `profileVersion` increments on EVERY mutation. It is half of the
 *    eligibility cache key (`user:profileVersion:job:jobVersion`), so a
 *    bump is what invalidates cached verdicts. Forgetting to bump would
 *    serve a student a stale "not eligible" after they fixed their profile —
 *    so the bump lives here, in the store, not at the call sites.
 *
 * 2. Age is never persisted. Only `dateOfBirth` is stored. Every
 *    recruitment reckons age against its own cutoff date, so a derived age
 *    field would rot silently and produce wrong statutory verdicts.
 *
 * Sensitive fields (category, PwBD status, disability percentage) are only
 * written when the caller has recorded consent — see `sensitiveDataConsent`.
 * This collection is registered in lib/userData.ts so DPDP export and
 * erasure both cover it automatically.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type {
  CareerProfile,
  EducationRecord,
  ExamRecord,
  ExperienceRecord,
} from '@nexigrate/shared';
import { normaliseDegree, normaliseDiscipline, normaliseSkills } from '@nexigrate/shared';

export const CAREER_PROFILE_COLLECTION = 'careerProfiles';

/**
 * Fields the client may send. Deliberately excludes `userId`,
 * `profileVersion`, `createdAt` and `updatedAt` — those are server-owned.
 */
export type CareerProfilePatch = Partial<
  Omit<CareerProfile, 'userId' | 'profileVersion' | 'createdAt' | 'updatedAt'>
>;

/** Progressive-profiling weights: which fields matter most for matching. */
const COMPLETENESS_FIELDS: ReadonlyArray<{
  key: string;
  label: string;
  weight: number;
  has: (p: CareerProfile) => boolean;
}> = [
  { key: 'dateOfBirth', label: 'Date of birth', weight: 20, has: (p) => !!p.dateOfBirth },
  { key: 'education', label: 'Education', weight: 20, has: (p) => p.education.length > 0 },
  { key: 'domicileState', label: 'Domicile state', weight: 12, has: (p) => !!p.domicileState },
  { key: 'category', label: 'Category', weight: 10, has: (p) => !!p.category },
  { key: 'nationality', label: 'Nationality', weight: 8, has: (p) => !!p.nationality },
  {
    key: 'education.percentage',
    label: 'Graduation marks',
    weight: 10,
    has: (p) => p.education.some((e) => e.percentage !== undefined || e.cgpa !== undefined),
  },
  { key: 'experience', label: 'Work experience', weight: 10, has: (p) => p.experience.length > 0 },
  { key: 'skills', label: 'Skills', weight: 6, has: (p) => p.skills.length > 0 },
  { key: 'preferredLocations', label: 'Preferred locations', weight: 4, has: (p) => (p.preferredLocations?.length ?? 0) > 0 },
];

export interface ProfileCompleteness {
  /** 0-100. */
  percent: number;
  /** Fields still worth collecting, highest impact first. */
  missing: Array<{ key: string; label: string; weight: number }>;
}

/**
 * Score how complete a profile is, and what to ask for next.
 *
 * Used by the UI to show "Career Profile: 72% complete" plus a prioritised
 * "complete these to unlock more accurate matching" list, rather than
 * dumping 60 onboarding questions on a new user.
 */
export function profileCompleteness(profile: CareerProfile): ProfileCompleteness {
  let earned = 0;
  let total = 0;
  const missing: Array<{ key: string; label: string; weight: number }> = [];
  for (const field of COMPLETENESS_FIELDS) {
    total += field.weight;
    if (field.has(profile)) earned += field.weight;
    else missing.push({ key: field.key, label: field.label, weight: field.weight });
  }
  missing.sort((a, b) => b.weight - a.weight);
  return {
    percent: total === 0 ? 0 : Math.round((earned / total) * 100),
    missing,
  };
}

/** A brand-new empty profile. Never persisted until the first mutation. */
export function emptyProfile(userId: string, now = new Date().toISOString()): CareerProfile {
  return {
    userId,
    education: [],
    experience: [],
    skills: [],
    exams: [],
    profileVersion: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Normalisation on write ───────────────────────────────────────────────

let idCounter = 0;
function ensureId(prefix: string, existing?: string): string {
  if (existing && existing.length > 0) return existing;
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

/**
 * Resolve canonical slugs at WRITE time, not read time.
 *
 * The eligibility engine compares canonical forms. Doing the normalisation
 * once on save keeps the hot matching path free of string munging, and means
 * a taxonomy improvement only needs a re-save rather than a schema change.
 */
function normaliseEducation(records: EducationRecord[]): EducationRecord[] {
  return records.map((r) => {
    const family = normaliseDegree(r.degree);
    const discipline = normaliseDiscipline(r.discipline);
    return {
      ...r,
      id: ensureId('edu', r.id),
      ...(family ? { degreeFamily: family } : {}),
      ...(discipline ? { disciplineSlug: discipline } : {}),
      // A completed qualification cannot also be awaiting a result.
      ...(r.completed ? { resultAwaited: false } : {}),
    };
  });
}

function normaliseExperience(records: ExperienceRecord[]): ExperienceRecord[] {
  return records.map((r) => ({
    ...r,
    id: ensureId('exp', r.id),
    ...(r.skills ? { skills: normaliseSkills(r.skills) } : {}),
    // A current role must not carry a stale end date.
    ...(r.current ? { endDate: undefined } : {}),
  }));
}

function normaliseExams(records: ExamRecord[]): ExamRecord[] {
  return records.map((r) => ({
    ...r,
    id: ensureId('exam', r.id),
    exam: r.exam.trim().toUpperCase().replace(/[\s-]+/g, '_'),
  }));
}

/** Strip `undefined` — the Firestore Admin SDK rejects it. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? stripUndefined(item as Record<string, unknown>)
          : item,
      );
    } else if (v && typeof v === 'object') {
      out[k] = stripUndefined(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Apply a patch, normalise it, and bump the version.
 *
 * Array fields are REPLACED wholesale rather than merged, because the client
 * always sends the full list when editing education/experience/skills/exams.
 * Merging would make deleting a row impossible.
 */
export function applyPatch(current: CareerProfile, patch: CareerProfilePatch): CareerProfile {
  const now = new Date().toISOString();
  const next: CareerProfile = {
    ...current,
    ...patch,
    userId: current.userId,
    education: patch.education ? normaliseEducation(patch.education) : current.education,
    experience: patch.experience ? normaliseExperience(patch.experience) : current.experience,
    exams: patch.exams ? normaliseExams(patch.exams) : current.exams,
    skills: patch.skills ? normaliseSkills(patch.skills) : current.skills,
    profileVersion: current.profileVersion + 1,
    createdAt: current.createdAt,
    updatedAt: now,
  };
  return next;
}

// ─── Store interface ──────────────────────────────────────────────────────

export interface CareerProfileStore {
  /** Read the stored profile, or null when the user has never saved one. */
  get(userId: string): Promise<CareerProfile | null>;
  /**
   * Read the profile, falling back to an empty one so callers can always
   * evaluate eligibility (which will report PROFILE_INCOMPLETE).
   */
  getOrEmpty(userId: string): Promise<CareerProfile>;
  /** Merge a patch, bump `profileVersion`, persist, return the new profile. */
  update(userId: string, patch: CareerProfilePatch): Promise<CareerProfile>;
  delete(userId: string): Promise<void>;
}

// ─── Firestore implementation ─────────────────────────────────────────────

export class FirestoreCareerProfileStore implements CareerProfileStore {
  constructor(private readonly db: Firestore) {}

  private doc(userId: string) {
    return this.db.collection(CAREER_PROFILE_COLLECTION).doc(userId);
  }

  async get(userId: string): Promise<CareerProfile | null> {
    const snap = await this.doc(userId).get();
    if (!snap.exists) return null;
    const data = snap.data() as Partial<CareerProfile>;
    // Defensive: tolerate documents written before a field existed.
    return {
      ...emptyProfile(userId, data.createdAt),
      ...data,
      userId,
      education: data.education ?? [],
      experience: data.experience ?? [],
      skills: data.skills ?? [],
      exams: data.exams ?? [],
      profileVersion: data.profileVersion ?? 1,
    } as CareerProfile;
  }

  async getOrEmpty(userId: string): Promise<CareerProfile> {
    return (await this.get(userId)) ?? emptyProfile(userId);
  }

  async update(userId: string, patch: CareerProfilePatch): Promise<CareerProfile> {
    // Transaction so two concurrent edits cannot land on the same
    // profileVersion — which would leave a cached verdict looking fresh
    // when it is actually stale.
    return this.db.runTransaction(async (txn) => {
      const ref = this.doc(userId);
      const snap = await txn.get(ref);
      const current = snap.exists
        ? ({
            ...emptyProfile(userId),
            ...(snap.data() as Partial<CareerProfile>),
            userId,
          } as CareerProfile)
        : emptyProfile(userId);
      const next = applyPatch(current, patch);
      txn.set(ref, stripUndefined(next as unknown as Record<string, unknown>), { merge: false });
      return next;
    });
  }

  async delete(userId: string): Promise<void> {
    await this.doc(userId).delete();
  }
}

// ─── In-memory implementation (tests / no-Firestore dev) ──────────────────

export class InMemoryCareerProfileStore implements CareerProfileStore {
  private docs = new Map<string, CareerProfile>();

  async get(userId: string): Promise<CareerProfile | null> {
    return this.docs.get(userId) ?? null;
  }

  async getOrEmpty(userId: string): Promise<CareerProfile> {
    return this.docs.get(userId) ?? emptyProfile(userId);
  }

  async update(userId: string, patch: CareerProfilePatch): Promise<CareerProfile> {
    const current = this.docs.get(userId) ?? emptyProfile(userId);
    const next = applyPatch(current, patch);
    this.docs.set(userId, next);
    return next;
  }

  async delete(userId: string): Promise<void> {
    this.docs.delete(userId);
  }
}
