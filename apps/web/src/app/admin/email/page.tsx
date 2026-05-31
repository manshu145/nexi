'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';


// ─── Types ────────────────────────────────────────────────────────────
type EmailType = 'welcome' | 'streak_reminder' | 'payment_receipt' | 'forgot_password' | 'plan_expiry' | 'cancellation' | 'admin_broadcast' | 'custom';
type Tab = 'overview' | 'logs' | 'templates' | 'campaign' | 'settings';

interface EmailTypeConfig {
  type: EmailType;
  label: string;
  description: string;
  enabled: boolean;
  senderEmail: string;
  senderName: string;
}

interface EmailLogEntry {
  id: string;
  to: string;
  subject: string;
  type: EmailType;
  status: 'sent' | 'failed' | 'queued' | 'bounced';
  senderEmail: string;
  senderName: string;
  messageId?: string;
  error?: string;
  sentAt: string;
}

interface EmailMarketingConfig {
  types: EmailTypeConfig[];
  transactionalSender: { email: string; name: string };
  marketingSender: { email: string; name: string };
  updatedAt: string;
}

interface MarketingTemplate {
  type: EmailType;
  subject: string;
  body: string;
  updatedAt: string;
}


const TYPE_ICONS: Record<EmailType, string> = {
  welcome: '👋', streak_reminder: '🔥', payment_receipt: '💳',
  forgot_password: '🔑', plan_expiry: '⏰', cancellation: '❌',
  admin_broadcast: '📢', custom: '✉️',
};

