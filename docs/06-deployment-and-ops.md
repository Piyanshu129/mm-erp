# 06 — Deployment & Operations

This is the "how it actually runs" reference. For the click-by-click production runbook (Vercel setup, current live URLs), see the root [`DEPLOYMENT.md`](../DEPLOYMENT.md) — this doc explains *why* it's shaped that way and covers local dev + the pieces DEPLOYMENT.md doesn't.

## The current architecture: hybrid local + Vercel

```
┌─────────────────────────────┐         ┌────────────────────────────────────┐
│  Vercel (cloud, free)        │         │  This PC (workshop's own machine)     │
│  frontend/ — Next.js          │ ──────> │  ngrok tunnel (reserved static domain) │
│  https://mm-erp-nine.vercel.app │ HTTPS │            │                          │
└─────────────────────────────┘         │            ▼                          │
                                          │  backend/ — Express, NODE_ENV=production │
                                          │            │                          │
                                          │            ▼                          │
                                          │  PostgreSQL (native, C:\Users\pisaini\pgsql16) │
                                          └────────────────────────────────────┘
```

**Deliberate choice, by explicit client request**: Postgres and the backend stay fully local on the workshop's own PC — nothing about the database moved to a cloud host. Only the Next.js frontend is deployed to Vercel; it reaches the local backend through a free ngrok tunnel on a **reserved static domain** (so the URL doesn't change when the tunnel restarts).

**The tradeoff this implies**: the site is only reachable while this PC is on, Postgres is running, and the backend + tunnel processes are running. If the machine sleeps or shuts down, the site goes down for everyone, including anyone the link was shared with.

The codebase does **not** hard-depend on this shape — see "An alternative: fully-cloud deployment" below.

## Local development

```powershell
# 1. Start Postgres (native install, not Docker — see "Why Postgres is installed this way" below)
powershell -File scripts/db-start.ps1

# 2. Backend
cd backend
npm install
npm run prisma:migrate     # creates tables from prisma/schema.prisma
npm run prisma:seed        # creates ADMIN/STORE_USER roles + an initial admin user (from .env's ADMIN_EMAIL/ADMIN_PASSWORD)
npm run dev                 # http://localhost:4000, via ts-node-dev

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev                 # http://localhost:3000, via next dev
```

Copy `backend/.env.example` → `backend/.env` and `frontend/.env.local.example` → `frontend/.env.local` first if they don't already exist. Change `JWT_ACCESS_SECRET` and `ADMIN_PASSWORD` from their placeholder values before any real deployment — they ship with obviously-fake defaults specifically so a fresh checkout doesn't run with production-unsafe values without someone noticing.

`scripts/db-status.ps1` and `scripts/db-stop.ps1` are also available. Postgres does **not** auto-start on boot — after a reboot, `db-start.ps1` needs to be run again.

### Why Postgres is installed this way

