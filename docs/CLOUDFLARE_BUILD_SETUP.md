# Cloudflare Build Setup

> **You are here:** Cloudflare Workers Builds is connected to the `manshu145/nexi` repo and the build is failing because Cloudflare doesn't know how to build a pnpm monorepo without explicit settings. This page tells you exactly what to enter to fix it.
>
> **Time required:** 3 minutes of clicking.

---

## What Cloudflare needs to know

Cloudflare's auto-detection works fine for single-package projects with `package-lock.json`. For our pnpm + Turborepo monorepo, we need to give it three things:

1. **Root directory** — where to run the build from
2. **Build command** — exact command that produces the output
3. **Build output directory** — where the deployable files end up

---

## Step 1 — Open the project's build settings

1. Go to the [Cloudflare dashboard](https://dash.cloudflare.com).
2. Left sidebar: **Workers & Pages**.
3. Click on the `nexigrate-marketing` project.
4. Top tabs: **Settings** → **Build configuration** (or **Builds & deployments**).

---

## Step 2 — Set these exact values

Copy-paste these into the matching fields:

| Setting | Value |
|---|---|
| **Production branch** | `main` *(set this after merging PR #1; for now it can stay on whatever branch you already configured)* |
| **Root directory** | **leave empty / blank** *(do **not** type `/`, `.`, or `apps/marketing` \u2014 the field expects a relative path or empty for the repo root; a literal `/` makes Cloudflare look for a folder *named* `/` and fail with "root directory not found")* |
| **Build command** | `pnpm install --frozen-lockfile=false && pnpm --filter @nexigrate/marketing build` |
| **Build output directory** | `apps/marketing/dist` |
| **Deploy command** *(if the field is shown)* | leave empty \u2014 Cloudflare auto-detects the Pages-style output |
| **Node version** | `22` *(should auto-detect from `.nvmrc`)* |
| **Package manager** | `pnpm` *(should auto-detect from `pnpm-lock.yaml`)* |

Click **Save**.

---

## Step 3 — Confirm the binding is still there

Same project, **Settings** \u2192 **Bindings** (or **Functions \u2192 KV namespace bindings** on older UI):

| Type | Name | Value |
|---|---|---|
| KV namespace | `WAITLIST_KV` | `nexigrate-waitlist` |

You already set this. Just confirm it's still listed.

---

## Step 4 — Trigger a fresh build

Two ways:

### Option A: Re-run the failed build
1. Go to **Deployments** tab.
2. Find the failed build at the top.
3. Click the **\u22ee** menu \u2192 **Retry deployment**.

### Option B: Push an empty commit (does the same thing)
This is what you tried last time \u2014 the empty commit works fine, only the *build settings* were broken before. After Step 2 you can either retry the failed build or push another empty commit.

---

## Step 5 — Watch the build succeed

Build logs live in **Workers & Pages \u2192 nexigrate-marketing \u2192 Deployments \u2192 the latest run \u2192 View build**.

Expected timing:
- `pnpm install` \u2014 ~30 s
- `astro build` \u2014 ~3 s
- Upload to Cloudflare \u2014 ~10 s
- **Total \u2248 1 minute**

When it goes green, hit `https://nexigrate.com` \u2014 the landing page should load.

---

## What I changed in the codebase to make this work

So you understand the moving parts:

- **`apps/marketing/wrangler.toml`** \u2014 removed the placeholder KV binding that was blocking the build (the binding now lives only in the Cloudflare dashboard, which is the recommended pattern).
- **`wrangler.jsonc` at the repo root** \u2014 added so Cloudflare can detect the project from the root regardless of which directory it scans first.
- **`package.json`** at the root \u2014 the top-level `build` script now invokes the marketing build directly (`pnpm --filter @nexigrate/marketing build`) so any tool that defaults to `npm run build` does the right thing.
- **`.github/workflows/deploy-marketing.yml`** \u2014 demoted from auto-deploy on push to manual-only (`workflow_dispatch`). Cloudflare Workers Builds is now the single source of truth for production deploys; the GitHub Action stays available as a manual fallback for the day Cloudflare's GitHub integration has an outage.

---

## Common failure modes (and the fix)

| Symptom in Cloudflare logs | Fix |
|---|---|
| `npm error ERESOLVE` or `npm install` complaining about lockfile | Wrong package manager. Confirm pnpm is selected; ours is auto-detected from `pnpm-lock.yaml`. |
| `command not found: pnpm` | Set the build image to one that includes corepack \u2014 Cloudflare's default node-22 image already does. Or prefix the build command with `corepack enable && `. |
| `failed in 0s` (the previous failure) | Build settings missing. This page fixes it. |
| `Failed: root directory not found` | The "Root directory" field has a value like `/` or `apps/marketing`. **Clear the field completely** \u2014 it must be empty for builds to run from the repo root. |
| `Error: Invalid binding name 'REPLACE_WITH_KV_NAMESPACE_ID'` | Old wrangler.toml committed. The current commit removes that placeholder \u2014 just make sure you're building the latest commit. |
| `404` on the live site | The build succeeded but the output directory is wrong. Confirm **Build output directory = `apps/marketing/dist`** (not `dist`, not `./dist`). |
| Form submits but says "Storage error" | KV binding is missing or misnamed. Must be exactly `WAITLIST_KV`. |

---

## Once it's live

Three quick verifications:

- [ ] `https://nexigrate.com` loads the landing page with no console errors
- [ ] Submit a test waitlist signup; the form says "You're on the list."
- [ ] Cloudflare dashboard \u2192 **Workers & Pages \u2192 KV \u2192 nexigrate-waitlist \u2192 View** shows a key starting with `waitlist:` containing your test email's hash

When all three are checked, ping me and we move to Phase 2.
