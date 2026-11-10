# 05 — Business Workflows

This traces the system's real processes end-to-end — frontend page → API call → service logic → database — rather than describing each layer in isolation. Read [02](02-database-schema.md)/[03](03-backend.md)/[04](04-frontend.md) first if a reference not covered here comes up.

## 1. Onboarding a customer & vehicle

`/dashboard/vehicles` (or `/dashboard/customers/[id]`) → `POST /customers` (if new) → `POST /vehicles`.

Nothing unusual here except normalization: registration numbers are uppercased and stripped of spaces before the uniqueness check, so `"hr06 ab 1234"` and `"HR06AB1234"` are the same vehicle. Neither Customer nor Vehicle can be hard-deleted — only `PATCH /:id/status` to toggle `isActive`, because Job Cards and Purchases reference them and history must survive.

## 2. Purchasing, stock & stickers

`/dashboard/purchases` → `POST /purchases` → [`purchases.service.ts#createPurchaseEntry`](../backend/src/modules/purchases/purchases.service.ts).

One purchase entry is one supplier and one bill, with **any number of items**. The form asks for the purchase type first. For an **expense** type there is no supplier: the entry is sent without `supplierId`, and the lines are description + amount. The service only requires a supplier when a line is an inventory type. Expenses are also listed on their own page, `/dashboard/expenses`. The request is multipart:
- `supplierId` (inventory only), `purchaseDate` and `remarks` are shared by every line.
- `lines` is a JSON array. Each line has an `itemType` and either an existing `itemId` or a `newItem` (name, category, UOM, min stock), plus `quantity`, `purchaseCost` (per unit) and an optional `sellingPrice` (MRP). Expense lines carry a `description` instead of an item.
- `bill` is an optional photo shared by all lines. Each new item can have its own photo as `itemPhoto_<line index>`. `uploadPurchaseFiles()` in `middleware/upload.ts` stores the bill with the other purchase bills and each item photo with the other item photos.

This is the single most business-critical write in the system, and it's the piece that changed most in the September 2026 rework (see [02-database-schema.md](02-database-schema.md#purchasing--inventory-phase-3-reworked-september-2026) for the *why*). **The whole entry is one `prisma.$transaction`**: every line saves or none does. For example, if item 3 fails, a new item created for item 1 is rolled back too. For each line:

1. **Inventory** `itemType` (`SPARE_PART`/`PAINT`/`TOOL`): if it's a new item, the `Item` is created first (Item Code derived from its own id). The item row is locked (`SELECT … FOR UPDATE`), the item's highest sticker number so far is read, and the `Purchase` row is created with the next range (`stickerFrom`/`stickerTo`; 10 of item `0001` after 8 earlier → `1.9`–`1.18`). `Item.currentStock` goes up by exactly that quantity, and `Item.purchaseCost`/`sellingPrice` are set to this purchase's values.
2. **Expense** `itemType` (`TRAVEL`/`PETROL`/`FOOD`/`OTHERS`): just the `Purchase` row with a `description`. No `Item`, no stickers, no stock change.
3. **Guardrail**: MRP (`sellingPrice`) can never be set below `purchaseCost`. It's checked here and again in `items.service.ts` for direct Item edits.

After saving, the page lists every sticker number to write (`<item number>.<n>`, `lib/stickers.ts`) with a *Print stickers* button. Every error names the line it's about (`"Item 2: MRP cannot be lower than purchase cost"`), and the frontend runs the same checks before sending.

## 2b. Supplier payments

`/dashboard/suppliers` → **Pay** → `POST /suppliers/:id/payments` (multipart, optional `proof` photo of the transaction) → [`suppliers.service.ts#recordSupplierPayment`](../backend/src/modules/suppliers/suppliers.service.ts). **Payment history** → `GET /suppliers/:id/payments`.

