# MM ERP — Motors Mitra Workshop Management System

Phase 1 (auth), Phase 2 (Customer/Vehicle/Item masters), Phase 3 (Purchase/Serial Number/Inventory), Phase 4 (Job Card/Inspection/Parts/Labour), Phase 5 (Invoice/Service History), and Phase 6 (Dashboard/Reports/Backup) are done.

## Stack

- `backend/` — Node.js + Express + TypeScript, PostgreSQL via Prisma, JWT auth (short-lived access token + rotating httpOnly refresh cookie).
- `frontend/` — Next.js (App Router) + TypeScript + Tailwind, installable as a PWA-ready responsive web app.
- PostgreSQL runs natively on this machine (no Docker) — installed at `C:\Users\pisaini\pgsql16`, outside the repo. It was obtained via the `@embedded-postgres/windows-x64` npm package rather than the official installer, because this network blocks `get.enterprisedb.com`; the binaries are the same official PostgreSQL 16 build. Production target (VPS/server) is decided at deployment time (Phase 7).

## First-time setup

1. **Start PostgreSQL**:
   ```
   powershell -File scripts/db-start.ps1
   ```
   (`scripts/db-stop.ps1` and `scripts/db-status.ps1` are also available.) The `mm_erp` role/database were created once already — no further setup needed unless the data directory is recreated.

2. **Backend**
   ```
   cd backend
   npm install
   npm run prisma:migrate   # creates tables from prisma/schema.prisma
   npm run prisma:seed      # creates ADMIN + STORE_USER roles and an initial admin user
   npm run dev               # http://localhost:4000
   ```
   Copy `.env.example` to `.env` first if it doesn't already exist, and change `JWT_ACCESS_SECRET` and `ADMIN_PASSWORD` from the placeholder values before any real deployment.

3. **Frontend**
   ```
   cd frontend
   npm install
   npm run dev               # http://localhost:3000
   ```
   Copy `.env.local.example` to `.env.local` first if it doesn't already exist.

4. Open http://localhost:3000 and sign in with the seeded admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD` from `backend/.env`).

## What's in Phase 1

- Roles stored as a database table (not a fixed enum), so new roles (Technician, Accountant, etc.) can be added later with a row insert, not a migration.
- JWT access token (15 min) kept in memory on the frontend only; a rotating opaque refresh token is stored httpOnly and hashed in the database, so a database leak alone can't be replayed as a session.
- Admin-only user management screen (`/dashboard/users`) to create Store User / Admin accounts and enable/disable them.

## What's in Phase 2

- **Customers** (`/dashboard/customers`) — create/search, unique mobile number enforced, detail page shows all vehicles owned.
- **Vehicles** (`/dashboard/vehicles`) — global search by registration/make/model (registration numbers are normalized to uppercase/no-spaces so "hr06 ab 1234" and "HR06AB1234" are treated as the same vehicle); added from a customer's page.
- **Items** (`/dashboard/items`) — Item Code is auto-generated (`ITM-000001`, derived from the row's own id right after insert, so it's always unique and never hand-typed), photo upload (JPEG/PNG/WEBP, 5MB max, stored on local disk under `backend/uploads/`), category/UOM/pricing/min-stock fields, stock status column (stock movements themselves start in Phase 3).
- Both ADMIN and STORE_USER can manage all three masters — only user/role management stays admin-only.
- None of these records are ever hard-deleted; every master has an active/disabled toggle instead, since Job Cards and Purchases will reference them in later phases.

## What's in Phase 3

- **Suppliers** (`/dashboard/suppliers`) — simple master, name/mobile/address.
- **Purchases** (`/dashboard/purchases`) — the Purchase Serial Number required by the spec is simply the purchase row's own database id: already unique, sequential, and impossible to hand-enter — no separate counter needed. One purchase = one serial number regardless of quantity (matches the spec's TEST 1/TEST 2 exactly: Qty 5 → Serial 1 → stock 5; next purchase Qty 10 → Serial 2 → stock 15).
- A purchase form supports two modes: pick an **existing item** by searching item code/name, or register a **new item** inline (same fields as the Items page) — either way it ends in one purchase record against a real item.
- Stock increment is a single atomic DB operation (`currentStock: { increment: qty }`, not read-then-write) inside the same transaction as the purchase insert and the ledger entry, so two simultaneous purchases of the same item can never lose an update, and a failure at any step rolls back all of it.
- **Stock ledger** — an append-only movement log (`stock_ledger` table) recording every IN (purchase) and, from Phase 4, every OUT (parts issue) movement with who/when/how much and a running balance. Visible per-item at `/dashboard/items/[id]` as "Stock history" — this is the traceability mechanism decided in Phase 0 (item-level, not full batch/lot FIFO).

## What's in Phase 4

