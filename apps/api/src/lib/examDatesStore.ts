/**
 * Exam dates / calendar store.
 *
 * Students need to know how long they have to prepare. We store, per exam,
 * a list of upcoming events (Prelims, Mains, registration windows, …). When
 * an exact date isn't officially announced we keep `date: null` + an
 * `estimatedMonth` string and `isConfirmed: false` so the UI can clearly say
 * "estimated". Admins update these via PATCH when official notifications drop.
 *
 * Firestore: examDates/{examSlug}. Seeded in-memory + lazily for Firestore
 * the first time an unseeded exam is read.
 */

import type { Firestore } from 'firebase-admin/firestore';

export interface ExamEvent {
  /** e.g. "Prelims 2027", "Tier I", "Registration". */
  name: string;
  /** ISO date (YYYY-MM-DD) when officially confirmed, else null. */
  date: string | null;
  /** Human estimate when the exact date is unknown, e.g. "May 2027". */
  estimatedMonth: string;
  isConfirmed: boolean;
  /** Official notification / source URL. */
  sourceUrl: string;
  registrationStart: string | null;
  registrationEnd: string | null;
}

export interface ExamDates {
  examSlug: string;
  examName: string;
  events: ExamEvent[];
  lastUpdated: string;
}

export interface ExamDatesStore {
  getAll(): Promise<ExamDates[]>;
  get(examSlug: string): Promise<ExamDates | null>;
  upsert(examSlug: string, examName: string, events: ExamEvent[]): Promise<ExamDates>;
}

// ─── Seed data ────────────────────────────────────────────────────────────
// Estimates flagged isConfirmed:false; admins confirm + set exact dates when
// official notifications are published. Sources are the official portals.

const ev = (
  name: string, estimatedMonth: string, sourceUrl: string,
  opts?: { date?: string | null; isConfirmed?: boolean; registrationStart?: string | null; registrationEnd?: string | null },
): ExamEvent => ({
  name,
  date: opts?.date ?? null,
  estimatedMonth,
  isConfirmed: opts?.isConfirmed ?? false,
  sourceUrl,
  registrationStart: opts?.registrationStart ?? null,
  registrationEnd: opts?.registrationEnd ?? null,
});

export const EXAM_DATES_SEED: Record<string, { examName: string; events: ExamEvent[] }> = {
  'upsc-cse': {
    examName: 'UPSC CSE (IAS/IPS)',
    events: [
      ev('Prelims 2027', 'May 2027', 'https://upsc.gov.in'),
      ev('Mains 2027', 'September 2027', 'https://upsc.gov.in'),
    ],
  },
  'neet-ug': {
    examName: 'NEET UG',
    events: [ev('NEET UG 2027', 'May 2027', 'https://neet.nta.nic.in')],
  },
  'jee-main': {
    examName: 'JEE Main',
    events: [
      ev('JEE Main 2027 — Session 1', 'January 2027', 'https://jeemain.nta.nic.in'),
      ev('JEE Main 2027 — Session 2', 'April 2027', 'https://jeemain.nta.nic.in'),
    ],
  },
  'jee-advanced': {
    examName: 'JEE Advanced (IIT)',
    events: [ev('JEE Advanced 2027', 'May 2027', 'https://jeeadv.ac.in')],
  },
  'ssc-cgl': {
    examName: 'SSC CGL',
    events: [ev('Tier I 2026', 'September 2026', 'https://ssc.gov.in')],
  },
  'cgpsc-state-service': {
    examName: 'CGPSC State Service',
    events: [
      ev('Prelims 2027', 'February 2027', 'https://psc.cg.gov.in'),
      ev('Mains 2027', 'July 2027', 'https://psc.cg.gov.in'),
    ],
  },
  'cg-vyapam-patwari': {
    examName: 'CG Vyapam Patwari',
    events: [ev('Patwari Exam', 'To be announced', 'https://vyapam.cgstate.gov.in')],
  },
  'ibps-po': {
    examName: 'IBPS PO',
    events: [ev('Prelims 2026', 'October 2026', 'https://www.ibps.in')],
  },
  'rrb-ntpc': {
    examName: 'RRB NTPC',
    events: [ev('CBT 1', 'To be announced', 'https://www.rrbcdg.gov.in')],
  },
  'cgtet': {
    examName: 'CGTET',
    events: [ev('CGTET 2026', 'To be announced', 'https://vyapam.cgstate.gov.in')],
  },
};

function seedFor(examSlug: string): ExamDates | null {
  const s = EXAM_DATES_SEED[examSlug];
  if (!s) return null;
  return { examSlug, examName: s.examName, events: s.events, lastUpdated: '2026-06-01T00:00:00.000Z' };
}

function allSeeds(): ExamDates[] {
  return Object.keys(EXAM_DATES_SEED).map(slug => seedFor(slug)!);
}

// ─── Firestore implementation ─────────────────────────────────────────────

const COLLECTION = 'examDates';

export class FirestoreExamDatesStore implements ExamDatesStore {
  constructor(private readonly db: Firestore) {}

  async getAll(): Promise<ExamDates[]> {
    const snap = await this.db.collection(COLLECTION).get();
    const stored = snap.docs.map(d => d.data() as ExamDates);
    if (stored.length > 0) return stored;
    // Empty collection (fresh project) — return seeds so the UI isn't blank.
    return allSeeds();
  }

  async get(examSlug: string): Promise<ExamDates | null> {
    const doc = await this.db.collection(COLLECTION).doc(examSlug).get();
    if (doc.exists) return doc.data() as ExamDates;
    return seedFor(examSlug);
  }

  async upsert(examSlug: string, examName: string, events: ExamEvent[]): Promise<ExamDates> {
    const data: ExamDates = { examSlug, examName, events, lastUpdated: new Date().toISOString() };
    await this.db.collection(COLLECTION).doc(examSlug).set(data, { merge: true });
    return data;
  }
}

// ─── In-memory implementation (tests + local dev) ─────────────────────────

export class InMemoryExamDatesStore implements ExamDatesStore {
  private readonly map = new Map<string, ExamDates>();

  constructor() {
    for (const d of allSeeds()) this.map.set(d.examSlug, d);
  }

  async getAll(): Promise<ExamDates[]> {
    return Array.from(this.map.values());
  }

  async get(examSlug: string): Promise<ExamDates | null> {
    return this.map.get(examSlug) ?? seedFor(examSlug);
  }

  async upsert(examSlug: string, examName: string, events: ExamEvent[]): Promise<ExamDates> {
    const data: ExamDates = { examSlug, examName, events, lastUpdated: new Date().toISOString() };
    this.map.set(examSlug, data);
    return data;
  }
}
