'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
}

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
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [activeTab, setActiveTab] = useState<'compose' | 'templates'>('compose');

  useEffect(() => { if (!loading && !user) router.replace('/admin/login'); }, [user, loading, router]);

  const getToken = async () => {
    const auth = getFirebaseAuthClient();
    return auth.currentUser?.getIdToken();
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await getToken();
        const [statusRes, templatesRes] = await Promise.all([
          fetch(`${API}/v1/admin/email/status`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/v1/admin/email/templates`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (statusRes.ok) { const data = (await statusRes.json()) as { configured: boolean }; setConfigured(data.configured); }
        if (templatesRes.ok) { const data = (await templatesRes.json()) as { templates: EmailTemplate[] }; setTemplates(data.templates); }
      } catch { setConfigured(false); }
    })();
  }, [user]);

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) return;
    setSending(true); setError(null); setResult(null);
    try {
      const token = await getToken();
      const payload: Record<string, string> = { subject, body };
      if (to.trim()) payload.to = to.trim();
      const res = await fetch(`${API}/v1/admin/email/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = (await res.json()) as { success?: boolean; sent?: number };
      setResult(data.sent ? `Sent to ${data.sent} users` : data.success ? 'Email sent!' : 'Failed to send');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSending(false); }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim() || !subject.trim() || !body.trim()) return;
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/email/templates`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: templateName, subject, body }),
      });
      if (res.ok) {
        const data = (await res.json()) as { id: string };
        setTemplates(prev => [{ id: data.id, name: templateName, subject, body, createdAt: new Date().toISOString() }, ...prev]);
        setTemplateName('');
        setShowSaveTemplate(false);
      }
    } catch { /* ignore */ }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      const token = await getToken();
      await fetch(`${API}/v1/admin/email/templates/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch { /* ignore */ }
  };

  const loadTemplate = (t: EmailTemplate) => {
    setSubject(t.subject);
    setBody(t.body);
    setActiveTab('compose');
  };

  if (loading || !user) return <div className="space-y-4"><div className="h-7 w-32 rounded bg-paper-300 animate-pulse" /><div className="h-40 rounded bg-paper-300 animate-pulse" /></div>;

  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Email</h1>
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
      {result && <div className="banner banner-success mt-4">{result}</div>}

      {/* Tabs */}
      <div className="mt-6 flex gap-2">
        <button onClick={() => setActiveTab('compose')} className={`pill ${activeTab === 'compose' ? 'bg-ink-900 text-paper-50 border-ink-900' : ''}`}>
          Compose
        </button>
        <button onClick={() => setActiveTab('templates')} className={`pill ${activeTab === 'templates' ? 'bg-ink-900 text-paper-50 border-ink-900' : ''}`}>
          Templates ({templates.length})
        </button>
      </div>

      {activeTab === 'compose' && (
        <div className="paper-card mt-4 p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-ink-700">To (email or leave blank for all users)</label>
            <input value={to} onChange={e => setTo(e.target.value)} className="input mt-1" placeholder="user@example.com (optional — blank = all users)" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700">Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} className="input mt-1" placeholder="Email subject" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700">Body (HTML supported)</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} className="input mt-1 font-mono text-xs" rows={8} placeholder="<h1>Hello {{name}}!</h1><p>Your message here...</p>" />
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleSend} disabled={sending || !subject.trim() || !body.trim()} className="btn-primary flex-1">
              {sending ? 'Sending...' : to.trim() ? 'Send to User' : 'Send to All Users'}
            </button>
            <button onClick={() => setShowSaveTemplate(!showSaveTemplate)} className="btn-ghost text-sm" disabled={!subject.trim() || !body.trim()}>
              💾 Save as Template
            </button>
          </div>

          {showSaveTemplate && (
            <div className="flex items-center gap-2 p-3 bg-paper-200 rounded-lg">
              <input value={templateName} onChange={e => setTemplateName(e.target.value)} className="input flex-1" placeholder="Template name (e.g. Welcome Email)" />
              <button onClick={handleSaveTemplate} disabled={!templateName.trim()} className="btn-primary text-sm">Save</button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="mt-4 space-y-3">
          {templates.length === 0 ? (
            <div className="paper-card p-8 text-center">
              <span className="text-3xl">📝</span>
              <p className="mt-2 text-sm text-muted-500">No templates saved yet. Compose an email and save it as a template.</p>
            </div>
          ) : (
            templates.map(t => (
              <div key={t.id} className="paper-card p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-sm text-ink-900 truncate">{t.name}</h3>
                    <p className="text-xs text-muted-500 mt-0.5 truncate">Subject: {t.subject}</p>
                    <p className="text-[10px] text-muted-400 mt-0.5">{new Date(t.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <button onClick={() => loadTemplate(t)} className="btn-ghost-sm text-xs">Use</button>
                    <button onClick={() => handleDeleteTemplate(t.id)} className="btn-ghost-sm text-xs text-ember-600">Delete</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
