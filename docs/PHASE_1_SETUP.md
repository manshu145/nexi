# Phase 1 Setup \u2014 Go Live with the Landing Page

> **Goal of Phase 1:** Get https://nexigrate.com live, collecting waitlist signups, before we write a single line of app code.
>
> **Time required:** ~30 minutes of clicking, mostly waiting for DNS to propagate.
>
> **Cost:** \u20b90.

---

## Big picture

The marketing site you see in `apps/marketing` is a fully-built Astro site that builds to a static `dist/` plus a single Cloudflare Pages Function (`/api/waitlist`). Every push to `main` runs the GitHub Actions workflow at `.github/workflows/deploy-marketing.yml`, which builds the site and deploys it to Cloudflare Pages.

To go live, you need to do four things:

1. Create a Cloudflare account and add `nexigrate.com` to it.
2. Update the nameservers at your domain registrar to point to Cloudflare.
3. Create a Cloudflare Pages project and a KV namespace.
4. Add three secrets to the GitHub repository.

Then every push to `main` ships to production.

---

## Prerequisites

- [ ] Access to the GitHub repository (`manshu145/nexi`).
- [ ] Access to the email/account you used to register `nexigrate.com`.
- [ ] A free Cloudflare account.

---

## Step 1 \u2014 Add `nexigrate.com` to Cloudflare

1. Sign up at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up). Use your founder email; we'll use this account for production for years.
2. On the home page, click **"Add a domain"**.
3. Enter `nexigrate.com` and proceed.
4. Choose the **Free** plan when prompted.
5. Cloudflare will show you two nameservers, like:
   ```
   ns1.somename.cloudflare.com
   ns2.somename.cloudflare.com
   ```
   Copy both \u2014 you'll need them in the next step.

Cloudflare will also auto-import your existing DNS records. Take a quick look; if you have any existing email (MX) records pointing to your registrar's email forwarding, leave them as-is.

---

## Step 2 \u2014 Point your domain at Cloudflare

Log in to wherever you bought `nexigrate.com` (GoDaddy, Namecheap, Hostinger, etc.) and replace the existing nameservers with the two from Cloudflare.

Quick links for the most common registrars:

- **GoDaddy:** Domain settings \u2192 Nameservers \u2192 Change \u2192 "I'll use my own nameservers"
- **Namecheap:** Domain List \u2192 Manage \u2192 Nameservers dropdown \u2192 Custom DNS
- **Hostinger:** Domains \u2192 your domain \u2192 DNS / Nameservers \u2192 Change Nameservers
- **BigRock:** Manage Domain \u2192 Name Servers \u2192 Modify Name Servers

Save the change. Cloudflare will email you the moment it detects the change (usually within 5 minutes; sometimes up to 24 hours).

You don't have to wait \u2014 you can do Steps 3 and 4 right now.

---

## Step 3 \u2014 Create the Cloudflare Pages project + KV namespace

### 3a. Create the KV namespace (for the waitlist)

1. In the Cloudflare dashboard, go to **Workers & Pages \u2192 KV** in the left sidebar.
2. Click **Create a namespace**.
3. Name it `nexigrate-waitlist`.
4. Click **Add**.
5. Copy the namespace **ID** that appears \u2014 you'll need it later if you ever want to query the data via wrangler.

### 3b. Create the Pages project

1. Go to **Workers & Pages \u2192 Overview**.
2. Click **Create application \u2192 Pages \u2192 Connect to Git**.
3. Authorize Cloudflare to read your GitHub repo (`manshu145/nexi`).
4. Pick the `nexi` repo.
5. **Project name:** `nexigrate-marketing` (this **must** match the value of `CLOUDFLARE_PROJECT` in `.github/workflows/deploy-marketing.yml`).
6. **Production branch:** `main`.

#### Build settings (set these even though we'll override via Actions)

- **Framework preset:** Astro
- **Build command:** `pnpm install --frozen-lockfile=false && pnpm --filter @nexigrate/marketing build`
- **Build output directory:** `apps/marketing/dist`
- **Root directory:** `/`

These settings are only used if Cloudflare ever builds the site directly (e.g. for preview branches). Our GitHub Actions workflow does the real production build.

7. Click **Save and Deploy**. The first deploy may fail until you add the KV binding \u2014 that's fine; do step 3c, then redeploy.

### 3c. Bind the KV namespace to the Pages project

1. Open the `nexigrate-marketing` Pages project you just created.
2. Go to **Settings \u2192 Functions \u2192 KV namespace bindings**.
3. Click **Add binding**.
   - **Variable name:** `WAITLIST_KV` (must be exactly this; the code reads it by this name).
   - **KV namespace:** select `nexigrate-waitlist` from Step 3a.
