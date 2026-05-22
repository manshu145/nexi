# Phase 1 Setup — Go Live with the Landing Page

> **Goal of Phase 1:** Get https://nexigrate.com live, collecting waitlist signups, before we write a single line of app code.
>
> **Time required:** ~10 minutes of clicking.
>
> **Cost:** ₹0.

---

## TL;DR — what you do in the dashboard

Create a fresh **Cloudflare Pages** project (NOT a Worker) connected to this repo with these exact settings, and add one binding. That's it. Cloudflare auto-builds on every push.

---

## Step 1 — DNS (only if you haven't already)

If `nexigrate.com` is not yet on Cloudflare:

1. Sign up free at [dash.cloudflare.com](https://dash.cloudflare.com)
2. **Add a domain** → `nexigrate.com` → Free plan
3. Cloudflare gives you 2 nameservers — copy them
4. Log in to your domain registrar and replace the existing nameservers with the two from Cloudflare
5. Wait 5 min – 24 h for DNS to propagate

If you've already done this from earlier attempts, skip this step.

---

## Step 2 — KV namespace (only if you haven't already)

The waitlist form writes signups to a Cloudflare KV namespace.

1. Cloudflare Dashboard → **Workers & Pages** → **KV** → **Create a namespace**
2. Name: `nexigrate-waitlist`
3. Click **Add**

If you already have it from earlier attempts, skip this step. (KV namespaces survive project deletes.)

---

## Step 3 — Create the **Pages** project

This is the critical part. You must create a **Pages** project, not a Worker.

1. Cloudflare Dashboard → **Workers & Pages** → **Create application**
2. Click the **Pages** tab (NOT Workers)
3. **Connect to Git** → authorize → select repo `manshu145/nexi`
4. **Project name:** `nexigrate-marketing`
5. **Production branch:** `main` (or `phase-1/marketing-landing` if PR #1 isn't merged yet)

### Build settings (copy-paste exactly)

| Field | Value |
|---|---|
| **Framework preset** | `Astro` |
| **Build command** | `pnpm install --frozen-lockfile=false && pnpm --filter @nexigrate/marketing build` |
| **Build output directory** | `apps/marketing/dist` |
| **Root directory** | *(leave default — repo root)* |
| **Environment variables** | none required |

6. Click **Save and Deploy**

The first deploy will likely fail at the runtime step because the KV binding isn't attached yet — that's fine. Continue to Step 4.

---

## Step 4 — Bind the KV namespace

1. Same project → **Settings** → **Functions** → **KV namespace bindings** (or **Bindings** on newer UI)
2. Click **Add binding**
   - **Variable name:** `WAITLIST_KV` (must be exactly this — the code reads it by this name)
   - **KV namespace:** select `nexigrate-waitlist`
3. **Save**

---

## Step 5 — Custom domain

1. Same project → **Custom domains** → **Set up a custom domain**
2. Enter `nexigrate.com` → confirm
3. Repeat for `www.nexigrate.com` → accept the suggested www-to-apex redirect

Cloudflare auto-creates the DNS records and issues an SSL certificate (5–15 min).

---

## Step 6 — Trigger a fresh build

After steps 4 and 5:

- **Deployments** tab → on the latest run → **⋮** → **Retry deployment**

OR push any commit to the production branch and Cloudflare auto-builds.

---

## Step 7 — Verify

After the green build:

- [ ] `https://nexigrate.com` loads the landing page (warm paper background, "Study smart. Verified facts. Zero distractions.")
- [ ] `https://www.nexigrate.com` redirects to apex (or also loads correctly)
- [ ] The lock icon in the browser shows a valid SSL certificate
- [ ] Submit a test waitlist signup → "You're on the list."
- [ ] Cloudflare → **Workers & Pages → KV → nexigrate-waitlist → View** shows a key starting with `waitlist:`
- [ ] `https://nexigrate.com/privacy` and `https://nexigrate.com/terms` both load

---

## Why this works (short version)

Cloudflare has two product paths that both deploy from a Git repo:

- **Pages** — designed for static sites and SSR-with-static-assets frameworks like Astro, Next.js, SvelteKit. Auto-detects framework presets. Auto-deploys after every successful build.
- **Workers (via Workers Builds)** — designed for code-first Workers. Newer, but rougher around the edges for monorepos and Astro's output format.

Astro's `@astrojs/cloudflare` adapter emits the exact directory structure that Pages expects (`dist/_worker.js/`, `dist/_routes.json`, prerendered HTML, static assets). Pages handles SSR routing automatically using `_routes.json`.

The earlier attempt used Workers Builds, which kept fighting our pnpm monorepo layout, asset format, and Pages-vs-Workers project type detection. Pages eliminates all of those failure modes by being the framework we're actually targeting.

---

## Common failure modes (and the fix)

| Symptom | Fix |
|---|---|
| `npm error ERESOLVE` or lockfile complaints | Ensure pnpm is auto-detected (it should be — we have `pnpm-lock.yaml`). If not, prefix the build command with `corepack enable && `. |
| `404` on the live site | Build output directory is wrong — must be exactly `apps/marketing/dist`. |
| Waitlist form returns "Storage error" | KV binding name is wrong or missing. Must be exactly `WAITLIST_KV`. |
| `Not secure` SSL warning persists for >1 hour | In zone settings: **SSL/TLS → Overview** → set to **Full (strict)**. |
| Build succeeds but site shows "Hello world" | The custom domain is still attached to the old Worker project. Detach it from the Worker (or delete the Worker), then re-attach to the new Pages project. |

---

## What's next (Phase 2)

Once the landing page is live, the next phase begins:

1. Create the GCP project + Firebase project (we'll walk through this when you're ready).
2. Add the rest of the API keys (OpenAI, Gemini, Groq, Razorpay, Resend, MSG91).
3. Scaffold `apps/web`, `apps/api`, and the shared `packages/*`.
4. Build auth, onboarding, the credits engine, and the daily MCQ flow.
5. Build the manual document-verification queue in the admin panel.

The Phase 2 setup doc will be created as a follow-up PR. For now, get Phase 1 live and let the waitlist start collecting signal.
