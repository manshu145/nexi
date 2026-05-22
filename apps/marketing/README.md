# @nexigrate/marketing

Static marketing site at https://nexigrate.com.

- **Framework**: Astro 5 (mostly static, with a single API route for the waitlist)
- **Styling**: Tailwind CSS v4 (via `@tailwindcss/vite`) + brand tokens in `src/styles/global.css`
- **Fonts**: Lora (serif) + Inter (sans), self-hosted via `@fontsource`
- **Forms**: progressive-enhancement waitlist form, posts to `/api/waitlist`
- **Storage**: Cloudflare KV namespace `WAITLIST_KV`
- **Deploy target**: Cloudflare Pages

## Develop

```bash
pnpm install
pnpm --filter @nexigrate/marketing dev
# \u2192 http://localhost:4321
```

The waitlist form will gracefully no-op in local dev if no KV binding is present \u2014 it logs to the console and returns success so the UX still works.

## Build

```bash
pnpm --filter @nexigrate/marketing build
```

The build emits to `apps/marketing/dist/`. Cloudflare Pages serves the static assets and runs the `/api/waitlist` route as a Pages Function.

## Deploy

CI/CD is wired up via GitHub Actions \u2014 see `.github/workflows/deploy-marketing.yml`. On every push to `main` the site is built and deployed to Cloudflare Pages.

To deploy manually:

```bash
pnpm --filter @nexigrate/marketing build
npx wrangler pages deploy ./apps/marketing/dist --project-name=nexigrate-marketing
```

## Adding the KV binding

Either:

1. **Recommended**: in the Cloudflare dashboard, go to **Workers & Pages \u2192 your project \u2192 Settings \u2192 Functions \u2192 KV namespace bindings** and add a binding named `WAITLIST_KV` pointing to a KV namespace named `nexigrate-waitlist`.
2. Or update `wrangler.toml` with the namespace id and deploy with the wrangler CLI.

See `docs/PHASE_1_SETUP.md` for the exact Cloudflare setup steps.