Installed natively at `C:\Users\pisaini\pgsql16` via the `@embedded-postgres/windows-x64` npm package (same official PostgreSQL 16 binaries as the standard installer) rather than Docker or the official EnterpriseDB Windows installer. Both alternatives were ruled out on this machine specifically: Docker Desktop was declined in favor of a fully local/native setup, and `get.enterprisedb.com` (the official installer's domain) is blocked on this network. This is a workaround for *this* machine's constraints, not a general recommendation — a different environment might reasonably just use the official installer or Docker.

## Going live (`scripts/start-app.ps1`)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-app.ps1
```

This one script: starts Postgres if it isn't already running, builds the backend (`npm run build`), starts it with `NODE_ENV=production` in its own PowerShell window, and starts the ngrok tunnel in another window. `NODE_ENV=production` specifically matters here beyond just "prod build" — it flips the refresh cookie to `SameSite=None; Secure` (see [03-backend.md](03-backend.md#auth--sessions)), which is required for the cookie to survive the cross-site request from Vercel's domain to the ngrok domain. Running the dev backend (`NODE_ENV` unset/`development`) behind the tunnel would silently break login persistence.

**Both windows need to stay open** — closing either takes the live site down for everyone. `scripts/db-start.ps1`/`db-stop.ps1`/`db-status.ps1` are separate, smaller scripts for just the database.

## Moving to another Windows PC

Three double-click files in the repo root do the whole move. Nothing needs to be installed on the new PC beforehand, and no admin rights are needed (except possibly once, for the Microsoft Visual C++ runtime that PostgreSQL uses):

1. **`prepare-transfer.bat`** (old PC, [`scripts/prepare-transfer.ps1`](../scripts/prepare-transfer.ps1)): builds `Desktop\MM-transfer\MM` with the code (no `node_modules` or builds), `backend/.env`, `backend/uploads`, a fresh data backup as `backend/backups/transfer-data.json`, and the ngrok login as `transfer/ngrok.yml`. Run it right before moving: anything entered later isn't in it. The folder holds secrets and customer data.
2. **`setup.bat`** (new PC, once, [`scripts/setup.ps1`](../scripts/setup.ps1)): downloads portable Node.js 22, PostgreSQL 18 (the `@embedded-postgres/windows-x64` npm package) and ngrok into `tools/`; creates the database server (random superuser password in `tools/pgsql/superuser-password.txt`) and the app's login and database from `DATABASE_URL` ([`scripts/setup-db.js`](../scripts/setup-db.js)); runs `npm ci`, migrations, generate and build; then restores `transfer-data.json` (or seeds an empty system if there isn't one). Each step skips itself if already done, so it can simply be re-run after a failure.
3. **`start-servers.bat`** (new PC, every time, [`scripts/start-servers.ps1`](../scripts/start-servers.ps1)): starts PostgreSQL if needed, then the backend (production mode) and the ngrok tunnel on the same static domain, each in its own window — so the Vercel frontend needs no change.

**Starting fresh instead** (no data carried over): unzip the code from GitHub to `Desktop\MM` and run `setup.bat`. With no `backend/.env` it writes one with new random database and token secrets, asks for the admin email and password, creates the roles and that admin, and asks for the ngrok authtoken.

Only one PC can hold the ngrok domain at a time: close the old PC's backend and tunnel windows before starting the new one.

## Environment variables

### Backend (`backend/.env`, see `.env.example` for the full annotated template)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `PORT` | default `4000` |
| `NODE_ENV` | `development` / `production` / `test` — see the cookie note above |
| `CORS_ORIGIN` | comma-separated allowlist of frontend origins |
| `JWT_ACCESS_SECRET` | signs both staff and employee tokens — min 16 chars, validated at startup |
| `JWT_ACCESS_EXPIRES_IN` | default `15m` |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | default `7` |
| `REFRESH_COOKIE_NAME` | default `mm_erp_refresh` |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | only read by `prisma/seed.ts`, one-time |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL` | all five optional; set together to switch file uploads from local disk to Cloudflare R2 (needed on hosts with no persistent disk — see [03-backend.md](03-backend.md#file-uploads)) |

All of this is validated with Zod at startup ([`config/env.ts`](../backend/src/config/env.ts)) — a missing/invalid required variable prints the exact field errors and exits immediately rather than failing confusingly later.

### Frontend (`frontend/.env.local`)

Just `NEXT_PUBLIC_API_URL` — defaults to `http://localhost:4000/api` if unset. Set to the ngrok tunnel URL + `/api` in the Vercel project's environment variables for production.

## Backup, restore, and the Excel mirror

Three genuinely different things — don't conflate them:

| | JSON Backup | Excel Export | CLI Restore |
|---|---|---|---|
| Trigger | `GET /backup` (Admin, on demand) | Auto-regenerated every ~60s, or `GET /backup/excel` to download the current file | `npm run backup:restore -- <file> --yes` (from `backend/`, terminal only) |
| Purpose | Point-in-time full data dump | Human-readable reference/reporting mirror | Disaster recovery |
| Excludes | `refresh_tokens` (sessions are meant to be re-issued, not restored) | `users`/`roles`/`refresh_tokens` (login plumbing, not business data) | — |

**Restore is deliberately not a web button.** [`backend/scripts/restore.ts`](../backend/scripts/restore.ts) requires `--yes` on the command line, and [`lib/backup.ts`](../backend/src/lib/backup.ts)'s `restoreFromBundle()` **refuses to run at all if any of the target tables already has any rows** — this is what actually prevents it from being used to accidentally clobber a live system; there's no "are you sure" dialog to misclick past. Tables are restored in dependency order (each table's foreign keys must already exist — `estimateLine` needs both `estimate` and `item`, etc.), and afterward every table's Postgres identity sequence is explicitly reset to `MAX(id)`, since the restore inserted explicit ids and bypassed the sequence — without this, the very next normal insert could collide with a restored row's id.

Since this npm-sourced Postgres binary distribution ships no `pg_dump`/`psql` client tools, backup/restore is implemented as a logical dump/restore straight through Prisma rather than shelling out — arguably more portable anyway, since it doesn't depend on client-tool binaries being present on whatever machine runs it.

The Excel export ([`lib/excelExport.ts`](../backend/src/lib/excelExport.ts), scheduled by [`lib/excelExportScheduler.ts`](../backend/src/lib/excelExportScheduler.ts)) writes `backend/exports/mm-erp-data.xlsx` — one worksheet per business table — and is purely a read-only side artifact; it's never consulted by restore.

## File storage

Local disk (`backend/uploads/`) by default — fine as long as the backend stays on a machine with persistent disk, which is true of the current hybrid setup. If ever moved to a host without persistent disk (e.g. Render's free tier), setting all five `R2_*` variables switches every upload (item photos, purchase bills, job card inspection media, portal selfies) to Cloudflare R2 with no code changes — see [03-backend.md](03-backend.md#file-uploads).

## An alternative: fully-cloud deployment

The codebase already supports moving off this machine entirely with **no further code changes** — only reconfiguring environment variables and a one-time data migration:
- **Database**: any hosted Postgres (e.g. Neon) — just change `DATABASE_URL`.
- **Backend**: [`render.yaml`](../render.yaml) is a ready-to-use Render.com blueprint (`npm install && npx prisma generate && npx prisma migrate deploy && npm run build` as the build command, `npm start` to run).
- **File storage**: Cloudflare R2, as above.
- **Frontend**: already on Vercel either way — just point `NEXT_PUBLIC_API_URL` at the new backend host instead of the ngrok URL.

This removes the "machine has to stay on" tradeoff entirely, at the cost of no longer having the database sit on-premises. Not currently in use — see the root [`DEPLOYMENT.md`](../DEPLOYMENT.md) for the live URLs of the setup that *is* currently in use.
