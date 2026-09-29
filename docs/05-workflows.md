# 05 — Business Workflows

This traces the system's real processes end-to-end — frontend page → API call → service logic → database — rather than describing each layer in isolation. Read [02](02-database-schema.md)/[03](03-backend.md)/[04](04-frontend.md) first if a reference not covered here comes up.

## 1. Onboarding a customer & vehicle

`/dashboard/vehicles` (or `/dashboard/customers/[id]`) → `POST /customers` (if new) → `POST /vehicles`.

Nothing unusual here except normalization: registration numbers are uppercased and stripped of spaces before the uniqueness check, so `"hr06 ab 1234"` and `"HR06AB1234"` are the same vehicle. Neither Customer nor Vehicle can be hard-deleted — only `PATCH /:id/status` to toggle `isActive`, because Job Cards and Purchases reference them and history must survive.

## 2. Purchasing & per-unit serial numbers

`/dashboard/purchases` → `POST /purchases` → [`purchases.service.ts#createPurchaseEntry`](../backend/src/modules/purchases/purchases.service.ts).

One purchase entry is one supplier and one bill, with **any number of items**. The request is multipart:
- `supplierId`, `purchaseDate` and `remarks` are shared by every line.
- `lines` is a JSON array. Each line has an `itemType` and either an existing `itemId` or a `newItem` (name, category, UOM, min stock), plus `quantity`, `purchaseCost` (per unit) and an optional `sellingPrice` (MRP). Expense lines carry a `description` instead of an item.
- `bill` is an optional photo shared by all lines. Each new item can have its own photo as `itemPhoto_<line index>`. `uploadPurchaseFiles()` in `middleware/upload.ts` stores the bill with the other purchase bills and each item photo with the other item photos.

This is the single most business-critical write in the system, and it's the piece that changed most in the September 2026 rework (see [02-database-schema.md](02-database-schema.md#purchasing--inventory-phase-3-reworked-september-2026) for the *why*). **The whole entry is one `prisma.$transaction`**: every line saves or none does. For example, if item 3 fails, a new item created for item 1 is rolled back too. For each line:

1. **Inventory** `itemType` (`SPARE_PART`/`PAINT`/`TOOL`): if it's a new item, the `Item` is created first (Item Code derived from its own id). Then the `Purchase` row is created, then `itemUnit.createMany` adds **one row per unit of `quantity`**, and each unit gets its own permanent serial number for free (its own auto-increment `id`). `Item.currentStock` goes up by exactly that quantity, and `Item.purchaseCost`/`sellingPrice` are set to this purchase's values.
2. **Expense** `itemType` (`TRAVEL`/`PETROL`/`FOOD`/`OTHERS`): just the `Purchase` row with a `description`. No `Item`, no units, no stock change.
3. **Guardrail**: MRP (`sellingPrice`) can never be set below `purchaseCost`. It's checked here and again in `items.service.ts` for direct Item edits.

Every error names the line it's about (`"Item 2: MRP cannot be lower than purchase cost"`), and the frontend runs the same checks before sending.

## 2b. Supplier payments

`/dashboard/suppliers` → **Pay** → `POST /suppliers/:id/payments` (multipart, optional `proof` photo of the transaction) → [`suppliers.service.ts#recordSupplierPayment`](../backend/src/modules/suppliers/suppliers.service.ts). **Payment history** → `GET /suppliers/:id/payments`.

Payments are made against the supplier's running account, not a specific purchase. Each payment is its own `SupplierPayment` row, so the history shows every partial payment: date, amount, mode, reference, who paid, and the photo. The account (`totalPurchased`, `totalPaid`, `balanceDue`) is computed on every read and never stored, and it's also returned alongside each supplier in `GET /suppliers`.

A payment can't exceed the current balance due, which catches a mistyped extra zero. To check that safely, `recordSupplierPayment` locks the supplier row (`SELECT … FOR UPDATE`) for the whole check-and-insert. Without the lock, two payments entered at the same moment could each pass the check and together overpay. Like the other payment endpoints, `amount` is what's being paid *now*, never a running total.

