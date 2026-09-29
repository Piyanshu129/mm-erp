# 02 — Database Schema

Source of truth: [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma). This walks through it by domain, with the reasoning behind the choices that aren't obvious from the column list alone.

Two conventions apply almost everywhere in this schema and are worth knowing up front:
- **Nothing is hard-deleted.** Every master record (Customer, Vehicle, Item, Supplier, Employee) has an `isActive` boolean toggle instead of a delete endpoint, because later tables (Job Cards, Purchases) reference them and history must never disappear.
- **Money is always `Decimal @db.Decimal(12, 2)`**, never `Float` — avoids floating-point rounding errors on currency.

## Auth & roles

```
Role ──< User ──< RefreshToken
```

- **`Role`** — a *table*, not a Postgres enum or a hardcoded string union. New roles (Technician, Accountant, …) can be added with a plain `INSERT`, no migration. Seeded with `ADMIN` and `STORE_USER` ([`prisma/seed.ts`](../backend/prisma/seed.ts)).
- **`User`** — `permissions: String[]` is a plain array, not a join table, for the same "grow without a migration" reasoning as `Role`. It's only meaningful for `STORE_USER` accounts — `ADMIN` is always a superuser regardless of what's in this array (enforced in [`requirePermission.ts`](../backend/src/middleware/requirePermission.ts), not at the DB layer). The valid values are the constant list in [`lib/permissions.ts`](../backend/src/lib/permissions.ts): `CUSTOMERS`, `VEHICLES`, `ITEMS`, `SUPPLIERS`, `PURCHASES`, `JOB_CARDS`, `INVOICES`, `REPORTS`, `EMPLOYEES`, `ATTENDANCE`, `SALARY` — notably **not** including user management or backup/restore, which stay Admin-only forever.
- **`RefreshToken`** — `tokenHash` only, never the plaintext token. A database leak alone can't be replayed as a session. Rotated on every use (see [05-workflows.md](05-workflows.md)).

## Masters (Phase 2)

```
Customer ──< Vehicle
```

