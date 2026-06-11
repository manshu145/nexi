'use client';

/**
 * Admin: Push Notifications (PR-38).
 *
 * Founder lock (30 May 2026):
 *   "ek push notification vala system bnana hai taki current affais
 *    ko bhej ske ham ya automatic chala jaye user personlized
 *    notioficaion? firebase to hai hi already?"
 *
 * Compose + broadcast push notifications to a user audience or a topic.
 * Supports optional Hindi version (titleHi / bodyHi); the backend
 * routes Hindi-language users to the Hindi copy automatically.
 *
 * Brand tokens only (paper / ink / ember / muted / line). No raw
 * amber / stone / hex.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';
import { toast } from 'sonner';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

/** Compact one-line summary of a job's last-run result object for the table. */
function summariseResult(r: Record<string, unknown>): string {
  return Object.entries(r)
    .filter(([, v]) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
}

interface PushStatus {
  configured: boolean;
  provider?: string;
  reason?: string;
  subscriberCount?: number;
  totalDevices?: number;
}

export default function AdminPushPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  // Compose form
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [titleHi, setTitleHi] = useState('');
  const [bodyHi, setBodyHi] = useState('');
  const [showHindi, setShowHindi] = useState(false);
  const [audience, setAudience] = useState<'all' | 'free' | 'paid' | 'topic'>('all');
  const [topic, setTopic] = useState('current-affairs');
  const [link, setLink] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);

  // Push send history + prompt-timing config
  interface PushLog { id: string; title?: string; body?: string; audience?: string; mode?: string; sent?: number; failed?: number; devices?: number; inboxCreated?: number; sentBy?: string; sentAt?: string; }
  interface PromptCfg { enabled: boolean; promptDelaySeconds: number; cooldownDays: number; maxDismissals: number; }
  const [logs, setLogs] = useState<PushLog[]>([]);
  const [promptCfg, setPromptCfg] = useState<PromptCfg>({ enabled: true, promptDelaySeconds: 6, cooldownDays: 3, maxDismissals: 3 });
  const [savingCfg, setSavingCfg] = useState(false);

  // Per-recipient log of AUTOMATIC / personalized notifications
  // (re-engagement, streak, daily digest) — who got what, on which channel, when.
  interface AutoLog {
    id: string; userId: string; userEmail?: string; userName?: string;
    type: string; title: string; body: string; link?: string;
    channel: 'push' | 'in_app'; pushDelivered?: boolean; pushSuccess?: number; pushFailure?: number;
    source: string; createdAt: string;
  }
  const [autoLogs, setAutoLogs] = useState<AutoLog[]>([]);
  const [autoSource, setAutoSource] = useState<'' | 'reengage' | 'streak' | 'daily-digest'>('');

  // Automatic schedule (in-process cron) — status + admin controls.
  interface CronJob {
    id: string; label: string; description: string; schedule: string; enabled: boolean;
    lastRunAt: string | null; lastStatus: 'ok' | 'error' | null;
    lastResult: Record<string, unknown> | null; lastError: string | null;
    lastDurationMs: number | null; lastTrigger: 'schedule' | 'manual' | null; running: boolean;
  }
  interface CronStatus { available: boolean; enabled: boolean; tickIntervalMs: number; jobs: CronJob[]; }
  const [cron, setCron] = useState<CronStatus | null>(null);
  const [cronBusy, setCronBusy] = useState<string | null>(null); // jobId | 'config' while a request is in flight

  useEffect(() => {
    if (!loading && !user) router.replace('/admin/login');
  }, [user, loading, router]);

  const getToken = async () => {
    const auth = getFirebaseAuthClient();
    return auth.currentUser?.getIdToken();
  };

  const loadLogs = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/push/logs?limit=100`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = (await res.json()) as { logs: PushLog[] }; setLogs(d.logs); }
    } catch { /* ignore */ }
  };

  const loadAutoLogs = async (src: '' | 'reengage' | 'streak' | 'daily-digest' = autoSource) => {
    try {
      const token = await getToken();
      const q = src ? `&source=${src}` : '';
      const res = await fetch(`${API}/v1/admin/notifications/log?limit=150${q}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = (await res.json()) as { logs: AutoLog[] }; setAutoLogs(d.logs); }
    } catch { /* ignore */ }
  };

  const loadCron = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/cron/status`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setCron((await res.json()) as CronStatus);
    } catch { /* ignore */ }
  };

  const updateCronConfig = async (patch: { enabled?: boolean; jobs?: Record<string, boolean> }) => {
    setCronBusy('config');
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/cron/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      });
      if (res.ok) { await loadCron(); toast.success('Schedule updated'); }
      else toast.error('Failed to update schedule');
    } catch { toast.error('Failed to update schedule'); }
    finally { setCronBusy(null); }
  };

  const runJob = async (id: string) => {
    setCronBusy(id);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/cron/run/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { status?: CronJob; message?: string; error?: string };
      if (res.ok) {
        toast.success(`Ran "${id}" — ${data.status?.lastStatus === 'error' ? 'finished with error' : 'success'}`);
        await loadCron();
        void loadAutoLogs(); // re-engagement / digest / streak may have added rows
      } else {
        toast.error(data.message ?? data.error ?? `Run failed (HTTP ${res.status})`);
      }
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Run failed'); }
    finally { setCronBusy(null); }
  };

  const saveCfg = async () => {
    setSavingCfg(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/push/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(promptCfg),
      });
      if (res.ok) { const d = (await res.json()) as { config: PromptCfg }; setPromptCfg(d.config); toast.success('Prompt settings saved'); }
      else toast.error('Failed to save settings');
    } catch { toast.error('Failed to save settings'); }
    finally { setSavingCfg(false); }
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API}/v1/admin/push/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setStatus((await res.json()) as PushStatus);
        else setStatus({ configured: false, reason: `HTTP ${res.status}` });
        // Load send history + prompt config in parallel (non-fatal).
        void loadLogs();
        void loadAutoLogs();
        void loadCron();
        try {
          const cfgRes = await fetch(`${API}/v1/admin/push/config`, { headers: { Authorization: `Bearer ${token}` } });
          if (cfgRes.ok) { const d = (await cfgRes.json()) as { config: PromptCfg }; setPromptCfg(d.config); }
        } catch { /* ignore */ }
      } catch (err) {
        setStatus({ configured: false, reason: err instanceof Error ? err.message : 'unknown' });
      } finally {
        setPageLoading(false);
      }
    })();
  }, [user]);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error('Title and body are required');
      return;
    }
    setSending(true);
    try {
      const token = await getToken();
      const payload: Record<string, unknown> = {
        title: title.trim(),
        body: body.trim(),
        audience: audience === 'topic' ? { topic: topic.trim() } : audience,
      };
      if (titleHi.trim()) payload['titleHi'] = titleHi.trim();
      if (bodyHi.trim()) payload['bodyHi'] = bodyHi.trim();
      if (link.trim()) payload['link'] = link.trim();
      if (imageUrl.trim()) payload['imageUrl'] = imageUrl.trim();
      const res = await fetch(`${API}/v1/admin/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { sent?: number; failed?: number; devices?: number; error?: string };
      if (res.ok) {
        if (audience === 'topic') {
          toast.success(`Topic push sent to "${topic}"`);
        } else {
          toast.success(`Sent to ${data.sent ?? 0} of ${data.devices ?? 0} devices · ${data.failed ?? 0} failed`);
        }
        setTitle('');
        setBody('');
        setTitleHi('');
        setBodyHi('');
        setLink('');
        setImageUrl('');
        void loadLogs();
      } else {
        toast.error(data.error ?? `Send failed (HTTP ${res.status})`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      // PR-45: auto-register this device first so test works.
      // Surface the ACTUAL failure reason (getLastPushError) instead of the
      // old generic "VAPID may not be configured" message — that was hiding
      // the real cause (e.g. invalid VAPID key for this project, unsupported
      // browser, permission denied, or a stale cached service worker).
      let tokenRegistered = false;
      let pushErr: string | null = null;
      try {
        const { registerPushToken, getLastPushError } = await import('~/lib/pushClient');
        tokenRegistered = await registerPushToken();
        if (!tokenRegistered) pushErr = getLastPushError();
      } catch (e) {
        pushErr = e instanceof Error ? e.message : String(e);
      }

      if (!tokenRegistered) {
        toast.error(
          pushErr
            ? `Device registration failed: ${pushErr}`
            : 'Could not register device. Allow notifications, then retry. If it persists, the VAPID key in Service Keys → FCM may be wrong for this Firebase project.',
          { duration: 9000 },
        );
        setTesting(false);
        return;
      }

      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/push/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { sent?: number; devices?: number; failed?: number; message?: string };
      if (res.ok) {
        toast.success(`Test sent to ${data.sent ?? 0} of ${data.devices ?? 0} of your devices`);
      } else {
        const msg = data.message ?? `Test failed (HTTP ${res.status})`;
        toast.error(msg.includes('No push tokens') ? 'No device registered yet. Allow notifications when prompted and retry.' : msg);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  if (loading || !user || pageLoading) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-56 animate-pulse rounded bg-paper-200" />
        <div className="h-64 animate-pulse rounded-xl bg-paper-200" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-900">Push Notifications</h1>
          <p className="mt-1 text-sm text-muted-500">
            Send rich push notifications to all users, free / paid segments, or a topic. Optional
            Hindi version is shown to Hindi-language users automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !status?.configured}
          className="rounded-lg border border-line bg-paper-50 px-3 py-2 text-xs text-ink-800 hover:bg-paper-200 disabled:opacity-50"
          title="Sends a test push to your own registered devices"
        >
          {testing ? 'Sending…' : 'Send test to me'}
        </button>
      </div>

      {/* Status */}
      <div className={`mt-4 rounded-lg border px-3 py-2 text-xs ${
        status?.configured ? 'border-line bg-paper-100 text-muted-500' : 'border-ember-500/40 bg-ember-500/5 text-ember-600'
      }`}>
        {status?.configured ? (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span>✓ FCM configured (provider: {status.provider})</span>
            <span className="font-semibold text-ink-800">📱 {status.subscriberCount ?? 0} subscribers · {status.totalDevices ?? 0} devices</span>
          </div>
        ) : (
          <>
            ⚠ Push not configured — open <a href="/admin/service-keys" className="underline">Admin → Service Keys → FCM</a> and save the service-account JSON.
            {status?.reason ? ` Reason: ${status.reason}` : null}
          </>
        )}
      </div>

      {/* VAPID key warning — shown when push is configured but 0 subscribers
          (likely means VAPID key is missing so the bell silently fails). */}
      {status?.configured && (status.subscriberCount ?? 0) === 0 && (
        <div className="mt-2 rounded-lg border border-amber-400/50 bg-amber-50 dark:bg-amber-900/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          ⚠ <strong>0 subscribers</strong> — the user-facing bell won't work without a VAPID key.
          Go to <a href="/admin/service-keys" className="underline font-medium">Service Keys → FCM</a> and
          paste your <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">vapidKey</code> (from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates).
        </div>
      )}

      {/* Compose form */}
      <section className="mt-6 rounded-xl border border-line bg-paper-50 p-5">
        <p className="text-sm font-semibold text-ink-700">Compose</p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-700">Title (English)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. New chapter unlocked"
              maxLength={100}
              className="mt-1 w-full rounded-lg border border-line bg-paper-100 px-3 py-2 text-sm text-ink-900 placeholder:text-muted-400 focus:border-ember-500 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-muted-400">{title.length}/100</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-700">Body (English)</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="One-line summary that appears on the lock screen"
              rows={3}
              maxLength={250}
              className="mt-1 w-full rounded-lg border border-line bg-paper-100 px-3 py-2 text-sm text-ink-900 placeholder:text-muted-400 focus:border-ember-500 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-muted-400">{body.length}/250</p>
          </div>

          {/* Hindi (optional) */}
          <div className="rounded-lg border border-line bg-paper-100 p-3">
            <button
              type="button"
              onClick={() => setShowHindi((s) => !s)}
              className="flex w-full items-center justify-between text-xs font-medium text-ink-700"
            >
              <span>Hindi version (अनुवाद) — optional</span>
              <span className="text-muted-500">{showHindi ? '▾' : '▸'}</span>
            </button>
            {showHindi && (
              <div className="mt-3 space-y-3">
                <input
                  value={titleHi}
                  onChange={(e) => setTitleHi(e.target.value)}
                  placeholder="शीर्षक (Hindi title)"
                  maxLength={100}
                  lang="hi"
                  className="w-full rounded-lg border border-line bg-paper-50 px-3 py-2 text-sm text-ink-900 placeholder:text-muted-400 focus:border-ember-500 focus:outline-none"
                />
                <textarea
                  value={bodyHi}
                  onChange={(e) => setBodyHi(e.target.value)}
                  placeholder="विवरण (Hindi body)"
                  rows={3}
                  maxLength={250}
                  lang="hi"
                  className="w-full rounded-lg border border-line bg-paper-50 px-3 py-2 text-sm text-ink-900 placeholder:text-muted-400 focus:border-ember-500 focus:outline-none"
                />
                <p className="text-[11px] text-muted-500">
                  Hindi-language users see this version. Leave blank to show the English text to all users.
                </p>
              </div>
            )}
          </div>

          {/* Audience */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-700">Audience</label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as typeof audience)}
                className="mt-1 w-full rounded-lg border border-line bg-paper-100 px-3 py-2 text-sm text-ink-900 focus:border-ember-500 focus:outline-none"
              >
                <option value="all">All users</option>
                <option value="free">Free plan only</option>
                <option value="paid">Paid users only</option>
                <option value="topic">Topic (subscription)</option>
              </select>
            </div>
            {audience === 'topic' && (
              <div>
                <label className="block text-xs font-medium text-ink-700">Topic name</label>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="current-affairs"
                  className="mt-1 w-full rounded-lg border border-line bg-paper-100 px-3 py-2 text-sm text-ink-900 focus:border-ember-500 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Optional link + image */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-700">Click-through link <span className="text-muted-400">(optional)</span></label>
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://app.nexigrate.com/current-affairs"
                className="mt-1 w-full rounded-lg border border-line bg-paper-100 px-3 py-2 text-sm text-ink-900 focus:border-ember-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700">Image URL <span className="text-muted-400">(optional)</span></label>
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://…"
                className="mt-1 w-full rounded-lg border border-line bg-paper-100 px-3 py-2 text-sm text-ink-900 focus:border-ember-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Send */}
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !status?.configured || !title.trim() || !body.trim()}
            className="rounded-lg bg-ember-500 px-5 py-2.5 text-sm font-medium text-paper-50 hover:bg-ember-600 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send notification'}
          </button>
        </div>
      </section>

      {/* Prompt timing settings */}
      <section className="mt-6 rounded-xl border border-line bg-paper-50 p-5">
        <p className="text-sm font-semibold text-ink-700">Permission prompt timing</p>
        <p className="mt-1 text-xs text-muted-500">Controls the soft-ask popup that invites users to enable notifications. It was appearing too quickly — tune the delay here.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-ink-700">Delay before showing (seconds)</label>
            <input type="number" min={0} max={600} value={promptCfg.promptDelaySeconds}
              onChange={(e) => setPromptCfg(c => ({ ...c, promptDelaySeconds: Number(e.target.value) }))}
              className="mt-1 w-full rounded-lg border border-line bg-paper-100 px-3 py-2 text-sm text-ink-900 focus:border-ember-500 focus:outline-none" />
            <p className="mt-1 text-[11px] text-muted-400">e.g. 60 = wait 1 minute after load</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-700">Re-ask cooldown (days)</label>
            <input type="number" min={0} max={60} value={promptCfg.cooldownDays}
              onChange={(e) => setPromptCfg(c => ({ ...c, cooldownDays: Number(e.target.value) }))}
              className="mt-1 w-full rounded-lg border border-line bg-paper-100 px-3 py-2 text-sm text-ink-900 focus:border-ember-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-700">Max times to ask</label>
            <input type="number" min={1} max={20} value={promptCfg.maxDismissals}
              onChange={(e) => setPromptCfg(c => ({ ...c, maxDismissals: Number(e.target.value) }))}
              className="mt-1 w-full rounded-lg border border-line bg-paper-100 px-3 py-2 text-sm text-ink-900 focus:border-ember-500 focus:outline-none" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-ink-800">
            <input type="checkbox" checked={promptCfg.enabled} onChange={(e) => setPromptCfg(c => ({ ...c, enabled: e.target.checked }))} className="accent-ember-500" />
            Show the prompt
          </label>
          <button type="button" onClick={saveCfg} disabled={savingCfg}
            className="ml-auto rounded-lg bg-ember-500 px-4 py-2 text-sm font-medium text-paper-50 hover:bg-ember-600 disabled:opacity-50">
            {savingCfg ? 'Saving…' : 'Save timing'}
          </button>
        </div>
      </section>

      {/* Send history */}
      <section className="mt-6 rounded-xl border border-line bg-paper-50 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink-700">Notification history</p>
          <button type="button" onClick={loadLogs} className="text-xs text-muted-500 hover:text-ink-800">↻ Refresh</button>
        </div>
        {logs.length === 0 ? (
          <p className="mt-3 text-xs text-muted-400">No notifications sent yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-muted-500">Title</th>
                  <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-muted-500">Audience</th>
                  <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-muted-500">Delivered</th>
                  <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-muted-500">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {logs.map((l) => (
                  <tr key={l.id} className="align-top">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-ink-900">{l.title || '—'}</p>
                      <p className="max-w-[280px] truncate text-[11px] text-muted-400">{l.body}</p>
                    </td>
                    <td className="py-2 pr-3"><span className="pill text-[11px]">{l.audience || l.mode}</span></td>
                    <td className="py-2 pr-3 text-xs text-muted-600">
                      {l.sent ?? 0}/{l.devices ?? 0} devices{typeof l.failed === 'number' && l.failed > 0 ? ` · ${l.failed} failed` : ''}
                      {typeof l.inboxCreated === 'number' && l.inboxCreated > 0 ? ` · ${l.inboxCreated} inbox` : ''}
                    </td>
                    <td className="py-2 pr-3 text-[11px] text-muted-400">{l.sentAt ? new Date(l.sentAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Automatic schedule (in-process cron) */}
      <section className="mt-6 rounded-xl border border-line bg-paper-50 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-ink-700">Automatic schedule</p>
            <p className="mt-0.5 text-xs text-muted-500">
              These jobs run automatically inside the app — no external scheduler, no GitHub.
              Turn the whole scheduler or any single job on/off, or trigger one right now.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {cron?.available && (
              <label className="flex items-center gap-2 text-xs font-medium text-ink-800">
                <input
                  type="checkbox"
                  checked={cron.enabled}
                  disabled={cronBusy !== null}
                  onChange={(e) => updateCronConfig({ enabled: e.target.checked })}
                  className="accent-ember-500"
                />
                {cron.enabled ? 'Scheduler ON' : 'Scheduler OFF'}
              </label>
            )}
            <button type="button" onClick={loadCron} className="text-xs text-muted-500 hover:text-ink-800">↻ Refresh</button>
          </div>
        </div>

        {!cron?.available ? (
          <p className="mt-3 text-xs text-muted-400">Scheduler not available on this deployment.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-muted-500">Job</th>
                  <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-muted-500">Schedule</th>
                  <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-muted-500">Last run</th>
                  <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-muted-500">On</th>
                  <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-muted-500" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {cron.jobs.map((j) => (
                  <tr key={j.id} className="align-top">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-ink-900">{j.label}</p>
                      <p className="max-w-[280px] text-[11px] text-muted-400">{j.description}</p>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-600 whitespace-nowrap">{j.schedule}</td>
                    <td className="py-2 pr-3 text-[11px]">
                      {j.lastRunAt ? (
                        <>
                          <span className={j.lastStatus === 'error' ? 'text-ember-600' : 'text-emerald-600'}>
                            {j.lastStatus === 'error' ? '✗ error' : '✓ ok'}
                          </span>
                          <span className="text-muted-400"> · {new Date(j.lastRunAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span>
                          {j.lastTrigger === 'manual' ? <span className="text-muted-400"> · manual</span> : null}
                          {j.lastResult && Object.keys(j.lastResult).length > 0 && (
                            <p className="max-w-[260px] truncate text-muted-500">{summariseResult(j.lastResult)}</p>
                          )}
                          {j.lastError && <p className="max-w-[260px] truncate text-ember-600">{j.lastError}</p>}
                        </>
                      ) : (
                        <span className="text-muted-400">Never run</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={j.enabled}
                        disabled={cronBusy !== null || !cron.enabled}
                        onChange={(e) => updateCronConfig({ jobs: { [j.id]: e.target.checked } })}
                        className="accent-ember-500"
                        title={cron.enabled ? '' : 'Enable the scheduler first'}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        onClick={() => runJob(j.id)}
                        disabled={cronBusy !== null || j.running}
                        className="rounded-lg border border-line bg-paper-100 px-2.5 py-1 text-[11px] text-ink-800 hover:bg-paper-200 disabled:opacity-50 whitespace-nowrap"
                      >
                        {cronBusy === j.id || j.running ? 'Running…' : 'Run now'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Automatic / personalized notification log (per recipient) */}
      <section className="mt-6 rounded-xl border border-line bg-paper-50 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-ink-700">Automatic &amp; re-engagement nudges</p>
            <p className="mt-0.5 text-xs text-muted-500">
              Personalized notifications fired by the system (idle re-engagement, streak reminders,
              daily digest) — who received what, on which channel, and when.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={autoSource}
              onChange={(e) => { const v = e.target.value as typeof autoSource; setAutoSource(v); void loadAutoLogs(v); }}
              className="rounded-lg border border-line bg-paper-100 px-2 py-1.5 text-xs text-ink-900 focus:border-ember-500 focus:outline-none"
            >
              <option value="">All sources</option>
              <option value="reengage">Re-engagement</option>
              <option value="streak">Streak</option>
              <option value="daily-digest">Daily digest</option>
            </select>
            <button type="button" onClick={() => loadAutoLogs()} className="text-xs text-muted-500 hover:text-ink-800">↻ Refresh</button>
          </div>
        </div>
        {autoLogs.length === 0 ? (
          <p className="mt-3 text-xs text-muted-400">No automatic notifications sent yet. The hourly re-engagement cron records them here.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-muted-500">Recipient</th>
                  <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-muted-500">Notification</th>
                  <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-muted-500">Source</th>
                  <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-muted-500">Channel</th>
                  <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-muted-500">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {autoLogs.map((l) => (
                  <tr key={l.id} className="align-top">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-ink-900">{l.userName || '—'}</p>
                      <p className="max-w-[180px] truncate text-[11px] text-muted-400">{l.userEmail || l.userId}</p>
                    </td>
                    <td className="py-2 pr-3">
                      <p className="max-w-[260px] truncate font-medium text-ink-900">{l.title}</p>
                      <p className="max-w-[260px] truncate text-[11px] text-muted-400">{l.body}</p>
                    </td>
                    <td className="py-2 pr-3"><span className="pill text-[11px]">{l.source}</span></td>
                    <td className="py-2 pr-3 text-xs">
                      {l.channel === 'push' ? (
                        <span className={l.pushDelivered ? 'text-emerald-600' : 'text-ember-600'}>
                          {l.pushDelivered ? 'Push ✓' : 'Push ✗'}
                          {typeof l.pushSuccess === 'number' ? ` (${l.pushSuccess}/${(l.pushSuccess ?? 0) + (l.pushFailure ?? 0)})` : ''}
                        </span>
                      ) : (
                        <span className="text-muted-600">In-app</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-[11px] text-muted-400">{l.createdAt ? new Date(l.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Help */}
      <section className="mt-6 rounded-lg border border-line bg-paper-100 p-4 text-xs text-muted-500 space-y-2">
        <p className="font-medium text-ink-800">How push works:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Audience targeting</strong> fans out to every device a matching user has registered (`fcmTokens` on their user doc).</li>
          <li><strong>Topic broadcasts</strong> reach anyone subscribed to that topic via the client SDK — useful for `current-affairs` digest.</li>
          <li><strong>Hindi version</strong> is delivered automatically to users with `language === 'hi'`. Without it, all users see the English copy.</li>
          <li><strong>Invalid tokens are auto-pruned</strong> — when FCM reports a revoked / unregistered token, we remove it from the user doc so the next broadcast doesn't waste cycles.</li>
        </ul>
      </section>
    </div>
  );
}
