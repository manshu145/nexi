'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type ReelAd, type ReelAdsConfig } from '~/lib/api';

/**
 * Admin: Reel Ads — sponsored cards for the Current Affairs reel.
 *
 * Controls:
 *   - master on/off + how often an ad shows (every N reels, 3..8)
 *   - the list of ad creatives (image OR video, headline, CTA, target link)
 *   - a live preview of exactly how each creative renders in the reel
 *
 * Compliance note: every ad card carries a "Sponsored" disclosure and video
 * autoplays muted + inline (Play Store / mobile ad-policy friendly).
 */

const MIN_EVERY = 3;
const MAX_EVERY = 8;

type MediaType = 'image' | 'video';

/** Creative spec guidance surfaced to the admin. */
const SIZE_GUIDE = {
  image: 'Recommended: 1080×1080 (1:1) or 1080×1350 (4:5). JPG / PNG / WebP. Uploads are auto-compressed to keep the feed fast.',
  video: 'Hosted MP4 (H.264) URL. 1:1 or 9:16, ≤ ~30s, ≤ ~10 MB. Plays muted & inline. Add a poster image as the fallback thumbnail.',
};

export default function AdminReelAdsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [config, setConfig] = useState<ReelAdsConfig>({ enabled: false, everyNReels: 5 });
  const [original, setOriginal] = useState<ReelAdsConfig>({ enabled: false, everyNReels: 5 });
  const [adsList, setAdsList] = useState<ReelAd[]>([]);
  const [stats, setStats] = useState<Record<string, { impressions: number; clicks: number }>>({});
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
      setStats(res.stats ?? {});
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
    <div className="max-w-5xl">
      <div>
        <h1 className="font-serif text-2xl font-bold text-ink-900">Reel Ads</h1>
        <p className="mt-1 text-sm text-muted-500 max-w-2xl">
          Sponsored cards shown inside the Current Affairs reel. Set how often an ad appears
          (after every N reels) and manage the creatives below. An ad only shows when ads are
          <strong> ON</strong> and at least one creative is <strong>active</strong>.
          Paid-plan users always see an ad-free feed. Changes propagate within ~60s.
        </p>
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
          <section className="paper-card mt-6 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-ink-900">Placement</h2>
            <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig((p) => ({ ...p, enabled: e.target.checked }))}
                  className="h-5 w-5 rounded border-line text-ember-500 focus:ring-ember-500"
                />
                <span className="text-sm font-medium text-ink-900">Ads {config.enabled ? 'enabled' : 'disabled'}</span>
              </label>

              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-500">Show an ad after every</label>
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
                      className="input w-20 text-sm"
                    />
                    <span className="text-sm text-ink-700">reels ({MIN_EVERY}–{MAX_EVERY})</span>
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
                  ? `Live: an ad appears after every ${config.everyNReels} news reels, cycling through ${activeCount} active creative${activeCount === 1 ? '' : 's'}.`
                  : 'Ads are ON but no creative is active — nothing shows until you add/activate one below.'
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
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                {adsList.map((ad) => (
                  <AdEditor key={ad.id} ad={ad} stats={stats[ad.id]} onChanged={() => void load()} onError={setError} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/* ─── Media-type tabs ─── */
function MediaTypeTabs({ value, onChange }: { value: MediaType; onChange: (v: MediaType) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-paper-200 p-0.5 text-xs">
      {(['image', 'video'] as MediaType[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`rounded-md px-3 py-1.5 font-medium capitalize transition-colors ${value === t ? 'bg-paper-50 text-ink-900 shadow-sm' : 'text-muted-500 hover:text-ink-800'}`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

/* ─── Create form (fields + live preview, responsive) ─── */
function NewAdForm({ onCreated, onError }: { onCreated: () => void; onError: (m: string) => void }) {
  const [mediaType, setMediaType] = useState<MediaType>('image');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [headline, setHeadline] = useState('');
  const [subtext, setSubtext] = useState('');
  const [ctaText, setCtaText] = useState('Learn more');
  const [targetUrl, setTargetUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const mediaOk = mediaType === 'video'
    ? /^https?:\/\/\S+$/i.test(videoUrl)
    : (/^https?:\/\/\S+$/i.test(imageUrl) || imageUrl.startsWith('data:image/'));
  const valid = mediaOk && headline.trim() && ctaText.trim() && /^https?:\/\/\S+$/i.test(targetUrl);

  async function create() {
    if (!valid) return;
    setSaving(true);
    try {
      await api.adminCreateReelAd({
        mediaType,
        imageUrl: imageUrl.trim(),
        videoUrl: videoUrl.trim(),
        headline: headline.trim(),
        subtext: subtext.trim(),
        ctaText: ctaText.trim(),
        targetUrl: targetUrl.trim(),
        active: true,
      });
      setMediaType('image'); setImageUrl(''); setVideoUrl(''); setHeadline(''); setSubtext(''); setCtaText('Learn more'); setTargetUrl('');
      onCreated();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Create failed');
    } finally { setSaving(false); }
  }

  return (
    <section className="paper-card mt-6 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink-900">Add a creative</h2>
        <MediaTypeTabs value={mediaType} onChange={setMediaType} />
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
        {/* Fields */}
        <div className="grid gap-3 sm:grid-cols-2">
          {mediaType === 'image' ? (
            <Field label="Image * (upload or paste URL)" full>
              <ImagePicker value={imageUrl} onChange={setImageUrl} onError={onError} />
            </Field>
          ) : (
            <>
              <Field label="Video URL * (hosted MP4)">
                <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://….mp4" className="input w-full text-sm" />
              </Field>
              <Field label="Poster image (upload or URL)">
                <ImagePicker value={imageUrl} onChange={setImageUrl} onError={onError} />
              </Field>
            </>
          )}
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
          <p className="sm:col-span-2 text-[11px] leading-relaxed text-muted-500">{SIZE_GUIDE[mediaType]}</p>
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-500">Live preview</p>
          <ReelAdPreview mediaType={mediaType} imageUrl={imageUrl} videoUrl={videoUrl} headline={headline} subtext={subtext} ctaText={ctaText} />
        </div>
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
function AdEditor({ ad, stats, onChanged, onError }: { ad: ReelAd; stats?: { impressions: number; clicks: number }; onChanged: () => void; onError: (m: string) => void }) {
  const [mediaType, setMediaType] = useState<MediaType>(ad.mediaType === 'video' ? 'video' : 'image');
  const [imageUrl, setImageUrl] = useState(ad.imageUrl);
  const [videoUrl, setVideoUrl] = useState(ad.videoUrl ?? '');
  const [headline, setHeadline] = useState(ad.headline);
  const [subtext, setSubtext] = useState(ad.subtext ?? '');
  const [ctaText, setCtaText] = useState(ad.ctaText);
  const [targetUrl, setTargetUrl] = useState(ad.targetUrl);
  const [active, setActive] = useState(ad.active);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const dirty =
    mediaType !== (ad.mediaType === 'video' ? 'video' : 'image') ||
    imageUrl !== ad.imageUrl || (videoUrl || '') !== (ad.videoUrl ?? '') ||
    headline !== ad.headline || (subtext || '') !== (ad.subtext ?? '') ||
    ctaText !== ad.ctaText || targetUrl !== ad.targetUrl || active !== ad.active;

  async function save() {
    if (!dirty) return;
    setSaving(true);
    try {
      await api.adminUpdateReelAd(ad.id, { mediaType, imageUrl: imageUrl.trim(), videoUrl: videoUrl.trim(), headline: headline.trim(), subtext: subtext.trim(), ctaText: ctaText.trim(), targetUrl: targetUrl.trim(), active });
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
      <div className="flex flex-col gap-4 sm:flex-row">
        {/* Live preview (scaled) */}
        <div className="mx-auto w-[150px] flex-shrink-0 sm:mx-0">
          <ReelAdPreview mediaType={mediaType} imageUrl={imageUrl} videoUrl={videoUrl} headline={headline} subtext={subtext} ctaText={ctaText} compact />
        </div>

        {/* Fields */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2 text-xs text-ink-700 cursor-pointer">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded border-line text-ember-500 focus:ring-ember-500" />
              {active ? 'Active' : 'Inactive'}
            </label>
            <MediaTypeTabs value={mediaType} onChange={setMediaType} />
          </div>
          <p className="mt-1 text-[11px] text-muted-500">
            {(stats?.impressions ?? 0).toLocaleString()} views · {(stats?.clicks ?? 0).toLocaleString()} clicks · {stats && stats.impressions > 0 ? Math.round((stats.clicks / stats.impressions) * 100) : 0}% CTR
          </p>

          <div className="mt-3 grid gap-2">
            {mediaType === 'video' && (
              <Field label="Video URL"><input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://….mp4" className="input w-full text-xs" /></Field>
            )}
            <Field label={mediaType === 'video' ? 'Poster image' : 'Image'}><ImagePicker value={imageUrl} onChange={setImageUrl} onError={onError} /></Field>
            <Field label="Headline"><input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={140} className="input w-full text-xs" /></Field>
            <Field label="Subtext"><input value={subtext} onChange={(e) => setSubtext(e.target.value)} maxLength={200} className="input w-full text-xs" /></Field>
            <Field label="CTA text"><input value={ctaText} onChange={(e) => setCtaText(e.target.value)} maxLength={40} className="input w-full text-xs" /></Field>
            <Field label="Target URL"><input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} className="input w-full text-xs" /></Field>
          </div>
        </div>
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

/* ─── Live preview that mirrors the real reel AdCard (non-interactive) ─── */
function ReelAdPreview({ mediaType, imageUrl, videoUrl, headline, subtext, ctaText, compact }: {
  mediaType: MediaType; imageUrl: string; videoUrl: string; headline: string; subtext: string; ctaText: string; compact?: boolean;
}) {
  const isVideo = mediaType === 'video' && /^https?:\/\/\S+$/i.test(videoUrl);
  const hasMedia = isVideo || !!imageUrl;
  return (
    <div className={`relative mx-auto w-full overflow-hidden rounded-2xl border border-line bg-paper-50 shadow-md ${compact ? 'aspect-[9/16] max-w-[150px]' : 'aspect-[9/16] max-w-[240px]'}`}>
      {/* media */}
      <div className="relative h-[44%] w-full overflow-hidden bg-paper-200">
        {isVideo ? (
          <video src={videoUrl} poster={imageUrl || undefined} muted loop autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-2xl text-muted-400">📣</div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-ink-900/80 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-paper-50">Sponsored</span>
      </div>
      {/* body */}
      <div className="flex h-[56%] flex-col px-3 pb-3 pt-2">
        <h3 className={`font-serif font-bold leading-snug text-ink-900 line-clamp-3 ${compact ? 'text-[11px]' : 'text-sm'}`}>
          {headline || 'Your headline appears here'}
        </h3>
        {subtext && <p className={`mt-1 text-ink-700 line-clamp-3 ${compact ? 'text-[9px]' : 'text-[11px]'}`}>{subtext}</p>}
        <div className="mt-auto">
          <div className={`flex items-center justify-center gap-1 rounded-lg bg-ember-500 font-bold text-paper-50 ${compact ? 'px-2 py-1.5 text-[10px]' : 'px-3 py-2 text-xs'}`}>
            {ctaText || 'Learn more'}
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </div>
          <p className={`mt-1 text-center text-muted-400 ${compact ? 'text-[7px]' : 'text-[9px]'}`}>Advertisement · Nexigrate</p>
        </div>
      </div>
      {!hasMedia && (
        <div className="pointer-events-none absolute inset-x-0 top-1 text-center text-[8px] text-muted-400">add media to preview</div>
      )}
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

/* ─── Image picker: upload (compressed to a small data-URL) OR paste a URL ─── */
function ImagePicker({ value, onChange, onError }: { value: string; onChange: (v: string) => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isData = value.startsWith('data:');
  return (
    <div className="flex items-center gap-2">
      <input
        value={isData ? '' : value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isData ? 'Uploaded ✓ — paste a URL to replace' : 'https://… or upload →'}
        className="input w-full text-xs"
      />
      <label className="btn-ghost text-xs cursor-pointer whitespace-nowrap">
        {busy ? '…' : 'Upload'}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true);
            try {
              const url = await fileToCompressedDataUrl(f);
              if (url.length > 900000) onError('Image is too large even after compression — use a smaller/simpler image.');
              else onChange(url);
            } catch {
              onError('Could not read that image file.');
            } finally {
              setBusy(false);
              e.target.value = '';
            }
          }}
        />
      </label>
    </div>
  );
}

/** Read an image File, downscale via canvas, and return a compressed JPEG
 *  data-URL kept comfortably under the server's inline-image size cap. */
async function fileToCompressedDataUrl(file: File): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const draw = (maxW: number, quality: number): string => {
    const scale = Math.min(1, maxW / (img.width || maxW));
    const w = Math.max(1, Math.round((img.width || maxW) * scale));
    const h = Math.max(1, Math.round((img.height || maxW) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  };
  for (const [maxW, q] of [[1000, 0.82], [800, 0.75], [640, 0.7], [480, 0.6]] as const) {
    const out = draw(maxW, q);
    if (out.length <= 880000) return out;
  }
  return draw(400, 0.5);
}
