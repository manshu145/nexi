'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';
import { INDIAN_STATES } from '@nexigrate/shared';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

const CATEGORIES = ['National', 'International', 'Economy', 'Science', 'Sports', 'Environment'];

interface Feed {
  id: string;
  url: string;
  name: string;
  category: string;
  /** Optional state/UT slug — when set, items from this feed are tagged
   *  to that state and only surface in the matching state edition. */
  state?: string | null;
  isActive: boolean;
  lastFetched: string | null;
  itemsFetched: number;
  createdAt: string;
  // Per-feed result of the most recent ingestion run (written back by
  // the API's fetchRssFeeds). Optional because feeds added before this
  // shipped won't have them until the next ingest.
  lastStatus?: 'ok' | 'empty' | 'error';
  lastError?: string | null;
  lastSampleTitles?: string[];
}

/** Admin view of one state/UT toggle row. */
interface CAStateRow {
  slug: string;
  name: string;
  nameHi: string;
  isUT: boolean;
  isLive: boolean;
}

/** Lookup: state slug -> English name (for the feeds table badge). */
const STATE_NAME_BY_SLUG: Record<string, string> = Object.fromEntries(
  INDIAN_STATES.map((s) => [s.slug, s.name]),
);

/** Compact "x min ago" formatter for the Last fetched column. */
function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'never';
  const secs = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AdminFeedsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('National');
  const [newState, setNewState] = useState('');  // '' = National (no state tag)
  const [adding, setAdding] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<string | null>(null);
  const [testingUrl, setTestingUrl] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  // State editions (current affairs). Admin toggles which states students
  // can pick in the Current Affairs state selector.
  const [caStates, setCaStates] = useState<CAStateRow[]>([]);
  const [statesLoading, setStatesLoading] = useState(true);
  const [savingState, setSavingState] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState('');
  // Poll timer for the background ingestion job (cleared on unmount).
  const pollRef = useRef<number | null>(null);
  useEffect(() => () => { if (pollRef.current) window.clearTimeout(pollRef.current); }, []);
  // PR-34a: inline confirm-row state, mirrors the pattern from
  // admin/announcements/page.tsx so the admin doesn't get a native
  // confirm() dialog when deleting a feed.
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/admin/login'); }, [user, loading, router]);

  const getToken = async () => {
    const auth = getFirebaseAuthClient();
    return auth.currentUser?.getIdToken();
  };

  const fetchFeeds = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/feeds`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { feeds: Feed[] };
        setFeeds(data.feeds ?? []);
      }
    } catch { /* ignore */ }
    finally { setPageLoading(false); }
  };

  const fetchStates = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/current-affairs/states`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { states: CAStateRow[] };
        setCaStates(data.states ?? []);
      }
    } catch { /* ignore */ }
    finally { setStatesLoading(false); }
  };

  const handleToggleState = async (slug: string, isLive: boolean) => {
    setSavingState(slug);
    // Optimistic update — revert on failure.
    setCaStates(prev => prev.map(s => s.slug === slug ? { ...s, isLive } : s));
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/current-affairs/states/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isLive }),
      });
      if (!res.ok) throw new Error('save failed');
    } catch {
      setCaStates(prev => prev.map(s => s.slug === slug ? { ...s, isLive: !isLive } : s));
    } finally {
      setSavingState(null);
    }
  };

  useEffect(() => { if (user) { fetchFeeds(); fetchStates(); } }, [user]);

  const handleTestUrl = async () => {
    if (!newUrl.trim()) return;
    setTestingUrl(true);
    setTestResult(null);
    try {
      const res = await fetch(newUrl, { method: 'HEAD', mode: 'no-cors' });
      setTestResult('URL appears reachable');
    } catch {
      setTestResult('URL may not be reachable (CORS blocked, but may still work server-side)');
    }
    finally { setTestingUrl(false); }
  };

  const handleAddFeed = async () => {
    if (!newUrl.trim() || !newName.trim()) return;
    setAdding(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/feeds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          url: newUrl,
          name: newName,
          category: newCategory.toLowerCase(),
          ...(newState ? { state: newState } : {}),
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { id: string };
        setFeeds(prev => [{
          id: data.id, url: newUrl, name: newName, category: newCategory.toLowerCase(),
          ...(newState ? { state: newState } : {}),
          isActive: true, lastFetched: null, itemsFetched: 0, createdAt: new Date().toISOString(),
        }, ...prev]);
        setNewUrl('');
        setNewName('');
        setNewCategory('National');
        setNewState('');
        setTestResult(null);
      }
    } catch { /* ignore */ }
    finally { setAdding(false); }
  };

  const handleToggleFeed = async (id: string, isActive: boolean) => {
    try {
      const token = await getToken();
      await fetch(`${API}/v1/admin/feeds/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: !isActive }),
      });
      setFeeds(prev => prev.map(f => f.id === id ? { ...f, isActive: !isActive } : f));
    } catch { /* ignore */ }
  };

  const handleDeleteFeed = async (id: string) => {
    try {
      const token = await getToken();
      await fetch(`${API}/v1/admin/feeds/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setFeeds(prev => prev.filter(f => f.id !== id));
      setDeleteConfirm(null);
    } catch { /* ignore */ }
  };

  // Poll the background ingestion job until it finishes. Replaces the old
  // 150s blocking request that timed out on slow-AI runs and made the
  // button feel broken. The POST below returns instantly; this drives the
  // progress + final result by reading /feeds/ingest-status every 3s.
  const pollIngestStatus = async (attempt = 0) => {
    const MAX_ATTEMPTS = 120; // 120 × 3s ≈ 6 min ceiling
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/feeds/ingest-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: { state: 'idle' | 'running' | 'error'; fetched: number | null; saved: number | null; error: string | null } | null;
      };
      const st = data.status;
      if (st && st.state === 'running' && attempt < MAX_ATTEMPTS) {
        setIngestResult('⏳ Running in background — fetching feeds & summarising with AI…');
        pollRef.current = window.setTimeout(() => { void pollIngestStatus(attempt + 1); }, 3000);
        return;
      }
      if (st && st.state === 'error') {
        setIngestResult(`Ingestion failed: ${st.error ?? 'unknown error'}`);
      } else if (st && st.state === 'idle' && typeof st.saved === 'number') {
        setIngestResult(`✓ Ingestion complete — ${st.saved} saved out of ${st.fetched ?? '?'} fetched.`);
      } else if (attempt >= MAX_ATTEMPTS) {
        setIngestResult('Still running after ~6 minutes — check the feed table shortly.');
      } else {
        setIngestResult('Ingestion finished.');
      }
      await fetchFeeds();
      setIngesting(false);
    } catch {
      // Transient poll hiccup — retry a few more times before giving up.
      if (attempt < MAX_ATTEMPTS) {
        pollRef.current = window.setTimeout(() => { void pollIngestStatus(attempt + 1); }, 4000);
      } else {
        setIngestResult('Lost connection while polling status. Refresh the page to check the result.');
        setIngesting(false);
      }
    }
  };

  const handleIngestNow = async () => {
    setIngesting(true);
    setIngestResult('Starting ingestion…');
    if (pollRef.current) window.clearTimeout(pollRef.current);
    try {
      const token = await getToken();
      // The endpoint kicks the job off in the background and returns
      // instantly — no more 150s blocking wait / timeout.
      const res = await fetch(`${API}/v1/admin/feeds/ingest-now`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        started?: boolean; alreadyRunning?: boolean; message?: string; error?: string;
      };
      if (!res.ok) {
        setIngestResult(data.error ?? data.message ?? `Could not start ingestion (HTTP ${res.status})`);
        setIngesting(false);
        return;
      }
      setIngestResult(data.message ?? (data.alreadyRunning ? 'Ingestion already running…' : 'Ingestion started…'));
      void pollIngestStatus(0);
    } catch (err) {
      setIngestResult(err instanceof Error ? `Failed to start ingestion: ${err.message}` : 'Failed to start ingestion');
      setIngesting(false);
    }
  };

  if (loading || !user || pageLoading) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-48 rounded bg-stone-800 animate-pulse" />
        <div className="h-64 rounded bg-stone-800 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-stone-100">📡 News Feed Management</h1>
          <p className="mt-1 text-sm text-stone-500">Manage RSS feeds for current affairs ingestion</p>
        </div>
        <button
          onClick={handleIngestNow}
          disabled={ingesting}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 hover:bg-amber-600 transition-colors disabled:opacity-50"
        >
          {ingesting ? '⏳ Ingesting...' : '🔄 Ingest Now'}
        </button>
      </div>

      {ingestResult && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-500">
          {ingestResult}
        </div>
      )}

      {/* Add Feed Form */}
      <section className="mt-6 rounded-xl border border-stone-800 bg-stone-900 p-5">
        <h2 className="font-serif text-lg font-semibold text-stone-100">Add Feed</h2>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-stone-400">Feed Name</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. The Hindu"
                className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-400">Category</label>
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-amber-500 focus:outline-none"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-stone-400">State Edition</label>
            <select
              value={newState}
              onChange={e => setNewState(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="">🇮🇳 National (no state)</option>
              <optgroup label="States">
                {INDIAN_STATES.filter(s => !s.isUT).map(s => (
                  <option key={s.slug} value={s.slug}>{s.name}</option>
                ))}
              </optgroup>
              <optgroup label="Union Territories">
                {INDIAN_STATES.filter(s => s.isUT).map(s => (
                  <option key={s.slug} value={s.slug}>{s.name}</option>
                ))}
              </optgroup>
            </select>
            <p className="mt-1 text-[11px] text-stone-500">
              Tag this feed to a state so its news appears only in that state edition.
              Leave as National for country-wide feeds. Make sure the state is
              <span className="text-amber-500"> live</span> below for students to see it.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-stone-400">RSS URL</label>
            <input
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              placeholder="https://example.com/rss/feed.xml"
              className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-500 focus:outline-none"
            />
          </div>
          {testResult && (
            <p className="text-xs text-stone-400">{testResult}</p>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={handleTestUrl}
              disabled={testingUrl || !newUrl.trim()}
              className="rounded-lg border border-stone-700 px-3 py-2 text-sm text-stone-300 hover:bg-stone-800 transition-colors disabled:opacity-50"
            >
              {testingUrl ? '⏳ Testing...' : '🔍 Test URL'}
            </button>
            <button
              onClick={handleAddFeed}
              disabled={adding || !newUrl.trim() || !newName.trim()}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 hover:bg-amber-600 transition-colors disabled:opacity-50"
            >
              {adding ? 'Adding...' : '➕ Save Feed'}
            </button>
          </div>
        </div>
      </section>

      {/* Active Feeds Table */}
      <section className="mt-6 rounded-xl border border-stone-800 bg-stone-900 p-5">
        <h2 className="font-serif text-lg font-semibold text-stone-100">Active Feeds ({feeds.length})</h2>
        {feeds.length === 0 ? (
          <div className="mt-4 text-center py-8">
            <p className="text-3xl">📡</p>
            <p className="mt-2 text-sm text-stone-500">No feeds configured yet. Add one above.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-800">
                  <th className="pb-2 text-left text-xs font-medium text-stone-500">Name</th>
                  <th className="pb-2 text-left text-xs font-medium text-stone-500">Category</th>
                  <th className="pb-2 text-left text-xs font-medium text-stone-500">State</th>
                  <th className="pb-2 text-left text-xs font-medium text-stone-500">Last fetched</th>
                  <th className="pb-2 text-center text-xs font-medium text-stone-500">Items</th>
                  <th className="pb-2 text-center text-xs font-medium text-stone-500">Result</th>
                  <th className="pb-2 text-center text-xs font-medium text-stone-500">Active</th>
                  <th className="pb-2 text-right text-xs font-medium text-stone-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {feeds.map(feed => (
                  <tr key={feed.id} className="border-b border-stone-800/50">
                    <td className="py-3 align-top">
                      <div className="text-stone-200 font-medium">{feed.name}</div>
                      <div className="text-stone-500 text-xs font-mono max-w-[220px] truncate" title={feed.url}>{feed.url}</div>
                    </td>
                    <td className="py-3 align-top">
                      <span className="inline-flex rounded-full bg-stone-800 px-2 py-0.5 text-xs text-stone-300 capitalize">
                        {feed.category}
                      </span>
                    </td>
                    <td className="py-3 align-top">
                      {feed.state ? (
                        <span className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">
                          {STATE_NAME_BY_SLUG[feed.state] ?? feed.state}
                        </span>
                      ) : (
                        <span className="text-xs text-stone-600">National</span>
                      )}
                    </td>
                    <td className="py-3 align-top text-stone-400 text-xs whitespace-nowrap" title={feed.lastFetched ?? 'never fetched'}>
                      {timeAgo(feed.lastFetched)}
                    </td>
                    <td className="py-3 align-top text-center">
                      <span
                        className="text-stone-200 text-sm font-medium"
                        title={
                          feed.lastSampleTitles && feed.lastSampleTitles.length > 0
                            ? `Last fetched headlines:\n• ${feed.lastSampleTitles.join('\n• ')}`
                            : 'No sample headlines from the last run'
                        }
                      >
                        {feed.lastFetched ? (feed.itemsFetched ?? 0) : '—'}
                      </span>
                    </td>
                    <td className="py-3 align-top text-center">
                      {!feed.lastFetched ? (
                        <span className="text-xs text-stone-600">not run</span>
                      ) : feed.lastStatus === 'error' ? (
                        <span
                          className="inline-flex rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400"
                          title={feed.lastError ?? 'fetch failed'}
                        >
                          ⚠ error
                        </span>
                      ) : feed.lastStatus === 'empty' || (feed.itemsFetched ?? 0) === 0 ? (
                        <span className="inline-flex rounded-full bg-stone-800 px-2 py-0.5 text-xs font-medium text-stone-400">
                          0 items
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-500">
                          ✓ ok
                        </span>
                      )}
                    </td>
                    <td className="py-3 align-top text-center">
                      <button
                        onClick={() => handleToggleFeed(feed.id, feed.isActive)}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                          feed.isActive
                            ? 'bg-amber-500/20 text-amber-500'
                            : 'bg-stone-800 text-stone-500'
                        }`}
                      >
                        {feed.isActive ? '🟢 Active' : '⚪ Paused'}
                      </button>
                    </td>
                    <td className="py-3 align-top text-right">
                      {deleteConfirm === feed.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleDeleteFeed(feed.id)}
                            className="rounded px-2 py-1 text-xs font-medium bg-ember-100 text-ember-700"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="rounded px-2 py-1 text-xs font-medium bg-stone-800 text-stone-300"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(feed.id)}
                          className="rounded p-1 text-stone-500 hover:bg-stone-800 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* State Editions Manager */}
      <section className="mt-6 rounded-xl border border-stone-800 bg-stone-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-serif text-lg font-semibold text-stone-100">🗺️ State Editions</h2>
            <p className="mt-1 text-sm text-stone-500">
              Toggle which states students can pick in the Current Affairs state selector.
              Only <span className="text-amber-500">live</span> states appear on the app.
            </p>
          </div>
          <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-400">
            {caStates.filter(s => s.isLive).length} live
          </span>
        </div>

        <input
          value={stateFilter}
          onChange={e => setStateFilter(e.target.value)}
          placeholder="Search state…"
          className="mt-4 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-500 focus:outline-none sm:max-w-xs"
        />

        {statesLoading ? (
          <div className="mt-4 h-24 rounded bg-stone-800 animate-pulse" />
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {caStates
              .filter(s =>
                !stateFilter.trim() ||
                s.name.toLowerCase().includes(stateFilter.toLowerCase()) ||
                s.nameHi.includes(stateFilter),
              )
              .map(s => (
                <button
                  key={s.slug}
                  onClick={() => handleToggleState(s.slug, !s.isLive)}
                  disabled={savingState === s.slug}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
                    s.isLive
                      ? 'border-amber-500/40 bg-amber-500/10 text-stone-100'
                      : 'border-stone-800 bg-stone-950 text-stone-400 hover:border-stone-700'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="block truncate text-[11px] text-stone-500">{s.nameHi}{s.isUT ? ' · UT' : ''}</span>
                  </span>
                  <span className={`ml-2 flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    s.isLive ? 'bg-amber-500/20 text-amber-400' : 'bg-stone-800 text-stone-500'
                  }`}>
                    {savingState === s.slug ? '…' : s.isLive ? '🟢 Live' : '⚪ Off'}
                  </span>
                </button>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
