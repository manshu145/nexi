import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import withPWAInit from '@ducanh2912/next-pwa';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
});

const config: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@nexigrate/shared'],
  webpack(c) {
    c.resolve = c.resolve ?? {};
    c.resolve.fallback = { ...(c.resolve.fallback ?? {}), 'node:fs': false };
    return c;
  },
};

export default withNextIntl(withPWA(config));
// Build trigger 1779951931

