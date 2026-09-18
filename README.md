# MM ERP — Motors Mitra Workshop Management System

Phase 1 (auth), Phase 2 (Customer/Vehicle/Item masters), Phase 3 (Purchase/Serial Number/Inventory), Phase 4 (Job Card/Inspection/Parts/Labour), Phase 5 (Invoice/Service History), and Phase 6 (Dashboard/Reports/Backup) are done, followed by a September 2026 rework driven by the client's own flowchart documentation — see "What's in the September 2026 rework" below, which supersedes some of Phase 3/4's original design.

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
- **Purchases** (`/dashboard/purchases`) — *(original Phase 3 design; see the September 2026 rework below for the current per-unit-serial behavior)* originally gave one Purchase Serial Number per purchase transaction regardless of quantity.
- A purchase form supports two modes: pick an **existing item** by searching item code/name, or register a **new item** inline (same fields as the Items page) — either way it ends in one purchase record against a real item. As of the rework, Purchases also cover non-inventory expense types (Travel/Petrol/Food/Others) with bill upload and supplier payment tracking.
- Stock increment is a single atomic DB operation inside the same transaction as the purchase insert, so two simultaneous purchases of the same item can never lose an update, and a failure at any step rolls back all of it.
- **Stock ledger** — *(removed in the September 2026 rework)* originally an append-only movement log (`stock_ledger` table). Replaced by per-unit `ItemUnit` rows — see below.

## What's in Phase 4

