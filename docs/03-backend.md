# 03 — Backend

Entry points: [`src/server.ts`](../backend/src/server.ts) (starts the HTTP server + the Excel export scheduler) and [`src/app.ts`](../backend/src/app.ts) (the Express app itself — every route is mounted there, so it's the fastest way to see the whole API surface at a glance).

## Folder structure

```
backend/src/
├── app.ts                 — middleware pipeline + route mounting
├── server.ts               — app.listen() + starts the background Excel export job
├── config/env.ts           — Zod-validated process.env, read once at startup
├── lib/
│   ├── jwt.ts               — sign/verify for both staff and employee tokens
│   ├── refreshToken.ts      — opaque refresh token generation/hashing
│   ├── errors.ts            — AppError + 4 subclasses (Unauthorized/Forbidden/NotFound/Conflict)
│   ├── permissions.ts       — the PERMISSIONS constant (grantable modules)
│   ├── pagination.ts        — parsePageParams / toSkipTake shared by every list endpoint
│   ├── jobCardStatus.ts     — job card statuses (Open / Invoiced / Cancelled) and which ones lock editing
│   ├── phone.ts             — the shared 10-digit mobile number validator
│   ├── backup.ts            — JSON backup/restore of every business table
│   ├── excelExport.ts       — builds the one-tab-per-table Excel workbook
│   ├── excelExportScheduler.ts — regenerates it every 60s
│   └── prisma.ts            — the shared PrismaClient instance
├── middleware/
│   ├── authenticate.ts        — verifies a staff (admin/store-user) JWT
│   ├── authenticateEmployee.ts — verifies an employee-portal JWT
│   ├── authorize.ts            — role gate (used only for ADMIN-only routes)
│   ├── requirePermission.ts    — per-module permission gate
│   ├── validate.ts             — Zod schema → req.body, or throws
│   ├── upload.ts               — multer config (local disk or R2), image vs. media (video) variants
│   └── errorHandler.ts         — central error → HTTP response mapping, + asyncHandler wrapper
└── modules/                  — one folder per business domain, each with controller.ts / service.ts / routes.ts
```

Every module follows the same three-file shape: **`routes.ts`** wires up middleware + Zod schemas to Express routes, **`controller.ts`** parses the request and calls the service, **`service.ts`** does the actual Prisma/business logic. Controllers never touch Prisma directly; services never touch `req`/`res`.

## Request pipeline (`app.ts`)

```
cors (origin allowlist from CORS_ORIGIN, credentials: true)
  → express.json()
  → cookieParser()
  → /uploads static file serving
  → GET /api/health
  → one router per module, each self-guarded with its own authenticate/authorize middleware
  → notFoundHandler (404 JSON for anything unmatched)
  → errorHandler (catches everything thrown/rejected upstream)
```

`CORS_ORIGIN` is comma-separated specifically because Vercel hands out several valid origins at once (production alias, git-branch URL, per-deployment URLs).

## Auth & sessions

Two **completely separate** token systems exist, tagged with a `type` claim so one can never be used against the other's routes even if both happen to be signed with the same secret ([`lib/jwt.ts`](../backend/src/lib/jwt.ts)):

| | Staff (admin dashboard) | Employee (self-service portal) |
|---|---|---|
| Token `type` claim | `"staff"` | `"employee"` |
| Access token lifetime | 15 min (`JWT_ACCESS_EXPIRES_IN`) | 12 h |
| Refresh mechanism | Rotating opaque refresh token, httpOnly cookie, hashed in `RefreshToken` table | None — just re-login |
| Verified by | `middleware/authenticate.ts` | `middleware/authenticateEmployee.ts` |
| Payload | `{ userId, role, permissions }` | `{ employeeId }` |

**Staff login flow** ([`auth.controller.ts`](../backend/src/modules/auth/auth.controller.ts), [`auth.service.ts`](../backend/src/modules/auth/auth.service.ts)):
1. `POST /api/auth/login` — checks email/`bcrypt.compare(password)`, issues an access token (returned in the JSON body, kept in memory on the frontend only) and a refresh token (set as an httpOnly cookie, `path=/api/auth`; only its SHA-256 hash is stored in `RefreshToken`).
2. `POST /api/auth/refresh` — reads the cookie, looks up the hash, checks it's not revoked/expired and the user is still active, then **rotates**: revokes the presented token and issues a brand-new pair. A stolen refresh token that gets reused after the legitimate client has already rotated it is immediately invalid.
3. `POST /api/auth/logout` — revokes the current refresh token and clears the cookie.
4. `GET /api/auth/me` — returns the current user (requires a valid access token).

Cookie flags differ by environment ([`refreshCookieOptions()`](../backend/src/modules/auth/auth.controller.ts)): `SameSite=Lax` in dev (frontend and backend are same-site on localhost), `SameSite=None; Secure` in production (Vercel and the backend are cross-site).

**Employee portal login** is intentionally simpler — see [05-workflows.md](05-workflows.md) for why: one longer-lived token, no rotation, no refresh cookie.

## Authorization

Two independent gates, both throwing `UnauthorizedError`/`ForbiddenError` (→ 401/403):

- **`authorize(...roles)`** — hard role check. Used for the Users and Backup routers (`authorize("ADMIN")`) — these stay Admin-only forever, never grantable — and for single admin-only actions inside other routers: editing a customer (`PATCH /customers/:id`), correcting or deleting a recorded payment (`PATCH`/`DELETE /invoices/:id/payments/:paymentId` and `/suppliers/:id/payments/:paymentId`), and the sales/purchases reports.
- **`requirePermission(...modules)`** — checks `req.user.permissions` unless `req.user.role === "ADMIN"`, in which case it always passes. Most module routers use this: `vehiclesRouter.use(authenticate, requirePermission("VEHICLES"))`. Passing more than one module means "any of these" (e.g. `item-lookup` is shared by the Items and Job Cards workflows: `requirePermission("ITEMS", "JOB_CARDS")`).

Because `permissions` is embedded in the JWT rather than looked up per-request, a permission change made via `/dashboard/users` takes effect on that user's *next token refresh* — worst case ~15 minutes — not instantly.

## Validation

Almost every mutating route runs `validateBody(schema)` ([`middleware/validate.ts`](../backend/src/middleware/validate.ts)) — a thin wrapper around `schema.parse(req.body)` that throws a `ZodError` on any failure. Two things worth knowing:

- Multipart (`multipart/form-data`) routes — Items and Purchases, both of which can carry a file — **don't** use `validateBody` on the router (multer needs to run first to populate `req.body`/`req.file`), so their controllers call `schema.parse(req.body)` directly instead (see `itemsController.create`).
- Numeric fields on schemas that accept form data use `z.coerce.number()` since multipart fields always arrive as strings.

## Error handling

[`lib/errors.ts`](../backend/src/lib/errors.ts) defines `AppError` and four subclasses mapping directly to HTTP status codes: `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409). Services throw these directly for business-rule violations (e.g. `ConflictError("This job card was already invoiced …")`).

[`middleware/errorHandler.ts`](../backend/src/middleware/errorHandler.ts) is the single place all of this is translated to a response:

| Thrown | Response |
|---|---|
| `ZodError` (validation) | `400 { error: "Validation failed", details: err.flatten() }` |
| `MulterError` | `400` — friendly message for file-too-large, otherwise multer's own message |
| `AppError` subclass | `err.statusCode` + `{ error: err.message }` |
| anything else | logged to console, `500 { error: "Internal server error" }` |

Every async route handler is wrapped in `asyncHandler()` (also in `errorHandler.ts`) so a rejected promise reaches this middleware instead of crashing the process — Express 4 doesn't do this automatically.

## File uploads

[`middleware/upload.ts`](../backend/src/middleware/upload.ts) configures `multer` with one of two storage engines, chosen automatically by whether R2 credentials are present (`R2_CONFIGURED` in `config/env.ts`):

- **Local disk** (default, used in dev): `backend/uploads/<subfolder>/`, served back out via `app.use("/uploads", express.static(...))`.
- **Cloudflare R2** (S3-compatible): streamed directly via `@aws-sdk/lib-storage`'s `Upload` so a 50MB video isn't buffered in memory first. Used automatically on hosts with no persistent disk (e.g. Render).

`publicUrlFor()` returns the right kind of URL either way, so callers never need to know which backend is active. Two upload profiles exist: `uploadImage()` (JPEG/PNG/WEBP, 5MB cap — item photos, purchase bills, selfies) and `uploadMedia()` (adds MP4/MOV/WEBM, 50MB cap — job card inspection media only).

## Full API reference

All paths are relative to `/api`. "Permission" is the module `requirePermission()` checks (Admin always passes regardless). All routes require a valid access token unless noted otherwise.

### Auth — `/auth` ([routes](../backend/src/modules/auth/auth.routes.ts))
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/login` | none | body: `{email, password}` |
| POST | `/refresh` | refresh cookie | rotates the refresh token |
| POST | `/logout` | refresh cookie | revokes it |
| GET | `/me` | any staff token | |

### Users — `/users` ([routes](../backend/src/modules/users/users.routes.ts)) — **Admin-only, entire router**
| Method | Path | Notes |
|---|---|---|
| GET | `/` | list all staff users |
| POST | `/` | create Admin or Store User |
| PATCH | `/:id/status` | enable/disable |
| DELETE | `/:id` | delete a login (not your own, not the last active admin). Erased if they never created anything; otherwise marked `deletedAt` — hidden, can't log in, email freed — so their records keep their name |
| PATCH | `/:id/permissions` | set the grantable-modules list |
| GET | `/roles` | lookup for the create form |
| GET | `/permissions` | the `PERMISSIONS` constant, for the create form's checklist |

### Customers — `/customers` (permission `CUSTOMERS`, [routes](../backend/src/modules/customers/customers.routes.ts))
`GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `PATCH /:id/status` (active/inactive toggle, never a hard delete).

### Vehicles — `/vehicles` (permission `VEHICLES`, [routes](../backend/src/modules/vehicles/vehicles.routes.ts))
`GET /` (search by reg/make/model), `GET /:id`, `GET /:id/service-history`, `POST /`, `PATCH /:id`, `PATCH /:id/status`.

### Items — `/items` (permission `ITEMS`, [routes](../backend/src/modules/items/items.routes.ts)) — multipart (`photo` field)
`GET /` (each item includes `purchasedQty`; `currentStock` is the available qty), `GET /:id`, `GET /:id/stock-history` (`purchases` with sticker ranges, and `issues` — job card parts that used it), `POST /`, `PATCH /:id`, `PATCH /:id/status`.

### Item lookup — `/item-lookup` (permission `ITEMS` **or** `JOB_CARDS`, [routes](../backend/src/modules/items/itemLookup.routes.ts))
`GET /:code` — one item by its item code (`2`, `02` or `0002`), with its available quantity — the lookup behind the job card's parts entry and the estimate.

### Suppliers — `/suppliers` ([routes](../backend/src/modules/suppliers/suppliers.routes.ts))
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | `SUPPLIERS` or `PURCHASES` | search with `q`; each supplier includes its computed `account` (`totalPurchased`, `totalPaid`, `balanceDue`) |
| POST | `/` | `SUPPLIERS` or `PURCHASES` | the purchase form can add a missing supplier inline |
| PATCH | `/:id`, `/:id/status` | `SUPPLIERS` | edit / deactivate |
| GET | `/:id/payments` | `SUPPLIERS` | payment history, newest first, plus the account summary |
| POST | `/:id/payments` | `SUPPLIERS` | multipart: `amount`, `paymentDate`, `paymentMode`, `reference`, `paidBy`, `notes`, optional `proof` photo; rejects paying more than the balance due |

### Purchases — `/purchases` (permission `PURCHASES`, [routes](../backend/src/modules/purchases/purchases.routes.ts))
`GET /` accepts optional filters: `month` (`YYYY-MM`, the server's local calendar month), `category` (`INVENTORY`/`EXPENSE`), `itemType`, and `itemId`. It is paged and newest first. Alongside the rows it returns a `summary` of per-type counts and totals (`byType`, `inventoryTotal`, `expenseTotal`, `total`). The summary covers the whole month for every type, whatever the category/type filter, and is summed in the database so it covers rows not on the current page. The same `purchaseTotals()` function feeds the dashboard's month total. `POST /` creates a multi-item purchase entry in one transaction. `supplierId` is required when any line is an inventory type, and omitted for expense-only entries. It's multipart: `supplierId`, `purchaseDate`, `remarks`, a JSON `lines` array, an optional `bill` photo and optional `itemPhoto_<n>` photos for new items. For inventory types it adds the quantity to the item's stock and gives the purchase its sticker range (`stickerFrom`/`stickerTo`, see [05-workflows.md](05-workflows.md)). There's no payment route here; payments are made per supplier.

### Job Cards — `/job-cards` (permission `JOB_CARDS`, [routes](../backend/src/modules/jobCards/jobCards.routes.ts))
| Method | Path | Notes |
|---|---|---|
| GET | `/` | filter by `status`/`q` |
| GET | `/:id` | full detail incl. parts/labour/media totals |
| POST | `/` | create (requires an existing `vehicleId`) |
| PATCH | `/:id` | the workhorse endpoint — status changes, inspection findings, estimate, assignment, final inspection all go through here; see [05-workflows.md](05-workflows.md) for the validation rules it enforces |
| POST | `/:jobCardId/parts` | use an item: `{itemId, quantity}` — deducted from stock, refused if not enough |
| DELETE | `/:jobCardId/parts/:partId` | remove it, putting the quantity back into stock |
| POST | `/:jobCardId/labour` | add a labour line |
| DELETE | `/:jobCardId/labour/:labourId` | remove one |
| POST | `/:jobCardId/media` | upload one photo/video (multipart, `file` field) with `angle`/`phase` |
| DELETE | `/:jobCardId/media/:mediaId` | remove one |
| POST | `/:jobCardId/invoice` | generate the draft invoice, or update it for a reopened job card (delegates to the Invoices controller — see below) |
| POST | `/:jobCardId/estimate` | create the job card's estimate (pre-filled from its parts and labour), or return the existing one |

### Estimates — `/estimates` (permission `JOB_CARDS`, [routes](../backend/src/modules/estimates/estimates.routes.ts))
| Method | Path | Notes |
|---|---|---|
| GET | `/:id` | the estimate with its lines, job card, vehicle, customer and computed totals (`partsTotal`, `labourTotal`, `subtotal`, `taxAmount`, `totalAmount`) |
| PATCH | `/:id` | `taxRate`, `notes`, `estimateDate` |
| POST | `/:id/lines` | `{lineType: PART|LABOUR, itemId?, description?, quantity, rate?}` — an inventory part (by `itemId`), a part not in inventory, or labour |
| DELETE | `/:id/lines/:lineId` | remove a line |
| POST | `/:id/approval` | multipart `photo` of the customer-signed estimate → `APPROVED` (locked) |

Everything except the approval photo is refused once the estimate is approved.

All of the parts/labour/media mutations are blocked once the job card is locked (see [02-database-schema.md](02-database-schema.md#job-cards-phase-4-reworked-september-2026) and [05-workflows.md](05-workflows.md)).

**Accounts:** `GET /customers/:id/account` (permission `CUSTOMERS`) and `GET /vehicles/:id/account` (permission `VEHICLES`) return the invoiced / paid / due summary, every invoice with its amount due, and the full payment history. The `GET /customers` and `GET /vehicles` lists include each row's `account` summary.

### Invoices — `/invoices` ([routes](../backend/src/modules/invoices/invoices.routes.ts))
`GET /` and `GET /:id` need `INVOICES`; the detail includes `payments`, newest first. `POST /:id/payments` takes `{amount, paymentDate?, paymentMode?, reference?, receivedBy?, notes?}` and accepts `INVOICES`, `CUSTOMERS` or `VEHICLES`. It records one payment and rejects overpayment. This replaced `PATCH /:id/payment`. Invoice creation happens via `POST /job-cards/:jobCardId/invoice` above, not a route on this router.

### Employees — `/employees` (permission `EMPLOYEES`, [routes](../backend/src/modules/employees/employees.routes.ts))
`GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `PATCH /:id/status`.

### Attendance — `/attendance` (permission `ATTENDANCE`, [routes](../backend/src/modules/attendance/attendance.routes.ts))
`GET /` (`?date=`, every active employee for that day, marked or not), `GET /summary` (`?employeeId=&month=&year=`), `POST /` (admin mark/correct — `{employeeId, date, status}`).

### Salary — `/salary` (permission `SALARY`, [routes](../backend/src/modules/attendance/salary.routes.ts))
`GET /` (`?month=&year=`), `POST /calculate` (`{employeeId, month, year}` — computes and stores; blocked if a payment already started), `PATCH /:id/payment`.

### Advances — `/advances` (permission `ATTENDANCE` or `SALARY`, [routes](../backend/src/modules/attendance/advances.routes.ts))
`GET /?month=YYYY-MM[&employeeId=]` returns the advances given in that calendar month. `POST /` takes `{employeeId, date, amount, notes?}` and works out which salary month the advance is charged to. `DELETE /:id` only works while that salary hasn't started being paid. Both writes recalculate that month's salary automatically if it's calculated but unpaid.

### Employee Portal — `/employee-portal` ([routes](../backend/src/modules/employeePortal/employeePortal.routes.ts)) — **its own auth, not staff auth**
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/login` | none | `{email, password}` — checked against `Employee.passwordHash` |
| GET | `/me` | employee token | |
| GET | `/attendance/today` | employee token | |
| GET | `/attendance/summary` | employee token | `?month=&year=` |
| POST | `/attendance/punch` | employee token | multipart (`selfie` optional) + `{latitude, longitude}` |

### Reports — `/reports` (permission `REPORTS`, [routes](../backend/src/modules/reports/reports.routes.ts))
`GET /dashboard` (the live widget summary — no date range), `GET /sales`, `/purchases`, `/inventory`, `/workshop`, `/customers` (most accept `?from=&to=`).

`/sales` and `/purchases` return each invoice / purchase with its `day` (local calendar date), so the Reports page can list a day's details under its total.

Sales and purchase figures are **admin-only** (since 2026-10-20): `/sales` and `/purchases` require the `ADMIN` role even with `REPORTS`, and `/dashboard` omits `todaysSales`, `todaysPurchaseValue` and the month's purchase totals for anyone else. `/dashboard` adds `upcomingServices` (count and list of vehicles due within 30 days) for users with `JOB_CARDS` or `VEHICLES`.

### Backup — `/backup` (**Admin-only**, [routes](../backend/src/modules/backup/backup.routes.ts))
`GET /` (downloads a full JSON backup, streamed as an attachment), `GET /excel` (downloads the pre-generated, auto-refreshing Excel workbook). Restore is **not** an HTTP route at all — see [06-deployment-and-ops.md](06-deployment-and-ops.md).

## Background jobs

`startExcelExportScheduler()` (called once from `server.ts`) regenerates `backend/exports/mm-erp-data.xlsx` every 60 seconds via `regenerateExcelExport()` in [`lib/excelExport.ts`](../backend/src/lib/excelExport.ts) — one worksheet per business table, read-only, purely a human-friendly mirror alongside Postgres (never the source of truth, never used for restore).
