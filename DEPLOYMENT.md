# Deploying MM ERP for free

Stack: **Vercel** (frontend) + **Render** (backend) + **Neon** (Postgres) + **Cloudflare R2** (file storage).
All four have real free tiers (no trial expiry) and deploy by connecting this GitHub repo.

One tradeoff: Render's free web service sleeps after ~15 minutes idle. The first request after
that takes ~30-50 seconds to wake up; everything after is normal speed.

Repo: https://github.com/Piyanshu129/mm-erp

## 1. Database — Neon

1. Sign up at https://neon.tech (free, no card required).
2. Create a project (any name/region).
3. Copy the connection string it gives you (starts `postgresql://...`) — this is `DATABASE_URL`.

## 2. File storage — Cloudflare R2

1. Sign up at https://dash.cloudflare.com (free).
2. Go to **R2 Object Storage** → **Create bucket**. Name it e.g. `mm-erp-uploads`.
3. In the bucket's **Settings** tab, enable **Public Access** (use the `r2.dev` subdomain it gives
   you — that's `R2_PUBLIC_URL`, looks like `https://pub-xxxxxxxx.r2.dev`).
4. Go to **R2 → Manage API Tokens → Create API Token**. Give it read+write access to this bucket.
   It gives you an **Access Key ID** and **Secret Access Key** — save both.
5. Your **Account ID** is shown on the main Cloudflare dashboard sidebar (R2 → Overview).

You now have: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`.

## 3. Apply migrations + seed the admin user (run once, from your own machine)

```
cd backend
DATABASE_URL="<neon-connection-string>" npx prisma migrate deploy
DATABASE_URL="<neon-connection-string>" ADMIN_EMAIL="admin@motorsmitra.local" ADMIN_PASSWORD="<a-real-password>" npx ts-node prisma/seed.ts
```

(On PowerShell, set each var with `$env:DATABASE_URL="..."` on its own line first instead of prefixing the command.)

## 4. Backend — Render

1. Sign up at https://render.com (free, GitHub sign-in works).
2. **New → Web Service** → connect the `mm-erp` GitHub repo.
3. Settings:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
4. Add environment variables (Render's dashboard, one per row):
   - `DATABASE_URL` — the Neon connection string
   - `NODE_ENV` — `production`
   - `CORS_ORIGIN` — leave as `http://localhost:3000` for now; you'll update this after step 5
   - (Don't set `PORT` — Render injects its own automatically and the app already reads `process.env.PORT`)
   - `JWT_ACCESS_SECRET` — a long random string (not the dev one in `.env`)
   - `JWT_ACCESS_EXPIRES_IN` — `15m`
   - `REFRESH_TOKEN_EXPIRES_IN_DAYS` — `7`
   - `REFRESH_COOKIE_NAME` — `mm_erp_refresh`
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` — from step 2
5. Deploy. Once live, copy the URL Render gives you (looks like `https://mm-erp-backend.onrender.com`).

## 5. Frontend — Vercel

1. Sign up at https://vercel.com (free, GitHub sign-in works).
2. **Add New → Project** → import the `mm-erp` GitHub repo.
3. **Root Directory**: `frontend` (Vercel auto-detects Next.js — no other config needed).
4. Environment variable: `NEXT_PUBLIC_API_URL` = `https://<your-render-url>/api`
5. Deploy. Copy the URL Vercel gives you (looks like `https://mm-erp.vercel.app`).

## 6. Close the loop: update CORS

Go back to Render → your backend service → Environment → set `CORS_ORIGIN` to your actual Vercel
URL (e.g. `https://mm-erp.vercel.app`, no trailing slash) → save (triggers a redeploy).

## 7. Verify

Open the Vercel URL, sign in with the admin account from step 3. Try creating a customer, uploading
an item photo (should land in the R2 bucket), and creating a job card.

## Updating after this

Every `git push` to `master` auto-redeploys both Render and Vercel. No manual redeploy steps needed
for future changes.

## Local development is unaffected

Nothing about local dev changes — `backend/.env` still points at the local Postgres install and
leaves the `R2_*` variables unset, so uploads keep going to `backend/uploads/` on disk exactly as
before.
