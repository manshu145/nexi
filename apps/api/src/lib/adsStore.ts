/**
 * Reel Ads store — admin-managed sponsored cards for the Current Affairs reel.
 *
 * Founder ask: "mujhe har 3 se 8 reels ke bich me ads place karne ka option
 * de admin panel me." So the admin controls:
 *   - a master on/off switch + how often an ad appears (every N reels, 3..8)
 *   - a list of ad creatives (image, headline, CTA, target link, active flag)
 *
 * The reel feed injects an active creative after every N news cards, cycling
 * through whatever creatives are marked active. Kept in its OWN store (not
 * platformConfig) because it owns a collection of creatives, not just a few
 * scalar overrides — this keeps the typing clean and self-contained.
 *
 * Firestore layout:
 *   - platformConfig/reelAdsConfig   → { enabled, everyNReels }
 *   - reelAds/{id}                   → ReelAd creative docs
 *
 * Config reads are cached in-process for 60s (same rationale as
 * platformConfigStore): the reel feed reads it on every load, but admin edits
 * are rare, so a short propagation gap is acceptable.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type { Logger } from '../logger.js';

export interface ReelAd {
  id: string;
  /** Banner/cover image shown on the ad card. */
  imageUrl: string;
  /** Headline / main line of the ad. */
  headline: string;
  /** Optional supporting line under the headline. */
  subtext?: string;
  /** Call-to-action button label, e.g. "Learn more". */
  ctaText: string;
  /** Where the CTA (and card tap) navigates. Opens in a new tab. */
  targetUrl: string;
  /** Only active creatives are served to the feed. */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdsConfig {
  /** Master on/off for reel ads. When false the feed shows no ads. */
  enabled: boolean;
  /** Insert an ad card after every N news reels. Clamped to [3, 8]. */
  everyNReels: number;
}

export const ADS_MIN_EVERY = 3;
export const ADS_MAX_EVERY = 8;
export const DEFAULT_ADS_CONFIG: AdsConfig = { enabled: false, everyNReels: 5 };

/** Fields accepted from the admin when creating/updating a creative. */
export interface ReelAdInput {
  imageUrl?: string;
  headline?: string;
  subtext?: string;
  ctaText?: string;
  targetUrl?: string;
  active?: boolean;
}

/** Per-ad performance counters. */
export interface AdStats { impressions: number; clicks: number }
export type AdEventType = 'impression' | 'click';

export interface AdsStore {
  /** Master config (enabled + frequency). */
  getConfig(): Promise<AdsConfig>;
  /** Patch the config; unspecified fields unchanged. everyNReels clamped 3..8. */
  updateConfig(patch: Partial<AdsConfig>): Promise<AdsConfig>;
  /** All creatives (admin view). */
  listAds(): Promise<ReelAd[]>;
  /** Only active creatives (feed view). */
  listActiveAds(): Promise<ReelAd[]>;
  createAd(input: ReelAdInput): Promise<ReelAd>;
  updateAd(id: string, patch: ReelAdInput): Promise<ReelAd>;
  deleteAd(id: string): Promise<void>;
  /** Record an impression or click for an ad (fire-and-forget metrics). */
  recordEvent(id: string, type: AdEventType): Promise<void>;
  /** Per-ad impression/click counts, keyed by ad id (admin dashboard). */
  getStats(): Promise<Record<string, AdStats>>;
}

const COL_ADS = 'reelAds';
const COL_STATS = 'reelAdStats';
const COL_CONFIG = 'platformConfig';
const DOC_CONFIG = 'reelAdsConfig';
const CACHE_TTL_MS = 60_000;
/** Cap inline (data-URL) images so an ad doc stays well under Firestore's 1MB limit. */
const MAX_DATA_URL_LEN = 900_000;

// ---------- shared sanitisers ----------

function clampEvery(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : DEFAULT_ADS_CONFIG.everyNReels;
  return Math.min(ADS_MAX_EVERY, Math.max(ADS_MIN_EVERY, v));
}

function isHttpUrl(s: unknown): s is string {
  return typeof s === 'string' && /^https?:\/\/\S+$/i.test(s.trim());
}

