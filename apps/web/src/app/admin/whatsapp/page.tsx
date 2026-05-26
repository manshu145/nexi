'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

export default function AdminWhatsAppPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
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
        const res = await fetch(`${API}/v1/admin/whatsapp/status`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) { const data = (await res.json()) as { configured: boolean }; setConfigured(data.configured); }
      } catch { setConfigured(false); }
    })();
  }, [user]);

  const handleSend = async () => {
    if (!to.trim() || !message.trim()) return;
    setSending(true); setError(null); setResult(null);
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API}/v1/admin/whatsapp/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: to.trim(), message: message.trim() }),
      });
      if (!res.ok) { const d = (await res.json()) as { message?: string }; throw new Error(d.message || `Failed: ${res.status}`); }
      setResult('WhatsApp message sent!');
      setTo(''); setMessage('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSending(false); }
  };

  if (loading || !user) return <div className="space-y-4"><div className="h-7 w-32 rounded bg-paper-300 dark:bg-ink-700 animate-pulse" /><div className="h-40 rounded bg-paper-300 dark:bg-ink-700 animate-pulse" /></div>;

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-ink-900 dark:text-paper-50">WhatsApp</h1>
      <p className="mt-1 text-sm text-muted-500">Send WhatsApp messages to users via Meta Business API</p>

      {configured === false && (
        <div className="paper-card mt-4 p-5 border-amber-500/50">
          <p className="text-sm font-medium text-ink-900 dark:text-paper-50">⚠️ WhatsApp Not Configured</p>
          <p className="mt-2 text-xs text-muted-500">To enable WhatsApp messaging, you need:</p>
          <ol className="mt-2 text-xs text-muted-500 list-decimal list-inside space-y-1">
            <li>Create a Meta Business account at business.facebook.com</li>
            <li>Set up WhatsApp Business API in Meta Developer Console</li>
            <li>Get your Phone Number ID and Access Token</li>
            <li>Add to environment: WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID</li>
          </ol>
        </div>
      )}
      {configured === true && (
        <span className="inline-flex items-center gap-1.5 mt-3 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> WhatsApp Connected
        </span>
      )}

      {error && <div className="banner banner-error mt-4">{error}</div>}
      {result && <div className="banner mt-4" style={{ borderColor: '#10b981', background: '#ecfdf5' }}>{result}</div>}

      <div className="paper-card mt-6 p-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-ink-700 dark:text-paper-300">Phone Number (+91XXXXXXXXXX)</label>
          <input value={to} onChange={e => setTo(e.target.value)} className="input mt-1" placeholder="+919876543210" />
        </div>
        <div>
          <label className="text-xs font-medium text-ink-700 dark:text-paper-300">Message</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)} className="input mt-1" rows={4} placeholder="Type your message..." maxLength={1000} />
          <p className="mt-1 text-xs text-muted-400">{message.length}/1000</p>
        </div>
        <button onClick={handleSend} disabled={sending || !to.trim() || !message.trim() || configured === false} className="btn-primary w-full">
          {sending ? 'Sending...' : 'Send WhatsApp Message'}
        </button>
      </div>
    </div>
  );
}
