/**
 * In-process cron scheduler — the self-contained replacement for the external
 * GitHub Actions scheduler.
 *
 * Founder ask: "jab mera app hai to GitHub pe kyun depend karu? sab admin
 * panel se chale." So the API itself now drives every scheduled job. A single
 * timer ticks once a minute; each registered job decides whether it's due
 * (based on its IST schedule + last successful run), and a Firestore lease
 * lock guarantees that with multiple Cloud Run instances only ONE runs a given
 * job per window.
 *
 * IMPORTANT — Cloud Run CPU: in-process timers only fire reliably when the
 * instance has CPU allocated outside request handling. The deploy MUST use
 * `--no-cpu-throttling` (and keep `--min-instances >= 1`) so this scheduler
 * keeps ticking between requests. Without it the OS throttles the idle
 * instance and the timer stalls.
 *
 * State (Firestore):
 *   - system/cronConfig         → { enabled, jobs: { [id]: boolean } } admin toggles
 *   - cronJobs/{id}             → { lastRunAt, lastStatus, lastResult, lastError,
 *                                   lastDurationMs, lastTrigger, lockedUntil, holder }
 *
 * Everything is best-effort: a job failure is recorded and never crashes the
 * tick loop or the server.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { Logger } from '../logger.js';
import {
  type CronJobDeps,
  runStreakCheck,
  runDailyDigest,
  runReengage,
  runCurrentAffairsIngest,
  runContentRefresh,
} from './cronJobs.js';
import { reconcilePendingOrders } from '../routes/billing.js';

export type CronJobId = 'ingest' | 'daily-digest' | 'streak-check' | 'reengage' | 'content-refresh' | 'reconcile-payments';

/** How often the scheduler wakes up to evaluate due jobs. */
const TICK_INTERVAL_MS = 60_000;
/**
 * How long a claimed job holds its lease. Longer than the slowest job
 * (content-refresh regenerates a batch sequentially) so a second instance
 * never double-fires while the first is still working.
 */
const LEASE_MS = 15 * 60_000;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

interface IstParts { y: number; mo: number; day: number; dow: number; h: number; mi: number }

function istParts(d: Date): IstParts {
  const t = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    y: t.getUTCFullYear(), mo: t.getUTCMonth(), day: t.getUTCDate(),
    dow: t.getUTCDay(), h: t.getUTCHours(), mi: t.getUTCMinutes(),
  };
}

/** Calendar-day key in IST, so "already ran today" survives restarts/timezones. */
function istDayKey(d: Date): string {
  const p = istParts(d);
  return `${p.y}-${p.mo}-${p.day}`;
}

type DuePredicate = (now: Date, lastRunAt: Date | null) => boolean;

/** Due every `intervalMs` (with a small tolerance for tick jitter). */
function everyInterval(intervalMs: number): DuePredicate {
  const tolerance = 30_000;
  return (now, last) => !last || now.getTime() - last.getTime() >= intervalMs - tolerance;
}

/** Due once per IST day, at or after `hourIST`. */
function dailyAt(hourIST: number): DuePredicate {
  return (now, last) => {
    if (istParts(now).h < hourIST) return false;
    if (!last) return true;
    return istDayKey(last) !== istDayKey(now);
  };
}

/** Due once per week, on `dowIST` (0 = Sunday) at or after `hourIST`. */
function weeklyOn(dowIST: number, hourIST: number): DuePredicate {
  return (now, last) => {
    const p = istParts(now);
    if (p.dow !== dowIST || p.h < hourIST) return false;
    if (!last) return true;
    return istDayKey(last) !== istDayKey(now);
  };
}

interface JobDef {
  id: CronJobId;
  label: string;
  description: string;
  schedule: string;
  isDue: DuePredicate;
  run: (deps: CronJobDeps) => Promise<Record<string, unknown>>;
}

