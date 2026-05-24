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
  const [lastTriggerResult, setLastTriggerResult] = useState<string | null>(null);

  useEffect(() => { loadStatus(); }, []);

  async function loadStatus() {
    try {
      const res = await api.admin.scheduler.status();
      setStatus(res);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function triggerDaily() {
    setTriggering(true);
    setLastTriggerResult(null);
    try {
      const res = await api.admin.scheduler.triggerDaily();
      setLastTriggerResult(`Generated ${res.generated} items for ${res.examsProcessed} exams (${res.durationMs}ms)`);
      loadStatus();
    } catch (e) {
      setLastTriggerResult(`Error: ${e instanceof Error ? e.message : 'unknown'}`);
    }
    setTriggering(false);
  }

  async function togglePause() {
    if (!status) return;
    try {
      if (status.paused) {
        await api.admin.scheduler.resume();
      } else {
        await api.admin.scheduler.pause();
      }
      loadStatus();
    } catch { /* ignore */ }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><span className="spinner" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Content Scheduler</h1>
        <span className={`pill ${status?.paused ? 'pill-warn' : 'pill-success'}`}>
          {status?.paused ? 'Paused' : 'Active'}
        </span>
      </div>

      <p className="text-sm text-muted-500">
        AI auto-generates daily content per syllabus. Admin monitors pipeline health — no manual content creation needed.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="paper-card p-4 text-center">
          <p className="text-2xl font-bold text-ink-900">{status?.totalGenerated ?? 0}</p>
          <p className="text-xs text-muted-500">Total generated</p>
        </div>
        <div className="paper-card p-4 text-center">
          <p className="text-2xl font-bold text-ink-900">{status?.runsToday ?? 0}</p>
          <p className="text-xs text-muted-500">Runs today</p>
        </div>
        <div className="paper-card p-4 text-center">
          <p className="text-2xl font-bold text-ember-500">{status?.totalFailed ?? 0}</p>
          <p className="text-xs text-muted-500">Failed</p>
        </div>
        <div className="paper-card p-4 text-center">
          <p className="text-sm font-medium text-ink-900">
            {status?.openaiConfigured ? 'Yes' : 'No'}
          </p>
          <p className="text-xs text-muted-500">OpenAI configured</p>
        </div>
      </div>

      {/* Last run info */}
      {status?.lastRunAt && (
        <div className="banner banner-info">
          Last run: {new Date(status.lastRunAt).toLocaleString()} — Status: {status.lastRunStatus}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          className="btn-primary"
          onClick={triggerDaily}
          disabled={triggering || status?.paused}
        >
          {triggering ? <><span className="spinner" /> Running...</> : 'Trigger Daily Generation'}
        </button>
        <button className="btn-ghost" onClick={togglePause}>
          {status?.paused ? 'Resume Scheduler' : 'Pause Scheduler'}
        </button>
      </div>

      {lastTriggerResult && (
        <div className="banner banner-success">{lastTriggerResult}</div>
      )}

      {/* Next run */}
      <div className="text-xs text-muted-500">
        Next scheduled run: {status?.nextScheduledRun ? new Date(status.nextScheduledRun).toLocaleString() : 'N/A'}
      </div>
    </div>
  );
}
