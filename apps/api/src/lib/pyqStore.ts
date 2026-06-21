/**
 * Previous Year Questions (PYQ) persistence.
 *
 * One document per (exam, year, language) at `pyqPapers/{examSlug}_{year}_
 * {language}`. Papers are NOT user-scoped — a generated/curated paper is
 * shared by every student, so the AI cost of reconstructing a paper is
 * paid once and then served from cache forever. This mirrors the
 * chapter-content + daily-quiz caching pattern already used elsewhere in
 * the API.
 *
 * The store is deliberately small: read one paper, save one paper, list
 * the available years for an exam (slim summaries), and admin
 * list-all / delete. Question generation lives in the AI engine; this
 * file only persists the result.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { PYQPaper, PYQPaperSummary } from '@nexigrate/shared';

export const PYQ_COLLECTION = 'pyqPapers';

/** Deterministic doc id so regeneration is idempotent. */
export function pyqPaperId(examSlug: string, year: number, language: 'en' | 'hi'): string {
  return `${examSlug}_${year}_${language}`;
}

function toSummary(p: PYQPaper): PYQPaperSummary {
  return {
    id: p.id,
    examSlug: p.examSlug,
    examName: p.examName,
    year: p.year,
    language: p.language,
    source: p.source,
    verified: p.verified,
    questionCount: Array.isArray(p.questions) ? p.questions.length : 0,
  };
}

export interface PYQStore {
  getPaper(examSlug: string, year: number, language: 'en' | 'hi'): Promise<PYQPaper | null>;
  savePaper(paper: PYQPaper): Promise<void>;
  /** Summaries for one exam (optionally one language), newest year first. */
  listSummaries(examSlug: string, language?: 'en' | 'hi'): Promise<PYQPaperSummary[]>;
  /** Admin: every paper, newest first. Capped to keep the response cheap. */
  listAll(limit?: number): Promise<PYQPaperSummary[]>;
  deletePaper(id: string): Promise<void>;
}

// ─── Firestore implementation ─────────────────────────────────────────────

export class FirestorePYQStore implements PYQStore {
  constructor(private readonly db: Firestore) {}

  async getPaper(examSlug: string, year: number, language: 'en' | 'hi'): Promise<PYQPaper | null> {
    const snap = await this.db.collection(PYQ_COLLECTION).doc(pyqPaperId(examSlug, year, language)).get();
    return snap.exists ? (snap.data() as PYQPaper) : null;
  }

  async savePaper(paper: PYQPaper): Promise<void> {
    await this.db.collection(PYQ_COLLECTION).doc(paper.id).set(paper, { merge: true });
  }

  async listSummaries(examSlug: string, language?: 'en' | 'hi'): Promise<PYQPaperSummary[]> {
    // Single-field where avoids the composite-index requirement; we sort
    // + language-filter in memory (a single exam has only a handful of
    // years, so this is cheap).
    const snap = await this.db.collection(PYQ_COLLECTION).where('examSlug', '==', examSlug).get();
    let papers = snap.docs.map(d => d.data() as PYQPaper);
    if (language) papers = papers.filter(p => p.language === language);
    papers.sort((a, b) => b.year - a.year);
    return papers.map(toSummary);
  }

  async listAll(limit = 200): Promise<PYQPaperSummary[]> {
    const snap = await this.db.collection(PYQ_COLLECTION).limit(limit).get();
    const papers = snap.docs.map(d => d.data() as PYQPaper);
    papers.sort((a, b) => (b.year - a.year) || a.examSlug.localeCompare(b.examSlug));
    return papers.map(toSummary);
  }

  async deletePaper(id: string): Promise<void> {
    await this.db.collection(PYQ_COLLECTION).doc(id).delete();
  }
}

// ─── In-memory implementation (tests + local dev) ─────────────────────────

export class InMemoryPYQStore implements PYQStore {
  private readonly papers = new Map<string, PYQPaper>();

  async getPaper(examSlug: string, year: number, language: 'en' | 'hi'): Promise<PYQPaper | null> {
    const p = this.papers.get(pyqPaperId(examSlug, year, language));
    return p ? { ...p } : null;
  }

  async savePaper(paper: PYQPaper): Promise<void> {
    this.papers.set(paper.id, { ...paper });
  }

  async listSummaries(examSlug: string, language?: 'en' | 'hi'): Promise<PYQPaperSummary[]> {
    let papers = Array.from(this.papers.values()).filter(p => p.examSlug === examSlug);
    if (language) papers = papers.filter(p => p.language === language);
    papers.sort((a, b) => b.year - a.year);
    return papers.map(toSummary);
  }

  async listAll(limit = 200): Promise<PYQPaperSummary[]> {
    const papers = Array.from(this.papers.values());
    papers.sort((a, b) => (b.year - a.year) || a.examSlug.localeCompare(b.examSlug));
    return papers.slice(0, limit).map(toSummary);
  }

  async deletePaper(id: string): Promise<void> {
    this.papers.delete(id);
  }
}
