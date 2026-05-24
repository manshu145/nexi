import type { Firestore } from 'firebase-admin/firestore';
import {
  asExamSlug,
  asISODateTime,
  type ExamDate,
  type ExamSlug,
} from '@nexigrate/shared';

/**
 * Phase 12 -- dashboard countdown widget.
 *
 * Exam dates are administered manually for now (an admin CMS will land
 * with Phase 17). The InMemory store is seeded with high-confidence
 * upcoming events so a fresh deploy already shows useful countdowns.
 *
 * The Firestore store falls back to the seed when the collection is
 * empty, so day-1 prod also has data without a one-off migration.
 */
export interface ExamDatesStore {
  list(exam: ExamSlug): Promise<ExamDate[]>;
  put(date: ExamDate): Promise<void>;
}

const COLLECTION = 'exam_dates';
const SEED_GENERATED_AT = asISODateTime('2026-05-24T00:00:00.000Z');

/**
 * Hand-curated seed dates. Every entry has an isOfficial flag and a
 * source; tentative dates announce themselves in the UI as such.
 *
 * Sources are the most recent NTA / CBSE / UPSC notifications I could
 * verify at the seeding date. Operators are expected to refresh these
 * as official notifications drop.
 */
export const SEED_EXAM_DATES: ExamDate[] = [
  {
    id: 'jee-main-2027-s1',
    exam: asExamSlug('jee-main'),
    eventName: 'JEE Main 2027 - Session 1 (tentative)',
    eventDate: '2027-01-22',
    eventType: 'exam',
    source: 'NTA, prior years window (Jan 22 - Feb 02)',
    isOfficial: false,
    createdAt: SEED_GENERATED_AT,
    updatedAt: SEED_GENERATED_AT,
  },
  {
    id: 'jee-main-2027-s2',
    exam: asExamSlug('jee-main'),
    eventName: 'JEE Main 2027 - Session 2 (tentative)',
    eventDate: '2027-04-02',
    eventType: 'exam',
    source: 'NTA, prior years window (Apr 02 - 12)',
    isOfficial: false,
    createdAt: SEED_GENERATED_AT,
    updatedAt: SEED_GENERATED_AT,
  },
  {
    id: 'jee-advanced-2027',
    exam: asExamSlug('jee-advanced'),
    eventName: 'JEE Advanced 2027 (tentative)',
    eventDate: '2027-05-23',
    eventType: 'exam',
    source: 'IIT, last Sunday of May (recurring)',
    isOfficial: false,
    createdAt: SEED_GENERATED_AT,
    updatedAt: SEED_GENERATED_AT,
  },
  {
    id: 'neet-ug-2027',
    exam: asExamSlug('neet-ug'),
    eventName: 'NEET UG 2027 (tentative)',
    eventDate: '2027-05-02',
    eventType: 'exam',
    source: 'NTA, first Sunday of May (recurring)',
    isOfficial: false,
    createdAt: SEED_GENERATED_AT,
    updatedAt: SEED_GENERATED_AT,
  },
  {
    id: 'cbse-12-2027',
    exam: asExamSlug('class-12-cbse'),
    eventName: 'CBSE Class 12 board exams 2027 (tentative)',
    eventDate: '2027-02-15',
    eventType: 'exam',
    source: 'CBSE, prior years (Feb 15 - Apr 04)',
    isOfficial: false,
    createdAt: SEED_GENERATED_AT,
    updatedAt: SEED_GENERATED_AT,
  },
  {
    id: 'cbse-11-2027',
    exam: asExamSlug('class-11-cbse'),
    eventName: 'Class 11 final exam window (school)',
    eventDate: '2027-02-15',
    eventType: 'exam',
    source: 'CBSE annual cycle (school-set)',
    isOfficial: false,
    createdAt: SEED_GENERATED_AT,
    updatedAt: SEED_GENERATED_AT,
  },
];

function todayUtcIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export class InMemoryExamDatesStore implements ExamDatesStore {
  private rows: ExamDate[] = [...SEED_EXAM_DATES];

  async list(exam: ExamSlug): Promise<ExamDate[]> {
    const today = todayUtcIsoDate();
    return this.rows
      .filter((r) => r.exam === exam && r.eventDate >= today)
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  }

  async put(date: ExamDate): Promise<void> {
    const idx = this.rows.findIndex((r) => r.id === date.id);
    if (idx >= 0) this.rows[idx] = date;
    else this.rows.push(date);
  }
}

export class FirestoreExamDatesStore implements ExamDatesStore {
  constructor(
    private readonly db: Firestore,
    private readonly fallback: ExamDatesStore = new InMemoryExamDatesStore(),
  ) {}

  async list(exam: ExamSlug): Promise<ExamDate[]> {
    const today = todayUtcIsoDate();
    const snap = await this.db
      .collection(COLLECTION)
      .where('exam', '==', exam)
      .where('eventDate', '>=', today)
      .orderBy('eventDate', 'asc')
      .limit(20)
      .get();
    if (snap.empty) {
      return this.fallback.list(exam);
    }
    return snap.docs.map((d) => d.data() as ExamDate);
  }

  async put(date: ExamDate): Promise<void> {
    await this.db.collection(COLLECTION).doc(date.id).set(date);
  }
}
