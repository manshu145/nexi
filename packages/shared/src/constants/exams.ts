import type { ExamSlug } from '../types/brand.js';
import { asExamSlug } from '../types/brand.js';
import type { Exam, ExamCategory } from '../types/exam.js';

/**
 * Master catalog of supported exams.
 * ALL exams are status: 'live' — no more "coming soon" gates.
 * From Class 5 to UPSC, covering Hindi-belt boards + competitive exams.
 */
export const EXAMS: readonly Exam[] = [
  // ─── School (CBSE) ───
  { id: asExamSlug('class-5-cbse'),   name: 'Class 5 (CBSE)',     category: 'school',         status: 'live' },
  { id: asExamSlug('class-6-cbse'),   name: 'Class 6 (CBSE)',     category: 'school',         status: 'live' },
  { id: asExamSlug('class-7-cbse'),   name: 'Class 7 (CBSE)',     category: 'school',         status: 'live' },
  { id: asExamSlug('class-8-cbse'),   name: 'Class 8 (CBSE)',     category: 'school',         status: 'live' },
  { id: asExamSlug('class-9-cbse'),   name: 'Class 9 (CBSE)',     category: 'school',         status: 'live' },
  { id: asExamSlug('class-10-cbse'),  name: 'Class 10 (CBSE)',    category: 'school',         status: 'live' },
  { id: asExamSlug('class-11-cbse'),  name: 'Class 11 (CBSE)',    category: 'school',         status: 'live' },
  { id: asExamSlug('class-12-cbse'),  name: 'Class 12 (CBSE)',    category: 'school',         status: 'live' },

  // ─── School (ICSE) ───
  { id: asExamSlug('class-10-icse'),  name: 'Class 10 (ICSE)',    category: 'school',         status: 'live' },
  { id: asExamSlug('class-12-isc'),   name: 'Class 12 (ISC)',     category: 'school',         status: 'live' },

  // ─── School (State Boards — Hindi belt) ───
  { id: asExamSlug('up-board-10'),    name: 'UP Board Class 10',  category: 'school',         status: 'live' },
  { id: asExamSlug('up-board-12'),    name: 'UP Board Class 12',  category: 'school',         status: 'live' },
  { id: asExamSlug('mp-board-10'),    name: 'MP Board Class 10',  category: 'school',         status: 'live' },
  { id: asExamSlug('mp-board-12'),    name: 'MP Board Class 12',  category: 'school',         status: 'live' },
  { id: asExamSlug('bihar-board-10'), name: 'Bihar Board Class 10', category: 'school',       status: 'live' },
  { id: asExamSlug('bihar-board-12'), name: 'Bihar Board Class 12', category: 'school',       status: 'live' },
  { id: asExamSlug('rajasthan-board-10'), name: 'Rajasthan Board 10', category: 'school',     status: 'live' },
  { id: asExamSlug('rajasthan-board-12'), name: 'Rajasthan Board 12', category: 'school',     status: 'live' },
  { id: asExamSlug('jharkhand-board'), name: 'Jharkhand Board',   category: 'school',         status: 'live' },
  { id: asExamSlug('cg-board'),       name: 'CG Board',           category: 'school',         status: 'live' },
  { id: asExamSlug('uttarakhand-board'), name: 'Uttarakhand Board', category: 'school',       status: 'live' },
  { id: asExamSlug('haryana-board'),  name: 'Haryana Board',      category: 'school',         status: 'live' },

  // ─── Engineering ───
  { id: asExamSlug('jee-main'),       name: 'JEE Main',           category: 'engineering',    status: 'live' },
  { id: asExamSlug('jee-advanced'),   name: 'JEE Advanced',       category: 'engineering',    status: 'live' },
  { id: asExamSlug('bitsat'),         name: 'BITSAT',             category: 'engineering',    status: 'live' },
  { id: asExamSlug('viteee'),         name: 'VITEEE',             category: 'engineering',    status: 'live' },

  // ─── Medical ───
  { id: asExamSlug('neet-ug'),        name: 'NEET UG',            category: 'medical',        status: 'live' },
  { id: asExamSlug('aiims-pg'),       name: 'AIIMS PG / NEET PG', category: 'medical',       status: 'live' },

  // ─── Civil Services + SSC ───
  { id: asExamSlug('upsc-cse'),       name: 'UPSC CSE (IAS/IPS)', category: 'civil-services', status: 'live' },
  { id: asExamSlug('upsc-capf'),      name: 'UPSC CAPF',          category: 'civil-services', status: 'live' },
  { id: asExamSlug('ssc-cgl'),        name: 'SSC CGL',            category: 'civil-services', status: 'live' },
  { id: asExamSlug('ssc-chsl'),       name: 'SSC CHSL',           category: 'civil-services', status: 'live' },
  { id: asExamSlug('ssc-mts'),        name: 'SSC MTS',            category: 'civil-services', status: 'live' },
  { id: asExamSlug('ssc-gd'),         name: 'SSC GD Constable',   category: 'civil-services', status: 'live' },

  // ─── State PSC ───
  { id: asExamSlug('uppsc'),          name: 'UPPSC (UP PCS)',     category: 'state',          status: 'live' },
  { id: asExamSlug('mppsc'),          name: 'MPPSC',              category: 'state',          status: 'live' },
  { id: asExamSlug('bpsc'),           name: 'BPSC (Bihar PSC)',   category: 'state',          status: 'live' },
  { id: asExamSlug('rpsc'),           name: 'RPSC (Rajasthan)',   category: 'state',          status: 'live' },
  { id: asExamSlug('jpsc'),           name: 'JPSC (Jharkhand)',   category: 'state',          status: 'live' },
  { id: asExamSlug('ukpsc'),          name: 'UKPSC (Uttarakhand)', category: 'state',         status: 'live' },
  { id: asExamSlug('cgpsc'),          name: 'CGPSC (Chhattisgarh)', category: 'state',        status: 'live' },

  // ─── Banking ───
  { id: asExamSlug('ibps-po'),        name: 'IBPS PO',            category: 'banking',        status: 'live' },
  { id: asExamSlug('ibps-clerk'),     name: 'IBPS Clerk',         category: 'banking',        status: 'live' },
  { id: asExamSlug('sbi-po'),         name: 'SBI PO',             category: 'banking',        status: 'live' },
  { id: asExamSlug('sbi-clerk'),      name: 'SBI Clerk',          category: 'banking',        status: 'live' },
  { id: asExamSlug('rbi-grade-b'),    name: 'RBI Grade B',        category: 'banking',        status: 'live' },

  // ─── Railways ───
  { id: asExamSlug('rrb-ntpc'),       name: 'RRB NTPC',           category: 'civil-services', status: 'live' },
  { id: asExamSlug('rrb-group-d'),    name: 'RRB Group D',        category: 'civil-services', status: 'live' },
  { id: asExamSlug('rrb-je'),         name: 'RRB JE',             category: 'civil-services', status: 'live' },

  // ─── Defence ───
  { id: asExamSlug('nda'),            name: 'NDA',                category: 'defence',        status: 'live' },
  { id: asExamSlug('cds'),            name: 'CDS',                category: 'defence',        status: 'live' },
  { id: asExamSlug('agniveer'),       name: 'Agniveer (Army/Navy/AF)', category: 'defence',   status: 'live' },
  { id: asExamSlug('afcat'),          name: 'AFCAT',              category: 'defence',        status: 'live' },

  // ─── Law ───
  { id: asExamSlug('clat'),           name: 'CLAT',               category: 'law',            status: 'live' },
  { id: asExamSlug('ailet'),          name: 'AILET (NLU Delhi)',  category: 'law',            status: 'live' },

  // ─── Management ───
  { id: asExamSlug('cat'),            name: 'CAT (IIMs)',         category: 'management',     status: 'live' },
  { id: asExamSlug('cuet-ug'),        name: 'CUET UG',            category: 'school',         status: 'live' },
  { id: asExamSlug('cuet-pg'),        name: 'CUET PG',            category: 'management',     status: 'live' },

  // ─── Teaching ───
  { id: asExamSlug('ctet'),           name: 'CTET',               category: 'civil-services', status: 'live' },
  { id: asExamSlug('uptet'),          name: 'UPTET / SUPER TET',  category: 'civil-services', status: 'live' },

  // ─── Nursing / Paramedical ───
  { id: asExamSlug('nursing-officer'), name: 'Nursing Officer',   category: 'medical',        status: 'live' },

  // ─── Professional Skills ───
  { id: asExamSlug('it-fundamentals'), name: 'IT Fundamentals', category: 'professional-skills', status: 'live' },
  { id: asExamSlug('python-basics'), name: 'Python Programming', category: 'professional-skills', status: 'live' },
  { id: asExamSlug('data-science'), name: 'Data Science', category: 'professional-skills', status: 'live' },
  { id: asExamSlug('web-development'), name: 'Web Development', category: 'professional-skills', status: 'live' },
  { id: asExamSlug('digital-marketing'), name: 'Digital Marketing', category: 'professional-skills', status: 'live' },
  { id: asExamSlug('tally-accounting'), name: 'Tally & Accounting', category: 'professional-skills', status: 'live' },
] as const;

export const LIVE_EXAMS = EXAMS.filter((e) => e.status === 'live');
export const SOON_EXAMS = EXAMS.filter((e) => e.status === 'soon');

export const EXAM_BY_SLUG: ReadonlyMap<ExamSlug, Exam> = new Map(
  EXAMS.map((e) => [e.id, e]),
);

/**
 * Type guard: is this string a known exam slug?
 * Used by Zod refinement in schemas/user.ts.
 */
export function isExamSlug(value: unknown): value is ExamSlug {
  return (
    typeof value === 'string' && EXAM_BY_SLUG.has(value as ExamSlug)
  );
}