/**
 * Valid ad image source: either a hosted http(s) URL, or an inline base64
 * data-URL (admin "upload" path — the client compresses the file to a small
 * data-URL so we don't need a storage bucket). Data-URLs are size-capped to
 * keep the ad doc under Firestore's 1MB limit.
 */
function isValidImageSrc(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  if (/^https?:\/\/\S+$/i.test(t)) return true;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(t) && t.length <= MAX_DATA_URL_LEN) return true;
  return false;
}

function normalizeConfig(raw: Partial<AdsConfig> | null | undefined): AdsConfig {
  return {
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : DEFAULT_ADS_CONFIG.enabled,
    everyNReels: clampEvery(raw?.everyNReels),
  };
}

/** Build a sanitised patch of editable creative fields from raw admin input. */
function sanitizeAdPatch(input: ReelAdInput): Partial<Omit<ReelAd, 'id' | 'createdAt'>> {
  const out: Partial<Omit<ReelAd, 'id' | 'createdAt'>> = {};
  if (typeof input.imageUrl === 'string' && isValidImageSrc(input.imageUrl)) out.imageUrl = input.imageUrl.trim();
  if (typeof input.headline === 'string' && input.headline.trim()) out.headline = input.headline.trim().slice(0, 140);
  if (typeof input.subtext === 'string') out.subtext = input.subtext.trim().slice(0, 200);
  if (typeof input.ctaText === 'string' && input.ctaText.trim()) out.ctaText = input.ctaText.trim().slice(0, 40);
  if (typeof input.targetUrl === 'string' && isHttpUrl(input.targetUrl)) out.targetUrl = input.targetUrl.trim();
  if (typeof input.active === 'boolean') out.active = input.active;
  return out;
}

/** Validate a fully-specified creative for creation. Throws on missing fields. */
function buildNewAd(id: string, input: ReelAdInput): ReelAd {
  const patch = sanitizeAdPatch(input);
  if (!patch.imageUrl) throw new Error('imageUrl must be a valid http(s) URL or uploaded image');
  if (!patch.headline) throw new Error('headline is required');
  if (!patch.ctaText) throw new Error('ctaText is required');
  if (!patch.targetUrl) throw new Error('targetUrl must be a valid http(s) URL');
  const now = new Date().toISOString();
  return {
    id,
    imageUrl: patch.imageUrl,
    headline: patch.headline,
    ...(patch.subtext ? { subtext: patch.subtext } : {}),
    ctaText: patch.ctaText,
    targetUrl: patch.targetUrl,
    active: patch.active ?? true,
    createdAt: now,
    updatedAt: now,
  };
}

