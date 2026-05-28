'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

const CATEGORIES = ['National', 'International', 'Economy', 'Science', 'Sports', 'Environment'];

interface Feed {
  id: string;
  url: string;
  name: string;
  category: string;
  isActive: boolean;
  lastFetched: string | null;
  itemsFetched: number;
  createdAt: string;
}

export default function AdminFeedsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('National');
  const [adding, setAdding] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<string | null>(null);
  const [testingUrl, setTestingUrl] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

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

  useEffect(() => { if (user) fetchFeeds(); }, [user]);

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
        body: JSON.stringify({ url: newUrl, name: newName, category: newCategory.toLowerCase() }),
      });
      if (res.ok) {
        const data = (await res.json()) as { id: string };
        setFeeds(prev => [{
          id: data.id, url: newUrl, name: newName, category: newCategory.toLowerCase(),
          isActive: true, lastFetched: null, itemsFetched: 0, createdAt: new Date().toISOString(),
        }, ...prev]);
        setNewUrl('');
        setNewName('');
        setNewCategory('National');
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
    if (!confirm('Delete this feed?')) return;
    try {
      const token = await getToken();
      await fetch(`${API}/v1/admin/feeds/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setFeeds(prev => prev.filter(f => f.id !== id));
    } catch { /* ignore */ }
  };

  const handleIngestNow = async () => {
    setIngesting(true);
    setIngestResult(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/feeds/ingest-now`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { message?: string };
        setIngestResult(data.message ?? 'Ingestion triggered!');
      }
    } catch { setIngestResult('Failed to trigger ingestion'); }
    finally { setIngesting(false); }
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
                  <th className="pb-2 text-left text-xs font-medium text-stone-500">URL</th>
                  <th className="pb-2 text-left text-xs font-medium text-stone-500">Category</th>
                  <th className="pb-2 text-center text-xs font-medium text-stone-500">Status</th>
                  <th className="pb-2 text-right text-xs font-medium text-stone-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {feeds.map(feed => (
                  <tr key={feed.id} className="border-b border-stone-800/50">
                    <td className="py-3 text-stone-200 font-medium">{feed.name}</td>
                    <td className="py-3 text-stone-400 text-xs font-mono max-w-[200px] truncate">{feed.url}</td>
                    <td className="py-3">
                      <span className="inline-flex rounded-full bg-stone-800 px-2 py-0.5 text-xs text-stone-300 capitalize">
                        {feed.category}
                      </span>
                    </td>
                    <td className="py-3 text-center">
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
                    <td className="py-3 text-right">
                      <button
                        onClick={() => handleDeleteFeed(feed.id)}
                        className="rounded p-1 text-stone-500 hover:bg-stone-800 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
