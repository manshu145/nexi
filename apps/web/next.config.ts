import type { NextConfig } from 'next';

/**
 * Next.js 15 / App Router config.
 *
 * `output: 'standalone'` produces a self-contained Node bundle that we
 * ship in the Cloud Run image. `transpilePackages` makes the workspace
 * package imports work cleanly in dev + prod without prebuilding.
 */
const config: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@nexigrate/shared'],
  experimental: {
    typedRoutes: true,
  },
  // The Firebase Web SDK occasionally bundles an undici cookie helper that
  // tries to import 'node:fs' from a client chunk; we don't need it.
  webpack(c) {
    c.resolve = c.resolve ?? {};
    c.resolve.fallback = { ...(c.resolve.fallback ?? {}), 'node:fs': false };
    return c;
  },
};

export default config;