- **Job Cards** (`/dashboard/jobcards`) — the central sales-side workflow record. Job Card Number is auto-generated the same way as Item Code (`JC-000001`, derived from the row's own id). Create by searching an existing vehicle by registration number (a job card always requires a vehicle already on file via Customer/Vehicle master).
- **Status** was originally one of 9 spec'd states; the September 2026 rework added two more (Ready for Delivery, Delivered) — see below. Once a job card reaches **Invoiced** or any later status, **parts and labour can no longer be added or removed** — this protects a billed record from silently drifting from what a customer was actually charged.
- **Vehicle inspection** — photo upload per angle, plus a 360°/walk-around video upload (MP4/MOV/WEBM, 50MB cap), all linked to the job card and viewable/removable inline. The angle set and a mandatory Before/After phase split were added in the September 2026 rework — see below.
- **Parts issue** — *(original Phase 4 design; the rework replaced quantity-based issuance with issuing one specific serial number at a time — see below)* originally: search an item by code/name, enter quantity, unit price/amount computed server-side. Stock changes use a single atomic conditional SQL update, so "insufficient stock" is safe under concurrency, not just checked-then-hope.
- **Labour** — description/technician/quantity/rate lines, amount computed server-side.
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

## Deployment

Shipped as a hybrid: PostgreSQL and the Node backend stay fully local on the workshop's own PC (not migrated to a cloud DB, by explicit client request), exposed to the internet via an ngrok free static-domain tunnel. Only the Next.js frontend is deployed to Vercel. An Excel export mirroring the database (one tab per table, described below) regenerates automatically about once a minute alongside the database — it's a parallel read-only copy, not a replacement for the database or the JSON backup.

## What's in the September 2026 rework

Triggered by the client sharing their own flowchart documentation of the real shop-floor process, which surfaced a mismatch with the original Phase 3/4 design and asked for several workflow gaps to be closed at the same time.

- **Per-unit serial numbers (replaces the Phase 3 stock ledger).** The original design gave one serial number per *purchase transaction*, with stock tracked as an aggregate count plus an append-only ledger. The client's actual practice is to write a serial on a sticker for **every individual physical part**, even when several identical parts arrive in one purchase. Purchases of inventory types now create one `ItemUnit` row per unit of quantity — each unit's own database id **is** its permanent serial number. The `stock_ledger` table is gone entirely; traceability now comes directly from each unit's own relations (which purchase/supplier it came from, which job card/vehicle it was issued to). Parts Issue on a Job Card now consumes one specific serial (searchable by item, or entered/scanned directly if the sticker is in hand) instead of "item + quantity". Item Code and Purchase Serial Number remain separate concepts — the reversal only affects what a serial number identifies (one physical unit, not one purchase line).
- **Expanded Purchases.** Beyond spare parts/paint/tools (which generate serials), Purchases now also cover non-inventory expense types — Travel, Petrol, Food, Others — with a description field instead of an item, an optional bill/receipt upload, and supplier payment tracking (amount paid so far, mode, reference, who paid; Pending/Partial/Paid computed from paid vs. total, never stored as a separate status).
- **Expanded Job Card workflow.** Added: Job Type (General Service / Accidental Claim / AC / Dent & Paint / Mechanical), Expected Delivery date, a free-text Initial Inspection findings field, an optional Estimate & Customer Approval step (amount + approve/reject, timestamped), Work Assignment to an Employee, mandatory Before/After inspection photos covering Front/Rear/Left/Right at minimum (enforced server-side before the status can move past Vehicle Received or into/past Completed) with an expanded angle set (added Roof/Glove Box/Boot, removed Engine Bay/Damage), a Final Inspection sign-off (Done/Not Done + inspector name, timestamped), customer payment recording on the Invoice, and two new terminal statuses — **Ready for Delivery** and **Delivered** — after Invoiced.
- **New Attendance → Salary module.** A self-contained HR module: an Employee master (name, role, joining date, monthly salary, paid-leave-days-per-month allowance); daily attendance marking (Present/Absent/Leave) with admin correction tracked separately from the original mark; a monthly summary per employee; and salary calculation that deducts one day's pay for every absent day and for every leave day taken beyond the employee's allowance, computed once per employee per month and **stored** (not live-recomputed) so a later attendance correction can't silently change an already-calculated or already-paid salary — recalculating after a payment has started is explicitly blocked.
- Selling price can no longer be set below purchase cost, on both the Item master and at Purchase entry.

## Employee Portal (added 2026-09-18)

A separate, lightweight self-service surface at `/portal/login` — distinct from the admin dashboard — where an employee logs in with an email + password an admin sets on their Employee record, then taps one button to punch their own attendance. The punch captures the exact time, GPS coordinates (via the browser's Geolocation permission), and an optional selfie, and marks that day **Present**. An employee can only punch once per day; an admin's manual correction (existing Attendance page) always overrides a self-punch's status but keeps the punch's location/selfie as an audit trail (`markedBy`: SELF vs ADMIN).

Deliberately kept separate from the admin auth system rather than folded into it:
- **Auth**: a dedicated `/api/employee-portal/login` issues one longer-lived (12h) JWT with no refresh-token rotation — a punch-clock is low-stakes enough (no money movement, one action a day) that this trade avoids building a second full refresh/cookie system. Employee tokens and admin tokens are tagged (`type: "staff"` vs `type: "employee"`) so one can never be used against the other's routes even if both happen to be valid JWTs signed with the same secret.
- **Data model**: `Employee` gained `email` (unique, the portal login id), `mobile`, and `passwordHash` (null until an admin sets a portal password — no email/SMS invite flow, the admin just tells the employee their credentials directly). `Attendance` gained `markedBy`, `punchedAt`, `latitude`, `longitude`, `selfieUrl`.
- **A real bug found and fixed while building this**: adding `passwordHash` to `Employee` meant every existing query that did `include: { employee: true }` (the admin Attendance view, the Salary list/calculate/payment endpoints, and Job Cards' `assignedEmployee`) started silently returning the password hash to the frontend. Fixed by switching every one of those to a scoped `select` (id/name/role only) — verified with live requests that none of them expose it anymore.

Remaining: **Phase 7 (Testing + Security + Deployment hardening)** — see the phase plan discussed with the project owner.
