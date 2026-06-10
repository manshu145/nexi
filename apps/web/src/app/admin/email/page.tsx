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

interface Contact {
  email: string;
  name: string;
  plan: string;
  createdAt: string;
}

type RecipientMode = 'all' | 'contacts' | 'manual';

/** Client-side preview of the branded shell the API wraps bodies in. */
function previewShell(inner: string): string {
  return `<div style="background:#FAF7F2;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><div style="max-width:600px;margin:0 auto"><div style="text-align:center;padding:16px 0;border-bottom:3px solid #D97706"><span style="font-size:20px;font-weight:700;color:#1C1917;letter-spacing:-0.5px">⬛ Nexigrate</span></div><div style="background:#fff;padding:24px;border-radius:12px;margin-top:14px;border:1px solid #E7E5E4;color:#44403C;font-size:15px;line-height:1.6">${inner || '<span style=\"color:#A8A29E\">Your message preview…</span>'}</div><div style="text-align:center;padding:16px 0;color:#78716C;font-size:11px">© 2026 Nexigrate · Unsubscribe · Privacy</div></div></div>`;
}

export default function AdminEmailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [configured, setConfigured] = useState<boolean | null>(null);
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

  // ── Bulk composer (Outlook-like) ──────────────────────────────────────
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('manual');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [manualEmails, setManualEmails] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [logLimit, setLogLimit] = useState(200);
  const [logsLoading, setLogsLoading] = useState(false);

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
          fetch(`${API}/v1/admin/email/logs?limit=200`, { headers: { Authorization: `Bearer ${token}` } }),
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

    // Resolve recipients from the active mode.
    let emails: string[] = [];
    let broadcastAll = false;
    if (recipientMode === 'all') {
      broadcastAll = true;
    } else if (recipientMode === 'contacts') {
      emails = [...selectedEmails];
      if (emails.length === 0) { setError('Select at least one contact.'); return; }
    } else {
      emails = manualEmails
        .split(/[\s,;]+/).map(e => e.trim()).filter(e => e.includes('@'));
      if (emails.length === 0) { setError('Enter at least one valid email.'); return; }
    }

    const count = broadcastAll ? contactsTotal || 'all' : emails.length;
    if (!confirm(`Send this email to ${count} recipient${count === 1 ? '' : 's'}?`)) return;

    setSending(true); setError(null); setResult(null);
    try {
      const token = await getToken();
      const payload: Record<string, unknown> = { subject, body };
      if (broadcastAll) payload.confirmBroadcast = true;
      else if (emails.length === 1) payload.to = emails[0];
      else payload.emails = emails;
      const res = await fetch(`${API}/v1/admin/email/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const t = await res.json().catch(() => ({})) as { message?: string }; throw new Error(t.message || `Failed: ${res.status}`); }
      const data = (await res.json()) as { success?: boolean; sent?: number; failed?: number };
      setResult(
        typeof data.sent === 'number'
          ? `Sent to ${data.sent} recipient${data.sent === 1 ? '' : 's'}${data.failed ? ` · ${data.failed} failed` : ''}`
          : data.success ? 'Email sent!' : 'Failed to send',
      );
      void loadLogs();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSending(false); }
  };

  const loadContacts = async (search = '') => {
    setContactsLoaded(false);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/email/recipients?search=${encodeURIComponent(search)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = (await res.json()) as { contacts: Contact[]; total: number };
        setContacts(data.contacts);
        setContactsTotal(data.total);
      }
    } catch { /* ignore */ }
    finally { setContactsLoaded(true); }
  };

  const loadLogs = async (limit = logLimit) => {
    setLogsLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/email/logs?limit=${limit}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = (await res.json()) as { logs: EmailLog[] }; setEmailLogs(data.logs); }
    } catch { /* ignore */ }
    finally { setLogsLoading(false); }
  };

  // Load contacts the first time the user switches to the contacts/all modes.
  useEffect(() => {
    if ((recipientMode === 'contacts' || recipientMode === 'all') && !contactsLoaded && user) void loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientMode, user]);

  const toggleContact = (email: string) => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email); else next.add(email);
      return next;
    });
  };
  const selectAllVisible = () => setSelectedEmails(new Set(contacts.map(c => c.email)));
  const clearSelection = () => setSelectedEmails(new Set());

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

  const TABS = [
    { id: 'compose', icon: '✏️', label: 'Compose' },
    { id: 'mailbox', icon: '💬', label: 'Mailbox', badge: mailboxUnread > 0 ? mailboxUnread : undefined },
    { id: 'templates', icon: '📝', label: 'Templates', count: templates.length },
    { id: 'logs', icon: '📬', label: 'Logs', count: emailLogs.length },
    { id: 'settings', icon: '⚙️', label: 'Settings' },
  ] as const;

  return (
    <div className="max-w-5xl">
      {/* Module header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-ember-500/10 text-xl">✉️</span>
          <div>
            <h1 className="font-serif text-2xl font-bold leading-tight text-ink-900">Email</h1>
            <p className="text-sm text-muted-500">Broadcasts, conversations &amp; delivery logs</p>
          </div>
        </div>
        {configured === true ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-500">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Resend connected
          </span>
        ) : configured === false ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-600">
            <span className="h-2 w-2 rounded-full bg-red-500" /> Not configured
          </span>
        ) : null}
      </div>

      {configured === false && (
        <div className="banner banner-error mt-4">Email not configured. Set RESEND_API_KEY in environment variables.</div>
      )}
      {error && <div className="banner banner-error mt-4">{error}</div>}
      {result && <div className="banner banner-success mt-4">{result}</div>}

      {/* Tab bar — professional underlined nav */}
      <div className="mt-5 border-b border-line">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'border-ember-500 text-ink-900' : 'border-transparent text-muted-500 hover:text-ink-900 hover:border-line'
                }`}
              >
                <span className="text-base leading-none">{tab.icon}</span>
                {tab.label}
                {'count' in tab && typeof tab.count === 'number' && (
                  <span className="rounded-full bg-paper-200 px-1.5 py-0.5 text-[10px] font-semibold text-muted-600 tabular-nums">{tab.count}</span>
                )}
                {'badge' in tab && tab.badge !== undefined && (
                  <span className="rounded-full bg-ember-500 px-1.5 py-0.5 text-[10px] font-bold text-paper-50 tabular-nums">{tab.badge}</span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === 'compose' && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(300px,420px)]">
          {/* Composer */}
          <div className="paper-card p-5 space-y-4">
            {/* Recipient mode selector */}
            <div>
              <label className="text-xs font-medium text-ink-700">Recipients</label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {([
                  { id: 'manual', label: '✏️ Type emails' },
                  { id: 'contacts', label: '👥 Pick contacts' },
                  { id: 'all', label: '📣 All users' },
                ] as const).map(m => (
                  <button key={m.id} onClick={() => { setRecipientMode(m.id); setError(null); }}
                    className={`pill text-xs ${recipientMode === m.id ? 'bg-ink-900 text-paper-50 border-ink-900' : ''}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {recipientMode === 'manual' && (
              <div>
                <textarea value={manualEmails} onChange={e => setManualEmails(e.target.value)} className="input font-mono text-xs" rows={2}
                  placeholder="a@x.com, b@y.com  (comma, space or newline separated)" />
                <p className="mt-1 text-[11px] text-muted-400">{manualEmails.split(/[\s,;]+/).filter(e => e.includes('@')).length} valid email(s)</p>
              </div>
            )}

            {recipientMode === 'all' && (
              <div className="rounded-lg border border-ember-500/30 bg-ember-500/5 p-3 text-xs text-ink-700">
                ⚠️ This will email <strong>every registered user</strong>{contactsTotal ? ` (~${contactsTotal})` : ''}. Double-check your subject &amp; body before sending.
              </div>
            )}

            {recipientMode === 'contacts' && (
              <div className="rounded-lg border border-paper-300 p-2">
                <div className="flex items-center gap-2">
                  <input value={contactSearch} onChange={e => setContactSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void loadContacts(contactSearch); }}
                    className="input flex-1 text-sm" placeholder="Search name or email…" />
                  <button onClick={() => void loadContacts(contactSearch)} className="btn-ghost-sm text-xs">Search</button>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-500">
                  <span>{selectedEmails.size} selected · {contactsTotal} contacts</span>
                  <div className="flex gap-2">
                    <button onClick={selectAllVisible} className="text-ember-600 hover:underline">Select all shown</button>
                    <button onClick={clearSelection} className="text-muted-500 hover:underline">Clear</button>
                  </div>
                </div>
                <div className="mt-2 max-h-52 overflow-y-auto divide-y divide-paper-200">
                  {!contactsLoaded ? (
                    <p className="p-3 text-center text-xs text-muted-400">Loading contacts…</p>
                  ) : contacts.length === 0 ? (
                    <p className="p-3 text-center text-xs text-muted-400">No contacts found.</p>
                  ) : contacts.map(ct => (
                    <label key={ct.email} className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-paper-100">
                      <input type="checkbox" checked={selectedEmails.has(ct.email)} onChange={() => toggleContact(ct.email)} className="accent-ember-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink-800">{ct.name || ct.email}</span>
                        {ct.name && <span className="block truncate text-[11px] text-muted-400">{ct.email}</span>}
                      </span>
                      <span className="flex-shrink-0 text-[10px] uppercase text-muted-400">{ct.plan}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-ink-700">Subject</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} className="input mt-1" placeholder="Email subject" />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-700">Body (HTML supported — wrapped in branded template automatically)</label>
              <textarea value={body} onChange={e => setBody(e.target.value)} className="input mt-1 font-mono text-xs" rows={8}
                placeholder="<h1>Hello!</h1><p>Your message here…</p>" />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button onClick={handleSend} disabled={sending || !subject.trim() || !body.trim()} className="btn-primary flex-1 min-w-[160px]">
                {sending ? 'Sending…'
                  : recipientMode === 'all' ? 'Send to all users'
                  : recipientMode === 'contacts' ? `Send to ${selectedEmails.size || 0} contact(s)`
                  : 'Send'}
              </button>
              <button onClick={() => setShowPreview(p => !p)} className="btn-ghost text-sm lg:hidden">{showPreview ? 'Hide' : 'Show'} preview</button>
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

          {/* Live preview */}
          <div className={`${showPreview ? 'block' : 'hidden'} lg:block`}>
            <div className="paper-card overflow-hidden">
              <div className="border-b border-paper-200 bg-paper-100 px-4 py-2">
                <p className="text-xs font-medium text-muted-500">Preview</p>
                <p className="truncate text-sm font-semibold text-ink-900">{subject || 'No subject'}</p>
              </div>
              <iframe title="email-preview" className="h-[460px] w-full bg-white" srcDoc={previewShell(body)} />
            </div>
          </div>
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
          {/* Logs toolbar — show count + load-more so the admin isn't capped at 50. */}
          <div className="mb-3 flex items-center gap-3">
            <p className="text-xs text-muted-500">Showing <strong>{emailLogs.length}</strong> log{emailLogs.length === 1 ? '' : 's'}</p>
            <button onClick={() => void loadLogs(logLimit)} disabled={logsLoading} className="btn-ghost-sm text-xs">{logsLoading ? 'Refreshing…' : '↻ Refresh'}</button>
            {emailLogs.length >= logLimit && (
              <button onClick={() => { const next = logLimit + 300; setLogLimit(next); void loadLogs(next); }} disabled={logsLoading} className="btn-ghost-sm text-xs ml-auto">Load more</button>
            )}
          </div>
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
