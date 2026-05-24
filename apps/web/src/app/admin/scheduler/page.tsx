'use client';

import { useEffect, useState } from 'react';
import { api } from '~/lib/api';

/**
 * Phase E — Admin content scheduler dashboard.
 *
 * Admin's role is now MONITOR, not CREATOR. This page shows:
 * - Pipeline health (last run, errors)
 * - Config (thresholds, limits)
 * - Manual trigger button
 * - Auto-approval rate
 */

interface SchedulerStatus {
  config: {
    maxMcqsPerRun: number;
    maxChaptersPerRun: number;
    autoApproveThreshold: number;
    targetExams: string[];
  };
  lastRun: {
    mcqsGenerated: number;
    mcqsAutoApproved: number;
    mcqsQueuedForReview: number;
    chaptersGenerated: number;
    chaptersAutoApproved: number;
    chaptersQueuedForReview: number;
    errors: string[];
    durationMs: number;
  } | null;
  lastRunAt: string | null;
  isHealthy: boolean;
  nextRunEstimate: string;
}

export default function AdminSchedulerPage() {
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const auth = await import('~/lib/firebase').then((m) => m.getFirebaseAuthClient());
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const baseUrl = process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://localhost:9090';
      const res = await fetch(`${baseUrl}/v1/admin/scheduler/status`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch { /* tolerate */ }
    setLoading(false);
  };

  useEffect(() => { loadStatus(); }, []);

  const triggerRun = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const auth = await import('~/lib/firebase').then((m) => m.getFirebaseAuthClient());
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const baseUrl = process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://localhost:9090';
      const res = await fetch(`${baseUrl}/v1/admin/scheduler/run`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (res.ok) {
        const data = await res.json();
        setRunResult(`Run complete: ${data.run.mcqsGenerated} MCQs + ${data.run.chaptersGenerated} chapters generated in ${data.run.durationMs}ms`);
        await loadStatus();
      } else {
        setRunResult('Run failed');
      }
    } catch {
      setRunResult('Network error');
    }
    setRunning(false);
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-sm text-muted-500">Loading scheduler status…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink-900">
            Content scheduler
          </h1>
          <p className="mt-1 text-sm text-muted-500">
            AI auto-generates daily content. You monitor and override.
          </p>
        </div>
        <button
          type="button"
          onClick={triggerRun}
          disabled={running}
          className="btn-primary"
        >
          {running ? 'Running…' : 'Trigger run now'}
        </button>
      </div>

      {runResult && (
        <div className="mt-4 rounded-lg bg-gold-50 border border-gold-200 p-3 text-sm text-ink-800">
          {runResult}
        </div>
      )}

      {/* Health status */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="paper-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-500">
            Pipeline health
          </p>
          <p className={`mt-2 text-2xl font-semibold ${status?.isHealthy ? 'text-gold-600' : 'text-ember-600'}`}>
            {status?.isHealthy ? 'Healthy' : 'Issues detected'}
          </p>
        </div>
        <div className="paper-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-500">
            Last run
          </p>
          <p className="mt-2 text-sm text-ink-900">
            {status?.lastRunAt
              ? new Date(status.lastRunAt).toLocaleString('en-IN')
              : 'Never'}
          </p>
        </div>
        <div className="paper-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-500">
            Next scheduled
          </p>
          <p className="mt-2 text-sm text-ink-900">
            {status?.nextRunEstimate
              ? new Date(status.nextRunEstimate).toLocaleString('en-IN')
              : '—'}
          </p>
        </div>
      </div>

      {/* Last run details */}
      {status?.lastRun && (
        <div className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-500">
            Last run results
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="MCQs generated" value={status.lastRun.mcqsGenerated} />
            <Stat label="MCQs auto-approved" value={status.lastRun.mcqsAutoApproved} color="gold" />
            <Stat label="Chapters generated" value={status.lastRun.chaptersGenerated} />
            <Stat label="Queued for review" value={status.lastRun.mcqsQueuedForReview + status.lastRun.chaptersQueuedForReview} color="ember" />
          </div>
          {status.lastRun.errors.length > 0 && (
            <div className="mt-3 rounded-lg bg-ember-50 border border-ember-200 p-3">
              <p className="text-xs font-semibold text-ember-700">Errors ({status.lastRun.errors.length})</p>
              <ul className="mt-1 space-y-1">
                {status.lastRun.errors.slice(0, 5).map((e, i) => (
                  <li key={i} className="text-xs text-ember-600">{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Config */}
      {status?.config && (
        <div className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-500">
            Configuration
          </h2>
          <div className="mt-3 paper-card p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-500">Max MCQs per run</p>
                <p className="text-sm font-medium text-ink-900">{status.config.maxMcqsPerRun}</p>
              </div>
              <div>
                <p className="text-xs text-muted-500">Max chapters per run</p>
                <p className="text-sm font-medium text-ink-900">{status.config.maxChaptersPerRun}</p>
              </div>
              <div>
                <p className="text-xs text-muted-500">Auto-approve threshold</p>
                <p className="text-sm font-medium text-ink-900">{(status.config.autoApproveThreshold * 100).toFixed(0)}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-500">Target exams</p>
                <p className="text-sm font-medium text-ink-900">
                  {status.config.targetExams.length > 0 ? status.config.targetExams.join(', ') : 'All active exams'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Philosophy note */}
      <div className="mt-8 rounded-lg border border-line bg-paper-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-600">
          How it works
        </p>
        <p className="mt-2 text-sm text-ink-800">
          The platform generates content automatically via the 3-AI pipeline (OpenAI + Gemini + Groq).
          Content that passes all three verifiers with a score above the threshold is published instantly.
          Borderline content appears in your MCQ drafts / chapter drafts for manual review.
          Your job: monitor health, reject bad content, tune the threshold.
        </p>
      </div>
    </main>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: 'gold' | 'ember' }) {
  const colorCls = color === 'gold' ? 'text-gold-600' : color === 'ember' ? 'text-ember-600' : 'text-ink-900';
  return (
    <div className="paper-card p-3">
      <p className="text-[11px] text-muted-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${colorCls}`}>{value}</p>
    </div>
  );
}
