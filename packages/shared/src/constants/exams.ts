import type { ExamSlug } from '../types/brand.js';
import { asExamSlug } from '../types/brand.js';
import type { Exam, ExamCategory } from '../types/exam.js';

/**
 * Master catalog of ALL supported exams.
 *
 * Phase D: Every exam is now 'live'. No "coming soon" gates.
 * Covers Class 5–12 (CBSE + Hindi-belt state boards), graduation,
 * and all major competitive exams across engineering, medical, civil
 * services, banking, defence, law, management, teaching, and university.
 */
export const EXAMS: readonly Exam[] = [
  /* ═══════════════════════════════════════════════════════════════════
     SCHOOL — Class 5 to 12 (CBSE)
     ═══════════════════════════════════════════════════════════════════ */
  { id: asExamSlug('class-5-cbse'),   name: 'Class 5 (CBSE)',      category: 'school', status: 'live' },
  { id: asExamSlug('class-6-cbse'),   name: 'Class 6 (CBSE)',      category: 'school', status: 'live' },
  { id: asExamSlug('class-7-cbse'),   name: 'Class 7 (CBSE)',      category: 'school', status: 'live' },
  { id: asExamSlug('class-8-cbse'),   name: 'Class 8 (CBSE)',      category: 'school', status: 'live' },
  { id: asExamSlug('class-9-cbse'),   name: 'Class 9 (CBSE)',      category: 'school', status: 'live' },
  { id: asExamSlug('class-10-cbse'),  name: 'Class 10 (CBSE)',     category: 'school', status: 'live' },
  { id: asExamSlug('class-11-cbse'),  name: 'Class 11 (CBSE)',     category: 'school', status: 'live' },
  { id: asExamSlug('class-12-cbse'),  name: 'Class 12 (CBSE)',     category: 'school', status: 'live' },

  /* ═══ SCHOOL — ICSE / ISC ═══ */
  { id: asExamSlug('class-10-icse'),  name: 'Class 10 (ICSE)',     category: 'school', status: 'live' },
  { id: asExamSlug('class-12-isc'),   name: 'Class 12 (ISC)',      category: 'school', status: 'live' },

  /* ═══ SCHOOL — State Boards (Hindi-belt & Central India) ═══ */
  { id: asExamSlug('up-board-10'),    name: 'UP Board (10th)',     category: 'school', status: 'live' },
  { id: asExamSlug('up-board-12'),    name: 'UP Board (12th)',     category: 'school', status: 'live' },
  { id: asExamSlug('mp-board-10'),    name: 'MP Board (10th)',     category: 'school', status: 'live' },
  { id: asExamSlug('mp-board-12'),    name: 'MP Board (12th)',     category: 'school', status: 'live' },
  { id: asExamSlug('bihar-board-10'), name: 'Bihar Board (10th)',  category: 'school', status: 'live' },
  { id: asExamSlug('bihar-board-12'), name: 'Bihar Board (12th)',  category: 'school', status: 'live' },
  { id: asExamSlug('rajasthan-board-10'), name: 'RBSE (10th)',     category: 'school', status: 'live' },
  { id: asExamSlug('rajasthan-board-12'), name: 'RBSE (12th)',     category: 'school', status: 'live' },
  { id: asExamSlug('cgbse-10'),       name: 'CGBSE (10th)',        category: 'school', status: 'live' },
  { id: asExamSlug('cgbse-12'),       name: 'CGBSE (12th)',        category: 'school', status: 'live' },
  { id: asExamSlug('jkbose-10'),      name: 'JKBOSE (10th)',       category: 'school', status: 'live' },
  { id: asExamSlug('jkbose-12'),      name: 'JKBOSE (12th)',       category: 'school', status: 'live' },
  { id: asExamSlug('uttarakhand-board-10'), name: 'Uttarakhand Board (10th)', category: 'school', status: 'live' },
  { id: asExamSlug('uttarakhand-board-12'), name: 'Uttarakhand Board (12th)', category: 'school', status: 'live' },
  { id: asExamSlug('jharkhand-board-10'), name: 'JAC (10th)',      category: 'school', status: 'live' },
  { id: asExamSlug('jharkhand-board-12'), name: 'JAC (12th)',      category: 'school', status: 'live' },
  { id: asExamSlug('hbse-10'),        name: 'HBSE (10th)',         category: 'school', status: 'live' },
  { id: asExamSlug('hbse-12'),        name: 'HBSE (12th)',         category: 'school', status: 'live' },
  { id: asExamSlug('pseb-10'),        name: 'PSEB (10th)',         category: 'school', status: 'live' },
  { id: asExamSlug('pseb-12'),        name: 'PSEB (12th)',         category: 'school', status: 'live' },

  /* ═══════════════════════════════════════════════════════════════════
     ENGINEERING ENTRANCE
     ═══════════════════════════════════════════════════════════════════ */
  { id: asExamSlug('jee-main'),       name: 'JEE Main',            category: 'engineering', status: 'live' },
  { id: asExamSlug('jee-advanced'),   name: 'JEE Advanced',        category: 'engineering', status: 'live' },
  { id: asExamSlug('bitsat'),         name: 'BITSAT',              category: 'engineering', status: 'live' },
  { id: asExamSlug('viteee'),         name: 'VITEEE',              category: 'engineering', status: 'live' },
  { id: asExamSlug('srmjeee'),        name: 'SRMJEEE',             category: 'engineering', status: 'live' },
  { id: asExamSlug('wbjee'),          name: 'WBJEE',               category: 'engineering', status: 'live' },
  { id: asExamSlug('mht-cet'),        name: 'MHT CET',             category: 'engineering', status: 'live' },

  /* ═══════════════════════════════════════════════════════════════════
     MEDICAL ENTRANCE
     ═══════════════════════════════════════════════════════════════════ */
  { id: asExamSlug('neet-ug'),        name: 'NEET UG',             category: 'medical', status: 'live' },
  { id: asExamSlug('neet-pg'),        name: 'NEET PG',             category: 'medical', status: 'live' },
  { id: asExamSlug('aiims-ini-cet'),  name: 'AIIMS INI CET',       category: 'medical', status: 'live' },

  /* ═══════════════════════════════════════════════════════════════════
     CIVIL SERVICES + SSC
     ═══════════════════════════════════════════════════════════════════ */
  { id: asExamSlug('upsc-cse'),       name: 'UPSC CSE (IAS/IPS)',  category: 'civil-services', status: 'live' },
  { id: asExamSlug('upsc-ese'),       name: 'UPSC ESE (IES)',      category: 'civil-services', status: 'live' },
  { id: asExamSlug('upsc-cds'),       name: 'UPSC CDS',            category: 'civil-services', status: 'live' },
  { id: asExamSlug('ssc-cgl'),        name: 'SSC CGL',             category: 'civil-services', status: 'live' },
  { id: asExamSlug('ssc-chsl'),       name: 'SSC CHSL',            category: 'civil-services', status: 'live' },
  { id: asExamSlug('ssc-mts'),        name: 'SSC MTS',             category: 'civil-services', status: 'live' },
  { id: asExamSlug('ssc-gd'),         name: 'SSC GD Constable',    category: 'civil-services', status: 'live' },
  { id: asExamSlug('rrb-ntpc'),       name: 'RRB NTPC',            category: 'civil-services', status: 'live' },
  { id: asExamSlug('rrb-group-d'),    name: 'RRB Group D',         category: 'civil-services', status: 'live' },

  /* ═══════════════════════════════════════════════════════════════════
     STATE PSCs
     ═══════════════════════════════════════════════════════════════════ */
  { id: asExamSlug('uppsc'),          name: 'UPPSC (UP PCS)',      category: 'state', status: 'live' },
  { id: asExamSlug('mppsc'),          name: 'MPPSC',               category: 'state', status: 'live' },
  { id: asExamSlug('bpsc'),           name: 'BPSC (Bihar)',        category: 'state', status: 'live' },
  { id: asExamSlug('rpsc'),           name: 'RPSC (Rajasthan)',    category: 'state', status: 'live' },
  { id: asExamSlug('cgpsc'),          name: 'CGPSC',               category: 'state', status: 'live' },
  { id: asExamSlug('ukpsc'),          name: 'UKPSC (Uttarakhand)', category: 'state', status: 'live' },
  { id: asExamSlug('jpsc'),           name: 'JPSC (Jharkhand)',    category: 'state', status: 'live' },
  { id: asExamSlug('hpsc'),           name: 'HPSC (Haryana)',      category: 'state', status: 'live' },
  { id: asExamSlug('ppsc'),           name: 'PPSC (Punjab)',       category: 'state', status: 'live' },
  { id: asExamSlug('state-psc-other'), name: 'Other State PSC',   category: 'state', status: 'live' },

  /* ═══════════════════════════════════════════════════════════════════
     BANKING & INSURANCE
     ═══════════════════════════════════════════════════════════════════ */
  { id: asExamSlug('ibps-po'),        name: 'IBPS PO',             category: 'banking', status: 'live' },
  { id: asExamSlug('ibps-clerk'),     name: 'IBPS Clerk',          category: 'banking', status: 'live' },
  { id: asExamSlug('sbi-po'),         name: 'SBI PO',              category: 'banking', status: 'live' },
  { id: asExamSlug('sbi-clerk'),      name: 'SBI Clerk',           category: 'banking', status: 'live' },
  { id: asExamSlug('rbi-grade-b'),    name: 'RBI Grade B',         category: 'banking', status: 'live' },
  { id: asExamSlug('rbi-assistant'),  name: 'RBI Assistant',       category: 'banking', status: 'live' },
  { id: asExamSlug('lic-aao'),        name: 'LIC AAO',             category: 'banking', status: 'live' },
  { id: asExamSlug('niacl'),          name: 'NIACL / UIIC',       category: 'banking', status: 'live' },

  /* ═══════════════════════════════════════════════════════════════════
     DEFENCE
     ═══════════════════════════════════════════════════════════════════ */
  { id: asExamSlug('nda'),            name: 'NDA',                 category: 'defence', status: 'live' },
  { id: asExamSlug('cds'),            name: 'CDS',                 category: 'defence', status: 'live' },
  { id: asExamSlug('agniveer'),       name: 'Agniveer',            category: 'defence', status: 'live' },
  { id: asExamSlug('capf'),           name: 'CAPF',                category: 'defence', status: 'live' },
  { id: asExamSlug('afcat'),          name: 'AFCAT',               category: 'defence', status: 'live' },
  { id: asExamSlug('indian-navy'),    name: 'Indian Navy (AA/SSR)', category: 'defence', status: 'live' },

  /* ═══════════════════════════════════════════════════════════════════
     LAW
     ═══════════════════════════════════════════════════════════════════ */
  { id: asExamSlug('clat'),           name: 'CLAT',                category: 'law', status: 'live' },
  { id: asExamSlug('ailet'),          name: 'AILET (NLU Delhi)',   category: 'law', status: 'live' },
  { id: asExamSlug('lsat-india'),     name: 'LSAT India',          category: 'law', status: 'live' },

  /* ═══════════════════════════════════════════════════════════════════
     MANAGEMENT
     ═══════════════════════════════════════════════════════════════════ */
  { id: asExamSlug('cat'),            name: 'CAT',                 category: 'management', status: 'live' },
  { id: asExamSlug('xat'),            name: 'XAT',                 category: 'management', status: 'live' },
  { id: asExamSlug('mat'),            name: 'MAT',                 category: 'management', status: 'live' },
  { id: asExamSlug('cmat'),           name: 'CMAT',                category: 'management', status: 'live' },

  /* ═══════════════════════════════════════════════════════════════════
     TEACHING
     ═══════════════════════════════════════════════════════════════════ */
  { id: asExamSlug('ctet'),           name: 'CTET',                category: 'teaching', status: 'live' },
  { id: asExamSlug('uptet'),          name: 'UPTET / Super TET',   category: 'teaching', status: 'live' },
  { id: asExamSlug('ugc-net'),        name: 'UGC NET',             category: 'teaching', status: 'live' },
  { id: asExamSlug('kvs'),            name: 'KVS Teacher',         category: 'teaching', status: 'live' },

  /* ═══════════════════════════════════════════════════════════════════
     UNIVERSITY ENTRANCE
     ═══════════════════════════════════════════════════════════════════ */
  { id: asExamSlug('cuet-ug'),        name: 'CUET UG',             category: 'university', status: 'live' },
  { id: asExamSlug('cuet-pg'),        name: 'CUET PG',             category: 'university', status: 'live' },
  { id: asExamSlug('du-entrance'),    name: 'DU Entrance',         category: 'university', status: 'live' },
  { id: asExamSlug('jnu-entrance'),   name: 'JNU Entrance',        category: 'university', status: 'live' },
  { id: asExamSlug('bhu-uet'),        name: 'BHU UET',             category: 'university', status: 'live' },
] as const;

/** All exams are now live — no "coming soon" gate. */
export const LIVE_EXAMS = EXAMS.filter((e) => e.status === 'live');
export const SOON_EXAMS = EXAMS.filter((e) => e.status === 'soon');

/** Map of exam slug -> exam, for O(1) lookup. */
export const EXAM_BY_SLUG: ReadonlyMap<ExamSlug, Exam> = new Map(
  EXAMS.map((e) => [e.id, e]),
);

export const EXAM_CATEGORY_LABELS: Readonly<Record<ExamCategory, string>> = {
  'school': 'School (Class 5–12)',
  'engineering': 'Engineering entrance',
  'medical': 'Medical entrance',
  'civil-services': 'Civil services & SSC',
  'banking': 'Banking & Insurance',
  'defence': 'Defence',
  'state': 'State PSCs',
  'law': 'Law entrance',
  'management': 'Management entrance',
  'teaching': 'Teaching exams',
  'university': 'University entrance',
};

/** Type guard usable in API validation. */
export const isExamSlug = (value: unknown): value is ExamSlug =>
  typeof value === 'string' && EXAM_BY_SLUG.has(value as ExamSlug);
