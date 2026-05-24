'use client';

import { useEffect, useState } from 'react';
import { api } from '~/lib/api';

interface SchedulerStatus {
  paused: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  totalGenerated: number;
  totalFailed: number;
  runsToday: number;
  openaiConfigured: boolean;
  nextScheduledRun: string;
}

export default function AdminSchedulerPage() {
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadStatus(); }, []);

  async function loadStatus() {
    try {
      setLoading(true);
      const res = await api.admin.scheduler.status();
      setStatus(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load scheduler status');
    } finally {
      setLoading(false);
    }
  }

  async function handleTrigger() {
    setTriggering(true);
    setTriggerResult(null);
    try {
      const res = await api.admin.scheduler.triggerDaily();
      setTriggerResult(`Generated: ${res.generated}, Failed: ${res.failed}, Exams: ${res.examsProcessed}, Duration: ${res.durationMs}ms`);
      loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Trigger failed');
    } finally {
      setTriggering(false);
    }
  }

  async function handleTogglePause() {
    try {
      if (status?.paused) {
        await api.admin.scheduler.resume();
      } else {
        await api.admin.scheduler.pause();
      }
      loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Toggle failed');
    }
  }

  if (loading) return <div className="flex items-center gap-2"><span className="spinner" /> Loading scheduler...</div>;

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-ink-900">AI Content Scheduler</h1>
      <p className="text-sm text-muted-500 mt-1">Auto-generates MCQs and content daily via 3-AI pipeline.</p>

      {error && <div className="banner banner-error mt-4">{error}</div>}
      {triggerResult && <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{triggerResult}</div>}

      {status && (
        <>
          {/* Status cards */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="paper-card p-4">
              <p className="text-2xl font-serif font-bold text-ink-900">{status.totalGenerated}</p>
              <p className="text-xs text-muted-500">Total Generated</p>
            </div>
            <div className="paper-card p-4">
              <p className="text-2xl font-serif font-bold text-red-600">{status.totalFailed}</p>
              <p className="text-xs text-muted-500">Total Failed</p>
            </div>
            <div className="paper-card p-4">
              <p className="text-2xl font-serif font-bold text-ink-900">{status.runsToday}</p>
              <p className="text-xs text-muted-500">Runs Today</p>
            </div>
            <div className="paper-card p-4">
              <p className={`text-lg font-bold ${status.openaiConfigured ? 'text-green-600' : 'text-red-600'}`}>
                {status.openaiConfigured ? '✅ Active' : '❌ No Key'}
              </p>
              <p className="text-xs text-muted-500">OpenAI</p>
            </div>
          </div>

          {/* Pipeline status */}
          <div className="mt-6 paper-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-ink-900">Pipeline Status</h2>
                <p className="text-sm text-muted-500 mt-1">
                  {status.paused ? '⏸️ Paused' : '▶️ Active'} · Last run: {status.lastRunAt ? new Date(status.lastRunAt).toLocaleString('en-IN') : 'Never'}
                </p>
                {status.lastRunStatus && (
                  <p className="text-xs text-muted-400 mt-0.5">Status: {status.lastRunStatus}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={handleTogglePause} className="btn-ghost px-3 py-1.5 text-sm">
                  {status.paused ? '▶️ Resume' : '⏸️ Pause'}
                </button>
                <button onClick={handleTrigger} disabled={triggering} className="btn-primary px-3 py-1.5 text-sm">
                  {triggering ? 'Running...' : '🚀 Trigger Now'}
                </button>
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-muted-500">
            Next scheduled: {status.nextScheduledRun ? new Date(status.nextScheduledRun).toLocaleString('en-IN') : 'Not scheduled'}
          </p>
        </>
      )}
    </div>
  );
}