Payment routes follow the Suppliers page's own permission (`SUPPLIERS`). Searching and adding suppliers also accepts `PURCHASES`, because the purchase form's supplier box can add a missing supplier inline.

## 3. The Job Card lifecycle

This is the central workflow — `/dashboard/jobcards/[id]` is the most complex page in the app because it's driving all of the following through one status field plus several sub-resources.

### The status machine

Defined in [`lib/jobCardStatus.ts`](../backend/src/lib/jobCardStatus.ts), enforced in [`jobCards.service.ts#updateJobCard`](../backend/src/modules/jobCards/jobCards.service.ts):

```
DRAFT → VEHICLE_RECEIVED → WORK_STARTED → WAITING_FOR_PARTS → WORK_IN_PROGRESS
      → COMPLETED → INVOICED → READY_FOR_DELIVERY → DELIVERED → CLOSED
                                                                    ↑
                                                              CANCELLED (from most states)
```

The status field is a free-editable dropdown in the UI, but `updateJobCard` layers several rules on top of just "accept whatever status was sent":

- **Mandatory before/after photos**: moving into any status in `AFTER_VEHICLE_RECEIVED` requires all four mandatory angles (`FRONT`/`REAR`/`LEFT`/`RIGHT`) already uploaded with `phase: "BEFORE"`; moving into `AT_OR_PAST_COMPLETED` requires the same four with `phase: "AFTER"`. This is `assertMandatoryPhotos()` — it's what actually forces the workshop's before/after comparison-shot practice, rather than just trusting staff to remember.
- **Invoice-forward-only**: once `jobCard.invoice` exists, `status` can only move to `READY_FOR_DELIVERY`, `DELIVERED`, or `CLOSED` — never back to an "open" status. This exists because the status dropdown alone is user-editable and *not* trustworthy as the sole lock signal (see next point) — but allowing it to go backward would make the UI *look* editable again even though it isn't.
- **Delivery requires an invoice**: can't move into `READY_FOR_DELIVERY`/`DELIVERED`/`CLOSED` without an invoice already existing.
- **Assignment validation**: `assignedEmployeeId` must reference an active employee.
- Side effects: setting `estimateApproved` stamps `estimateApprovedAt`; setting `finalInspectionStatus` stamps `finalInspectionAt`; first transition to `DELIVERED` stamps `deliveredAt`.

### The real lock: invoice existence, not the status field