Payments are made against the supplier's running account, not a specific purchase. Each payment is its own `SupplierPayment` row, so the history shows every partial payment: date, amount, mode, reference, who paid, and the photo. The account (`totalPurchased`, `totalPaid`, `balanceDue`) is computed on every read and never stored, and it's also returned alongside each supplier in `GET /suppliers`.

A payment can't exceed the current balance due, which catches a mistyped extra zero. To check that safely, `recordSupplierPayment` locks the supplier row (`SELECT … FOR UPDATE`) for the whole check-and-insert. Without the lock, two payments entered at the same moment could each pass the check and together overpay. Like the other payment endpoints, `amount` is what's being paid *now*, never a running total.

A payment can also carry a **discount** the supplier gave (`discount`, default 0). It comes off the balance along with the amount, so the account is `balanceDue = totalPurchased − totalPaid − totalDiscount`. The amount can be 0 for a discount-only settlement, but not both. The overpay check covers payment + discount; editing a payment re-checks against the balance without that payment's old amount and discount.

Payment routes follow the Suppliers page's own permission (`SUPPLIERS`). Searching and adding suppliers also accepts `PURCHASES`, because the purchase form's supplier box can add a missing supplier inline.

## 2c. Starting a job card: find or add the vehicle

Dashboard → **New Job Card** → `/dashboard/vehicles?for=jobcard`. The Vehicles list shows each row's **New job card** link only in this flow (`?for=jobcard`), not on the plain Vehicles tab. Search the vehicle number first; capitals are forced as you type. **New vehicle** is offered only when no vehicle has exactly that number, and the searched number carries into the form, so it isn't typed twice. An RC photo is required. A vehicle added this way continues straight to the job card form, `/dashboard/jobcards?vehicleId=…`. That form keeps a draft on the device per vehicle until the job card is created. Once created, the job card's detail page **auto-saves** its details, findings and estimate about a second after typing stops. Blank fields clear on the server, since the update schema turns `""` into `null`. For an **Accidental Claim** job type, both the new job card form and the detail page also ask for the optional **insurance company** and **claim number** (`JobCard.insuranceCompany` / `claimNumber`). They print on the estimate and the GST invoice.

## 2d. Service schedule

`/dashboard/service-schedule` (`GET /service-schedule`, permission `JOB_CARDS` or `VEHICLES`) lists every active vehicle with its last general service (date, KM, job card), updated KM, and next service due date and KM. Each vehicle is flagged Passed, Due soon (within 30 days or 1,000 km), On track, or Not scheduled. `refreshVehicleService()` in `lib/serviceSchedule.ts` runs whenever a job card is created or its type, KM or status changes. It raises `currentKm` to the highest KM seen, and the latest non-cancelled General Service visit sets the next service to +6 months / +10,000 km from that visit. Cancelling that visit falls back to the previous one.

Since 2026-10-20 the due date is **estimated from average running**. Readings are job card visits (`kmAtService`) plus readings typed on the schedule page (`POST /service-schedule/:vehicleId/odometer {km, readingDate}` → `OdometerReading`, refused if lower than an earlier reading). Average km/day is taken over the whole history (first to latest reading, at least 7 days apart). From the latest reading it projects the day the vehicle reaches `nextServiceKm`; the estimated due date is the earlier of that and the 6-month date (`dueBasis` says which). Each row's **Update KM / Ask customer** panel takes a reading and offers a pre-written, editable WhatsApp message asking the customer for it. Vehicles due within 30 days (or overdue) are highlighted red, and the dashboard shows their count and list (`upcomingServices`, for users with `JOB_CARDS` or `VEHICLES`).

## 3. The Job Card lifecycle

This is the central workflow — `/dashboard/jobcards/[id]` is the most complex page in the app because it's driving all of the following through one status field plus several sub-resources.

### Statuses: Open, Closed, Cancelled

