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

interface PushStatus {
  configured: boolean;
  provider?: string;
  reason?: string;
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

  useEffect(() => {
    if (!loading && !user) router.replace('/admin/login');
  }, [user, loading, router]);

  const getToken = async () => {
    const auth = getFirebaseAuthClient();
    return auth.currentUser?.getIdToken();
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
      // PR-45: register this device's token first so "test to me" works
      // even if admin hasn't tapped the bell icon on the dashboard.
      try {
        const { registerPushToken } = await import('~/lib/pushClient');
        await registerPushToken();
      } catch { /* non-fatal — might already be registered or permission denied */ }

      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/push/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { sent?: number; devices?: number; failed?: number; message?: string };
      if (res.ok) {
        toast.success(`Test sent to ${data.sent ?? 0} of ${data.devices ?? 0} of your devices`);
      } else {
        // Show helpful message if no tokens registered
        const msg = data.message ?? `Test failed (HTTP ${res.status})`;
        if (msg.includes('No push tokens')) {
          toast.error('No device registered. Please allow notifications when prompted, then retry.');
        } else {
          toast.error(msg);
        }
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
          <>✓ FCM configured (provider: {status.provider})</>
        ) : (
          <>
            ⚠ Push not configured — open <a href="/admin/service-keys" className="underline">Admin → Service Keys → FCM</a> and save the service-account JSON.
            {status?.reason ? ` Reason: ${status.reason}` : null}
          </>
        )}
      </div>

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