- **Job Cards** (`/dashboard/jobcards`) — the central sales-side workflow record. Job Card Number is auto-generated the same way as Item Code (`JC-000001`, derived from the row's own id). Create by searching an existing vehicle by registration number (a job card always requires a vehicle already on file via Customer/Vehicle master).
- **Status** is one of the 9 spec'd states (Draft → ... → Invoiced/Closed/Cancelled), settable from a dropdown on the job card. Once a job card reaches **Invoiced, Closed, or Cancelled, parts and labour can no longer be added or removed** — this protects a billed record from silently drifting from what a customer was actually charged.
- **Vehicle inspection** — photo upload per angle (Front/Rear/Left/Right/Interior/Dashboard/Engine Bay/Damage) plus a 360°/walk-around video upload (MP4/MOV/WEBM, 50MB cap), all linked to the job card and viewable/removable inline.
- **Parts issue** — search an item by code/name, enter quantity, and the line's unit price/amount are computed server-side from the item's current selling price (never user-entered). Stock is decremented with a single atomic conditional SQL update (`UPDATE items SET current_stock = current_stock - qty WHERE current_stock >= qty`) — this is what makes "insufficient stock" actually safe under concurrency, not just checked-then-hope: two staff trying to issue the last unit at the same instant can't both succeed, and the loser gets a clear "Insufficient stock: only N available" error instead of silently pushing stock negative. Removing a mistakenly-added part restores the stock and logs a reversal ledger entry.
- **Labour** — description/technician/quantity/rate lines, amount computed server-side.
- Every parts issue/removal appends to the same stock ledger from Phase 3, now fully joined through to the job card and vehicle — item stock history (`/dashboard/items/[id]`) shows real purchase-to-job-card traceability, not just "JOB_CARD" as a label.
- Verified directly against the spec's own acceptance tests: adding 1 Oil Filter to a job card took stock from 15 → 14 exactly (TEST 3); attempting to issue 999 against 14 available was rejected with no stock change (TEST 7).

## What's in Phase 5

- **Invoices** — generated from a Job Card (`/dashboard/jobcards/[id]`, once its status is **Completed**), with an optional discount. Deliberately has no line-item tables of its own: parts and labour are read straight from the job card's own (already-immutable) records, and generating the invoice sets the job card to **Invoiced** in the same transaction — which is what actually locks it from further edits (Phase 4's rule). A job card can only be invoiced once (DB-unique constraint). Invoice Number is auto-generated the same way as Item/Job Card Number (`INV-000001`).
- Invoice math verified against the spec's own example: Parts ₹500 + Labour ₹1300 − Discount ₹50 = **₹1750**, exactly (TEST 4).
- **Invoice view** (`/dashboard/invoices/[id]`) is a print-friendly layout (dashboard nav and buttons hidden via CSS on print) — "Print / Save as PDF" uses the browser's native print dialog rather than a server-side PDF library, keeping the stack simple.
- **Service History** (`/dashboard/service-history`) — search by vehicle registration number, customer mobile, **or** customer name (the same search now also powers the Vehicles page); shows every job card for the matched vehicle with date/KM/complaint/status/amount, linking through to the invoice (if billed) or the job card itself. Verified against TEST 5.
- GST/tax fields (`taxRate`, `taxAmount`) already exist on the Invoice table, unused — so GST can be added later (master spec's own "GST-ready" requirement) without a schema migration touching this table's shape.

## What's in Phase 6

- **Dashboard** (`/dashboard`) — real live widgets, not placeholders: today's vehicles, open job cards, jobs completed-but-not-yet-invoiced, jobs waiting for parts, today's sales/purchase value, low-stock/out-of-stock counts, plus quick-action links.
- **Reports** (`/dashboard/reports`) — Sales, Purchases (by day and by supplier), Inventory (with stock value), Workshop (job cards by status), and Customers (new/repeat), each with a date range where relevant and a client-side CSV export button (no server-side export library needed).
- **Backup** (`/dashboard/settings`, admin-only) — "Download backup now" produces one JSON file containing every business table (customers through invoices; refresh tokens excluded on purpose). Restore is deliberately **not** a one-click web action — it's a CLI command (`npm run backup:restore -- <file> --yes`) that refuses to run against a database that already has any data, specifically so it can't be used to accidentally clobber a live system. Both backup and restore were tested end-to-end against a scratch database (fresh migration → restore → verified row counts and a restored invoice/job card's data matched exactly, including the auto-increment sequences being correctly reset so new records don't collide with restored ones).
- Since this Postgres install has no `pg_dump`/`psql` (this npm-sourced binary distribution only ships the server itself — see the local-env note below), backup/restore is implemented as a logical dump/restore through Prisma directly rather than shelling out to `pg_dump`. This is arguably more portable anyway, since it doesn't depend on client-tool binaries being present at all.
- **Bug found and fixed while building this phase**: the Job Card status dropdown had no restriction once a job card was invoiced, so it was possible to drag the status back to e.g. "Completed" and then add/remove parts on an already-billed job card — silently drifting it from what the invoice actually said. Fixed by making the invoice's own existence (not just the mutable status field) the authoritative lock check in the parts/labour endpoints, and by refusing any status change away from Invoiced/Closed once an invoice exists. Verified the fix blocks both the status reversion and the resulting edit attempt.

Remaining: **Phase 7 (Testing + Security + Deployment)** — see the phase plan discussed with the project owner.
