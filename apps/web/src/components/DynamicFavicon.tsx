'use client';

/**
 * Static favicon is now set via layout.tsx metadata pointing to /brand/nexigrate-favicon.svg.
 * This component is kept as a no-op for backward compatibility (remove in future cleanup).
 */
export function DynamicFavicon() {
  return null;
}
