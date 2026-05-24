import type { ExamSlug } from '../types/brand.js';
import { asExamSlug } from '../types/brand.js';
import type { Exam, ExamCategory } from '../types/exam.js';

/**
 * Master catalog of supported and roadmap exams.
 *
 * Mirrors apps/marketing/src/data/exams.ts -- the marketing site has its own
 * copy intentionally so it can be deployed as a static site without pulling
 * in the workspace package. Keep them in sync when adding new exams.
 */
export const EXAMS: readonly Exam[] = [
  // --- MVP wedge ---
  { id: asExamSlug('class-11-cbse'),  name: 'Class 11 (CBSE)',     category: 'school',         status: 'live' },
  { id: asExamSlug('class-12-cbse'),  name: 'Class 12 (CBSE)',     category: 'school',         status: 'live' },
  { id: asExamSlug('jee-main'),       name: 'JEE Main',            category: 'engineering',    status: 'live' },
  { id: asExamSlug('jee-advanced'),   name: 'JEE Advanced',        category: 'engineering',    status: 'live' },
  { id: asExamSlug('neet-ug'),        name: 'NEET UG',             category: 'medical',        status: 'live' },

  // --- Phase 2 expansion ---
  { id: asExamSlug('class-10-cbse'),  name: 'Class 10 (CBSE)',     category: 'school',         status: 'live' },
  { id: asExamSlug('class-9-cbse'),   name: 'Class 9 (CBSE)',      category: 'school',         status: 'live' },
  { id: asExamSlug('class-8-cbse'),   name: 'Class 8 (CBSE)',      category: 'school',         status: 'live' },

  // --- Phase 3 ---
  { id: asExamSlug('ssc-cgl'),        name: 'SSC CGL',             category: 'civil-services', status: 'live' },
  { id: asExamSlug('ssc-chsl'),       name: 'SSC CHSL',            category: 'civil-services', status: 'live' },
  { id: asExamSlug('ibps-po'),        name: 'IBPS PO / Clerk',     category: 'banking',        status: 'live' },
  { id: asExamSlug('sbi-po'),         name: 'SBI PO',              category: 'banking',        status: 'live' },
  { id: asExamSlug('rrb-ntpc'),       name: 'RRB NTPC',            category: 'civil-services', status: 'live' },

  // --- Phase 4 ---
  { id: asExamSlug('upsc-cse'),       name: 'UPSC CSE',            category: 'civil-services', status: 'live' },
  { id: asExamSlug('state-psc'),      name: 'State PSCs',          category: 'state',          status: 'live' },
  { id: asExamSlug('nda'),            name: 'NDA',                 category: 'defence',        status: 'live' },
  { id: asExamSlug('cds'),            name: 'CDS',                 category: 'defence',        status: 'live' },
  { id: asExamSlug('agniveer'),       name: 'Agniveer',            category: 'defence',        status: 'live' },
  { id: asExamSlug('capf'),           name: 'CAPF',                category: 'defence',        status: 'live' },
] as const;

export const LIVE_EXAMS = EXAMS.filter((e) => e.status === 'live');
export const SOON_EXAMS = EXAMS.filter((e) => e.status === 'soon');

/** Map of exam slug -> exam, for O(1) lookup. */
export const EXAM_BY_SLUG: ReadonlyMap<ExamSlug, Exam> = new Map(
  EXAMS.map((e) => [e.id, e]),
);

export const EXAM_CATEGORY_LABELS: Readonly<Record<ExamCategory, string>> = {
  'school': 'School (Class 8-12)',
  'engineering': 'Engineering entrance',
  'medical': 'Medical entrance',
  'civil-services': 'Civil services & SSC',
  'banking': 'Banking',
  'defence': 'Defence',
  'state': 'State exams',
};

/** Type guard usable in API validation. */
export const isExamSlug = (value: unknown): value is ExamSlug =>
  typeof value === 'string' && EXAM_BY_SLUG.has(value as ExamSlug);
