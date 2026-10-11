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
- **Mobile numbers** (customer mobile/WhatsApp, supplier, employee) are exactly 10 digits, validated by the shared `mobileSchema` in `lib/phone.ts`. Input is cleaned first: spaces, dashes and a leading `+91`/`91`/`0` are dropped. The frontend's `MobileInput` component applies the same clean-up as you type. The rule only applies to new writes; numbers stored before 2026-09-30 are left as they were.
- **`Vehicle`** — `registrationNumber` is globally unique. The service layer normalizes it (uppercase, no spaces) before the uniqueness check, so `"hr06 ab 1234"` and `"HR06AB1234"` collide as the same vehicle; the frontend also forces capitals as you type. `rcPhotoUrl` (a photo of the registration certificate) is required when a vehicle is added; vehicles added before 2026-09-30 may lack it. `nextServiceDue`/`nextServiceKm` are the next general service: entered when the vehicle is added, then moved on automatically by each General Service job card (`lib/serviceSchedule.ts`, +6 months / +10,000 km). `currentKm` rises with the highest KM seen on any visit.
- **`Item`** — the parts/consumables catalog. `itemCode` is a 4-digit number (`0001`, `0002`, …) generated server-side from the row's own `id` right after insert — never typed by a user, so it can never collide (same pattern used for `JobCard`/`Invoice`/`Estimate` numbers). It's what staff type on a job card to use the item. `currentStock` is the **available quantity**, a denormalized counter: it's incremented/decremented transactionally alongside every purchase and every parts issue/removal ([`purchases.service.ts`](../backend/src/modules/purchases/purchases.service.ts), [`jobCardParts.service.ts`](../backend/src/modules/jobCards/jobCardParts.service.ts)), so it's always in sync.
- **`Supplier`** — master for Purchases, and the account that supplier payments are made against (see `SupplierPayment` below).

## Purchasing & inventory (Phase 3, reworked September 2026)

```
Supplier ──< Purchase >── Item
         ──< SupplierPayment
```

Stock is a **quantity per item** (since 2026-10-11): one item = one item code, a purchase adds its quantity, and a job card part takes a quantity out. Every physical piece still gets a sticker, numbered `<item number>.<n>` — 10 of item `0001` are stickers `1.1`–`1.10`, and the next purchase of it continues at `1.11`. (From 2026-09-15 to 2026-10-11 there was instead one `ItemUnit` row per physical piece, each with its own serial; the migration `20261011090000_quantity_stock_and_estimates` converted that data: each issued piece became a quantity-1 job card part at the price it was issued at, each past purchase got its sticker range, item codes became 4-digit, and `item_units` was dropped.)

- **`Purchase`** — one row per purchased line. A single purchase entry in the UI (one supplier, one bill) can contain several items; each becomes its own `Purchase` row sharing `supplierId`, `purchaseDate`, `billUrl` and `remarks`, all created in one transaction. `itemType` is one of:
  - Inventory types: `SPARE_PART`, `PAINT`, `TOOL` — these reference an `Item` and add `quantity` to its stock. `stickerFrom`/`stickerTo` are this purchase's range of the item's sticker numbers, assigned under a row lock on the item so two purchases of the same item can't overlap.
  - Expense types: `TRAVEL`, `PETROL`, `FOOD`, `OTHERS` — no `Item`, just a `description` and a cost; no stock implications at all.

  `supplierId` is **optional** (since 2026-09-30). The service requires it for inventory types, and expenses are recorded without one, because petrol or food isn't bought on a supplier's account. Expenses recorded before then may still have a supplier, and those keep counting toward that supplier's balance. The foreign key stays `ON DELETE RESTRICT`.

  `purchaseCost` is the **per-unit** rate for inventory lines (the line total is `quantity × purchaseCost`) and the total for expense lines (quantity is always 1). `sellingPrice` is labelled **MRP** in the UI, and can't be below `purchaseCost`. Purchases carry **no payment fields** — payment is tracked per supplier, below.

