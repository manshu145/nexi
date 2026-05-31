'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type AdminPlan, type AdminPlanPatch } from '~/lib/api';
import { getFirebaseAuthClient } from '~/lib/firebase';

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

/**
 * Editable copy of a plan kept in component state. We track the SUBSET of
 * fields the admin can change (price, yearlyPrice, isActive, comingSoon,
 * features, name, nameHi). The id and subscriber count stay read-only here
 * to keep the editor table compact.
 *
 * PR-34b (audit #37): nameHi is now editable in the row form. Backend
 * already accepted it via adminUpdatePlan; the table just didn't surface
 * it. Hindi label sits as a small input under the English one.
 */
type PlanDraft = Pick<AdminPlan,
  'id' | 'name' | 'nameHi' | 'price' | 'yearlyPrice' | 'isActive' | 'comingSoon' | 'features' | 'subscribers'
>;

export default function AdminPlansPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [plans, setPlans] = useState<PlanDraft[]>([]);
  const [originalPlans, setOriginalPlans] = useState<PlanDraft[]>([]);
  const [coupons, setCoupons] = useState<CouponInfo[]>([]);
  const [fetching, setFetching] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

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
        api.adminGetPlans(),
        fetch(`${API}/v1/admin/coupons`, { headers }),
      ]);

      const planDrafts: PlanDraft[] = plansRes.plans.map((p) => ({
        id: p.id,
        name: p.name,
        nameHi: p.nameHi,
        price: p.price,
        yearlyPrice: p.yearlyPrice,
        isActive: p.isActive,
        comingSoon: p.comingSoon,
        features: { ...p.features },
        subscribers: p.subscribers,
      }));
      setPlans(planDrafts);
      setOriginalPlans(JSON.parse(JSON.stringify(planDrafts)));

      if (couponsRes.ok) {
        const d = (await couponsRes.json()) as { coupons: CouponInfo[] };
        setCoupons(d.coupons);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed';
      if (!msg.includes('404')) setError(msg);
    } finally { setFetching(false); }
  };

  useEffect(() => { if (user) fetchData(); }, [user]);

  // Update one field on one plan in component state. Saving happens later
  // via the row's "Save" button so admin can adjust several numbers and
  // commit them in a single PATCH.
  function patchDraft(id: string, patch: Partial<PlanDraft>) {
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch, features: { ...p.features, ...patch.features } } : p)));
  }

  function isDirty(id: string): boolean {
    const draft = plans.find((p) => p.id === id);
    const orig = originalPlans.find((p) => p.id === id);
    if (!draft || !orig) return false;
    return JSON.stringify({ ...draft, subscribers: 0 }) !== JSON.stringify({ ...orig, subscribers: 0 });
  }

  async function savePlan(id: string) {
    const draft = plans.find((p) => p.id === id);
    if (!draft) return;
    setSavingId(id);
    setError(null);
    setOkMsg(null);
    try {
      const patch: Partial<AdminPlanPatch> = {
        name: draft.name,
        nameHi: draft.nameHi,
        price: draft.price,
        yearlyPrice: draft.yearlyPrice,
        isActive: draft.isActive,
        comingSoon: draft.comingSoon,
        features: draft.features,
      };
      const res = await api.adminUpdatePlan(id, patch);
      // Sync back: server may have sanitised values (e.g. floor numbers).
      patchDraft(id, {
        name: res.plan.name,
        nameHi: res.plan.nameHi,
        price: res.plan.price,
        yearlyPrice: res.plan.yearlyPrice,
        isActive: res.plan.isActive,
        comingSoon: res.plan.comingSoon,
        features: res.plan.features,
      });
      setOriginalPlans((prev) => prev.map((p) => (p.id === id ? { ...draft, ...res.plan } : p)));
      setOkMsg(`Saved ${draft.name}.`);
      setTimeout(() => setOkMsg(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  }

  function resetPlan(id: string) {
    const orig = originalPlans.find((p) => p.id === id);
    if (!orig) return;
    setPlans((prev) => prev.map((p) => (p.id === id ? JSON.parse(JSON.stringify(orig)) : p)));
  }

  // ── coupon handlers (unchanged from pre-PR-04) ───────────────────────────

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
      const data = (await res.json()) as { coupon: CouponInfo };
      setCoupons((prev) => [data.coupon, ...prev]);
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
      setCoupons((prev) => prev.filter((c) => c.code !== code));
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
      setCoupons((prev) => prev.map((c) => (c.code === code ? { ...c, isActive: !active } : c)));
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
      <h1 className="font-serif text-2xl font-bold text-ink-900">Plans &amp; Coupons</h1>
      <p className="mt-1 text-sm text-muted-500">Edit subscription pricing, feature flags, and discount codes.</p>

      {error && <div className="banner banner-error mt-4">{error}</div>}
      {okMsg && <div className="banner mt-4 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-sm">{okMsg}</div>}

      {/* Plans Editor */}
      <section className="paper-card mt-6 overflow-hidden">
        <div className="px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-ink-900">Plan matrix</h2>
          <p className="mt-0.5 text-xs text-muted-500">Edit the price, status, and feature caps. Changes take effect within ~60 seconds (config cache TTL).</p>
        </div>
        {fetching ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 rounded bg-paper-300 animate-pulse" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Plan</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">₹/mo</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">₹/yr</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Active</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Coming Soon</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Subs</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {plans.map((p) => {
                  const dirty = isDirty(p.id);
                  const saving = savingId === p.id;
                  return (
                    <tr key={p.id}>
                      <td className="px-4 py-3">
                        <input
                          value={p.name}
                          onChange={(e) => patchDraft(p.id, { name: e.target.value })}
                          className="input w-32 text-sm"
                          placeholder="Name (English)"
                        />
                        {/* PR-34b (audit #37): admin can now edit the
                             Hindi label in-place. Backend already accepted
                             nameHi via adminUpdatePlan; surfacing the field
                             stops it from drifting from the locked default. */}
                        {p.id !== 'free' && (
                          <input
                            value={p.nameHi}
                            onChange={(e) => patchDraft(p.id, { nameHi: e.target.value })}
                            className="input mt-1 w-32 text-xs"
                            placeholder="Hindi label"
                            lang="hi"
                          />
                        )}
                        <p className="mt-0.5 text-[10px] text-muted-400">id: {p.id}</p>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          value={p.price}
                          onChange={(e) => patchDraft(p.id, { price: Number(e.target.value) })}
                          className="input w-24 text-sm"
                          disabled={p.id === 'free'}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          value={p.yearlyPrice}
                          onChange={(e) => patchDraft(p.id, { yearlyPrice: Number(e.target.value) })}
                          className="input w-28 text-sm"
                          disabled={p.id === 'free'}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={p.isActive}
                          onChange={(e) => patchDraft(p.id, { isActive: e.target.checked })}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={p.comingSoon}
                          onChange={(e) => patchDraft(p.id, { comingSoon: e.target.checked })}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-ink-900">{p.subscribers}</td>
                      <td className="px-4 py-3">
                        {dirty ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => savePlan(p.id)}
                              disabled={saving}
                              className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                            >
                              {saving ? '…' : 'Save'}
                            </button>
                            <button
                              onClick={() => resetPlan(p.id)}
                              disabled={saving}
                              className="btn-ghost-sm text-xs"
                            >
                              Reset
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-400">No changes</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Feature toggles, one row per plan */}
            <div className="mt-2 border-t border-line">
              <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-500">Feature caps</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-line text-left">
                    <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-500">Plan</th>
                    <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-500">Daily MCQ</th>
                    <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-500">Mocks</th>
                    <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-500">Chapters/day</th>
                    <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-500">AI Tutor</th>
                    <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-500">Current Affairs</th>
                    <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-500">Essay Grade</th>
                    <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-500">Deduct credits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {plans.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2 font-medium text-ink-900">{p.name}</td>
                      <td className="px-4 py-2">
                        <input type="number" value={p.features.dailyMCQ}
                          onChange={(e) => patchDraft(p.id, { features: { ...p.features, dailyMCQ: Number(e.target.value) } })}
                          className="input w-16 text-xs" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" value={p.features.mockTests}
                          onChange={(e) => patchDraft(p.id, { features: { ...p.features, mockTests: Number(e.target.value) } })}
                          className="input w-16 text-xs" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" value={p.features.chaptersPerDay}
                          onChange={(e) => patchDraft(p.id, { features: { ...p.features, chaptersPerDay: Number(e.target.value) } })}
                          className="input w-16 text-xs" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="checkbox" checked={p.features.aiTutor}
                          onChange={(e) => patchDraft(p.id, { features: { ...p.features, aiTutor: e.target.checked } })} />
                      </td>
                      <td className="px-4 py-2">
                        <input type="checkbox" checked={p.features.currentAffairs}
                          onChange={(e) => patchDraft(p.id, { features: { ...p.features, currentAffairs: e.target.checked } })} />
                      </td>
                      <td className="px-4 py-2">
                        <input type="checkbox" checked={p.features.essayGrading}
                          onChange={(e) => patchDraft(p.id, { features: { ...p.features, essayGrading: e.target.checked } })} />
                      </td>
                      <td className="px-4 py-2">
                        <input type="checkbox" checked={p.features.creditDeduction}
                          onChange={(e) => patchDraft(p.id, { features: { ...p.features, creditDeduction: e.target.checked } })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-2 text-[11px] text-muted-400">
                <code>-1</code> means &quot;unlimited&quot;. Use the per-row Save button above after changing any feature; one save commits the whole row.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Coupons Section */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">Coupons</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs px-3 py-1.5">
          {showForm ? 'Cancel' : '+ Create Coupon'}
        </button>
      </div>

      {showForm && (
        <div className="paper-card mt-4 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-ink-700">Code</label>
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className="input mt-1" placeholder="SAVE50" />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-700">Discount Type</label>
              <select value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value as 'percent' | 'flat' }))} className="input mt-1">
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
            <div>
              <label className="text-xs font-medium text-ink-700">Applicable plans</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {(['scholar', 'aspirant', 'achiever'] as const).map((id) => (
                  <label key={id} className="inline-flex items-center gap-1 text-xs text-ink-700">
                    <input
                      type="checkbox"
                      checked={form.applicablePlans.includes(id)}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        applicablePlans: e.target.checked
                          ? Array.from(new Set([...f.applicablePlans, id]))
                          : f.applicablePlans.filter((p) => p !== id),
                      }))}
                    />
                    {id}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <button onClick={handleCreateCoupon} disabled={creating || !form.code.trim() || !form.discountValue} className="btn-primary w-full text-sm">
            {creating ? 'Creating...' : 'Create Coupon'}
          </button>
        </div>
      )}

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
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-500">Applicable Plans</th>
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
                  {/* PR-34b (audit #34): show which plans the coupon
                       is configured for. Coupons configured for
                       aspirant/achiever-only would otherwise be
                       invisible from the admin table even though they
                       took effect server-side. "all" indicates the
                       backend treats an empty list as universal. */}
                  <td className="px-4 py-3 text-muted-600 dark:text-muted-400">
                    {c.applicablePlans && c.applicablePlans.length > 0
                      ? c.applicablePlans.join(', ')
                      : 'all'}
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
