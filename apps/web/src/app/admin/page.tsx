'use client';

/**
 * Admin → Dashboard (unified, Google-Analytics style).
 *
 * Merges what used to be three separate pages — Stats (KPIs + API health),
 * Analytics (charts/funnel), and Live Sessions — into ONE scrollable
 * surface. A "Realtime" block (active-now count + live user list) sits on
 * top like GA's realtime card, followed by KPI cards, trend charts, the
 * upgrade funnel, feature/exam/language breakdowns and API health.
 *
 * /admin/analytics and /admin/sessions now redirect here.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid,
} from 'recharts';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';
import { api, type AnalyticsOverview } from '~/lib/api';
import { EXAM_BY_SLUG } from '@nexigrate/shared';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';
const EMBER = '#B3461F';
const GOLD = '#B8862F';

interface AdminStats {
  totalUsers: number; dau: number; activeNow: number; newToday: number;
  revenue30d: number; aiCostToday: number;
  activeSessions?: number; newUsersToday?: number; pwaInstalls?: number;
}
interface ApiHealthStatus {
  health: { openai: 'ok'|'error'|'unconfigured'; groq: 'ok'|'error'|'unconfigured'; gemini: 'ok'|'error'|'unconfigured'; razorpay: 'ok'|'error'|'unconfigured'; };
  checkedAt: string;
}
interface ActiveSession { userId: string; userName: string; exam: string; lastActiveAt: string; plan: string; }

const EVENT_LABELS: Record<string, string> = {
  page_view: 'Page views', chapter_open: 'Chapters opened', chapter_complete: 'Chapters completed',
  quiz_start: 'Quizzes started', quiz_complete: 'Quizzes completed', mock_test_start: 'Mock tests started',
  mock_test_complete: 'Mock tests completed', essay_practice: 'Essay practice', essay_submit: 'Essays graded',
  chat_message: 'Chat messages', current_affairs_view: 'Current affairs views', reel_view: 'News reels opened',
  ca_quiz_attempt: 'CA quiz attempts', search: 'Searches', feature_click: 'Feature clicks',
  upgrade_view: 'Upgrade page views', upgrade_click: 'Upgrade clicks', error_encountered: 'Errors',
};
const COMPARE_METRICS: Array<{ key: string; label: string }> = [
  { key: '__total', label: 'Total activity' }, { key: 'chapter_open', label: 'Chapters' },
  { key: 'quiz_complete', label: 'Quizzes' }, { key: 'mock_test_complete', label: 'Mock tests' },
  { key: 'reel_view', label: 'News reels' }, { key: 'essay_submit', label: 'Essays' },
];

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="paper-card min-h-[92px] p-4 flex flex-col justify-between">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">{label}</p>
      <p className="font-serif mt-1 text-2xl font-bold text-ink-900 tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-500">{sub}</p>}
    </div>
  );
}

function HealthBadge({ name, status }: { name: string; status: 'ok'|'error'|'unconfigured' }) {
  const mapped = status === 'ok' ? 'up' : status === 'error' ? 'down' : 'unknown';
  const colors: Record<string, string> = {
    up: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500',
    down: 'bg-red-500/10 text-red-600',
    unknown: 'bg-paper-200 text-muted-500',
  };
  const dots: Record<string, string> = { up: 'bg-emerald-500', down: 'bg-red-500', unknown: 'bg-muted-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${colors[mapped]}`}>
      <span className={`h-2 w-2 rounded-full ${dots[mapped]}`} />{name}
    </span>
  );
}

export default function AdminDashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [health, setHealth] = useState<ApiHealthStatus | null>(null);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const isAdmin = (email?: string | null) =>
    email === 'manshu.ibc24@gmail.com' || email === 'manshusinha777@gmail.com';

  useEffect(() => {
    if (!loading && !user) router.replace('/admin/login');
    if (!loading && user && !isAdmin(user.email)) router.replace('/dashboard');
  }, [user, loading, router]);

  const authToken = async () => {
    const auth = getFirebaseAuthClient();
    return auth.currentUser?.getIdToken();
  };

  const fetchStats = useCallback(async () => {
    if (!user || !isAdmin(user.email)) return;
    try {
      const token = await authToken();
      const res = await fetch(`${API}/v1/admin/stats`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = (await res.json()) as AdminStats;
      setStats({ ...data, activeNow: data.activeNow ?? data.activeSessions ?? 0, newToday: data.newToday ?? data.newUsersToday ?? 0 });
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load stats'); }
  }, [user]);

  const fetchHealth = useCallback(async () => {
    if (!user || !isAdmin(user.email)) return;
    try {
      const token = await authToken();
      const res = await fetch(`${API}/v1/admin/api-health`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setHealth((await res.json()) as ApiHealthStatus);
    } catch { /* ignore */ }
  }, [user]);

  const fetchSessions = useCallback(async () => {
    if (!user || !isAdmin(user.email)) return;
    try {
      const token = await authToken();
      const res = await fetch(`${API}/v1/admin/sessions`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = (await res.json()) as { sessions: ActiveSession[]; count: number }; setSessions(d.sessions); setSessionCount(d.count); }
    } catch { /* ignore */ }
  }, [user]);

  // Stats + health: initial + 60s poll (visibility-gated).
  useEffect(() => {
    if (!user || !isAdmin(user.email)) return;
    void fetchStats(); void fetchHealth();
    const i = setInterval(() => { if (document.visibilityState === 'visible') { void fetchStats(); void fetchHealth(); } }, 60_000);
    return () => clearInterval(i);
  }, [user, fetchStats, fetchHealth]);

  // Realtime sessions: faster 30s poll (visibility-gated).
  useEffect(() => {
    if (!user || !isAdmin(user.email)) return;
    void fetchSessions();
    const i = setInterval(() => { if (document.visibilityState === 'visible') void fetchSessions(); }, 30_000);
    return () => clearInterval(i);
  }, [user, fetchSessions]);

  // Analytics overview (range-dependent).
  useEffect(() => {
    if (!user || !isAdmin(user.email)) return;
    api.getAnalyticsOverview(days).then(setAnalytics).catch(() => { /* charts optional */ });
  }, [user, days]);

  const handleReset = async () => {
    setResetting(true); setResetMsg(null);
    try {
      const res = await api.adminResetAnalytics();
      const summary = Object.entries(res.deleted).map(([k, v]) => `${k}: ${v}`).join(' · ');
      setResetMsg(`✓ Reset complete — ${summary}`); setResetConfirm(false);
      void fetchStats();
    } catch (e) { setResetMsg(`✗ ${e instanceof Error ? e.message : 'Reset failed'}`); }
    finally { setResetting(false); }
  };

  if (loading || !user) {
    return (
      <div className="space-y-6">
        <div className="h-7 w-40 rounded bg-paper-300 animate-pulse" />
        <div className="h-28 rounded bg-paper-300 animate-pulse" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 rounded bg-paper-300 animate-pulse" />)}
        </div>
      </div>
    );
  }
  if (error) return <div className="banner banner-error">{error}</div>;

  // Derived analytics views.
  const seriesData = (analytics?.series ?? []).map(d => ({
    date: d.date.slice(5), activity: d.total,
    chapters: d.events['chapter_open'] ?? 0, quizzes: d.events['quiz_complete'] ?? 0,
  }));
  const featureData = Object.entries(analytics?.featureTotals ?? {})
    .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ name: EVENT_LABELS[k] ?? k, value: v }));
  const examData = Object.entries(analytics?.examTotals ?? {})
    .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([slug, v]) => ({ name: EXAM_BY_SLUG.get(slug as never)?.name ?? slug, value: v }));
  const langTotals = analytics?.langTotals ?? {};
  const enCount = langTotals['en'] ?? 0; const hiCount = langTotals['hi'] ?? 0;
  const langTotal = enCount + hiCount;
  const enPct = langTotal > 0 ? Math.round((enCount / langTotal) * 100) : 0;
  const hiPct = langTotal > 0 ? 100 - enPct : 0;
  const funnel = analytics?.funnel;
  const clickRate = funnel && funnel.upgradeViews > 0 ? Math.round((funnel.upgradeClicks / funnel.upgradeViews) * 100) : 0;
  const buyRate = funnel && funnel.upgradeClicks > 0 ? Math.round((funnel.payments / funnel.upgradeClicks) * 100) : 0;
  const cmp = analytics?.compare;
  const metricVal = (snap: { total: number; events: Record<string, number> } | undefined, key: string) =>
    !snap ? 0 : key === '__total' ? snap.total : (snap.events[key] ?? 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-900">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-500">Realtime, growth & engagement — all in one place</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {!resetConfirm ? (
            <button onClick={() => { setResetConfirm(true); setResetMsg(null); }}
              className="rounded-lg border border-line bg-paper-50 px-3 py-1.5 text-xs font-medium text-muted-600 hover:text-ember-600 hover:border-ember-500/40 transition-colors">
              ♻️ Reset test data
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-ember-500/40 bg-ember-500/5 px-3 py-1.5">
              <span className="text-xs text-ink-900">Clear analytics? (users &amp; payments safe)</span>
              <button onClick={handleReset} disabled={resetting} className="text-xs font-semibold text-ember-600 hover:text-ember-700 disabled:opacity-50">{resetting ? 'Resetting…' : 'Yes, reset'}</button>
              <button onClick={() => setResetConfirm(false)} disabled={resetting} className="text-xs font-medium text-muted-500 hover:text-ink-900">Cancel</button>
            </div>
          )}
          {resetMsg && <p className="text-[11px] text-muted-500 max-w-xs text-right">{resetMsg}</p>}
        </div>
      </div>

      {/* Realtime (GA-style) */}
      <div className="paper-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gold-500" />
            </span>
            <h2 className="text-sm font-semibold text-ink-900">Realtime</h2>
          </div>
          <span className="text-[11px] text-muted-400">Active in the last 10 min</span>
        </div>
        <div className="mt-3 grid gap-4 md:grid-cols-[160px_1fr]">
          <div className="flex flex-col justify-center rounded-lg border border-line bg-paper-50 p-4 text-center">
            <p className="font-serif text-4xl font-bold text-ink-900 tabular-nums">{sessionCount}</p>
            <p className="mt-1 text-xs text-muted-500">users active now</p>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-line">
            {sessions.length === 0 ? (
              <div className="flex h-full min-h-[120px] items-center justify-center p-4 text-center text-xs text-muted-400">No active users right now.</div>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line">
                  {sessions.map(s => (
                    <tr key={s.userId} className="hover:bg-paper-100">
                      <td className="px-3 py-2 font-medium text-ink-900">{s.userName}</td>
                      <td className="px-3 py-2 text-muted-600 dark:text-muted-400">{s.exam}</td>
                      <td className="px-3 py-2"><span className="pill text-[11px]">{s.plan}</span></td>
                      <td className="px-3 py-2 text-right text-[11px] text-muted-400">{new Date(s.lastActiveAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard label="Total Users" value={(stats?.totalUsers ?? analytics?.overview.totalUsers ?? 0).toLocaleString()} sub={analytics ? `+${analytics.overview.newUsersThisWeek} this week` : undefined} />
        <KpiCard label="DAU" value={(stats?.dau ?? analytics?.overview.dau ?? 0).toLocaleString()} sub="active today" />
        <KpiCard label="MAU" value={(analytics?.overview.mau ?? 0).toLocaleString()} sub="active 30d" />
        <KpiCard label="Stickiness" value={`${analytics?.overview.stickiness ?? 0}%`} sub="DAU / MAU" />
        <KpiCard label="New Today" value={(stats?.newToday ?? 0).toLocaleString()} />
        <KpiCard label="Revenue 30d" value={`₹${(stats?.revenue30d ?? 0).toLocaleString('en-IN')}`} />
        <KpiCard label="AI Cost Today" value={`₹${(stats?.aiCostToday ?? 0).toLocaleString('en-IN')}`} />
        <KpiCard label="PWA Installs" value={(stats?.pwaInstalls ?? 0).toLocaleString()} />
      </div>

      {/* Range selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">Trends</h2>
        <div className="flex gap-1">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} className={`pill text-xs ${days === d ? 'bg-ink-900 text-paper-50 border-ink-900' : ''}`}>{d}d</button>
          ))}
        </div>
      </div>

      {!analytics ? (
        <div className="h-64 rounded bg-paper-300 animate-pulse" />
      ) : (
        <>
          {/* Today vs Yesterday */}
          <div className="paper-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink-900">Today vs Yesterday</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {COMPARE_METRICS.map(({ key, label }) => {
                const t = metricVal(cmp?.today, key); const y = metricVal(cmp?.yesterday, key);
                const delta = t - y; const pct = y > 0 ? Math.round((delta / y) * 100) : (t > 0 ? 100 : 0);
                const trend = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
                return (
                  <div key={key} className="rounded-lg border border-line bg-paper-50 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-500">{label}</p>
                    <p className="mt-1 font-serif text-xl font-bold text-ink-900">{t}</p>
                    <p className={`mt-0.5 text-[11px] font-semibold ${trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-muted-500'}`}>{trend === 'up' ? '▲' : trend === 'down' ? '▼' : '—'} {Math.abs(pct)}% <span className="font-normal text-muted-400">vs {y}</span></p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Daily activity */}
          <div className="paper-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink-900">Daily activity</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={seriesData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E0CE" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#7A6F5C' }} />
                <YAxis tick={{ fontSize: 11, fill: '#7A6F5C' }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#FBF6E8', border: '1px solid #E7E0CE', borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="activity" name="Total events" stroke={EMBER} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="chapters" name="Chapters opened" stroke={GOLD} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Funnel */}
          <div className="paper-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink-900">Upgrade funnel</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="font-serif text-2xl font-bold text-ink-900">{funnel?.upgradeViews ?? 0}</p><p className="text-xs text-muted-500">Saw upgrade</p></div>
              <div><p className="font-serif text-2xl font-bold text-ink-900">{funnel?.upgradeClicks ?? 0}</p><p className="text-xs text-muted-500">Clicked buy <span className="text-emerald-600">({clickRate}%)</span></p></div>
              <div><p className="font-serif text-2xl font-bold text-ink-900">{funnel?.payments ?? 0}</p><p className="text-xs text-muted-500">Paid <span className="text-emerald-600">({buyRate}%)</span></p></div>
            </div>
          </div>

          {/* Feature usage */}
          <div className="paper-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink-900">Top features used</h3>
            {featureData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-500">No events recorded yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, featureData.length * 34)}>
                <BarChart data={featureData} layout="vertical" margin={{ top: 0, right: 16, left: 60, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E0CE" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#7A6F5C' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#7A6F5C' }} width={120} />
                  <Tooltip contentStyle={{ background: '#FBF6E8', border: '1px solid #E7E0CE', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" fill={EMBER} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Exam + Language */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="paper-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink-900">Most active exams</h3>
              {examData.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-500">No exam-tagged activity yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(200, examData.length * 32)}>
                  <BarChart data={examData} layout="vertical" margin={{ top: 0, right: 16, left: 60, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E7E0CE" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#7A6F5C' }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#7A6F5C' }} width={130} />
                    <Tooltip contentStyle={{ background: '#FBF6E8', border: '1px solid #E7E0CE', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="value" fill={GOLD} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="paper-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink-900">Language split</h3>
              {langTotal === 0 ? (
                <p className="py-8 text-center text-sm text-muted-500">No language-tagged activity yet.</p>
              ) : (
                <div className="space-y-4 pt-2">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs"><span className="font-medium text-ink-900">English</span><span className="text-muted-500">{enPct}% · {enCount.toLocaleString('en-IN')}</span></div>
                    <div className="h-3 overflow-hidden rounded-full bg-paper-200"><div className="h-full rounded-full bg-ember-500" style={{ width: `${enPct}%` }} /></div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs"><span className="font-medium text-ink-900">हिंदी (Hindi)</span><span className="text-muted-500">{hiPct}% · {hiCount.toLocaleString('en-IN')}</span></div>
                    <div className="h-3 overflow-hidden rounded-full bg-paper-200"><div className="h-full rounded-full bg-gold-500" style={{ width: `${hiPct}%` }} /></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* API health */}
      {health && (
        <div className="paper-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">API Health</p>
            <span className="text-xs text-muted-400">Checked {new Date(health.checkedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <HealthBadge name="OpenAI" status={health.health.openai} />
            <HealthBadge name="Groq" status={health.health.groq} />
            <HealthBadge name="Gemini" status={health.health.gemini} />
            <HealthBadge name="Razorpay" status={health.health.razorpay} />
          </div>
        </div>
      )}
    </div>
  );
}
