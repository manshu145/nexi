import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

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

export default withNextIntl(config);
