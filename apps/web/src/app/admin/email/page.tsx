'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

export default function AdminEmailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/admin/login'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const auth = getFirebaseAuthClient();
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`${API}/v1/admin/email/status`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) { const data = (await res.json()) as { configured: boolean }; setConfigured(data.configured); }
      } catch { setConfigured(false); }
    })();
  }, [user]);

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) return;
    setSending(true); setError(null); setResult(null);
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const payload: Record<string, string> = { subject, body: body };
      if (to.trim()) payload.to = to.trim();
      const res = await fetch(`${API}/v1/admin/email/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = (await res.json()) as { success?: boolean; sent?: number };
      setResult(data.sent ? `Sent to ${data.sent} users` : data.success ? 'Email sent!' : 'Failed to send');
      setTo(''); setSubject(''); setBody('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSending(false); }
  };

  if (loading || !user) return <div className="space-y-4"><div className="h-7 w-32 rounded bg-paper-300 animate-pulse" /><div className="h-40 rounded bg-paper-300 animate-pulse" /></div>;

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-ink-900 dark:text-paper-50">Email</h1>
      <p className="mt-1 text-sm text-muted-500">Send emails to users via Resend</p>

      {configured === false && (
        <div className="banner banner-error mt-4">Email not configured. Set RESEND_API_KEY in environment variables.</div>
      )}
      {configured === true && (
        <span className="inline-flex items-center gap-1.5 mt-3 rounded-full bg-gold-500/10 px-3 py-1 text-xs font-medium text-gold-600 dark:text-gold-500">
          <span className="h-2 w-2 rounded-full bg-gold-500" /> Resend Connected
        </span>
      )}

      {error && <div className="banner banner-error mt-4">{error}</div>}
      {result && <div className="banner mt-4" style={{ borderColor: '#10b981', background: '#ecfdf5' }}>{result}</div>}

      <div className="paper-card mt-6 p-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-ink-700 dark:text-paper-300">To (email or leave blank for all)</label>
          <input value={to} onChange={e => setTo(e.target.value)} className="input mt-1" placeholder="user@example.com (optional)" />
        </div>
        <div>
          <label className="text-xs font-medium text-ink-700 dark:text-paper-300">Subject</label>
          <input value={subject} onChange={e => setSubject(e.target.value)} className="input mt-1" placeholder="Email subject" />
        </div>
        <div>
          <label className="text-xs font-medium text-ink-700 dark:text-paper-300">Body (HTML)</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} className="input mt-1" rows={6} placeholder="<h1>Hello!</h1><p>Your message here...</p>" />
        </div>
        <button onClick={handleSend} disabled={sending || !subject.trim() || !body.trim()} className="btn-primary w-full">
          {sending ? 'Sending...' : to.trim() ? 'Send to User' : 'Send to All Users'}
        </button>
      </div>
    </div>
  );
}