4. Save.

### 3d. Add custom domains

1. Go to **Custom domains** tab on the Pages project.
2. Click **Set up a custom domain** \u2192 enter `nexigrate.com` \u2192 confirm.
3. Repeat for `www.nexigrate.com` \u2014 Cloudflare will offer to redirect www \u2192 apex; accept.

Cloudflare will automatically create the DNS records for you in the zone created in Step 1. SSL certificates are issued automatically (usually within minutes).

---

## Step 4 \u2014 Add GitHub Actions secrets

These let our CI/CD pipeline deploy to Cloudflare on every push to `main`.

### 4a. Get a Cloudflare API token

1. In the Cloudflare dashboard, top-right user menu \u2192 **My Profile \u2192 API Tokens**.
2. Click **Create Token**.
3. Use the **"Edit Cloudflare Workers"** template (it's the right scope).
4. Restrict it to your account (optional but recommended).
5. Click **Create Token**.
6. Copy the token \u2014 it's shown only once.

### 4b. Get your Cloudflare account ID

In the Cloudflare dashboard, the account ID is shown on the right-hand side of the **Workers & Pages \u2192 Overview** page.

### 4c. Add the secrets to GitHub

In the `manshu145/nexi` repo:

1. **Settings \u2192 Secrets and variables \u2192 Actions \u2192 New repository secret**.
2. Add two secrets:
   - `CLOUDFLARE_API_TOKEN` = the token from Step 4a.
   - `CLOUDFLARE_ACCOUNT_ID` = the account id from Step 4b.

Both are required. The deploy workflow won't run without them.

---

## Step 5 \u2014 Trigger the first deploy

Once Steps 1\u20134 are done:

```bash
git checkout main
git pull
git commit --allow-empty -m "ci: kick off first deploy"
git push
```

Or use **Actions \u2192 Deploy marketing site \u2192 Run workflow** on GitHub for a manual run.

Watch the run at `https://github.com/manshu145/nexi/actions`. It typically completes in under 3 minutes. Once green, hit `https://nexigrate.com` \u2014 you should see the landing page.

The first signup on the form will write a key to your KV namespace. You can verify by going to **Workers & Pages \u2192 KV \u2192 nexigrate-waitlist \u2192 View** in the Cloudflare dashboard.

---

## Verification checklist

After everything is set up, please confirm:

- [ ] `https://nexigrate.com` loads the landing page.
- [ ] `https://www.nexigrate.com` redirects to the apex (or also loads correctly).
- [ ] The lock icon in the browser shows a valid SSL certificate.
- [ ] Submitting the waitlist form returns success (and a duplicate submission says "you're already on the list").
- [ ] Cloudflare KV shows entries under `waitlist:*`.
- [ ] GitHub Actions has a green check on the deploy run.
- [ ] `https://nexigrate.com/privacy` and `https://nexigrate.com/terms` both load.

---

## Troubleshooting

**Form returns "Storage error"**
The KV binding name does not match. Confirm it's exactly `WAITLIST_KV` in **Pages \u2192 Settings \u2192 Functions \u2192 KV namespace bindings**.

**Deploy fails with "project not found"**
The Cloudflare Pages project name doesn't match `nexigrate-marketing`. Either rename the project on Cloudflare or update `CLOUDFLARE_PROJECT` in `.github/workflows/deploy-marketing.yml`.

**"DNS_PROBE_FINISHED_NXDOMAIN" in browser**
Nameservers haven't propagated yet. Wait up to 24 hours. Check with `dig nexigrate.com NS +short` or [whatsmydns.net](https://whatsmydns.net).

**SSL "Not secure" warning**
Cloudflare's universal SSL takes 5\u201315 minutes to issue after a custom domain is added. If still failing after an hour, in the zone settings set **SSL/TLS \u2192 Overview** to **Full (strict)**.

**"Invalid binding SESSION" in build logs**
This is informational, not an error. Astro's Cloudflare adapter assumes a SESSION KV binding may exist. Our code does not use sessions; you can safely ignore the message.

---

## What's next (Phase 2)

Once the landing page is live, the next phase begins:

1. Create the GCP project + Firebase project (we'll walk through this when you're ready).
2. Add the rest of the GitHub secrets (OpenAI, Gemini, Groq, Razorpay, Resend, MSG91).
3. Scaffold `apps/web`, `apps/api`, and the shared `packages/*`.
4. Build auth, onboarding, the credits engine, and the daily MCQ flow.
5. Build the manual document-verification queue in the admin panel.

The Phase 2 setup doc will be created as a follow-up PR. For now, get Phase 1 live and let the waitlist start collecting signal.