Defined in [`lib/jobCardStatus.ts`](../backend/src/lib/jobCardStatus.ts), enforced in [`jobCards.service.ts#updateJobCard`](../backend/src/modules/jobCards/jobCards.service.ts) and [`invoices.service.ts#closeJobCard`](../backend/src/modules/invoices/invoices.service.ts). On 2026-09-30 they were simplified from an eleven-step workflow (Draft → … → Completed → Invoiced → Ready for Delivery → Delivered → Closed). Since 2026-11-01 the app calls the second one **Closed**. It's still stored as `INVOICED`, and there's no separate draft invoice any more: **closing the job card makes its estimate the bill** (see *Closing* below).

```
OPEN ──(close job card)──> INVOICED (shown "Closed")
  ↑ ↓      <──(set back to Open)──
CANCELLED
```

- **Closed always comes with its bills.** `PATCH` with `status: "INVOICED"` (choosing *Closed* in the status dropdown) closes the job card. Closing makes or updates the bills, keeping the customer's discount for a reopened job card, in the same transaction as the status change (`jobCards.controller.ts#update` → `closeJobCard`). **Close job card** does the same through `POST /job-cards/:id/close` with an optional discount (`/invoice` is the old name, still accepted). The job card row is locked while closing, so two closes at once can't make bills twice. On the page, both the button and choosing *Closed* in the dropdown open the **Close job card** box. It shows the checks, the discount and an optional **payment received now** (amount, mode, reference, received by). The payment is sent as `payment` (same fields as `POST /invoices/:id/payments`) and recorded on the customer's bill in the same transaction. If it can't be (more than is due), nothing is closed. It needs the same permission as any payment (Bills & Payments, Customers or Vehicles).
- **Closed can be set back to Open** to change parts or labour; the page asks for confirmation. The bills stay. Closing again **updates the same bills**: same numbers, same payments. It refuses a bill total below what's already been paid on it. **Not once a GST invoice has been made** from the estimate: that's final. A billed job card can't be cancelled.
- **Cancelled can be reopened** to Open. While cancelled, parts and labour are locked and it can't be closed.
- **At least one labour / service line** is required to close.
- **Mandatory before/after photos** are checked at closing: all four mandatory angles (`FRONT`/`REAR`/`LEFT`/`RIGHT`) for both the `BEFORE` and `AFTER` phases. This is `assertMandatoryPhotos()`.
- **Job types**: General Service, Accidental Claim, AC, Dent & Paint, Mechanical, Detailing (`DETAILING`) and Setting & Adjustment (`SETTING_ADJUSTMENT`); the last two were added 2026-11-01. The labels are shared in `frontend/src/lib/jobTypes.ts`. On a closed job card, switching to or from Accidental Claim moves lines between the customer's and insurance company's bills. This is refused once a GST invoice exists.

#### Vehicle trial agreement and gate pass

The job card page has two printable slips, signed on paper, each with **Print**, **Download PDF** and **Share on WhatsApp** (`components/SignOffSlip.tsx`). A photo of the signed copy is uploaded back with `POST /job-cards/:id/sign-off/trial` or `/sign-off/gate-pass` (multipart `photo`, stored under `job-card-sign-offs`). A later photo replaces the earlier one, and the first sign-off time is kept.

- **Vehicle trial agreement** (*वाहन ट्रायल अनुमति एवं अस्थायी सुपुर्दगी पत्र*, `components/TrialAgreement.tsx`), any time before the job card is cancelled. This is the Hindi letter the customer signs before taking the vehicle out on trial: their details and the vehicle's, the conditions, the return details, the legal-action clause and the signatures. The system fills in the job card number, date, customer name, mobile and address, registration number, model and KM. It also fills in what's entered above the letter: the workshop representative (`trialBy`), fuel level (`trialFuelLevel`), trial area (`trialArea`) and return date and time (`trialReturnBy`), all saved with `PATCH /job-cards/:id` (migration `20261109090000_trial_agreement`). Anything not entered, such as the handover and return times and the signatures, is a blank line to fill by hand. The photo sets `trialPhotoUrl`/`trialAt`. The older `trialRemarks` column is kept but no longer shown.
- **Gate pass**, only once the job card is closed. It shows each bill as paid or what's still due. It says the vehicle may leave, with the customer's receipt of the vehicle. The photo sets `gatePassPhotoUrl`/`gatePassAt` and marks the job card delivered (`deliveredAt`, if not already set).
- **Assignment validation**: `assignedEmployeeId` must reference an active employee.
- Side effects: `estimateAmount`/`estimateApproved`/`estimateApprovedAt` are kept in step by the estimate (below), and setting `finalInspectionStatus` stamps `finalInspectionAt`. `deliveredAt` is set by the signed gate pass.