- **`SupplierPayment`** (added 2026-09-29) — one row per payment made to a supplier: `amount`, `paymentDate`, `paymentMode`, `reference`, `paidBy`, `proofUrl` (photo/screenshot of the transaction), `notes`, and `createdById`. Payments go against the supplier's **running account**, not against any one purchase, because that's how the workshop actually pays ("₹20,000 towards the balance"). The account is always computed and never stored: `totalPurchased` (sum of `quantity × purchaseCost` over the supplier's purchases) minus `totalPaid` (sum of these rows) = `balanceDue`. Because each payment is its own row, the full partial-payment history is kept. Before this table existed, each purchase stored one accumulated payment total. The migration `20260929130000_supplier_payments` copied each paid purchase into one row here, noted "Recorded against purchase #N", and then dropped those columns.

- An item's history is its `Purchase` rows (what came in, with sticker ranges) and its `JobCardPart` rows (what was used, on which job card). **Purchased qty** is the sum of its purchases' `quantity`; **available qty** is `currentStock`.

## Job Cards (Phase 4, reworked September 2026)

```
Vehicle ──< JobCard ──< JobCardMedia
                    ├──< JobCardPart >── Item
                    ├──── Estimate (1:1) ──< EstimateLine >── Item (optional)
                    ├──< JobCardLabour
                    └──── Invoice (1:1)
Employee ──< JobCard   (assignedEmployee, optional)
```

- **`JobCard`** — the central sales-side workflow record. `jobCardNumber` (`JC-000123`) follows the same derive-from-own-id pattern as `Item`. `status` is a plain string (same reasoning as `Role`), one of `OPEN`, `INVOICED` or `CANCELLED`, defined in [`lib/jobCardStatus.ts`](../backend/src/lib/jobCardStatus.ts). These replaced an eleven-step workflow on 2026-09-30. `INVOICED` and `CANCELLED` are `LOCKED_STATUSES`: while in either, parts and labour can't be added or removed. Invoiced is reached only by generating the draft invoice. Since 2026-10-11 an invoiced job card can be set back to `OPEN` to change it; invoicing it again updates the same invoice. A job card with an invoice can't be cancelled. See [05-workflows.md](05-workflows.md) for the rules.

  The September 2026 rework added: `jobType`, `expectedDelivery`, `inspectionFindings` (initial inspection), an estimate/approval step (`estimateAmount`, `estimateApproved`, `estimateApprovedAt` — since 2026-10-11 these are kept in step with the job card's `Estimate` and not edited directly), work assignment (`assignedEmployeeId` → `Employee`), a final inspection sign-off (`finalInspectionStatus`, `finalInspectionBy`, `finalInspectionAt`), and `deliveredAt`.

- **`JobCardMedia`** — inspection photos/video. `angle` (FRONT/REAR/LEFT/RIGHT/ROOF/INTERIOR/DASHBOARD/GLOVE_BOX/BOOT/WALKAROUND/OTHER) and `phase` (`BEFORE`/`AFTER`) together enforce the workshop's mandatory before/after comparison shots — see [`assertMandatoryPhotos()`](../backend/src/modules/jobCards/jobCards.service.ts) in the workflow doc.

- **`JobCardPart`** — one row per item used: `quantity` taken out of stock, `rate` (the item's MRP at that moment) and `amount` (`quantity × rate`). Both are captured **at the moment of use** and never recomputed — a later price change on the Item can't silently change what an already-issued job card is worth.

- **`JobCardLabour`** — simple description/technician/quantity/rate lines, `amount` computed server-side (`quantity × rate`).

- **`Estimate`** (added 2026-10-11) — the customer estimate, at most one per job card (`jobCardId @unique`). `estimateNumber` follows the `EST-000123` pattern. `taxRate` (optional %) and `notes` print on it. `status` is `DRAFT` or `APPROVED`; it becomes `APPROVED` when a photo of the customer-signed copy is uploaded (`approvalPhotoUrl`, `approvedAt`), and is locked from then on. Its **`EstimateLine`** rows are `PART` or `LABOUR` lines with `description`/`quantity`/`rate`/`amount`; a part line has an `itemId` when it's from inventory, and none when it's a part the workshop doesn't stock. Creating an estimate copies the job card's parts and labour so far. Estimate lines never touch stock. Totals are computed, never stored.

## Invoices (Phase 5)

- **`Invoice`** (shown as **Draft Invoice** in the app) — 1:1 with `JobCard` (`jobCardId @unique`, DB-enforced — a job card only ever has one; re-invoicing a reopened job card updates it, keeping its number and payments, and its total can't go below what's already been paid). Deliberately **has no line-item tables of its own**: parts and labour are read live from the job card's own (already-locked) records at invoice-generation time, so an invoice can never show numbers different from the job card it came from. `invoiceNumber` follows the `INV-000123` pattern. `taxRate`/`taxAmount` exist, unused, so GST support can be added later without a schema migration touching this table's shape. Each customer payment is its own **`InvoicePayment`** row (added 2026-09-30): `amount`, `paymentDate`, `paymentMode`, `reference`, `receivedBy`, `notes`, `createdById`. That keeps the full history. `Invoice.paymentAmount` is their running total, updated in the same transaction as every payment, with the invoice row locked. `Pending`/`Partial`/`Paid` is computed from `paymentAmount` vs. `totalAmount` and never stored. Before this, each invoice held only its running total plus the last payment's details. The migration `20260930120000_invoice_payment_history` turned each paid invoice into one payment row, noted "Recorded before payment history was kept", and dropped those columns. A customer's or vehicle's account (invoiced / paid / due) is computed from its invoices.

## HR: Attendance → Salary (Phase 6, expanded with the Employee Portal)

```
Employee ──< Attendance
         ──< SalaryPayment
         ──< JobCard (assignedEmployee, optional)
```

- **`Employee`** — `email`/`mobile`/`passwordHash` were added specifically for the self-service Employee Portal (see [05-workflows.md](05-workflows.md)); `passwordHash` stays `null` until an admin manually sets a portal password (no invite-email flow — the admin just tells the employee their credentials).

- **`Attendance`** — `@@unique([employeeId, date])`: one row per employee per calendar day, whether it came from an admin marking it or the employee self-punching. `markedBy` (`ADMIN`/`SELF`) distinguishes the two, but **both write the same row** — an admin correction always overwrites `status`/`markedBy` but *keeps* the original punch's `punchedAt`/`latitude`/`longitude`/`selfieUrl` as an audit trail of what actually happened before the override.

- **`EmployeeAdvance`** (added 2026-09-30): money paid to an employee ahead of salary, entered from the attendance sheet. There's one row per advance (`amount`, `date` given, `createdById`), so the history is kept. `salaryMonth`/`salaryYear` record which month's salary it comes out of. That's normally the month it was given, but it's the next unpaid month if that month's salary was already being paid. The advances charged to a month can't total more than the employee's monthly salary.

- **`SalaryPayment`** — `@@unique([employeeId, periodMonth, periodYear])`: one row per employee per month. `advanceDeduction` stores the advances charged to that month at calculation time. `grossSalary`/`netSalary` are **computed once and stored**, not a live view over `Attendance` — so a later attendance correction can't silently change an already-calculated (or already-paid) salary. Recalculating is an explicit action, and is blocked entirely once `paymentAmount > 0` for that month (see [`salary.service.ts`](../backend/src/modules/attendance/salary.service.ts)).

## What's deliberately *not* in the schema

- **No `stock_ledger` table** — an item's purchases and job card parts are its history (see above).
- **No line items on `Invoice`** — reads live from `JobCard.parts`/`JobCard.labour`.
- **No payment fields on `Purchase`** — supplier payments are their own table (`SupplierPayment`), against the supplier's account. Invoice payments likewise have their own history table (`InvoicePayment`). Only `SalaryPayment` still carries a single evolving payment snapshot on the row itself.
- **GST/tax fields exist but are unused** (`Invoice.taxRate`/`taxAmount`) — reserved for a future feature, not yet wired into any calculation.
