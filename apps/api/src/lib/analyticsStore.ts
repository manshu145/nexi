/**
 * Product analytics — cost-aware event aggregation.
 *
 * GA-style insight without scanning the whole users collection on every
 * dashboard load (the S1/S2 cost trap). Events increment a single daily
 * rollup doc (analyticsDaily/{YYYY-MM-DD}); the dashboard reads a 30-doc
 * range. Per-user "rich" events (chapter_open, quiz_complete, …) are ALSO
 * written to users/{uid}/activityLog so the existing admin user-activity
 * view finally has data.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

/** Allow-listed event types (anything else is ignored — no junk writes). */
export const TRACKED_EVENTS = [
  'page_view',
  'chapter_open',
  'chapter_complete',
  'quiz_start',
  'quiz_complete',
  'mock_test_start',
  'mock_test_complete',
  'essay_practice',
  'essay_submit',
  'chat_message',
  'current_affairs_view',
  'reel_view',
  'ca_quiz_attempt',
  'search',
  'feature_click',
  'upgrade_view',
  'upgrade_click',
  'error_encountered',
] as const;
export type TrackedEvent = (typeof TRACKED_EVENTS)[number];

const TRACKED_SET = new Set<string>(TRACKED_EVENTS);
/** Events worth persisting per-user (low frequency, useful for user history). */
const RICH_EVENTS = new Set<string>([
  'chapter_open', 'chapter_complete', 'quiz_complete', 'mock_test_complete',
  'essay_submit', 'chat_message', 'ca_quiz_attempt', 'search',
]);

/** Dimension keys we roll up per day for exam-wise / language-wise breakdowns. */
const SAFE_DIM = /^[a-z0-9-]{1,40}$/;

export interface DailyAnalytics {
  date: string;
  total: number;
  events: Record<string, number>;
  /**
   * Cheap per-day breakdowns by dimension, incremented from event props.
   *   dims.exam.{slug} — engagement by exam ("which exam is most active")
   *   dims.lang.{en|hi} — English vs Hindi usage split
   */
  dims?: { exam?: Record<string, number>; lang?: Record<string, number> };
}

export interface IncomingEvent {
  type: string;
  /** Optional context (chapter/subject/exam/page/query…). */
  props?: Record<string, string>;
}

export interface AnalyticsStore {
  /** Record a batch of events for a user (allow-listed types only). */
  recordEvents(userId: string, events: IncomingEvent[]): Promise<void>;
  /** Read the last `days` daily rollups (oldest → newest). */
  getDailySeries(days: number): Promise<DailyAnalytics[]>;
}

function dateId(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Firestore ──────────────────────────────────────────────────────────────

export class FirestoreAnalyticsStore implements AnalyticsStore {
  constructor(private readonly db: Firestore) {}

  async recordEvents(userId: string, events: IncomingEvent[]): Promise<void> {
    const valid = events.filter(e => e && TRACKED_SET.has(e.type)).slice(0, 50);
    if (valid.length === 0) return;

    // 1. Increment today's rollup doc (one write).
    const today = dateId(new Date());
    const updates: Record<string, unknown> = { date: today, total: FieldValue.increment(valid.length) };
    for (const e of valid) {
      updates[`events.${e.type}`] = FieldValue.increment(1);
      // Dimension rollups (exam-wise engagement, language split) from props.
      const exam = e.props?.['exam'];
      if (exam && SAFE_DIM.test(exam)) updates[`dims.exam.${exam}`] = FieldValue.increment(1);
      const lang = e.props?.['lang'];
      if (lang && SAFE_DIM.test(lang)) updates[`dims.lang.${lang}`] = FieldValue.increment(1);
    }
    await this.db.collection('analyticsDaily').doc(today).set(updates, { merge: true });

    // 2. Persist rich events to the user's activity log (best-effort).
    const rich = valid.filter(e => RICH_EVENTS.has(e.type)).slice(0, 10);
    if (rich.length > 0) {
      const col = this.db.collection('users').doc(userId).collection('activityLog');
      const batch = this.db.batch();
      const now = new Date().toISOString();
      for (const e of rich) {
        const ref = col.doc();
        batch.set(ref, { type: e.type, ...(e.props ?? {}), timestamp: now });
      }
      await batch.commit().catch(() => { /* non-critical */ });
    }
  }

  async getDailySeries(days: number): Promise<DailyAnalytics[]> {
    const n = Math.min(Math.max(days, 1), 90);
    const refs = [];
    const out: { date: string }[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const id = dateId(d);
      refs.push(this.db.collection('analyticsDaily').doc(id));
      out.push({ date: id });
    }
    const snaps = await this.db.getAll(...refs);
    return out.map((o, idx) => {
      const data = snaps[idx]?.exists ? (snaps[idx]!.data() as DailyAnalytics) : null;
      return { date: o.date, total: data?.total ?? 0, events: data?.events ?? {}, dims: data?.dims ?? {} };
    });
  }
}

// ─── In-memory ────────────────────────────────────────────────────────────

export class InMemoryAnalyticsStore implements AnalyticsStore {
  private days = new Map<string, DailyAnalytics>();

  async recordEvents(_userId: string, events: IncomingEvent[]): Promise<void> {
    const valid = events.filter(e => e && TRACKED_SET.has(e.type));
    if (valid.length === 0) return;
    const today = dateId(new Date());
    const day = this.days.get(today) ?? { date: today, total: 0, events: {}, dims: { exam: {}, lang: {} } };
    day.dims ??= { exam: {}, lang: {} };
    for (const e of valid) {
      day.events[e.type] = (day.events[e.type] ?? 0) + 1;
      day.total += 1;
      const exam = e.props?.['exam'];
      if (exam && SAFE_DIM.test(exam)) day.dims.exam![exam] = (day.dims.exam![exam] ?? 0) + 1;
      const lang = e.props?.['lang'];
      if (lang && SAFE_DIM.test(lang)) day.dims.lang![lang] = (day.dims.lang![lang] ?? 0) + 1;
    }
    this.days.set(today, day);
  }

  async getDailySeries(days: number): Promise<DailyAnalytics[]> {
    const n = Math.min(Math.max(days, 1), 90);
    const out: DailyAnalytics[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const id = dateId(d);
      out.push(this.days.get(id) ?? { date: id, total: 0, events: {} });
    }
    return out;
  }
}
