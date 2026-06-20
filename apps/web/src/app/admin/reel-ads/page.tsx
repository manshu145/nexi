'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type ReelAd, type ReelAdsConfig } from '~/lib/api';

/**
 * Admin: Reel Ads — sponsored cards for the Current Affairs reel.
 *
 * Founder ask: "mujhe har 3 se 8 reels ke bich me ads place karne ka option
 * de admin panel me." This page controls:
 *   - master on/off + how often an ad shows (every N reels, 3..8)
 *   - the list of ad creatives (image, headline, CTA, target link, active)
 *
 * Mirrors the credit-rewards admin page pattern (auth guard → load → edit →
 * save with ~60s config-cache propagation note).
 */

const MIN_EVERY = 3;
const MAX_EVERY = 8;

export default function AdminReelAdsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [config, setConfig] = useState<ReelAdsConfig>({ enabled: false, everyNReels: 5 });
  const [original, setOriginal] = useState<ReelAdsConfig>({ enabled: false, everyNReels: 5 });
  const [adsList, setAdsList] = useState<ReelAd[]>([]);
  const [fetching, setFetching] = useState(true);
  const [savingCfg, setSavingCfg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/admin/login'); }, [user, loading, router]);

  async function load() {
    try {
      const res = await api.adminGetReelAds();
      setConfig({ ...res.config });
      setOriginal({ ...res.config });
      setAdsList(res.ads);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => { if (user) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user]);

  const dirty = config.enabled !== original.enabled || config.everyNReels !== original.everyNReels;

  async function saveConfig() {
    if (!dirty) return;
    setSavingCfg(true); setError(null); setOkMsg(null);
    try {
      const res = await api.adminUpdateReelAdsConfig(config);
      setConfig({ ...res.config });
      setOriginal({ ...res.config });
      setOkMsg('Saved. Changes take effect within ~60 seconds.');
      setTimeout(() => setOkMsg(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSavingCfg(false); }
  }

  if (loading || !user) return (
    <div className="space-y-4">
      <div className="h-7 w-40 rounded bg-paper-300 animate-pulse" />
      <div className="h-40 rounded bg-paper-300 animate-pulse" />
    </div>
  );

  const activeCount = adsList.filter(a => a.active).length;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-900">Reel Ads</h1>
          <p className="mt-1 text-sm text-muted-500 max-w-2xl">
            Sponsored cards shown inside the Current Affairs reel. Set how often an ad appears
            (after every N reels) and manage the creatives below. An ad only shows when ads are
            <strong> ON</strong> and at least one creative is <strong>active</strong>.
            Changes propagate within ~60 seconds (config cache).
          </p>
        </div>
      </div>

      {error && <div className="banner banner-error mt-4">{error}</div>}
      {okMsg && <div className="banner mt-4 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-sm">{okMsg}</div>}

      {fetching ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded bg-paper-300 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* ── Placement config ── */}
          <section className="paper-card mt-6 p-5">
            <h2 className="text-sm font-semibold text-ink-900">Placement</h2>
            <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig((p) => ({ ...p, enabled: e.target.checked }))}
                  className="h-5 w-5 rounded border-line text-ember-500 focus:ring-ember-500"
                />
                <span className="text-sm font-medium text-ink-900">
                  Ads {config.enabled ? 'enabled' : 'disabled'}
                </span>
              </label>

              <div className="flex items-end gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-500">
                    Show an ad after every
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="number"
                      min={MIN_EVERY}
                      max={MAX_EVERY}
                      value={config.everyNReels}
                      onChange={(e) => {
                        const n = Math.floor(Number(e.target.value) || 0);
                        setConfig((p) => ({ ...p, everyNReels: Math.min(MAX_EVERY, Math.max(MIN_EVERY, n)) }));
                      }}
                      className="input w-24 text-sm"
                    />
                    <span className="text-sm text-ink-700">reels (range {MIN_EVERY}–{MAX_EVERY})</span>
                  </div>
                </div>
                <button onClick={saveConfig} disabled={!dirty || savingCfg} className="btn-primary text-sm disabled:opacity-50">
                  {savingCfg ? 'Saving…' : dirty ? 'Save' : 'Saved'}
                </button>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-500">
              {config.enabled
                ? activeCount > 0
                  ? `Live: an ad will appear after every ${config.everyNReels} news reels, cycling through ${activeCount} active creative${activeCount === 1 ? '' : 's'}.`
                  : 'Ads are ON but no creative is active — nothing will show until you add/activate one below.'
                : 'Ads are OFF — the reel shows news only.'}
            </p>
          </section>

          {/* ── Add a new creative ── */}
          <NewAdForm onCreated={() => void load()} onError={setError} />

          {/* ── Existing creatives ── */}
          <section className="mt-6">
            <h2 className="text-sm font-semibold text-ink-900">
              Creatives <span className="text-muted-500 font-normal">({adsList.length})</span>
            </h2>
            {adsList.length === 0 ? (
              <p className="mt-3 text-sm text-muted-500">No ad creatives yet. Add one above.</p>
            ) : (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {adsList.map((ad) => (
                  <AdEditor key={ad.id} ad={ad} onChanged={() => void load()} onError={setError} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/* ─── Create form ─── */
function NewAdForm({ onCreated, onError }: { onCreated: () => void; onError: (m: string) => void }) {
  const [imageUrl, setImageUrl] = useState('');
  const [headline, setHeadline] = useState('');
  const [subtext, setSubtext] = useState('');
  const [ctaText, setCtaText] = useState('Learn more');
  const [targetUrl, setTargetUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const valid = /^https?:\/\/\S+$/i.test(imageUrl) && headline.trim() && ctaText.trim() && /^https?:\/\/\S+$/i.test(targetUrl);

  async function create() {
    if (!valid) return;
    setSaving(true);
    try {
      await api.adminCreateReelAd({ imageUrl: imageUrl.trim(), headline: headline.trim(), subtext: subtext.trim(), ctaText: ctaText.trim(), targetUrl: targetUrl.trim(), active: true });
      setImageUrl(''); setHeadline(''); setSubtext(''); setCtaText('Learn more'); setTargetUrl('');
      onCreated();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Create failed');
    } finally { setSaving(false); }
  }

  return (
    <section className="paper-card mt-6 p-5">
      <h2 className="text-sm font-semibold text-ink-900">Add a creative</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Image URL *">
          <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" className="input w-full text-sm" />
        </Field>
        <Field label="Target URL * (where the CTA goes)">
          <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://…" className="input w-full text-sm" />
        </Field>
        <Field label="Headline *">
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={140} placeholder="Crack UPSC with…" className="input w-full text-sm" />
        </Field>
        <Field label="CTA button text *">
          <input value={ctaText} onChange={(e) => setCtaText(e.target.value)} maxLength={40} placeholder="Learn more" className="input w-full text-sm" />
        </Field>
        <Field label="Subtext (optional)" full>
          <input value={subtext} onChange={(e) => setSubtext(e.target.value)} maxLength={200} placeholder="One supporting line…" className="input w-full text-sm" />
        </Field>
      </div>
      <div className="mt-4 flex justify-end">
        <button onClick={create} disabled={!valid || saving} className="btn-primary text-sm disabled:opacity-50">
          {saving ? 'Adding…' : 'Add ad'}
        </button>
      </div>
    </section>
  );
}

/* ─── Edit one creative ─── */
function AdEditor({ ad, onChanged, onError }: { ad: ReelAd; onChanged: () => void; onError: (m: string) => void }) {
  const [imageUrl, setImageUrl] = useState(ad.imageUrl);
  const [headline, setHeadline] = useState(ad.headline);
  const [subtext, setSubtext] = useState(ad.subtext ?? '');
  const [ctaText, setCtaText] = useState(ad.ctaText);
  const [targetUrl, setTargetUrl] = useState(ad.targetUrl);
  const [active, setActive] = useState(ad.active);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const dirty =
    imageUrl !== ad.imageUrl || headline !== ad.headline || (subtext || '') !== (ad.subtext ?? '') ||
    ctaText !== ad.ctaText || targetUrl !== ad.targetUrl || active !== ad.active;

  async function save() {
    if (!dirty) return;
    setSaving(true);
    try {
      await api.adminUpdateReelAd(ad.id, { imageUrl: imageUrl.trim(), headline: headline.trim(), subtext: subtext.trim(), ctaText: ctaText.trim(), targetUrl: targetUrl.trim(), active });
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!confirm('Delete this ad creative?')) return;
    setDeleting(true);
    try {
      await api.adminDeleteReelAd(ad.id);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Delete failed');
      setDeleting(false);
    }
  }

  return (
    <div className={`paper-card p-4 ${active ? '' : 'opacity-70'}`}>
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" className="h-16 w-16 flex-shrink-0 rounded-lg object-cover bg-paper-300" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-900">{headline || '(no headline)'}</p>
          <label className="mt-1 inline-flex items-center gap-2 text-xs text-ink-700 cursor-pointer">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded border-line text-ember-500 focus:ring-ember-500" />
            {active ? 'Active' : 'Inactive'}
          </label>
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        <Field label="Image URL"><input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="input w-full text-xs" /></Field>
        <Field label="Headline"><input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={140} className="input w-full text-xs" /></Field>
        <Field label="Subtext"><input value={subtext} onChange={(e) => setSubtext(e.target.value)} maxLength={200} className="input w-full text-xs" /></Field>
        <Field label="CTA text"><input value={ctaText} onChange={(e) => setCtaText(e.target.value)} maxLength={40} className="input w-full text-xs" /></Field>
        <Field label="Target URL"><input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} className="input w-full text-xs" /></Field>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button onClick={remove} disabled={deleting} className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50">
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
        <button onClick={save} disabled={!dirty || saving} className="btn-primary text-xs disabled:opacity-50">
          {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-500">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
