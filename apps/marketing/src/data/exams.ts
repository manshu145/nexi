/**
 * Exams currently supported (or planned) on Nexigrate.
 * `live` exams are part of MVP v0.1 (Class 11–12 + JEE/NEET wedge).
 * Everything else is on the roadmap and shown as "Coming soon".
 */
export type Exam = {
  id: string;
  name: string;
  category: 'school' | 'engineering' | 'medical' | 'civil-services' | 'defence' | 'banking' | 'state';
  status: 'live' | 'soon';
};

export const EXAMS: readonly Exam[] = [
  // — MVP wedge —
  { id: 'class-11-cbse',   name: 'Class 11 (CBSE)',     category: 'school',         status: 'live' },
  { id: 'class-12-cbse',   name: 'Class 12 (CBSE)',     category: 'school',         status: 'live' },
  { id: 'jee-main',        name: 'JEE Main',            category: 'engineering',    status: 'live' },
  { id: 'jee-advanced',    name: 'JEE Advanced',        category: 'engineering',    status: 'live' },
  { id: 'neet-ug',         name: 'NEET UG',             category: 'medical',        status: 'live' },

  // — All exams live —
  { id: 'class-10-cbse',   name: 'Class 10 (CBSE)',     category: 'school',         status: 'live' },
  { id: 'class-9-cbse',    name: 'Class 9 (CBSE)',      category: 'school',         status: 'live' },
  { id: 'class-8-cbse',    name: 'Class 8 (CBSE)',      category: 'school',         status: 'live' },
  { id: 'ssc-cgl',         name: 'SSC CGL',             category: 'civil-services', status: 'live' },
  { id: 'ssc-chsl',        name: 'SSC CHSL',            category: 'civil-services', status: 'live' },
  { id: 'ibps-po',         name: 'IBPS PO / Clerk',     category: 'banking',        status: 'live' },
  { id: 'sbi-po',          name: 'SBI PO',              category: 'banking',        status: 'live' },
  { id: 'rrb-ntpc',        name: 'RRB NTPC',            category: 'civil-services', status: 'live' },
  { id: 'upsc-cse',        name: 'UPSC CSE',            category: 'civil-services', status: 'live' },
  { id: 'state-psc',       name: 'State PSCs',          category: 'state',          status: 'live' },
  { id: 'nda',             name: 'NDA',                 category: 'defence',        status: 'live' },
  { id: 'cds',             name: 'CDS',                 category: 'defence',        status: 'live' },
  { id: 'agniveer',        name: 'Agniveer',            category: 'defence',        status: 'live' },
  { id: 'capf',            name: 'CAPF',                category: 'defence',        status: 'live' },
] as const;

export const LIVE_EXAMS = EXAMS.filter((e) => e.status === 'live');
export const SOON_EXAMS = EXAMS.filter((e) => e.status === 'soon');

/** Slug accepted by the waitlist API — also accepts `'undecided'` for the curious. */
export type ExamSlug = (typeof EXAMS)[number]['id'] | 'undecided';