export default function AdminEmailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [config, setConfig] = useState<EmailMarketingConfig | null>(null);
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Campaign state
  const [campaignSubject, setCampaignSubject] = useState('');
  const [campaignBody, setCampaignBody] = useState('');
  const [campaignSegment, setCampaignSegment] = useState<'all' | 'free' | 'paid' | 'custom'>('all');
  const [campaignEmails, setCampaignEmails] = useState('');
  const [sending, setSending] = useState(false);

  // Test email
  const [testTo, setTestTo] = useState('');
  const [testSubject, setTestSubject] = useState('Test from Nexigrate');
  const [testBody, setTestBody] = useState('<h1>Test Email</h1><p>This is a test.</p>');

  // Template editor
  const [editingTemplate, setEditingTemplate] = useState<EmailType | null>(null);
  const [tplSubject, setTplSubject] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [showPreview, setShowPreview] = useState(false);


  useEffect(() => { if (!loading && !user) router.replace('/admin/login'); }, [user, loading, router]);

  const getToken = async () => {
    const auth = getFirebaseAuthClient();
    return auth.currentUser?.getIdToken();
  };

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchConfig = useCallback(async () => {
    try {
      const token = await getToken();
      const [statusRes, configRes, tplRes] = await Promise.all([
        fetch(`${API}/v1/admin/email/status`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/v1/admin/email/config`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/v1/admin/email/marketing-templates`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (statusRes.ok) {
        const d = await statusRes.json() as { configured: boolean };
        setConfigured(d.configured);
      }
      if (configRes.ok) {
        const d = await configRes.json() as EmailMarketingConfig;
        setConfig(d);
      }
      if (tplRes.ok) {
        const d = await tplRes.json() as { templates: MarketingTemplate[] };
        setTemplates(d.templates);
      }
    } catch { setConfigured(false); }
  }, []);

  const fetchLogs = useCallback(async (page = 1) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/email/logs?page=${page}&limit=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json() as { logs: EmailLogEntry[]; total: number };
        setLogs(d.logs);
        setLogsTotal(d.total);
        setLogsPage(page);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchConfig();
    fetchLogs();
  }, [user, fetchConfig, fetchLogs]);


  // ─── Handlers ─────────────────────────────────────────────────────────

  const toggleType = async (type: EmailType, enabled: boolean) => {
    if (!config) return;
    const updated = config.types.map(t => t.type === type ? { ...t, enabled } : t);
    const next = { ...config, types: updated };
    setConfig(next);
    try {
      const token = await getToken();
      await fetch(`${API}/v1/admin/email/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ types: updated }),
      });
      showToast(`${type} ${enabled ? 'enabled' : 'disabled'}`, 'success');
    } catch { showToast('Failed to update', 'error'); }
  };

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/email/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(config),
      });
      if (res.ok) showToast('Config saved!', 'success');
      else showToast('Save failed', 'error');
    } catch { showToast('Save failed', 'error'); }
    finally { setSaving(false); }
  };

  const saveTemplate = async () => {
    if (!editingTemplate || !tplSubject || !tplBody) return;
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/email/marketing-templates/${editingTemplate}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subject: tplSubject, body: tplBody }),
      });
      if (res.ok) {
        showToast('Template saved!', 'success');
        setTemplates(prev => {
          const existing = prev.findIndex(t => t.type === editingTemplate);
          const tpl = { type: editingTemplate, subject: tplSubject, body: tplBody, updatedAt: new Date().toISOString() };
          if (existing >= 0) { const next = [...prev]; next[existing] = tpl; return next; }
          return [...prev, tpl];
        });
        setEditingTemplate(null);
      } else showToast('Save failed', 'error');
    } catch { showToast('Save failed', 'error'); }
    finally { setSaving(false); }
  };


  const sendTestEmail = async () => {
    if (!testTo || !testSubject || !testBody) return;
    setSending(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/email/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: testTo, subject: testSubject, body: testBody }),
      });
      if (res.ok) showToast('Test email sent!', 'success');
      else showToast('Send failed', 'error');
    } catch { showToast('Send failed', 'error'); }
    finally { setSending(false); }
  };

  const sendCampaign = async () => {
    if (!campaignSubject || !campaignBody) return;
    setSending(true);
    try {
      const token = await getToken();
      const payload: Record<string, unknown> = {
        subject: campaignSubject,
        htmlBody: campaignBody,
        segment: campaignSegment,
      };
      if (campaignSegment === 'custom') {
        payload.emails = campaignEmails.split(/[,\n]/).map(e => e.trim()).filter(e => e.includes('@'));
      }
      const res = await fetch(`${API}/v1/admin/email/campaign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const d = await res.json() as { sent: number; failed: number; totalTargeted: number };
        showToast(`Campaign sent! ${d.sent}/${d.totalTargeted} delivered`, 'success');
        setCampaignSubject(''); setCampaignBody('');
        fetchLogs();
      } else showToast('Campaign failed', 'error');
    } catch { showToast('Campaign failed', 'error'); }
    finally { setSending(false); }
  };


  if (loading || !user) return (
    <div className="space-y-4">
      <div className="h-7 w-48 rounded bg-paper-300 animate-pulse" />
      <div className="h-40 rounded bg-paper-300 animate-pulse" />
    </div>
  );

  return (
    <div className="max-w-5xl">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-900">Email Marketing</h1>
          <p className="mt-1 text-sm text-muted-500">Manage all email types, templates, campaigns & logs</p>
        </div>
        <div className="flex items-center gap-2">
          {configured === true && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 border border-green-200">
              <span className="h-2 w-2 rounded-full bg-green-500" /> Resend Connected
            </span>
          )}
          {configured === false && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 border border-red-200">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Not Configured
            </span>
          )}
        </div>
      </div>


      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-paper-300 overflow-x-auto">
        {([
          ['overview', 'Overview'],
          ['logs', 'Email Logs'],
          ['templates', 'Templates'],
          ['campaign', 'Campaign'],
          ['settings', 'Settings'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === id
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-muted-500 hover:text-ink-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ─── OVERVIEW TAB ─── */}
      {activeTab === 'overview' && (
        <div className="mt-6 space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="paper-card p-4 text-center">
              <div className="text-2xl font-bold text-ink-900">{logsTotal}</div>
              <div className="text-xs text-muted-500 mt-1">Total Emails Sent</div>
            </div>
            <div className="paper-card p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{logs.filter(l => l.status === 'sent').length}</div>
              <div className="text-xs text-muted-500 mt-1">Recent Delivered</div>
            </div>
            <div className="paper-card p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{logs.filter(l => l.status === 'failed').length}</div>
              <div className="text-xs text-muted-500 mt-1">Recent Failed</div>
            </div>
            <div className="paper-card p-4 text-center">
              <div className="text-2xl font-bold text-amber-600">{config?.types.filter(t => t.enabled).length ?? 0}</div>
              <div className="text-xs text-muted-500 mt-1">Active Types</div>
            </div>
          </div>


          {/* Email Types Grid */}
          <div>
            <h2 className="text-sm font-semibold text-ink-800 mb-3">All Email Types</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {config?.types.map(t => (
                <div key={t.type} className="paper-card p-4 flex items-start gap-3">
                  <span className="text-xl">{TYPE_ICONS[t.type]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-ink-900">{t.label}</h3>
                      <button
                        onClick={() => toggleType(t.type, !t.enabled)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          t.enabled ? 'bg-amber-500' : 'bg-paper-400'
                        }`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          t.enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-500 mt-0.5">{t.description}</p>
                    <p className="text-[10px] text-muted-400 mt-1">From: {t.senderName} &lt;{t.senderEmail}&gt;</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Send Test Email */}
          <div className="paper-card p-5">
            <h2 className="text-sm font-semibold text-ink-800 mb-3">Send Test Email</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input value={testTo} onChange={e => setTestTo(e.target.value)} className="input" placeholder="your@email.com" />
              <input value={testSubject} onChange={e => setTestSubject(e.target.value)} className="input" placeholder="Subject" />
              <button onClick={sendTestEmail} disabled={sending || !testTo} className="btn-primary text-sm">
                {sending ? 'Sending...' : 'Send Test'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ─── LOGS TAB ─── */}
      {activeTab === 'logs' && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink-800">Email Logs ({logsTotal})</h2>
            <button onClick={() => fetchLogs(logsPage)} className="btn-ghost text-xs">Refresh</button>
          </div>
          {logs.length === 0 ? (
            <div className="paper-card p-12 text-center">
              <span className="text-4xl">📬</span>
              <p className="mt-3 text-sm text-muted-500">No email logs yet. Emails will appear here once sent.</p>
            </div>
          ) : (
            <>
              <div className="paper-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-paper-300 bg-paper-100">
                      <th className="p-3 text-left text-xs font-medium text-muted-500">To</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-500">Subject</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-500">Type</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-500">Status</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-500">Sent At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id} className="border-b border-paper-200 hover:bg-paper-50">
                        <td className="p-3 text-xs text-ink-700 truncate max-w-[140px]">{log.to}</td>
                        <td className="p-3 text-xs text-ink-700 truncate max-w-[200px]">{log.subject}</td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-600">
                            {TYPE_ICONS[log.type] ?? '✉️'} {log.type?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            log.status === 'sent' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="p-3 text-[10px] text-muted-400">
                          {log.sentAt ? new Date(log.sentAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-muted-500">Page {logsPage} of {Math.ceil(logsTotal / 30)}</span>
                <div className="flex gap-2">
                  <button onClick={() => fetchLogs(logsPage - 1)} disabled={logsPage <= 1} className="btn-ghost text-xs">Prev</button>
                  <button onClick={() => fetchLogs(logsPage + 1)} disabled={logsPage >= Math.ceil(logsTotal / 30)} className="btn-ghost text-xs">Next</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}


      {/* ─── TEMPLATES TAB ─── */}
      {activeTab === 'templates' && (
        <div className="mt-6 space-y-4">
          <h2 className="text-sm font-semibold text-ink-800">Email Templates (per type)</h2>
          <p className="text-xs text-muted-500">Customize subject + body for each email type. Falls back to built-in template if not set.</p>

          {editingTemplate ? (
            <div className="paper-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink-900">
                  {TYPE_ICONS[editingTemplate]} Editing: {editingTemplate.replace('_', ' ')}
                </h3>
                <button onClick={() => setEditingTemplate(null)} className="btn-ghost text-xs">Cancel</button>
              </div>
              <div>
                <label className="text-xs font-medium text-ink-700">Subject</label>
                <input value={tplSubject} onChange={e => setTplSubject(e.target.value)} className="input mt-1" placeholder="Email subject line" />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-700">Body (HTML)</label>
                <textarea value={tplBody} onChange={e => setTplBody(e.target.value)} className="input mt-1 font-mono text-xs" rows={10} placeholder="<h1>Hello {{name}}</h1>..." />
              </div>
              <div className="flex items-center gap-3">
                <button onClick={saveTemplate} disabled={saving || !tplSubject || !tplBody} className="btn-primary text-sm">
                  {saving ? 'Saving...' : 'Save Template'}
                </button>
                <button onClick={() => setShowPreview(!showPreview)} className="btn-ghost text-sm">
                  {showPreview ? 'Hide Preview' : 'Preview'}
                </button>
              </div>
              {showPreview && (
                <div className="border border-paper-300 rounded-lg p-4 bg-white">
                  <p className="text-xs text-muted-500 mb-2">Subject: <strong>{tplSubject}</strong></p>
                  <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: tplBody }} />
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {config?.types.map(t => {
                const saved = templates.find(tpl => tpl.type === t.type);
                return (
                  <div key={t.type} className="paper-card p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{TYPE_ICONS[t.type]}</span>
                        <div>
                          <h3 className="text-sm font-medium text-ink-900">{t.label}</h3>
                          {saved ? (
                            <p className="text-[10px] text-green-600 mt-0.5">Custom template set</p>
                          ) : (
                            <p className="text-[10px] text-muted-400 mt-0.5">Using built-in template</p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setEditingTemplate(t.type);
                          setTplSubject(saved?.subject ?? '');
                          setTplBody(saved?.body ?? '');
                          setShowPreview(false);
                        }}
                        className="btn-ghost text-xs"
                      >
                        {saved ? 'Edit' : 'Customize'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}


      {/* ─── CAMPAIGN TAB ─── */}
      {activeTab === 'campaign' && (
        <div className="mt-6 space-y-4">
          <h2 className="text-sm font-semibold text-ink-800">Bulk Email Campaign</h2>
          <p className="text-xs text-muted-500">Compose and send to a segment of users (from: admin@nexigrate.com)</p>

          <div className="paper-card p-5 space-y-4">
            {/* Segment */}
            <div>
              <label className="text-xs font-medium text-ink-700">Target Segment</label>
              <div className="flex gap-2 mt-2 flex-wrap">
                {(['all', 'free', 'paid', 'custom'] as const).map(seg => (
                  <button
                    key={seg}
                    onClick={() => setCampaignSegment(seg)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      campaignSegment === seg
                        ? 'bg-amber-50 border-amber-300 text-amber-700'
                        : 'bg-paper-100 border-paper-300 text-muted-600 hover:border-amber-200'
                    }`}
                  >
                    {seg === 'all' ? 'All Users' : seg === 'free' ? 'Free Plan' : seg === 'paid' ? 'Paid Plans' : 'Custom List'}
                  </button>
                ))}
              </div>
            </div>

            {campaignSegment === 'custom' && (
              <div>
                <label className="text-xs font-medium text-ink-700">Email Addresses (comma or newline separated)</label>
                <textarea
                  value={campaignEmails}
                  onChange={e => setCampaignEmails(e.target.value)}
                  className="input mt-1 font-mono text-xs"
                  rows={4}
                  placeholder="user1@example.com, user2@example.com"
                />
              </div>
            )}

            {/* Subject */}
            <div>
              <label className="text-xs font-medium text-ink-700">Subject</label>
              <input
                value={campaignSubject}
                onChange={e => setCampaignSubject(e.target.value)}
                className="input mt-1"
                placeholder="Your campaign subject..."
              />
            </div>

            {/* Body */}
            <div>
              <label className="text-xs font-medium text-ink-700">Body (HTML)</label>
              <textarea
                value={campaignBody}
                onChange={e => setCampaignBody(e.target.value)}
                className="input mt-1 font-mono text-xs"
                rows={10}
                placeholder="<h1>Big announcement!</h1><p>We've launched...</p>"
              />
            </div>

            {/* Preview */}
            {campaignBody && (
              <div>
                <button onClick={() => setShowPreview(!showPreview)} className="btn-ghost text-xs mb-2">
                  {showPreview ? 'Hide Preview' : 'Show Preview'}
                </button>
                {showPreview && (
                  <div className="border border-paper-300 rounded-lg p-4 bg-white">
                    <p className="text-xs text-muted-500 mb-2">Subject: <strong>{campaignSubject}</strong></p>
                    <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: campaignBody }} />
                  </div>
                )}
              </div>
            )}

            {/* Send */}
            <div className="flex items-center gap-3 pt-2 border-t border-paper-200">
              <button
                onClick={sendCampaign}
                disabled={sending || !campaignSubject || !campaignBody}
                className="btn-primary"
              >
                {sending ? 'Sending...' : `Send to ${campaignSegment === 'custom' ? 'Custom List' : campaignSegment === 'all' ? 'All Users' : `${campaignSegment} users`}`}
              </button>
              <span className="text-[10px] text-muted-400">Emails are sent in batches of 10</span>
            </div>
          </div>
        </div>
      )}


      {/* ─── SETTINGS TAB ─── */}
      {activeTab === 'settings' && config && (
        <div className="mt-6 space-y-6">
          <h2 className="text-sm font-semibold text-ink-800">Email Configuration</h2>

          {/* Sender Addresses */}
          <div className="paper-card p-5 space-y-4">
            <h3 className="text-sm font-medium text-ink-900">Sender Addresses</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-600">Transactional Sender (welcome, receipts, reminders)</label>
                <input
                  value={config.transactionalSender.email}
                  onChange={e => setConfig({ ...config, transactionalSender: { ...config.transactionalSender, email: e.target.value } })}
                  className="input"
                  placeholder="hello@nexigrate.com"
                />
                <input
                  value={config.transactionalSender.name}
                  onChange={e => setConfig({ ...config, transactionalSender: { ...config.transactionalSender, name: e.target.value } })}
                  className="input"
                  placeholder="Nexigrate"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-600">Marketing Sender (broadcasts, campaigns)</label>
                <input
                  value={config.marketingSender.email}
                  onChange={e => setConfig({ ...config, marketingSender: { ...config.marketingSender, email: e.target.value } })}
                  className="input"
                  placeholder="admin@nexigrate.com"
                />
                <input
                  value={config.marketingSender.name}
                  onChange={e => setConfig({ ...config, marketingSender: { ...config.marketingSender, name: e.target.value } })}
                  className="input"
                  placeholder="Nexigrate Team"
                />
              </div>
            </div>
          </div>

          {/* Per-Type Sender Override */}
          <div className="paper-card p-5 space-y-4">
            <h3 className="text-sm font-medium text-ink-900">Per-Type Sender Override</h3>
            <p className="text-xs text-muted-500">Override the from address for specific email types</p>
            <div className="space-y-3">
              {config.types.map((t, idx) => (
                <div key={t.type} className="flex items-center gap-3">
                  <span className="text-sm w-6">{TYPE_ICONS[t.type]}</span>
                  <span className="text-xs font-medium text-ink-700 w-32 truncate">{t.label}</span>
                  <input
                    value={t.senderEmail}
                    onChange={e => {
                      const types = [...config.types];
                      types[idx] = { ...types[idx]!, senderEmail: e.target.value };
                      setConfig({ ...config, types });
                    }}
                    className="input flex-1 text-xs"
                    placeholder="sender@nexigrate.com"
                  />
                  <input
                    value={t.senderName}
                    onChange={e => {
                      const types = [...config.types];
                      types[idx] = { ...types[idx]!, senderName: e.target.value };
                      setConfig({ ...config, types });
                    }}
                    className="input w-32 text-xs"
                    placeholder="Name"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button onClick={saveConfig} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save All Settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
