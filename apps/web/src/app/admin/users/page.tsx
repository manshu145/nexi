'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';
import { AILoader } from '~/components/ui/AILoader';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  targetExam: string | null;
  plan: string;
  credits: number;
  role: string;
  createdAt: string;
}

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

export default function AdminUsersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchDebounce, setSearchDebounce] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => { setSearchDebounce(search); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setFetching(true);
      try {
        const auth = getFirebaseAuthClient();
        const token = await auth.currentUser?.getIdToken();
        const searchParam = searchDebounce ? `&search=${encodeURIComponent(searchDebounce)}` : '';
        const res = await fetch(`${API}/v1/admin/users?page=${page}&limit=20${searchParam}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json() as { users: AdminUser[]; total: number };
        if (!cancelled) { setUsers(data.users); setTotal(data.total); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load users');
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, page, searchDebounce]);

  if (loading || !user) return <div className="flex items-center justify-center py-20"><AILoader context="general" /></div>;
  if (error) return <div className="banner banner-error">{error}</div>;

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-ink-900">Users</h1>
      <p className="mt-1 text-sm text-muted-500">{total} total users</p>

      {/* Search bar */}
      <div className="mt-4">
        <input
          type="text"
          placeholder="Search by name, email, phone, or exam..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input w-full"
        />
      </div>

      {fetching ? (
        <div className="flex items-center justify-center py-12"><AILoader context="general" /></div>
      ) : (
        <div className="mt-6 space-y-2">
          {users.map((u) => (
            <div key={u.id} className="paper-card p-4">
              <button
                className="w-full text-left flex items-center justify-between"
                onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg">👤</span>
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-ink-900 truncate">{u.name || 'Unnamed'}</p>
                    <p className="text-xs text-muted-500 truncate">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="pill text-xs">{u.plan}</span>
                  <span className="text-xs text-muted-500">{expandedId === u.id ? '▲' : '▼'}</span>
                </div>
              </button>
              {expandedId === u.id && (
                <div className="mt-3 pt-3 border-t border-line grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-500">Exam:</span> <span className="text-ink-900">{u.targetExam ?? '—'}</span></div>
                  <div><span className="text-muted-500">Credits:</span> <span className="text-ink-900">{u.credits}</span></div>
                  <div><span className="text-muted-500">Role:</span> <span className="text-ink-900">{u.role}</span></div>
                  <div><span className="text-muted-500">Joined:</span> <span className="text-ink-900">{new Date(u.createdAt).toLocaleDateString()}</span></div>
                </div>
              )}
            </div>
          ))}
          {users.length === 0 && <p className="text-center text-sm text-muted-500 py-8">No users yet.</p>}
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost-sm disabled:opacity-50">← Prev</button>
          <span className="text-sm text-muted-500">Page {page} of {Math.ceil(total / 20)}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= total} className="btn-ghost-sm disabled:opacity-50">Next →</button>
        </div>
      )}
    </div>
  );
}
