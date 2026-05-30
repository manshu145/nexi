'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

interface SeoSettings {
  metaTitle: string;
  metaDescription: string;
  ogImage: string;
  logoUrl: string;
  favicon: string;
  tagline: string;
  taglineHi: string;
  robotsTxt: string;
  blockedPages: string;
  googleAnalyticsId: string;
  canonicalUrl: string;
  twitterHandle: string;
  structuredData: string;
}

const DEFAULT_SEO: SeoSettings = {
  metaTitle: 'Nexigrate - AI-Powered Exam Preparation',
  metaDescription: 'India\'s smartest exam preparation platform. AI tutor, current affairs, mock tests for UPSC, SSC, Banking & more.',
  ogImage: '',
  logoUrl: '',
  favicon: '',
  tagline: 'Study Smarter, Score Higher',
  taglineHi: 'स्मार्ट पढ़ो, ज़्यादा स्कोर करो',
  robotsTxt: 'User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\nSitemap: https://nexigrate.com/sitemap.xml',
  blockedPages: '',
  googleAnalyticsId: '',
  canonicalUrl: 'https://nexigrate.com',
  twitterHandle: '@nexigrate',
  structuredData: '',
};

export default function AdminSeoPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<SeoSettings>(DEFAULT_SEO);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/admin/login'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const auth = getFirebaseAuthClient();
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`${API}/v1/admin/seo`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = (await res.json()) as { settings: Record<string, any> };
          if (data.settings && Object.keys(data.settings).length > 0) {
            setSettings({ ...DEFAULT_SEO, ...data.settings });
          }
        }
      } catch { /* use defaults */ }
      finally { setPageLoading(false); }
    })();
  }, [user]);

  const handleSave = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API}/v1/admin/seo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSaving(false); }
  };

  const updateField = (key: keyof SeoSettings, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (loading || !user || pageLoading) return (
    <div className="space-y-4">
      <div className="h-7 w-48 rounded bg-paper-300 animate-pulse" />
      <div className="h-64 rounded bg-paper-300 animate-pulse" />
    </div>
  );

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-900">SEO & Branding</h1>
          <p className="mt-1 text-sm text-muted-500">Manage site metadata, branding, and search engine settings</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Changes'}
        </button>
      </div>

      {error && <div className="banner banner-error mt-4">{error}</div>}
      {saved && <div className="banner banner-success mt-4">Settings saved successfully!</div>}

      {/* Meta Data Section */}
      <section className="paper-card mt-6 p-5">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Meta Data</h2>
        <p className="text-xs text-muted-500 mt-1">Controls how your site appears in search results</p>
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-ink-700">Meta Title</label>
            <input value={settings.metaTitle} onChange={e => updateField('metaTitle', e.target.value)} className="input mt-1" placeholder="Nexigrate - AI Exam Prep" />
            <p className="text-[10px] text-muted-400 mt-0.5">{settings.metaTitle.length}/60 characters recommended</p>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700">Meta Description</label>
            <textarea value={settings.metaDescription} onChange={e => updateField('metaDescription', e.target.value)} className="input mt-1" rows={3} placeholder="India's smartest exam preparation platform..." />
            <p className="text-[10px] text-muted-400 mt-0.5">{settings.metaDescription.length}/160 characters recommended</p>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700">Canonical URL</label>
            <input value={settings.canonicalUrl} onChange={e => updateField('canonicalUrl', e.target.value)} className="input mt-1" placeholder="https://nexigrate.com" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700">Google Analytics ID</label>
            <input value={settings.googleAnalyticsId} onChange={e => updateField('googleAnalyticsId', e.target.value)} className="input mt-1" placeholder="G-XXXXXXXXXX" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700">Twitter Handle</label>
            <input value={settings.twitterHandle} onChange={e => updateField('twitterHandle', e.target.value)} className="input mt-1" placeholder="@nexigrate" />
          </div>
        </div>
      </section>

      {/* Branding Section */}
      <section className="paper-card mt-4 p-5">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Branding</h2>
        <p className="text-xs text-muted-500 mt-1">Logo, favicon, and taglines</p>
        {/* PR-34c (audit #46): the three "📁 Upload" buttons that used
            to live here created an object-URL preview but the save
            handler only PUT the URL string -- the blob was never
            uploaded anywhere. UI was decorative theatre. Removed; the
            URL inputs stay. Real Storage upload is a separate PR
            (needs bucket setup + CORS + admin SDK upload route). */}
        <p className="text-[11px] text-muted-400 mt-1">
          Paste a hosted image URL (Firebase Storage, Cloudinary, GCS, etc.). Direct file upload is coming in a future update.
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-ink-700">Logo</label>
            <input value={settings.logoUrl} onChange={e => updateField('logoUrl', e.target.value)} className="input mt-1" placeholder="https://nexigrate.com/logo.svg" />
            {settings.logoUrl && (
              <div className="mt-2 inline-block rounded-lg bg-paper-200 p-3">
                <img src={settings.logoUrl} alt="Logo preview" className="h-8 max-w-[200px] object-contain" />
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700">Favicon</label>
            <input value={settings.favicon} onChange={e => updateField('favicon', e.target.value)} className="input mt-1" placeholder="https://nexigrate.com/favicon.ico" />
            {settings.favicon && (
              <div className="mt-2 inline-block rounded-lg bg-paper-200 p-3">
                <img src={settings.favicon} alt="Favicon preview" className="h-6 w-6 object-contain" />
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700">OG Image (Social sharing preview)</label>
            <input value={settings.ogImage} onChange={e => updateField('ogImage', e.target.value)} className="input mt-1" placeholder="https://nexigrate.com/og-image.png" />
            {settings.ogImage && (
              <div className="mt-2 inline-block rounded-lg bg-paper-200 p-3">
                <img src={settings.ogImage} alt="OG Image preview" className="h-24 max-w-[300px] object-contain" />
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700">Tagline (English)</label>
            <input value={settings.tagline} onChange={e => updateField('tagline', e.target.value)} className="input mt-1" placeholder="Study Smarter, Score Higher" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700">Tagline (Hindi)</label>
            <input value={settings.taglineHi} onChange={e => updateField('taglineHi', e.target.value)} className="input mt-1" placeholder="स्मार्ट पढ़ो, ज़्यादा स्कोर करो" />
          </div>
        </div>
      </section>

      {/* Crawling & Blocking Section */}
      <section className="paper-card mt-4 p-5">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Crawling & Page Blocking</h2>
        <p className="text-xs text-muted-500 mt-1">Control which pages search engines can access</p>
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-ink-700">robots.txt Content</label>
            <textarea value={settings.robotsTxt} onChange={e => updateField('robotsTxt', e.target.value)} className="input mt-1 font-mono text-xs" rows={6} placeholder="User-agent: *\nAllow: /" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700">Blocked Pages (one path per line)</label>
            <textarea value={settings.blockedPages} onChange={e => updateField('blockedPages', e.target.value)} className="input mt-1 font-mono text-xs" rows={4} placeholder="/admin&#10;/api&#10;/internal" />
            <p className="text-[10px] text-muted-400 mt-0.5">Pages listed here will have &lt;meta name=&quot;robots&quot; content=&quot;noindex&quot;&gt;</p>
          </div>
        </div>
      </section>

      {/* Structured Data Section */}
      <section className="paper-card mt-4 p-5">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Structured Data (JSON-LD)</h2>
        <p className="text-xs text-muted-500 mt-1">Custom schema.org markup for rich search results</p>
        <div className="mt-4">
          <textarea value={settings.structuredData} onChange={e => updateField('structuredData', e.target.value)} className="input mt-1 font-mono text-xs" rows={8} placeholder='{"@context":"https://schema.org","@type":"EducationalOrganization","name":"Nexigrate"}' />
        </div>
      </section>

      {/* Save button at bottom too */}
      <div className="mt-6 flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save All Changes'}
        </button>
      </div>
    </div>
  );
}