function sortAds(ads: ReelAd[]): ReelAd[] {
  // Newest first — stable, deterministic ordering for both admin + feed.
  return [...ads].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

// ---------- Firestore implementation ----------

interface ConfigCache { value: AdsConfig; expiresAt: number }

export class FirestoreAdsStore implements AdsStore {
  private configCache: ConfigCache | null = null;

  constructor(private readonly db: Firestore, private readonly logger: Logger) {}

  async getConfig(): Promise<AdsConfig> {
    if (this.configCache && this.configCache.expiresAt > Date.now()) return this.configCache.value;
    let value = DEFAULT_ADS_CONFIG;
    try {
      const snap = await this.db.collection(COL_CONFIG).doc(DOC_CONFIG).get();
      value = normalizeConfig(snap.exists ? (snap.data() as Partial<AdsConfig>) : null);
    } catch (e) {
      this.logger.warn('ads.config_read_failed', { error: e instanceof Error ? e.message : String(e) });
    }
    this.configCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  }

  async updateConfig(patch: Partial<AdsConfig>): Promise<AdsConfig> {
    const current = await this.getConfig();
    const next: AdsConfig = {
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
      everyNReels: patch.everyNReels !== undefined ? clampEvery(patch.everyNReels) : current.everyNReels,
    };
    await this.db.collection(COL_CONFIG).doc(DOC_CONFIG).set(next, { merge: true });
    this.configCache = null; // local invalidate; remote refresh on TTL
    this.logger.info('ads.config_updated', { ...next });
    return next;
  }

  async listAds(): Promise<ReelAd[]> {
    const snap = await this.db.collection(COL_ADS).get();
    return sortAds(snap.docs.map(d => d.data() as ReelAd));
  }

  async listActiveAds(): Promise<ReelAd[]> {
    // Filter in memory (ad count is tiny) to avoid a composite index.
    return (await this.listAds()).filter(a => a.active);
  }

  async createAd(input: ReelAdInput): Promise<ReelAd> {
    const ref = this.db.collection(COL_ADS).doc();
    const ad = buildNewAd(ref.id, input);
    await ref.set(ad);
    this.logger.info('ads.created', { id: ad.id });
    return ad;
  }

  async updateAd(id: string, patch: ReelAdInput): Promise<ReelAd> {
    const ref = this.db.collection(COL_ADS).doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new Error('Ad not found');
    const sanitised = sanitizeAdPatch(patch);
    const next = { ...(snap.data() as ReelAd), ...sanitised, id, updatedAt: new Date().toISOString() };
    await ref.set(next, { merge: true });
    this.logger.info('ads.updated', { id, fields: Object.keys(sanitised) });
    return next;
  }

  async deleteAd(id: string): Promise<void> {
    await this.db.collection(COL_ADS).doc(id).delete();
    await this.db.collection(COL_STATS).doc(id).delete().catch(() => {});
    this.logger.info('ads.deleted', { id });
  }

  async recordEvent(id: string, type: AdEventType): Promise<void> {
    const field = type === 'click' ? 'clicks' : 'impressions';
    try {
      await this.db.collection(COL_STATS).doc(id).set({ [field]: FieldValue.increment(1) }, { merge: true });
    } catch (e) {
      this.logger.warn('ads.event_failed', { id, type, error: e instanceof Error ? e.message : String(e) });
    }
  }

  async getStats(): Promise<Record<string, AdStats>> {
    const out: Record<string, AdStats> = {};
    try {
      const snap = await this.db.collection(COL_STATS).get();
      for (const d of snap.docs) {
        const data = d.data() as Partial<AdStats>;
        out[d.id] = { impressions: Number(data.impressions) || 0, clicks: Number(data.clicks) || 0 };
      }
    } catch (e) {
      this.logger.warn('ads.stats_read_failed', { error: e instanceof Error ? e.message : String(e) });
    }
    return out;
  }
}

// ---------- in-memory implementation (tests / no-Firestore dev) ----------

export class InMemoryAdsStore implements AdsStore {
  private config: AdsConfig = { ...DEFAULT_ADS_CONFIG };
  private ads = new Map<string, ReelAd>();

  async getConfig() { return { ...this.config }; }

  async updateConfig(patch: Partial<AdsConfig>) {
    this.config = {
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : this.config.enabled,
      everyNReels: patch.everyNReels !== undefined ? clampEvery(patch.everyNReels) : this.config.everyNReels,
    };
    return { ...this.config };
  }

  async listAds() { return sortAds([...this.ads.values()]); }
  async listActiveAds() { return (await this.listAds()).filter(a => a.active); }

  async createAd(input: ReelAdInput) {
    const id = `ad_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ad = buildNewAd(id, input);
    this.ads.set(id, ad);
    return ad;
  }

  async updateAd(id: string, patch: ReelAdInput) {
    const existing = this.ads.get(id);
    if (!existing) throw new Error('Ad not found');
    const next = { ...existing, ...sanitizeAdPatch(patch), id, updatedAt: new Date().toISOString() };
    this.ads.set(id, next);
    return next;
  }

  async deleteAd(id: string) { this.ads.delete(id); this.stats.delete(id); }

  private stats = new Map<string, AdStats>();
  async recordEvent(id: string, type: AdEventType) {
    const s = this.stats.get(id) ?? { impressions: 0, clicks: 0 };
    if (type === 'click') s.clicks += 1; else s.impressions += 1;
    this.stats.set(id, s);
  }
  async getStats() {
    const out: Record<string, AdStats> = {};
    for (const [id, s] of this.stats) out[id] = { ...s };
    return out;
  }
}
