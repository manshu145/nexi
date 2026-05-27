'use client';
import { useEffect } from 'react';
import { useBranding } from './Logo';

/**
 * Dynamically updates the favicon based on admin branding settings.
 * Falls back to the default /icon-192.png if no custom favicon is set.
 */
export function DynamicFavicon() {
  const branding = useBranding();

  useEffect(() => {
    if (!branding?.favicon) return;

    // Update existing favicon link or create one
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = branding.favicon;

    // Also update apple-touch-icon if logo is set
    if (branding.logoUrl) {
      let appleLink = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
      if (!appleLink) {
        appleLink = document.createElement('link');
        appleLink.rel = 'apple-touch-icon';
        document.head.appendChild(appleLink);
      }
      appleLink.href = branding.favicon || branding.logoUrl;
    }
  }, [branding]);

  return null;
}