const JOBS: JobDef[] = [
  {
    id: 'reconcile-payments',
    label: 'Payment reconciliation',
    description: 'Auto-activate paid plans for orders Razorpay captured but whose verify/webhook was missed (mainly UPI). Keeps activation automatic so no manual step is needed.',
    schedule: 'Every 3 minutes',
    isDue: everyInterval(3 * 60_000),
    run: (d) => reconcilePendingOrders({
      users: d.users, coupons: d.coupons, db: d.fs, logger: d.logger, serviceKeys: d.serviceKeys, env: d.env,
    }) as Promise<Record<string, unknown>>,
  },
  {
    id: 'reengage',
    label: 'Re-engagement nudge',
    description: 'Personalized push to users idle 5h+ (exam countdown / streak / come-back).',
    schedule: 'Every hour',
    isDue: everyInterval(60 * 60_000),
    run: (d) => runReengage(d),
  },
  {
    id: 'ingest',
    label: 'Current-affairs ingest',
    description: 'Pull RSS sources → AI summary → Hindi and store fresh current affairs.',
    schedule: 'Every 30 minutes',
    isDue: everyInterval(30 * 60_000),
    run: (d) => runCurrentAffairsIngest(d),
  },
  {
    id: 'daily-digest',
    label: 'Daily digest',
    description: 'Once-a-day "today\'s current affairs are ready" nudge to recently-active users.',
    schedule: 'Daily · 07:00 IST',
    isDue: dailyAt(7),
    run: (d) => runDailyDigest(d),
  },
  {
    id: 'streak-check',
    label: 'Streak reminder',
    description: 'Daily reminder to users with an active streak who haven\'t studied today.',
    schedule: 'Daily · 19:00 IST',
    isDue: dailyAt(19),
    run: (d) => runStreakCheck(d),
  },
  {
    id: 'content-refresh',
    label: 'Content refresh',
    description: 'Weekly regeneration of the stalest cached chapter content.',
    schedule: 'Weekly · Sun 04:00 IST',
    isDue: weeklyOn(0, 4),
    run: (d) => runContentRefresh(d),
  },
];

export interface CronJobStatus {
  id: CronJobId;
  label: string;
  description: string;
  schedule: string;
  /** Effective enabled state (global kill-switch AND per-job toggle). */
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: 'ok' | 'error' | null;
  lastResult: Record<string, unknown> | null;
  lastError: string | null;
  lastDurationMs: number | null;
  lastTrigger: 'schedule' | 'manual' | null;
  /** True while this job is executing on THIS instance right now. */
  running: boolean;
}

export interface SchedulerConfig {
  /** Global kill-switch for all automatic runs. */
  enabled: boolean;
  /** Per-job override; absent = enabled. */
  jobs: Partial<Record<CronJobId, boolean>>;
}

const CONFIG_COLLECTION = 'system';
const CONFIG_DOC = 'cronConfig';
const JOB_COLLECTION = 'cronJobs';

const DEFAULT_CONFIG: SchedulerConfig = { enabled: true, jobs: {} };

interface JobState {
  lastRunAt?: string | null;
  lastStatus?: 'ok' | 'error' | null;
  lastResult?: Record<string, unknown> | null;
  lastError?: string | null;
  lastDurationMs?: number | null;
  lastTrigger?: 'schedule' | 'manual' | null;
  lockedUntil?: string | null;
  holder?: string | null;
}

