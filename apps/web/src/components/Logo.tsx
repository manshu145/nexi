'use client';
import { useEffect, useState } from 'react';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';
const CACHE_KEY = 'nexigrate-branding';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface BrandingData {
  logoUrl: string;
  favicon: string;
  tagline: string;
  taglineHi: string;
  fetchedAt: number;
}

let brandingPromise: Promise<BrandingData> | null = null;

/** Fetch branding config from API with localStorage caching */
function getBranding(): Promise<BrandingData> {
  if (brandingPromise) return brandingPromise;

  // Check cache first
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached) as BrandingData;
      if (Date.now() - data.fetchedAt < CACHE_TTL) {
        brandingPromise = Promise.resolve(data);
        return brandingPromise;
      }
    }
  } catch { /* ignore parse errors */ }

  // Fetch fresh
  brandingPromise = fetch(`${API}/v1/branding`)
    .then(res => res.ok ? res.json() : { logoUrl: '', favicon: '', tagline: '', taglineHi: '' })
    .then((data: any) => {
      const branding: BrandingData = { ...data, fetchedAt: Date.now() };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(branding)); } catch { /* quota */ }
      return branding;
    })
    .catch(() => ({ logoUrl: '', favicon: '', tagline: '', taglineHi: '', fetchedAt: Date.now() }));

  return brandingPromise;
}

export function Logo({ className = '' }: { className?: string }) {
  const [logoUrl, setLogoUrl] = useState<string>('');

  useEffect(() => {
    getBranding().then(b => { if (b.logoUrl) setLogoUrl(b.logoUrl); });
  }, []);

  if (logoUrl) {
    return <img src={logoUrl} alt="Nexigrate" className={`h-7 w-auto object-contain ${className}`} />;
  }

  // Fallback: text logo
  return <span className={`font-serif text-xl font-bold text-amber-500 ${className}`}>Nexigrate</span>;
}

/** Hook to get branding data (for favicon, tagline, etc.) */
export function useBranding() {
  const [branding, setBranding] = useState<BrandingData | null>(null);

  useEffect(() => {
    getBranding().then(setBranding);
  }, []);

  return branding;
}
