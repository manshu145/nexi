import type {
  ExamSlug,
  ISODateTime,
  StudentProfileId,
  UserId,
} from './brand.js';
import type { Board, ClassLevel } from './exam.js';
import type { StreakBadge } from './mcq.js';

/**
 * User and student-profile types.
 *
 * `User` is the auth identity (one-to-one with a Firebase Auth UID).
 * `StudentProfile` is the educational identity (target exam, school, etc.)
 * created during onboarding and updated when the student switches focus.
 *
 * They are deliberately split: a future `User` could become a parent, teacher,
 * or admin without touching the student-only schema.
 */

export type AuthProvider = 'google' | 'phone';

export interface User {
  id: UserId;
  /** Firebase Auth UID -- equal to `id`. Stored explicitly for clarity. */
  firebaseUid: string;
  /** Authoritative email when available (Google sign-in). May be empty for phone-only users. */
  email: string;
  /** E.164 phone number with country code (e.g. "+919876543210") if collected. */
  phone: string | null;
  /** Display name, free-form. */
  name: string;
  /** Cloud Storage path of the profile photo, or null. */
  photoPath: string | null;
  /** Provider used at first sign-in. */
  primaryProvider: AuthProvider;
  /** Custom claims mirror, kept in sync from the Firebase token. */
  isAdmin: boolean;
  /** Did the user pass identity verification? */
  isVerified: boolean;
  /** Are they under 18? Drives the parental-consent flow. */
  isMinor: boolean;
  /** Locale tag (e.g. "en-IN"). */
  locale: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  /** Soft-delete flag, set when the user requests deletion under DPDP. */
  deletedAt: ISODateTime | null;
  /**
   * Streak-milestone badges the user has earned over their lifetime.
   * Append-only (a 7-day badge stays even after the streak resets).
   */
  streakBadges?: StreakBadge[];
}

export type ParentalConsentStatus = 'not_required' | 'pending' | 'granted' | 'revoked';

export interface StudentProfile {
  id: StudentProfileId;
  userId: UserId;
  /** Primary target exam (the one shown on the dashboard). */
  targetExam: ExamSlug;
  /** Other exams the student is preparing for, ordered by recency. */
  secondaryExams: ExamSlug[];
  classLevel: ClassLevel | null;
  board: Board | null;
  schoolName: string | null;
  district: string | null;
  state: string | null;
  /** Date of birth as ISO date (YYYY-MM-DD). null if not collected yet. */
  dateOfBirth: string | null;
  parentalConsent: ParentalConsentStatus;
  /** ISO datetime of the last consent grant or revoke event. */
  parentalConsentAt: ISODateTime | null;
  /** Optional parent contact captured for consent flow. */
  parentEmail: string | null;
  parentPhone: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
