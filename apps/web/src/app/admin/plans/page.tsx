'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';

interface PlanInfo {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  comingSoon: boolean;
  subscribers: number;
}

interface CouponInfo {
  code: string;
  discountType: 'percent' | 'flat';
  discountValue: number;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  applicablePlans: string[];
  createdAt: string;
}

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

export default function AdminPlansPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [coupons, setCoupons] = useState<CouponInfo[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Coupon form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: '', discountType: 'percent' as 'percent' | 'flat', discountValue: '', maxUses: '', expiresAt: '', applicablePlans: ['scholar'] as string[] });
  const [creating, setCreating] = useState(false);

  useEffect(() => { if (!loading && !user) router.replace('/admin/login'); }, [user, loading, router]);

  const fetchData = async () => {
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [plansRes, couponsRes] = await Promise.all([
        fetch(`${API}/v1/admin/plans`, { headers }),
        fetch(`${API}/v1/admin/coupons`, { headers }),
      ]);

      if (plansRes.ok) { const d = await plansRes.json() as { plans: PlanInfo[] }; setPlans(d.plans); }
      if (couponsRes.ok) { const d = await couponsRes.json() as { coupons: CouponInfo[] }; setCoupons(d.coupons); }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed';
      if (!msg.includes('404')) setError(msg);
    } finally { setFetching(false); }
  };

  useEffect(() => { if (user) fetchData(); }, [user]);

  const handleCreateCoupon = async () => {
    if (!form.code.trim() || !form.discountValue) return;
    setCreating(true);
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API}/v1/admin/coupons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          code: form.code.toUpperCase(),
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          maxUses: form.maxUses ? Number(form.maxUses) : 0,
          expiresAt: form.expiresAt || null,
          applicablePlans: form.applicablePlans,
        }),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json() as { coupon: CouponInfo };
      setCoupons(prev => [data.coupon, ...prev]);
      setForm({ code: '', discountType: 'percent', discountValue: '', maxUses: '', expiresAt: '', applicablePlans: ['scholar'] });
      setShowForm(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create'); }
    finally { setCreating(false); }
  };

  const handleDeleteCoupon = async (code: string) => {
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      await fetch(`${API}/v1/admin/coupons/${code}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setCoupons(prev => prev.filter(c => c.code !== code));
    } catch { /* ignore */ }
  };

  const handleToggleCoupon = async (code: string, active: boolean) => {
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      await fetch(`${API}/v1/admin/coupons/${code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: !active }),
      });
      setCoupons(prev => prev.map(c => c.code === code ? { ...c, isActive: !active } : c));
    } catch { /* ignore */ }
  };

  if (loading || !user) return (
    <div className="space-y-4">
      <div className="h-7 w-32 rounded bg-paper-300 animate-pulse" />
      <div className="h-40 rounded bg-paper-300 animate-pulse" />
    </div>
  );

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-ink-900">Plans & Coupons</h1>
      <p className="mt-1 text-sm text-muted-500">Manage subscription plans and discount codes</p>

      {error && <div className="banner banner-error mt-4">{error}</div>}

      {/* Plans Table */}
      <div className="paper-card mt-6 overflow-hidden">
        <div className="px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-ink-900">Plans</h2>
        </div>
        {fetching ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 rounded bg-paper-300 animate-pulse" />)}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Plan</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Price</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Status</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Subscribers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {plans.map(p => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium text-ink-900">{p.name}</td>
                  <td className="px-4 py-3 text-muted-600 dark:text-muted-400">{p.price === 0 ? 'Free' : `₹${p.price}/mo`}</td>
                  <td className="px-4 py-3">
                    {p.isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-muted-500">
                        Coming Soon
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink-900">{p.subscribers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Coupons Section */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">Coupons</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs px-3 py-1.5">
          {showForm ? 'Cancel' : '+ Create Coupon'}
        </button>
      </div>

      {/* Create coupon form */}
      {showForm && (
        <div className="paper-card mt-4 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-ink-700">Code</label>
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className="input mt-1" placeholder="SAVE50" />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-700">Discount Type</label>
              <select value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value as any }))} className="input mt-1">
                <option value="percent">% Off</option>
                <option value="flat">Flat ₹ Off</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-ink-700">Discount Value</label>
              <input type="number" value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))} className="input mt-1" placeholder={form.discountType === 'percent' ? '50' : '30'} />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-700">Max Uses (0 = unlimited)</label>
              <input type="number" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))} className="input mt-1" placeholder="100" />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-700">Expiry Date (optional)</label>
              <input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} className="input mt-1" />
            </div>
          </div>
          <button onClick={handleCreateCoupon} disabled={creating || !form.code.trim() || !form.discountValue} className="btn-primary w-full text-sm">
            {creating ? 'Creating...' : 'Create Coupon'}
          </button>
        </div>
      )}

      {/* Coupons table */}
      {coupons.length === 0 && !fetching ? (
        <div className="paper-card mt-4 p-6 text-center">
          <p className="text-sm text-muted-500">No coupons created yet.</p>
        </div>
      ) : (
        <div className="paper-card mt-4 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Code</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Discount</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Used/Max</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Status</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {coupons.map(c => (
                <tr key={c.code}>
                  <td className="px-4 py-3 font-mono font-medium text-ink-900">{c.code}</td>
                  <td className="px-4 py-3 text-muted-600 dark:text-muted-400">
                    {c.discountType === 'percent' ? `${c.discountValue}%` : `₹${c.discountValue}`}
                  </td>
                  <td className="px-4 py-3 text-muted-600 dark:text-muted-400">
                    {c.usedCount}/{c.maxUses === 0 ? '∞' : c.maxUses}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleToggleCoupon(c.code, c.isActive)} className="text-xs">
                      {c.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-400">Active</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-stone-200 px-2 py-0.5 font-medium text-muted-500">Inactive</span>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDeleteCoupon(c.code)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
