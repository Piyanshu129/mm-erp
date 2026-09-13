# Deploying MM ERP for free

**Chosen architecture:** PostgreSQL and the backend stay fully local on this machine — nothing about
the database moved anywhere. Only the frontend is hosted on the web (Vercel, free), reaching the
local backend through a free ngrok tunnel.

**The tradeoff this implies:** the site is only reachable while this PC is on, Postgres is running,
and the backend + tunnel processes (started via `scripts/start-app.ps1`) are running. If this
machine sleeps or shuts down, the site goes down for everyone using the link, including whoever
you've sent it to.

Repo: https://github.com/Piyanshu129/mm-erp

## What's already set up

- **ngrok**: installed, authenticated, and a free static domain reserved:
  `https://les-unhesitative-blandishingly.ngrok-free.dev`. This URL is permanent — it doesn't change
  when the tunnel restarts.
- **`scripts/start-app.ps1`**: run this to go live. It builds the backend, starts it in production
  mode (needed so the cross-site refresh cookie works — Vercel and ngrok are different domains from
  the browser's perspective), and starts the ngrok tunnel — backend and tunnel each open in their
  own PowerShell window so you can see their logs / stop them individually.
- **AuthedImage/AuthedVideo**: item photos and job card inspection media fetch through the tunnel
  with the header ngrok requires to skip its free-tier warning page (plain `<img>`/`<video>` tags
  can't send custom headers, so this was a real blocker that's now handled).

## 1. Go live locally

```
powershell -ExecutionPolicy Bypass -File scripts\start-app.ps1
```

This starts Postgres (if not already running), builds and starts the backend in production mode,
and starts the ngrok tunnel. Leave both opened windows running.

Verify: open https://les-unhesitative-blandishingly.ngrok-free.dev/api/health in a browser — you'll
see ngrok's warning page once (click "Visit Site"), then `{"status":"ok"}`. That one-time click only
affects direct visits to the raw backend URL — the actual app (once on Vercel) talks to it via
fetch with the bypass header, so end users never see that page.

## 2. Frontend — Vercel

1. Sign up at https://vercel.com (free, GitHub sign-in works).
2. **Add New → Project** → import the `mm-erp` GitHub repo.
3. **Root Directory**: `frontend` (Vercel auto-detects Next.js).
4. Environment variable: `NEXT_PUBLIC_API_URL` =
   `https://les-unhesitative-blandishingly.ngrok-free.dev/api`
5. Deploy. Copy the URL Vercel gives you (looks like `https://mm-erp.vercel.app`).

## 3. Close the loop: update CORS

Edit `backend/.env` and set:
```
CORS_ORIGIN="https://<your-actual-vercel-url>"
```
(no trailing slash). Then restart the backend window (or re-run `scripts/start-app.ps1`) for it to
take effect.

## 4. Verify

Open the Vercel URL, sign in with your admin account, create a customer, upload an item photo (it
should display correctly — that's the AuthedImage fetch working), and create a job card.

## Updating after this

- **Frontend changes**: `git push` auto-redeploys Vercel.
- **Backend changes**: pull the latest code, then re-run `scripts/start-app.ps1` (or manually
  `npm run build` + restart the production window) — there's no auto-redeploy since it's not hosted
  on a platform that watches the repo.

## Restarting after a reboot

Postgres does not auto-start (see `scripts/db-status.ps1`), and neither does the backend or tunnel.
After restarting this PC, re-run `scripts/start-app.ps1` to bring the site back online.

## If you ever want to move off this machine

The codebase already supports a fully-cloud deployment (Neon for Postgres, Render for the backend,
Cloudflare R2 for file storage) with no further code changes — only reconfiguring environment
variables and one-time data migration. Ask if you want to switch to that path later.