The migration `20260930110000_simplify_job_card_statuses` converted existing job cards by what was actually true of them. Any job card with an invoice became Invoiced, a cancelled one without an invoice stayed Cancelled, and everything else became Open.

### The lock: the status

`jobCardParts.service.ts#assertJobCardEditable` (also used for labour) refuses changes while the status is `INVOICED` (Closed) or `CANCELLED`. A closed job card is edited by setting it back to Open, and its estimate and bills catch up when it's closed again. The status can't be set to Closed except by closing the job card, so the status is a reliable lock. A closed job card's estimate is locked too: its lines follow the job card.

### Estimates

`/dashboard/jobcards/[id]` → *Create estimate* → `POST /job-cards/:jobCardId/estimate` → [`estimates.service.ts`](../backend/src/modules/estimates/estimates.service.ts), then `/dashboard/estimates/[id]`.

Creating copies the job card's parts and labour so far into `EstimateLine`s (calling it again returns the existing estimate). While it's a `DRAFT`: `POST /estimates/:id/lines` adds an inventory part (`itemId`; name and MRP fill in), a part not in inventory (`description` + `rate`) or labour; `DELETE /estimates/:id/lines/:lineId` removes one; `PATCH /estimates/:id` sets `taxRate`/`notes`. Lines never touch stock. The page is printable and downloads as `EST-000123_<car number>_<date>.pdf`, with signature spaces for the customer and the workshop. `POST /estimates/:id/approval` (multipart `photo` of the signed copy) marks it `APPROVED` and locks it; the photo can be replaced later. The job card, the vehicle's service history (`GET /vehicles/:id/service-history` includes `estimate`) and the backup/Excel export all link to it. Every change also updates the job card's `estimateAmount`/`estimateApproved`/`estimateApprovedAt`. **Share on WhatsApp** (`components/SharePdfButton.tsx`) makes the same PDF. On a phone it opens the share sheet with the PDF attached. On a computer it downloads the PDF and opens WhatsApp to the customer with a message ready, and the PDF is attached there by hand.

#### Closing: the estimate becomes the bill

`invoices.service.ts#closeJobCard` runs, in one transaction with the job card row locked:

1. `estimates.service.ts#syncEstimateWithJobCard` makes the estimate exactly the job card's parts and labour, creating the estimate if there isn't one.
   - Each estimate line remembers the job card line it was copied from (`EstimateLine.jobCardPartId`/`jobCardLabourId`), so a line keeps its HSN, GST % and who pays.
   - Lines that aren't on the job card (quote-only lines) are dropped.
   - If a GST invoice was already made from the estimate, its lines are left alone.
2. `syncBills` makes or updates one `Invoice` row per payer. The customer's bill is the customer's lines minus the discount. On an accidental claim, the insurance company's bill is the insurance company's lines.
3. The status becomes `INVOICED`.

The page then opens the estimate. The **Estimates** tab (`/dashboard/estimates`, `GET /estimates?q=&payment=`) lists every estimate with the car (make, model, variant) and each one's total, paid and due once closed. It can be filtered by payment: `PENDING` (closed, with money due on either bill), `PAID` (closed, nothing due) or `OPEN` (job card not closed yet). The search also matches the car make and model. It replaces the Draft Invoices tab, and old draft invoice links open the estimate. The estimate page shows **Estimate & bill**: the lines (insurance lines tagged), the discount, the total, what the insurance company and the customer each pay, and what's paid and due. Each bill has its own payment form, history and change log (`components/EstimateBills.tsx`, still `POST /invoices/:id/payments`).