A bug found and fixed while building Phase 6 (documented in the root [README.md](../README.md#whats-in-phase-6)): the status dropdown alone doesn't prevent editing parts/labour on an invoiced job card, because nothing stops someone dragging the status back to e.g. `COMPLETED`. The fix, still in place: `jobCardParts.service.ts` and `jobCardLabour.service.ts` both check **both** `isLocked(jobCard.status)` **and** whether an `Invoice` row actually exists for this job card — the invoice's existence can't be faked by editing a dropdown, so it's the authoritative check, not the status string.

### Parts issue: by serial, not by quantity

`/dashboard/jobcards/[id]` → look up/scan a serial (`GET /item-units/:id`, fed by `GET /items/:id/available-units`) → `POST /job-cards/:jobCardId/parts` `{itemUnitId}` → [`jobCardParts.service.ts#addPart`](../backend/src/modules/jobCards/jobCardParts.service.ts).

Inside one transaction:
1. `assertJobCardEditable` — the lock check above.
2. `issueUnitOrThrow` — a **single conditional `UPDATE`** (`SET status='ISSUED' WHERE id=? AND status='IN_STOCK'`) via `$queryRaw`, not a read-then-write. This means two staff scanning the same physical sticker at the same instant can't both succeed — Postgres's row-level locking makes the second `UPDATE` affect zero rows, which the code turns into a `ConflictError("Serial number ... is already issued")`.
3. Creates the `JobCardPart` row with `amount` copied from `Item.sellingPrice` **right now** (never recomputed later — a subsequent price change can't retroactively change what an already-issued part is worth).
4. Decrements `Item.currentStock` by 1.

Removing a part (`DELETE /job-cards/:jobCardId/parts/:partId`, only before lock) reverses all of this: the unit goes back to `IN_STOCK` under the *same* serial (units are never deleted, only re-flagged), and `currentStock` increments back.

The original spec's acceptance tests are still the way to sanity-check this logic if you touch it: issuing 1 Oil Filter against 15 in stock should leave 14; attempting to issue against a unit that's already `ISSUED` (or a nonexistent quantity conceptually — 999 units, pre-rework) must be rejected with **no** stock change.

### Labour

Simple — `POST/DELETE /job-cards/:jobCardId/labour`, same lock check, `amount = quantity × rate` computed server-side, no stock implications.

## 4. Invoice generation & the payment-snapshot pattern

`/dashboard/jobcards/[id]` (once `status === "COMPLETED"`) → `POST /job-cards/:jobCardId/invoice` `{discount}` → [`invoices.service.ts#createInvoice`](../backend/src/modules/invoices/invoices.service.ts).

One transaction: reads `parts`/`labour` **live** from the job card (safe because the job card is about to be locked by this same transaction), computes `partsTotal + labourTotal - discount` (discount validated to be within `[0, subtotal]`), creates the `Invoice`, assigns `INV-000123`, and — critically — sets `JobCard.status = "INVOICED"` **in the same transaction**. This last write is what actually locks the job card; everything else (parts/labour services checking `isLocked()`) is downstream of it.

Invoice math is worth knowing precisely if you ever touch this: `Parts + Labour − Discount = Total`, no tax applied yet (`taxRate`/`taxAmount` columns exist but nothing writes to them — reserved for a future GST feature).

### The payment-snapshot pattern (Invoice and SalaryPayment use this)

Neither has a separate payments table. Instead, each row carries its own running `paymentAmount` plus `paymentMode`, reference, who paid and `paymentDate`. `Pending`/`Partial`/`Paid` is *computed* by `paymentStatusFor(total, paid)` and never stored. Supplier payments used to work this way too, per purchase, but moved to their own table in September 2026 so partial-payment history is kept (see section 2b).

**The one rule that matters if you ever touch these endpoints**: `PATCH .../payment`'s `paymentAmount` is *what's being paid right now*, added on top of whatever's already recorded. It is **never the new cumulative total**. This was a real bug, since fixed (see the root README's recent commits): a caller that passed the running total would silently double-count every payment after the first. `recordInvoicePayment`, `recordSalaryPayment` and `recordSupplierPayment` all reject anything that would overpay with a `ConflictError`.

## 5. Reports & the Dashboard

`/dashboard` and `/dashboard/reports` both read live from Postgres on every request — nothing is precomputed or cached. `reports.service.ts`'s `getDashboardSummary()` is the one exception worth knowing: `openJobCards` is `count(status NOT IN LOCKED_STATUSES)`, so it automatically tracks the job card status machine without needing its own list of "open" statuses to keep in sync.

The Reports page's CSV export ([`lib/csv.ts`](../frontend/src/lib/csv.ts)) is entirely client-side — no server export endpoint — it just serializes whatever JSON the report endpoint already returned.

## 6. Attendance → Salary, and the Employee Portal

Two ways attendance gets marked, writing to the **same** `Attendance` table (`@@unique([employeeId, date])`):

- **Admin marking** (`/dashboard/attendance` → `POST /attendance` `{employeeId, date, status}`): first mark of the day creates the row (`markedBy: "ADMIN"`); a second call for the same day is treated as a *correction* (`correctedById` set to the acting admin).
- **Employee self-punch** (`/portal` → `POST /employee-portal/attendance/punch`, employee-token auth): captures GPS coordinates (browser Geolocation API) and an optional selfie, sets `status: "PRESENT"`, `markedBy: "SELF"`. Refuses a second punch the same day (`punchedAt` already set → `ConflictError`).

**An admin correction always wins**: `markAttendance()` always writes `markedBy: "ADMIN"` and the new status, but explicitly preserves the *original* punch's `punchedAt`/`latitude`/`longitude`/`selfieUrl` as an audit trail of what the employee actually did before being overridden. The reverse also happens naturally: if an admin pre-marks someone `ABSENT` before they arrive, their later self-punch overwrites it back to `PRESENT` with `markedBy: "SELF"` — the live punch is treated as the more authoritative signal that they're actually here.

**Salary calculation** (`/dashboard/salary` → `POST /salary/calculate` `{employeeId, month, year}`):
```
perDayRate = monthlySalary / daysInThatMonth
unpaidLeaveDays = max(0, leaveDays - monthlyLeaveAllowance)
deductionDays = absentDays + unpaidLeaveDays
netSalary = max(0, monthlySalary - deductionDays × perDayRate)
```
This is computed **once and stored** (`SalaryPayment`, `@@unique([employeeId, periodMonth, periodYear])`), not a live view — recalculating is an explicit re-run of the same endpoint, and it's **blocked entirely** once `paymentAmount > 0` for that month, so a later attendance correction can never silently change an already-paid salary figure.

### Why the Employee Portal is a separate auth system entirely

Deliberate, not accidental — documented reasoning from when it was built:
- **Stakes are low**: one action a day, no money movement. A dedicated `/employee-portal/login` issuing one 12-hour JWT with no refresh rotation is judged good enough — building a second full refresh/cookie system for this wasn't worth it.
- **Cannot cross over**: staff tokens carry `type: "staff"`, employee tokens carry `type: "employee"` (see [03-backend.md](03-backend.md#auth--sessions)) — `authenticate` and `authenticateEmployee` each reject the other's token type even though both are signed with the same `JWT_ACCESS_SECRET`.
- **A real bug this surfaced**: adding `passwordHash` to `Employee` meant every existing `include: { employee: true }` query (admin Attendance view, Salary endpoints, Job Cards' `assignedEmployee`) started silently returning the password hash to the frontend. Fixed by switching every one of those to a scoped `select` — and `employees.service.ts`'s `sanitizeEmployee()` now does this centrally for the Employees module itself, stripping `passwordHash` and replacing it with a boolean `hasPortalAccess`.

## 7. Permissions model

Two independent layers, both covered in more depth in [03-backend.md](03-backend.md#authorization):

- **Role** (`ADMIN` / `STORE_USER`) — `ADMIN` is a hardcoded superuser bypass everywhere (`requirePermission` short-circuits for it); Users management and Backup/Restore are gated by `authorize("ADMIN")` directly and are **never** part of the grantable permission list — a permission-scoped Store User could otherwise create other logins or restore the database over the live one.
- **Permissions** (`User.permissions: String[]`, only meaningful for `STORE_USER`) — set at user creation or edited later via `/dashboard/users` → `PATCH /users/:id/permissions` → `updateUserPermissions()`, which itself refuses to touch an `ADMIN` account's permissions (they're irrelevant — always ignored by `requirePermission`).

Deactivating a user (`PATCH /users/:id/status {isActive: false}`) also immediately revokes every one of their outstanding refresh tokens, so a disabled account can't keep silently refreshing its way back in.

## 8. Backup, restore, and the Excel mirror

Three completely different artifacts, covered fully in [06-deployment-and-ops.md](06-deployment-and-ops.md):
- **JSON backup** (`GET /backup`, Admin-only) — a full logical dump of every business table via Prisma, on demand.
- **CLI restore** (`backend/scripts/restore.ts`, not an HTTP route) — deliberately not a one-click web action; refuses to run against a database that already has any data in any of the backed-up tables, specifically so it can't be used to accidentally clobber a live system.
- **Excel export** (`GET /backup/excel`) — a read-only, auto-regenerating (~60s) human-readable mirror, one tab per table. Never used for restore; purely a reference artifact that happens to also satisfy the original spec's "Excel/Google Sheets mirror" requirement.