export class CronScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly running = new Set<CronJobId>();
  private readonly instanceId = `${process.env['K_REVISION'] ?? 'local'}-${Math.random().toString(36).slice(2, 8)}`;

  constructor(
    private readonly deps: CronJobDeps,
    private readonly logger: Logger,
    private readonly fs: Firestore | null,
  ) {}

  /** Begin ticking. No-op if already started. Safe to call once at boot. */
  start(): void {
    if (this.timer) return;
    if (!this.fs) {
      this.logger.info('cron.scheduler_disabled', { reason: 'no firestore (memory mode)' });
      return;
    }
    this.logger.info('cron.scheduler_started', { instanceId: this.instanceId, tickMs: TICK_INTERVAL_MS, jobs: JOBS.map(j => j.id) });
    // First tick shortly after boot, then on the interval.
    const kick = setTimeout(() => void this.tick(), 10_000);
    kick.unref?.();
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
    // Don't keep the event loop alive solely for the timer (the HTTP server
    // already does); makes the process cleanly exitable in tests.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /** Evaluate every job; run the ones that are due and not locked. */
  private async tick(): Promise<void> {
    if (!this.fs) return;
    let config: SchedulerConfig;
    try {
      config = await this.loadConfig();
    } catch (err) {
      this.logger.warn('cron.config_load_failed', { error: errMsg(err) });
      return;
    }
    if (!config.enabled) return;
    const now = new Date();
    for (const job of JOBS) {
      if (config.jobs[job.id] === false) continue;
      try {
        await this.maybeRun(job, now);
      } catch (err) {
        this.logger.warn('cron.tick_job_failed', { job: job.id, error: errMsg(err) });
      }
    }
  }

  /** Atomically claim a due job (lease lock), then execute it. */
  private async maybeRun(job: JobDef, now: Date): Promise<void> {
    if (!this.fs) return;
    const ref = this.fs.collection(JOB_COLLECTION).doc(job.id);
    const claimed = await this.fs.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = (snap.exists ? snap.data() : {}) as JobState;
      const lastRunAt = data.lastRunAt ? new Date(data.lastRunAt) : null;
      const lockedUntil = data.lockedUntil ? Date.parse(data.lockedUntil) : 0;
      if (!job.isDue(now, lastRunAt)) return false;
      if (lockedUntil > now.getTime()) return false; // another instance owns it
      tx.set(ref, { lockedUntil: new Date(now.getTime() + LEASE_MS).toISOString(), holder: this.instanceId }, { merge: true });
      return true;
    });
    if (!claimed) return;
    await this.execute(job, 'schedule');
  }

  /** Run a job now, recording its outcome. Used by tick() and Run-now. */
  private async execute(job: JobDef, trigger: 'schedule' | 'manual'): Promise<CronJobStatus> {
    const start = Date.now();
    this.running.add(job.id);
    this.logger.info('cron.run_start', { job: job.id, trigger, instanceId: this.instanceId });
    let result: Record<string, unknown> = {};
    let status: 'ok' | 'error' = 'ok';
    let error: string | null = null;
    try {
      result = (await job.run(this.deps)) ?? {};
    } catch (err) {
      status = 'error';
      error = errMsg(err);
      this.logger.error('cron.run_error', { job: job.id, error });
    } finally {
      this.running.delete(job.id);
    }
    const durationMs = Date.now() - start;
    const update: JobState = {
      lastRunAt: new Date().toISOString(),
      lastStatus: status,
      lastResult: result,
      lastError: error,
      lastDurationMs: durationMs,
      lastTrigger: trigger,
      lockedUntil: null, // release the lease
      holder: null,
    };
    if (this.fs) {
      await this.fs.collection(JOB_COLLECTION).doc(job.id).set(update, { merge: true }).catch((err) => {
        this.logger.warn('cron.state_write_failed', { job: job.id, error: errMsg(err) });
      });
    }
    this.logger.info('cron.run_done', { job: job.id, status, durationMs, ...result });
    return this.toStatus(job, update, true);
  }

  /**
   * Manually trigger a job from the admin panel, bypassing the due check but
   * still respecting the cross-instance lease so it can't double-fire.
   */
  async runNow(jobId: string): Promise<{ ok: boolean; reason?: string; status?: CronJobStatus }> {
    const job = JOBS.find(j => j.id === jobId);
    if (!job) return { ok: false, reason: 'Unknown job' };
    if (this.fs) {
      const ref = this.fs.collection(JOB_COLLECTION).doc(job.id);
      const claimed = await this.fs.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = (snap.exists ? snap.data() : {}) as JobState;
        const lockedUntil = data.lockedUntil ? Date.parse(data.lockedUntil) : 0;
        if (lockedUntil > Date.now()) return false;
        tx.set(ref, { lockedUntil: new Date(Date.now() + LEASE_MS).toISOString(), holder: this.instanceId }, { merge: true });
        return true;
      }).catch(() => false);
      if (!claimed) return { ok: false, reason: 'Job is already running' };
    } else if (this.running.has(job.id)) {
      return { ok: false, reason: 'Job is already running' };
    }
    const statusResult = await this.execute(job, 'manual');
    return { ok: true, status: statusResult };
  }

  /** Read the admin enable/disable config (global + per-job). */
  async loadConfig(): Promise<SchedulerConfig> {
    if (!this.fs) return DEFAULT_CONFIG;
    const snap = await this.fs.collection(CONFIG_COLLECTION).doc(CONFIG_DOC).get();
    if (!snap.exists) return DEFAULT_CONFIG;
    const data = snap.data() as Partial<SchedulerConfig>;
    return {
      enabled: typeof data.enabled === 'boolean' ? data.enabled : true,
      jobs: (data.jobs && typeof data.jobs === 'object') ? data.jobs : {},
    };
  }

  /** Persist an admin config change (global kill-switch and/or per-job toggle). */
  async updateConfig(patch: { enabled?: boolean; jobs?: Partial<Record<CronJobId, boolean>> }): Promise<SchedulerConfig> {
    const current = await this.loadConfig();
    const next: SchedulerConfig = {
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
      jobs: { ...current.jobs, ...sanitiseJobs(patch.jobs) },
    };
    if (this.fs) {
      await this.fs.collection(CONFIG_COLLECTION).doc(CONFIG_DOC).set(next, { merge: true });
    }
    this.logger.info('cron.config_updated', { enabled: next.enabled, jobs: next.jobs });
    return next;
  }

  /** Full status for the admin panel: definitions + persisted state + config. */
  async getStatus(): Promise<{ enabled: boolean; tickIntervalMs: number; jobs: CronJobStatus[] }> {
    const config = await this.loadConfig();
    const states = new Map<CronJobId, JobState>();
    if (this.fs) {
      const snap = await this.fs.collection(JOB_COLLECTION).get().catch(() => null);
      if (snap) {
        for (const doc of snap.docs) states.set(doc.id as CronJobId, doc.data() as JobState);
      }
    }
    const jobs = JOBS.map((job) => {
      const state = states.get(job.id) ?? {};
      const enabled = config.enabled && config.jobs[job.id] !== false;
      return this.toStatus(job, state, this.running.has(job.id), enabled);
    });
    return { enabled: config.enabled, tickIntervalMs: TICK_INTERVAL_MS, jobs };
  }

  private toStatus(job: JobDef, state: JobState, running: boolean, enabled = true): CronJobStatus {
    return {
      id: job.id,
      label: job.label,
      description: job.description,
      schedule: job.schedule,
      enabled,
      lastRunAt: state.lastRunAt ?? null,
      lastStatus: state.lastStatus ?? null,
      lastResult: state.lastResult ?? null,
      lastError: state.lastError ?? null,
      lastDurationMs: state.lastDurationMs ?? null,
      lastTrigger: state.lastTrigger ?? null,
      running,
    };
  }
}

function sanitiseJobs(jobs?: Partial<Record<CronJobId, boolean>>): Partial<Record<CronJobId, boolean>> {
  const out: Partial<Record<CronJobId, boolean>> = {};
  if (!jobs) return out;
  const validIds = new Set<string>(JOBS.map(j => j.id));
  for (const [k, v] of Object.entries(jobs)) {
    if (validIds.has(k) && typeof v === 'boolean') out[k as CronJobId] = v;
  }
  return out;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
