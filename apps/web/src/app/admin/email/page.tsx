'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';
import { api, type MailboxThread, type MailboxMessage } from '~/lib/api';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
}

interface EmailLog {
  id: string;
  to?: string;
  subject?: string;
  status?: string;
  sentAt?: string;
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
  const [activeTab, setActiveTab] = useState<'compose' | 'mailbox' | 'templates' | 'logs' | 'settings'>('compose');
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [emailConfig, setEmailConfig] = useState<Record<string, any>>({});

  // Mailbox state
  const [threads, setThreads] = useState<MailboxThread[]>([]);
  const [mailboxUnread, setMailboxUnread] = useState(0);
  const [threadFilter, setThreadFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [selectedThread, setSelectedThread] = useState<MailboxThread | null>(null);
  const [threadMessages, setThreadMessages] = useState<MailboxMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [composeFields, setComposeFields] = useState({ to: '', name: '', subject: '', text: '' });

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
        const [statusRes, templatesRes, logsRes, configRes] = await Promise.all([
          fetch(`${API}/v1/admin/email/status`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/v1/admin/email/templates`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/v1/admin/email/logs`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/v1/admin/email/config`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (statusRes.ok) { const data = (await statusRes.json()) as { configured: boolean }; setConfigured(data.configured); }
        if (templatesRes.ok) { const data = (await templatesRes.json()) as { templates: EmailTemplate[] }; setTemplates(data.templates); }
        if (logsRes.ok) { const data = (await logsRes.json()) as { logs: EmailLog[] }; setEmailLogs(data.logs); }
        if (configRes.ok) { const data = (await configRes.json()) as { config: Record<string, any> }; setEmailConfig(data.config); }
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

  // ── Mailbox ──────────────────────────────────────────────────────────
  const loadThreads = async (filter: 'open' | 'closed' | 'all' = threadFilter) => {
    try {
      const res = await api.getMailboxThreads(filter === 'all' ? undefined : filter);
      setThreads(res.threads);
      setMailboxUnread(res.unreadCount);
    } catch { /* ignore */ }
  };

  // Load unread badge once on mount; full list when the tab is opened.
  useEffect(() => { if (user) void loadThreads('open'); /* eslint-disable-next-line */ }, [user]);
  useEffect(() => { if (user && activeTab === 'mailbox') void loadThreads(threadFilter); /* eslint-disable-next-line */ }, [activeTab, threadFilter]);

  const openThread = async (t: MailboxThread) => {
    setSelectedThread(t);
    setThreadMessages([]);
    try {
      const res = await api.getMailboxThread(t.id);
      setSelectedThread(res.thread);
      setThreadMessages(res.messages);
      // opening marks read server-side; reflect locally
      setThreads(prev => prev.map(x => x.id === t.id ? { ...x, unreadByAdmin: false } : x));
      setMailboxUnread(c => Math.max(0, c - (t.unreadByAdmin ? 1 : 0)));
    } catch { /* ignore */ }
  };

  const sendReply = async () => {
    if (!selectedThread || !replyText.trim()) return;
    setReplying(true); setError(null);
    try {
      const res = await api.mailboxReply(selectedThread.id, replyText.trim());
      setThreadMessages(prev => [...prev, res.message]);
      setReplyText('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Reply failed'); }
    finally { setReplying(false); }
  };

  const sendCompose = async () => {
    if (!composeFields.to.trim() || !composeFields.subject.trim() || !composeFields.text.trim()) return;
    setReplying(true); setError(null);
    try {
      const res = await api.mailboxCompose({
        to: composeFields.to.trim(),
        ...(composeFields.name.trim() ? { name: composeFields.name.trim() } : {}),
        subject: composeFields.subject.trim(),
        text: composeFields.text.trim(),
      });
      setShowCompose(false);
      setComposeFields({ to: '', name: '', subject: '', text: '' });
      await loadThreads('open');
      void openThread(res.thread);
    } catch (e) { setError(e instanceof Error ? e.message : 'Send failed'); }
    finally { setReplying(false); }
  };

  const toggleThreadStatus = async () => {
    if (!selectedThread) return;
    const next = selectedThread.status === 'open' ? 'closed' : 'open';
    try {
      await api.setMailboxThreadStatus(selectedThread.id, next);
      setSelectedThread({ ...selectedThread, status: next });
      await loadThreads(threadFilter);
    } catch { /* ignore */ }
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
        <button onClick={() => setActiveTab('mailbox')} className={`pill ${activeTab === 'mailbox' ? 'bg-ink-900 text-paper-50 border-ink-900' : ''}`}>
          Mailbox{mailboxUnread > 0 ? ` (${mailboxUnread})` : ''}
        </button>
        <button onClick={() => setActiveTab('templates')} className={`pill ${activeTab === 'templates' ? 'bg-ink-900 text-paper-50 border-ink-900' : ''}`}>
          Templates ({templates.length})
        </button>
        <button onClick={() => setActiveTab('logs')} className={`pill ${activeTab === 'logs' ? 'bg-ink-900 text-paper-50 border-ink-900' : ''}`}>
          Logs ({emailLogs.length})
        </button>
        <button onClick={() => setActiveTab('settings')} className={`pill ${activeTab === 'settings' ? 'bg-ink-900 text-paper-50 border-ink-900' : ''}`}>
          Settings
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

      {activeTab === 'mailbox' && (
        <div className="mt-4">
          {/* Toolbar */}
          <div className="mb-3 flex items-center gap-2">
            <div className="flex gap-1">
              {(['open', 'closed', 'all'] as const).map(f => (
                <button key={f} onClick={() => setThreadFilter(f)} className={`pill text-xs ${threadFilter === f ? 'bg-ink-900 text-paper-50 border-ink-900' : ''}`}>
                  {f === 'open' ? 'Open' : f === 'closed' ? 'Closed' : 'All'}
                </button>
              ))}
            </div>
            <button onClick={() => { setShowCompose(true); setSelectedThread(null); }} className="btn-primary text-sm ml-auto">✉️ New conversation</button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
            {/* Thread list */}
            <div className="paper-card divide-y divide-paper-200 max-h-[70vh] overflow-y-auto">
              {threads.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-500">No conversations yet.</div>
              ) : threads.map(t => (
                <button key={t.id} onClick={() => { setShowCompose(false); void openThread(t); }}
                  className={`block w-full p-3 text-left hover:bg-paper-100 ${selectedThread?.id === t.id ? 'bg-paper-100' : ''}`}>
                  <div className="flex items-center gap-2">
                    {t.unreadByAdmin && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-ember-500" />}
                    <span className="truncate text-sm font-medium text-ink-900">{t.participantName || t.participantEmail}</span>
                    {t.status === 'closed' && <span className="ml-auto text-[10px] text-muted-400">closed</span>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-600">{t.subject}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-400">{t.lastDirection === 'inbound' ? '↩ ' : '→ '}{t.preview}</p>
                </button>
              ))}
            </div>

            {/* Conversation / compose */}
            <div className="paper-card p-4 flex flex-col max-h-[70vh]">
              {showCompose ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-ink-900">New conversation</h3>
                  <input value={composeFields.to} onChange={e => setComposeFields(f => ({ ...f, to: e.target.value }))} className="input" placeholder="Recipient email" />
                  <input value={composeFields.name} onChange={e => setComposeFields(f => ({ ...f, name: e.target.value }))} className="input" placeholder="Name (optional)" />
                  <input value={composeFields.subject} onChange={e => setComposeFields(f => ({ ...f, subject: e.target.value }))} className="input" placeholder="Subject" />
                  <textarea value={composeFields.text} onChange={e => setComposeFields(f => ({ ...f, text: e.target.value }))} className="input" rows={6} placeholder="Your message…" />
                  <div className="flex gap-2">
                    <button onClick={sendCompose} disabled={replying} className="btn-primary flex-1">{replying ? 'Sending…' : 'Send'}</button>
                    <button onClick={() => setShowCompose(false)} className="btn-ghost">Cancel</button>
                  </div>
                </div>
              ) : !selectedThread ? (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-500">Select a conversation to read &amp; reply.</div>
              ) : (
                <>
                  <div className="flex items-center justify-between border-b border-paper-200 pb-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-900">{selectedThread.participantName || selectedThread.participantEmail}</p>
                      <p className="truncate text-xs text-muted-500">{selectedThread.subject} · {selectedThread.participantEmail}</p>
                    </div>
                    <button onClick={toggleThreadStatus} className="btn-ghost-sm text-xs flex-shrink-0">{selectedThread.status === 'open' ? 'Close' : 'Reopen'}</button>
                  </div>

                  <div className="flex-1 space-y-3 overflow-y-auto py-3">
                    {threadMessages.map(m => (
                      <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.direction === 'outbound' ? 'bg-ember-500/10 text-ink-900' : 'bg-paper-200 text-ink-800'}`}>
                          <p className="whitespace-pre-wrap">{m.text}</p>
                          <p className="mt-1 text-[10px] text-muted-400">
                            {m.direction === 'outbound' ? (m.authorAdminEmail ? `you · ${m.authorAdminEmail}` : 'you') : m.from}
                            {' · '}{new Date(m.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                            {m.status ? ` · ${m.status}` : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-paper-200 pt-3">
                    <textarea value={replyText} onChange={e => setReplyText(e.target.value)} className="input" rows={3} placeholder="Type your reply…" />
                    <button onClick={sendReply} disabled={replying || !replyText.trim()} className="btn-primary mt-2 w-full">{replying ? 'Sending…' : 'Send reply'}</button>
                  </div>
                </>
              )}
            </div>
          </div>
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

      {activeTab === 'logs' && (
        <div className="mt-4">
          {emailLogs.length === 0 ? (
            <div className="paper-card p-8 text-center">
              <span className="text-3xl">📬</span>
              <p className="mt-2 text-sm text-muted-500">No email logs yet.</p>
            </div>
          ) : (
            <div className="paper-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-paper-300">
                    <th className="p-3 text-left text-xs font-medium text-muted-500">To</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-500">Subject</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-500">Type</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-500">Status</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-500">Sent At</th>
                  </tr>
                </thead>
                <tbody>
                  {emailLogs.map(log => (
                    <tr key={log.id} className="border-b border-paper-200">
                      <td className="p-3 text-xs text-ink-700 truncate max-w-[150px]">{log.to ?? '—'}</td>
                      <td className="p-3 text-xs text-ink-700 truncate max-w-[200px]">{log.subject ?? '—'}</td>
                      <td className="p-3 text-xs text-muted-500">{(log as any).type ?? '—'}</td>
                      <td className="p-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          log.status === 'sent' ? 'bg-gold-500/10 text-gold-600' : 'bg-ember-500/10 text-ember-600'
                        }`}>
                          {log.status ?? 'unknown'}
                        </span>
                      </td>
                      <td className="p-3 text-[10px] text-muted-400">{log.sentAt ? new Date(log.sentAt).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="mt-4 space-y-4">
          {/* Auto-email types */}
          <div className="paper-card p-5">
            <h2 className="text-sm font-semibold text-ink-900">Auto-Email Types</h2>
            <p className="text-xs text-muted-500 mt-1">Enable/disable automatic emails. All use Resend (hello@nexigrate.com).</p>
            <div className="mt-4 space-y-3">
              {[
                { id: 'welcome', label: 'Welcome Email', desc: 'Sent after first sign-up + assessment' },
                { id: 'streak_reminder', label: 'Streak Reminder', desc: 'Daily 7pm IST to at-risk users' },
                { id: 'payment_success', label: 'Payment Receipt', desc: 'After Razorpay payment verified' },
                { id: 'plan_expiry', label: 'Plan Expiry Warning', desc: '3 days before plan expires' },
                { id: 'cancellation', label: 'Cancellation Confirmation', desc: 'When user cancels plan' },
                { id: 'forgot_password', label: 'Forgot Password', desc: 'Firebase password reset email' },
              ].map(type => (
                <div key={type.id} className="flex items-center justify-between py-2 border-b border-paper-200 last:border-0">
                  <div>
                    <p className="text-sm text-ink-800">{type.label}</p>
                    <p className="text-[11px] text-muted-400">{type.desc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emailConfig[`${type.id}_enabled`] !== false}
                      onChange={async (e) => {
                        const newConfig = { ...emailConfig, [`${type.id}_enabled`]: e.target.checked };
                        setEmailConfig(newConfig);
                        const token = await getToken();
                        fetch(`${API}/v1/admin/email/config`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ [`${type.id}_enabled`]: e.target.checked }),
                        }).catch(() => {});
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-paper-300 peer-focus:ring-2 peer-focus:ring-ember-500/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-paper-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-ember-500"></div>
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Sender Config */}
          <div className="paper-card p-5">
            <h2 className="text-sm font-semibold text-ink-900">Sender Addresses</h2>
            <p className="text-xs text-muted-500 mt-1">Configure who emails come from. Domain must be verified in Resend.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-ink-700">Transactional (welcome, receipts, streak)</label>
                <input
                  value={emailConfig.transactionalFrom ?? 'hello@nexigrate.com'}
                  onChange={(e) => setEmailConfig(c => ({ ...c, transactionalFrom: e.target.value }))}
                  className="input mt-1"
                  placeholder="hello@nexigrate.com"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-700">Marketing (campaigns, broadcasts)</label>
                <input
                  value={emailConfig.marketingFrom ?? 'admin@nexigrate.com'}
                  onChange={(e) => setEmailConfig(c => ({ ...c, marketingFrom: e.target.value }))}
                  className="input mt-1"
                  placeholder="admin@nexigrate.com"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-700">From Name</label>
                <input
                  value={emailConfig.fromName ?? 'Nexigrate'}
                  onChange={(e) => setEmailConfig(c => ({ ...c, fromName: e.target.value }))}
                  className="input mt-1"
                  placeholder="Nexigrate"
                />
              </div>
              <button
                onClick={async () => {
                  const token = await getToken();
                  await fetch(`${API}/v1/admin/email/config`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify(emailConfig),
                  });
                  setResult('Settings saved!');
                  setTimeout(() => setResult(null), 3000);
                }}
                className="btn-primary mt-2"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