The migration `20261101090000_estimate_is_the_bill` gave every job card that already had a draft invoice an estimate matching it. That estimate got the job card's parts and labour, unless a GST invoice had already been made from it. Existing invoices became the customer's bills, with the same amounts, numbers and payments.

#### Accidental claims: customer scope and insurance scope

On an Accidental Claim job card, the estimate has a **Customer / Insurance** tab. Each line is billed wholly to the customer or to the insurance company (`EstimateLine.scope`: `CUSTOMER` | `INSURANCE`, saved with `PATCH /estimates/:id/gst` `lines:[{id, scope}]`).

- On a closed job card, saving moves the amounts between the two bills. The customer's discount stays on the customer's bill.
- An insurance bill can't be emptied while payments are recorded on it.
- Any other job type bills every line to the customer, and the server refuses `INSURANCE` there.
- The customer and vehicle accounts (Customers and Vehicles pages) show only the customer's bills. The insurance company's share is on the estimate.

#### GST invoice tab

The estimate page has a second tab, **GST Invoice** (`components/GstInvoice.tsx`). It turns the estimate into a tax invoice with **HSN/SAC** and **GST %** per line, plus **CGST, SGST and IGST** columns per item. Lines take their HSN and GST % from the item (`Item.hsnCode`/`gstRate`, set on the Items form or a purchase's new-item form). Labour defaults to 18% and SAC 998714. All of them can be changed on the tab: `PATCH /estimates/:id/gst` saves `{supplyType: INTRA|INTER, pricesIncludeGst, customerGstin, lines:[{id, hsnCode, gstRate}]}`.

- **Within the state**, a line's GST splits half CGST and half SGST.
- **To another state**, it's all IGST.
- If **prices include GST**, the taxable value is `amount ÷ (1 + rate)`. Otherwise GST is added on top.

The tab also shows a tax summary by rate, a rounded total and the amount in words.

**Generate GST invoice number** (`POST /estimates/:id/gst-invoice` `{payer?}`) needs the job card closed and a GST % on every line of that payer. It assigns `GST/<FY>/0001`, numbered in sequence within the April–March financial year across both kinds, under an advisory lock.

On an accidental claim there are **two GST invoices**. The GST tab shows both side by side, each with its number or *not generated yet*, and a **Generate both GST invoices** button. That button first saves the GST details shown for any line that doesn't have them yet (18%, and SAC 998714 for labour), then generates each invoice in turn:
- **The customer's**, covering the customer's lines (`gstInvoiceNumber`, `customerGstin`).
- **The insurance company's**, covering its lines (`insuranceGstInvoiceNumber`, `insuranceGstin`). It's billed to the insurer, with the claim number and the insured customer.

**Locks once an invoice is generated:**
- A payer's GST invoice fixes that payer's HSN/GST % and GSTIN.
- Either invoice fixes the supply type, whether prices include GST, and who pays for each line.
- Either invoice also stops the job card from being reopened. The invoice header comes from **Settings → Business details** (`GET/PUT /settings/business`, stored in `AppSetting`; anyone can read it, only an admin can change it).

### Parts: by item code and quantity

Since 2026-10-20 the quantity can be **part of a unit** (0.5 L of oil): job card parts, labour and estimate lines, and `Item.currentStock`, are decimals. Every stock change goes through `lib/stock.ts` (`takeStock`/`addStock`), which rounds to 3 decimals in SQL so repeated changes can't drift. A part can also be **not in inventory** — bought outside for this job: `POST /job-cards/:jobCardId/parts` `{description, rate, quantity}` with no `itemId`. It's billed like any part but touches no stock (`JobCardPart.itemId` is null).

`/dashboard/jobcards/[id]` → type the item code (`GET /item-lookup/:code` shows the item, MRP and available quantity; `2`, `02` and `0002` all find `0002`) and the **Qty used** → `POST /job-cards/:jobCardId/parts` `{itemId, quantity}` → [`jobCardParts.service.ts#addPart`](../backend/src/modules/jobCards/jobCardParts.service.ts).

Inside one transaction:
1. `assertJobCardEditable` — the lock check above.
2. A **single conditional `UPDATE`** (`SET current_stock = current_stock - qty WHERE id = ? AND current_stock >= qty`), not a read-then-write, so two job cards using the last few pieces at the same moment can't take more than there is. If no row is updated: `ConflictError("Only N … available — can't use X")`.
3. Creates the `JobCardPart` with `rate` = the item's MRP **right now** and `amount = quantity × rate` (never recomputed later).

Removing a part (`DELETE /job-cards/:jobCardId/parts/:partId`, only while Open) puts its quantity back into stock.

Example: 10 available, use 2 → 8 available; trying to use 50 is refused with no stock change.

### Labour

Simple — `POST/DELETE /job-cards/:jobCardId/labour`, same lock check, `amount = quantity × rate` computed server-side, no stock implications.

## 3a. Purchases: paying the supplier at the end of the entry

A purchase entry from a supplier can carry a **Payment to supplier** section at the end: amount paid, discount, mode, reference and paid by. **Paid in full** fills in the entry's total. It's sent as a JSON `payment` field with the purchase (`POST /purchases`). It's saved in the same transaction as a `SupplierPayment`, dated the purchase date, through `suppliers.service.ts#recordSupplierPaymentTx`. The usual check applies: payment + discount can't exceed what's due to the supplier, including this purchase. If that check fails, nothing is saved, not even the purchase. Leave the section empty for a purchase on credit.

## 3b. Daily Sales & Purchases report

`/dashboard/reports` → **Daily Sales & Purchases** (admin) → `GET /reports/daily?date=YYYY-MM-DD` → [`reports/dailyReport.ts`](../backend/src/modules/reports/dailyReport.ts). For one day on the workshop's calendar: every draft invoice dated that day with its parts, non-inventory and labour lines, discount, tax, total, received, outstanding and payments; every customer payment received that day (totals by mode); and every purchase line with item code, brand, specification, quantity, rate, amount and the supplier's balance (supplier payments go against the account, not a purchase). Only invoices whose job card is Invoiced count in the totals — one whose job card was set back to Open is listed as "being revised". Print hides the app chrome; **Export Excel** writes a workbook with Summary, Sales, Sale Lines, Payments Received and Purchases sheets in the browser (`lib/excel.ts`, ExcelJS loaded on demand). All report exports, and the Purchases and Expenses month lists, export to Excel.

The range buttons are Today, This month and **All time** (from 2020-01-01). Bills are listed by their estimate number, and an insurance company's bill is marked *(Insurance)*. **Share on WhatsApp** (`lib/shareReport.ts#shareFile`) works like this:
- On a phone, the share sheet opens with the Excel file and a summary.
- On a computer, the Excel file downloads and WhatsApp opens with the summary, ready for the file to be attached.
- If a phone refuses because preparing the file took too long after the tap, the button says *Ready — tap to share*.

**Share complete data (Excel)** shares the full workbook of every table, kept fresh by the server (`GET /backup/excel`, admin).

**Payment corrections** (admin): `PATCH`/`DELETE /invoices/:id/payments/:paymentId` and `/suppliers/:id/payments/:paymentId` adjust the running totals in the same transaction (an edit can't overpay) and write a `PaymentAudit` row with the before/after values. The change log shows under the payment history (`GET /invoices/:id/payment-audits`, `GET /suppliers/:id/payment-audits`) and in the full Excel export's *Payment Changes* sheet.

## 4. Bills & the payment-snapshot pattern

Since 2026-11-01 there's no draft invoice in the app. An `Invoice` row is the money side of a closed job card's estimate: one per payer, the customer and (on an accidental claim) the insurance company. Closing is described in §3 above. Routes and tables are still `invoices`. The rest of this section describes how those rows work. The old invoice page (`/dashboard/invoices/[id]`) now opens the estimate; it shows the old layout only for a bill without an estimate.

**Viewing and downloading:** the invoice page (`/dashboard/invoices/[id]`) has *Print* and *Download PDF*. The Invoices list has *View* and *Download* on every row. Download renders the on-screen invoice to an A4 PDF in the browser (`lib/invoicePdf.ts`, using `html2pdf.js`, which loads only when a download is requested). The file is named `<car number>_<DD-MM-YYYY>.pdf`, for example `HR06AB1234_30-09-2026.pdf`. The page title is set to the same name, so the browser's own Print → Save as PDF suggests it too. `?download=1` on the invoice page starts the download automatically; that's how the list's Download link works.

One transaction: reads `parts`/`labour` **live** from the job card (safe because the job card is about to be locked by this same transaction), computes `partsTotal + labourTotal - discount` (discount validated to be within `[0, subtotal]`), creates the `Invoice` and assigns `INV-000123` — or, for a job card that was reopened, updates its existing invoice instead — and — critically — sets `JobCard.status = "INVOICED"` **in the same transaction**. This last write is what actually locks the job card; everything else (parts/labour services checking `isLocked()`) is downstream of it.

Invoice math is worth knowing precisely if you ever touch this: `Parts + Labour − Discount = Total`, no tax applied yet (`taxRate`/`taxAmount` columns exist but nothing writes to them — reserved for a future GST feature).

### Customer payments and their history

`POST /invoices/:id/payments` records one payment. It adds an `InvoicePayment` row and increments `Invoice.paymentAmount` in the same transaction, with the invoice row locked so two simultaneous payments can't together overpay. Payments can be taken from:
- the **invoice page**: totals, a payment form, and that invoice's payment history;
- the **Customers** and **Vehicles** pages: each row shows Invoiced / Paid / Due, and **Pay** or **Payment history** opens an account panel (`components/InvoiceAccountPanel.tsx`) with a payment form against a chosen unpaid invoice, every invoice with what's due, and the full payment history (`GET /customers/:id/account`, `GET /vehicles/:id/account`);
- the **customer detail page**, where the same panel sits permanently.

A payment can carry a **discount** (`InvoicePayment.discount`), for example ₹950 received and ₹50 let go. The discount is written off the invoice: `Invoice.discount` goes up and `totalAmount` goes down by the same amount, so every "due" stays `totalAmount − paymentAmount`. Editing or deleting the payment moves those numbers back. The amount can be 0 for a discount-only settlement, and payment + discount can't exceed what's due. The payment history, the change log, the daily report and the Excel export all show the discount.

A payment always belongs to one specific invoice, so each invoice's Pending/Partial/Paid stays exact. Recording one therefore accepts any of the `INVOICES`, `CUSTOMERS` or `VEHICLES` permissions, while opening the invoice itself still needs `INVOICES`.

`SalaryPayment` still uses the older single-snapshot pattern: a running `paymentAmount` on the row, with `Pending`/`Partial`/`Paid` computed.

**The one rule that matters if you ever touch these endpoints**: `PATCH .../payment`'s `paymentAmount` is *what's being paid right now*, added on top of whatever's already recorded. It is **never the new cumulative total**. This was a real bug, since fixed (see the root README's recent commits): a caller that passed the running total would silently double-count every payment after the first. `recordInvoicePayment`, `recordSalaryPayment` and `recordSupplierPayment` all reject anything that would overpay with a `ConflictError`.

## 5. Reports & the Dashboard

`/dashboard` and `/dashboard/reports` both read live from Postgres on every request — nothing is precomputed or cached. `reports.service.ts`'s `getDashboardSummary()` returns open job cards (`status = OPEN`), invoices generated today, job cards cancelled this month, today's sales and purchases, stock alerts, and this month's purchase total.

The Reports page's CSV export ([`lib/csv.ts`](../frontend/src/lib/csv.ts)) is entirely client-side — no server export endpoint — it just serializes whatever JSON the report endpoint already returned.

## 6. Attendance → Salary, and the Employee Portal

Two ways attendance gets marked, writing to the **same** `Attendance` table (`@@unique([employeeId, date])`):

- **Admin marking** (`/dashboard/attendance` → `POST /attendance` `{employeeId, date, status}`): first mark of the day creates the row (`markedBy: "ADMIN"`); a second call for the same day is treated as a *correction* (`correctedById` set to the acting admin). Below the day's sheet, a **Month summary** (`GET /attendance/month-summary?month&year`) shows each active employee's columns for the month of the chosen date:
  - total days in the month;
  - present, half day, absent and leave counts;
  - days not marked so far;
  - total present, with a half day counting ½.
- **Employee self-punch** (`/portal` → `POST /employee-portal/attendance/punch`, employee-token auth): captures GPS coordinates (browser Geolocation API) and an optional selfie, sets `status: "PRESENT"`, `markedBy: "SELF"`. Refuses a second punch the same day (`punchedAt` already set → `ConflictError`).

**An admin correction always wins**: `markAttendance()` always writes `markedBy: "ADMIN"` and the new status, but explicitly preserves the *original* punch's `punchedAt`/`latitude`/`longitude`/`selfieUrl` as an audit trail of what the employee actually did before being overridden. The reverse also happens naturally: if an admin pre-marks someone `ABSENT` before they arrive, their later self-punch overwrites it back to `PRESENT` with `markedBy: "SELF"` — the live punch is treated as the more authoritative signal that they're actually here.

**Salary calculation** (`/dashboard/salary` → `POST /salary/calculate` `{employeeId, month, year}`):
```
perDayRate = monthlySalary / daysInThatMonth
availableLeave = openingLeave + monthlyLeaveAllowance
unpaidLeaveDays = max(0, leaveDays - availableLeave)
closingLeave = max(0, availableLeave - leaveDays)        → next month's openingLeave
deductionDays = absentDays + 0.5 × halfDays + unpaidLeaveDays
advances = sum of EmployeeAdvance.amount charged to this month
netSalary = max(0, monthlySalary - deductionDays × perDayRate - advances)
```

**Half days** (`HALF_DAY`, since 2026-10-20) deduct half a day's pay. **Unused leave carries forward** (`salary.service.ts#leaveBalanceFor`): each month opens with the previous month's closing balance, starting at 0 in the employee's first month (the later of joining and their first attendance mark). A month whose salary has been calculated stores its `openingLeaveBalance`/`closingLeaveBalance`, and later months use that stored closing figure — so a balance is never counted twice and a calculated month never shifts. Months not yet calculated are worked out from their attendance.

**Optional in/out times** (`Attendance.inTime`/`outTime`, "HH:MM") can be entered on the sheet once the day's status is marked; out must be after in. **Advances** take an optional remark (`notes`).

**Previous dates are admin-only**: `POST /attendance` refuses a date before today (the server's calendar) for anyone but an admin (`ForbiddenError`), and the attendance page disables the buttons to match.

**Advances** are entered in the attendance sheet's "Advance paid" column (`POST /advances`), and each row's history column lists that month's advances. An advance is charged to the month it was given. If that month's salary has already started being paid, it's too late to deduct there, so it's charged to the next unpaid month and the page says so. Recording or removing an advance recalculates that month's salary automatically, but only while it's calculated and unpaid, the same rule as manual recalculation. The advances charged to one month can't total more than the monthly salary; the employee row is locked during that check.
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