- **`Customer`** — `mobile` is globally unique (the app's primary lookup key for a customer).
- **`Vehicle`** — `registrationNumber` is globally unique; the service layer normalizes it (uppercase, no spaces) before the uniqueness check so `"hr06 ab 1234"` and `"HR06AB1234"` collide as the same vehicle.
- **`Item`** — the parts/consumables catalog. `itemCode` (`ITM-000123`) is generated server-side from the row's own `id` right after insert — never typed by a user, so it can never collide (same pattern used for `Vehicle`/`JobCard`/`Invoice` numbers). `currentStock` is a **denormalized counter**: it's not computed live from `ItemUnit` rows on every read: it's incremented/decremented transactionally alongside every purchase and every parts issue/removal ([`purchases.service.ts`](../backend/src/modules/purchases/purchases.service.ts), [`jobCardParts.service.ts`](../backend/src/modules/jobCards/jobCardParts.service.ts)), so it's always in sync.
- **`Supplier`** — master for Purchases, and the account that supplier payments are made against (see `SupplierPayment` below).

## Purchasing & inventory (Phase 3, reworked September 2026)

```
Supplier ──< Purchase ──< ItemUnit >── Item
         ──< SupplierPayment
```

This is the part of the schema that changed shape most dramatically. The **original** Phase 3 design gave one serial number per *purchase transaction* and tracked stock as an aggregate count plus an append-only `stock_ledger` table. The client's actual shop-floor practice, surfaced by their own flowchart documentation, is different: **a serial sticker gets written on every individual physical part**, even when ten identical brake pads arrive in one purchase. The schema was reworked to match:

- **`Purchase`** — one row per purchased line. A single purchase entry in the UI (one supplier, one bill) can contain several items; each becomes its own `Purchase` row sharing `supplierId`, `purchaseDate`, `billUrl` and `remarks`, all created in one transaction. `itemType` is one of:
  - Inventory types: `SPARE_PART`, `PAINT`, `TOOL` — these reference an `Item` and generate `ItemUnit` rows.
  - Expense types: `TRAVEL`, `PETROL`, `FOOD`, `OTHERS` — no `Item`, just a `description` and a cost; no stock implications at all.

  `purchaseCost` is the **per-unit** rate for inventory lines (the line total is `quantity × purchaseCost`) and the total for expense lines (quantity is always 1). `sellingPrice` is labelled **MRP** in the UI, and can't be below `purchaseCost`. Purchases carry **no payment fields** — payment is tracked per supplier, below.

- **`SupplierPayment`** (added 2026-09-29) — one row per payment made to a supplier: `amount`, `paymentDate`, `paymentMode`, `reference`, `paidBy`, `proofUrl` (photo/screenshot of the transaction), `notes`, and `createdById`. Payments go against the supplier's **running account**, not against any one purchase, because that's how the workshop actually pays ("₹20,000 towards the balance"). The account is always computed and never stored: `totalPurchased` (sum of `quantity × purchaseCost` over the supplier's purchases) minus `totalPaid` (sum of these rows) = `balanceDue`. Because each payment is its own row, the full partial-payment history is kept. Before this table existed, each purchase stored one accumulated payment total. The migration `20260929130000_supplier_payments` copied each paid purchase into one row here, noted "Recorded against purchase #N", and then dropped those columns.

- **`ItemUnit`** — one row per **physical unit**. Its own `id` **is** its permanent serial number: assigned the moment it's created, never reused, never hand-typed. `status` is `IN_STOCK` or `ISSUED`. This single table is now the entire traceability mechanism — a unit's `purchase` relation says exactly where it came from (which supplier, which purchase), and its `jobCardPart` relation (if any) says exactly where it went (which job card, which vehicle). The old `stock_ledger` table is gone entirely; nothing replaced it as a separate ledger because none is needed anymore.

  Item Code (`Item.itemCode`) and Purchase Serial Number (`Purchase.id`) remain distinct concepts from an `ItemUnit`'s serial — the rework only changed what a *serial number* identifies (one physical unit, not one purchase line).

## Job Cards (Phase 4, reworked September 2026)

```
Vehicle ──< JobCard ──< JobCardMedia
                    ├──< JobCardPart >── ItemUnit
                    ├──< JobCardLabour
                    └──── Invoice (1:1)
Employee ──< JobCard   (assignedEmployee, optional)
```

- **`JobCard`** — the central sales-side workflow record. `jobCardNumber` (`JC-000123`) follows the same derive-from-own-id pattern as `Item`. `status` is a plain string (same reasoning as `Role`), one of eleven values defined in [`lib/jobCardStatus.ts`](../backend/src/lib/jobCardStatus.ts):

  ```
  DRAFT → VEHICLE_RECEIVED → WORK_STARTED → WAITING_FOR_PARTS → WORK_IN_PROGRESS
        → COMPLETED → INVOICED → READY_FOR_DELIVERY → DELIVERED → CLOSED
  (CANCELLED can happen from most states)
  ```
  The last five (`INVOICED`, `READY_FOR_DELIVERY`, `DELIVERED`, `CLOSED`, `CANCELLED`) are `LOCKED_STATUSES` — once a job card reaches one of these, parts and labour can no longer be added or removed. See [05-workflows.md](05-workflows.md) for the full state-machine rules (mandatory photos, estimate approval, invoice-forward-only).

  The September 2026 rework added: `jobType`, `expectedDelivery`, `inspectionFindings` (initial inspection), an optional estimate/approval step (`estimateAmount`, `estimateApproved`, `estimateApprovedAt`), work assignment (`assignedEmployeeId` → `Employee`), a final inspection sign-off (`finalInspectionStatus`, `finalInspectionBy`, `finalInspectionAt`), and `deliveredAt`.

- **`JobCardMedia`** — inspection photos/video. `angle` (FRONT/REAR/LEFT/RIGHT/ROOF/INTERIOR/DASHBOARD/GLOVE_BOX/BOOT/WALKAROUND/OTHER) and `phase` (`BEFORE`/`AFTER`) together enforce the workshop's mandatory before/after comparison shots — see [`assertMandatoryPhotos()`](../backend/src/modules/jobCards/jobCards.service.ts) in the workflow doc.

- **`JobCardPart`** — one row per **issued physical unit** (`itemUnitId` is `@unique` — a unit can only ever be issued once, matching its `IN_STOCK`/`ISSUED` status). There is no "quantity" field anymore since each row already represents exactly one physical part. `amount` is captured from `Item.sellingPrice` **at the moment of issue** and never recomputed — a later price change on the Item can't silently change what an already-issued job card is worth.

- **`JobCardLabour`** — simple description/technician/quantity/rate lines, `amount` computed server-side (`quantity × rate`).

## Invoices (Phase 5)

- **`Invoice`** — 1:1 with `JobCard` (`jobCardId @unique`, DB-enforced — a job card can only be invoiced once). Deliberately **has no line-item tables of its own**: parts and labour are read live from the job card's own (already-locked) records at invoice-generation time, so an invoice can never show numbers different from the job card it came from. `invoiceNumber` follows the `INV-000123` pattern. `taxRate`/`taxAmount` exist, unused, so GST support can be added later without a schema migration touching this table's shape. Payment is a single evolving snapshot on the row itself (`paymentAmount`, `paymentMode`, `paymentReference`, `paymentReceivedBy`, `paymentDate`), with `Pending`/`Partial`/`Paid` computed from `paymentAmount` vs. `totalAmount`, never stored. `SalaryPayment` below uses the same pattern.

## HR: Attendance → Salary (Phase 6, expanded with the Employee Portal)

```
Employee ──< Attendance
         ──< SalaryPayment
         ──< JobCard (assignedEmployee, optional)
```

- **`Employee`** — `email`/`mobile`/`passwordHash` were added specifically for the self-service Employee Portal (see [05-workflows.md](05-workflows.md)); `passwordHash` stays `null` until an admin manually sets a portal password (no invite-email flow — the admin just tells the employee their credentials).

- **`Attendance`** — `@@unique([employeeId, date])`: one row per employee per calendar day, whether it came from an admin marking it or the employee self-punching. `markedBy` (`ADMIN`/`SELF`) distinguishes the two, but **both write the same row** — an admin correction always overwrites `status`/`markedBy` but *keeps* the original punch's `punchedAt`/`latitude`/`longitude`/`selfieUrl` as an audit trail of what actually happened before the override.

- **`SalaryPayment`** — `@@unique([employeeId, periodMonth, periodYear])`: one row per employee per month. `grossSalary`/`netSalary` are **computed once and stored**, not a live view over `Attendance` — so a later attendance correction can't silently change an already-calculated (or already-paid) salary. Recalculating is an explicit action, and is blocked entirely once `paymentAmount > 0` for that month (see [`salary.service.ts`](../backend/src/modules/attendance/salary.service.ts)).

## What's deliberately *not* in the schema

- **No `stock_ledger` table** — replaced by `ItemUnit`'s own relations (see above).
- **No line items on `Invoice`** — reads live from `JobCard.parts`/`JobCard.labour`.
- **No payment fields on `Purchase`** — supplier payments are their own table (`SupplierPayment`), against the supplier's account. `Invoice` and `SalaryPayment`, by contrast, each still carry a single evolving payment snapshot on the row itself.
- **GST/tax fields exist but are unused** (`Invoice.taxRate`/`taxAmount`) — reserved for a future feature, not yet wired into any calculation.
