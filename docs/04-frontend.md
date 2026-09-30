# 04 — Frontend

Next.js App Router app under `frontend/src/app/`. No global state library — each page owns its own data via `useState`/`useEffect`, and the two things that *are* global are React Contexts for auth.

## Two separate apps, one Next.js project

| | Admin Dashboard | Employee Portal |
|---|---|---|
| Route prefix | `/dashboard/*` | `/portal/*` |
| Layout | [`app/dashboard/layout.tsx`](../frontend/src/app/dashboard/layout.tsx) — sidebar nav + `RequireAuth` | [`app/portal/layout.tsx`](../frontend/src/app/portal/layout.tsx) — wraps in `EmployeePortalAuthProvider` |
| Auth context | `AuthContext` | `EmployeePortalAuthContext` |
| Gate component | `RequireAuth` | `RequireEmployeeAuth` |
| API client | `lib/api.ts` → `apiFetch()` | `lib/employeePortalApi.ts` → `employeeApiFetch()` |
| Who uses it | Admin / Store User staff | Shop employees, for one thing: punching attendance |

These deliberately don't share a token or a context — see [05-workflows.md](05-workflows.md) for why. `AuthProvider` wraps the *entire* app in the root [`app/layout.tsx`](../frontend/src/app/layout.tsx), while `EmployeePortalAuthProvider` is scoped to just `app/portal/layout.tsx`.

## Admin auth flow (`AuthContext` + `lib/api.ts`)

The access token is **held only in memory** (a module-level variable in `lib/api.ts`, set via `setAccessToken()`) — never `localStorage`, so a stolen XSS payload can't casually exfiltrate a long-lived credential, and a page reload always starts from zero.

On mount, `AuthProvider` ([`context/AuthContext.tsx`](../frontend/src/context/AuthContext.tsx)) calls `tryRefresh()`, which hits `POST /auth/refresh` — the browser sends the httpOnly refresh cookie automatically (`credentials: "include"`), and if it's valid, a fresh access token comes back and `GET /auth/me` fills in the user. This is how a page reload keeps you logged in without ever storing the access token client-side.

`apiFetch()` ([`lib/api.ts`](../frontend/src/lib/api.ts)) is the one function nearly every page calls:
- Attaches `Authorization: Bearer <token>` and `Content-Type: application/json` (skipped for `FormData` bodies so the browser can set its own multipart boundary).
- Always sends `ngrok-skip-browser-warning: true` — harmless against any other host, but required so the free ngrok tunnel used in production (see [06-deployment-and-ops.md](06-deployment-and-ops.md)) doesn't intercept the request with its own browser-warning interstitial.
- On a `401`, automatically calls `tryRefresh()` once and retries the original request — so a page sitting open past the 15-minute access token lifetime doesn't force a manual re-login.
- On any non-OK response, throws `ApiError(status, message)`. The message is built by `formatErrorMessage()`, which prefers the backend's Zod `details.fieldErrors` (e.g. `"year: Number must be greater than or equal to 1980"`) over the generic `"Validation failed"`, so form error text is actually actionable.

`RequireAuth` ([`components/RequireAuth.tsx`](../frontend/src/components/RequireAuth.tsx)) wraps every dashboard page (directly, or via the shared `dashboard/layout.tsx`). It redirects to `/login` if there's no user, or back to `/dashboard` if the user lacks a required `roles`/`permission` prop — used both at the layout level (any logged-in user) and per-page (e.g. `<RequireAuth permission="VEHICLES">`).

## Employee portal auth flow

Simpler on purpose, matching the backend's simpler token (see [03-backend.md](03-backend.md#auth--sessions)): the token is stored in `localStorage` (`lib/employeePortalApi.ts`, key `mm_employee_portal_token`) since there's no refresh flow to bootstrap from a cookie — the token just needs to survive a page reload on its own. No auto-retry-on-401; a 12-hour-expired token just means the employee logs in again.

## Media that needs auth: `AuthedImage` / `AuthedVideo`

Plain `<img src="...">` / `<video src="...">` tags can't send custom headers, but the ngrok tunnel used in production shows its browser-warning interstitial to *any* request missing `ngrok-skip-browser-warning` — images and videos included. [`components/AuthedMedia.tsx`](../frontend/src/components/AuthedMedia.tsx) works around this by fetching the bytes itself (`fetchAssetBlob()` in `lib/api.ts`, which sends the header) and handing back an object URL. Used for item photos, job card inspection media, and portal attendance selfies. Harmless against a normal host too (Render, R2, etc.) — it's used everywhere by default, not conditionally.

## `lib/permissions.ts`

A deliberate mirror of [`backend/src/lib/permissions.ts`](../backend/src/lib/permissions.ts) (same `PERMISSIONS` array) plus `PERMISSION_LABELS` (display names) and `hasPermission(user, permission)` — `true` for Admin unconditionally, otherwise checks `user.permissions.includes(permission)`. Used to both hide sidebar links and gate pages via `RequireAuth`'s `permission` prop — but this is a **UX convenience only**; the actual enforcement is server-side (`requirePermission()` on every route), so a hidden link is not a security boundary by itself.

## Dashboard layout & navigation

[`app/dashboard/layout.tsx`](../frontend/src/app/dashboard/layout.tsx) renders a fixed sidebar (desktop) / slide-out drawer (mobile) from a static `NAV_GROUPS` config — five groups (Workshop, Masters, Money, Staff, Admin), each entry optionally tagged `permission` or `adminOnly`. The sidebar filters itself live against the current user, so a Store User only ever sees the modules they've been granted.

## Component library (`components/ui/`)

Small, unstyled-library-free primitives built directly on Tailwind: `Button`, `Card`/`CardBody`, `Input`/`Select`/`Label`/`Textarea`, `Table`/`Th`/`Td`/`Tr`, `Badge`, `PageHeader`, `EmptyState`, `Skeleton`/`TableSkeleton`. Every dashboard page composes these rather than writing raw markup — check here first before adding new one-off styling.

## Page-by-page map

Every page under `app/dashboard/` is a `"use client"` component that fetches its own data on mount and follows the same rough shape: a search/filter bar, a table, and an inline "add new" form (`showForm` toggled by a button) rather than a separate route/modal. All of them wrap their content in `<RequireAuth permission="...">`.

| Page | Backend module | Notable behavior |
|---|---|---|
| `/dashboard` | `reports` (`/reports/dashboard`) | Live widgets: today's vehicles, open/completed/waiting-for-parts job cards, today's sales/purchase value, low/out-of-stock counts, and this month's total purchases split into inventory vs. expenses |
| `/dashboard/customers`, `/customers/[id]` | `customers`, `vehicles`, `invoices` | List rows show Invoiced / Paid / Due with **Pay** and **Payment history**, which open the shared account panel. The detail page lists the customer's vehicles, with an inline "add vehicle" form, and has the account panel permanently at the bottom |
| `/dashboard/vehicles` | `vehicles`, `invoices` | Global search across all vehicles, with Invoiced / Paid / Due and **Pay** / **Payment history** per vehicle. The "New vehicle" form can create a brand-new customer inline |
| `/dashboard/items`, `/items/[id]` | `items`, `itemUnits` | Photo upload (multipart); detail page shows stock history (every `ItemUnit` ever created) via `/items/:id/stock-history` |
| `/dashboard/suppliers` | `suppliers` | Each supplier's purchased / paid / balance due. **Pay** records a payment with an optional transaction photo; **Payment history** lists every partial payment |
| `/dashboard/purchases` | `purchases` | The form asks for the **purchase type first**. Inventory types show the supplier box (type-to-search, can add a missing supplier inline) and item lines (new item is the default). Expense types skip the supplier and take description + amount lines. `?new=<TYPE>` opens the form preset to that type. The list is per month (◀ month ▶) with Total / Inventory / Expenses tiles, a Category column, and Category/Type filters in the column headers. It shows per-unit rate, MRP and total, with a filtered total in the footer |
| `/dashboard/expenses` | `purchases` (`category=EXPENSE`) | Sidebar entry right below Suppliers. The month's expenses with a total per expense type (click a tile to filter), a Type column filter, and **New expense**, which links to the Purchases form preset to an expense type |
| `/dashboard/jobcards`, `/jobcards/[id]` | `jobCards` + parts/labour/media/invoice sub-resources | The most complex page — status transitions, mandatory before/after photo upload, parts issue by serial lookup, labour lines, invoice generation. See [05-workflows.md](05-workflows.md) for the rules it's enforcing |
| `/dashboard/invoices`, `/invoices/[id]` | `invoices` | The list shows Total / Paid / Due / status with **View** and **Download**. The detail page has *Print* and *Download PDF* (named `<car number>_<date>.pdf`), plus customer payments: totals, a payment form, and the full payment history |
| `/dashboard/service-history` | `vehicles` (`/:id/service-history`) | Search by registration, customer mobile, or customer name |
| `/dashboard/service-schedule` | `service-schedule` | When each vehicle's next general service is due, flagged Passed / Due soon / On track, with filters |

All photo uploads are shrunk in the browser first (`lib/compressImage.ts`: at most 1600px, JPEG). Full-size phone photos over the tunnel had made saving look stuck.
| `/dashboard/employees` | `employees` | Includes setting/clearing the Employee Portal password |
| `/dashboard/attendance` | `attendance`, `advances` | Daily grid for all active employees with admin corrections. Each row has an **Advance paid** box and an advance history column for the month; advances are deducted from salary |
| `/dashboard/salary` | `attendance/salary` (`salary` router) | Calculate (and **Recalculate** while unpaid) + record payments. An Advance column shows what was deducted |
| `/dashboard/reports` | `reports` | Sales/Purchases/Inventory/Workshop/Customers, each with a date range and a client-side CSV export (`lib/csv.ts` — no server export library needed) |
| `/dashboard/users` | `users` | **Admin-only** — create/disable staff, edit per-module permissions |
| `/dashboard/settings` | `backup` | **Admin-only** — "Download backup now" (JSON) and Excel export download |

### Employee Portal pages

| Page | Notes |
|---|---|
| `/portal/login` | Separate login form, posts to `/employee-portal/login` |
| `/portal` | One screen: punch button (captures GPS via `navigator.geolocation`, optional selfie via `<input type="file" capture="user">`), today's status, this month's Present/Absent/Leave tally. See [`app/portal/page.tsx`](../frontend/src/app/portal/page.tsx) |

## A worked example: `lib/api.ts`'s error handling (recent fix)

As a concrete illustration of how frontend forms are wired to backend validation: the Vehicles "New vehicle" form's Year/Current KM number inputs originally had no `min`/`max`/`step`, so the browser would let through values (a 2-digit year, a negative KM) that the backend's Zod schema rejects — and the UI only ever showed the bare `"Validation failed"`. The fix touched both layers:
1. **Frontend, prevention**: added `min`/`max`/`step` to those inputs (in both `dashboard/vehicles/page.tsx` and `dashboard/customers/[id]/page.tsx`, which both have their own copy of this form) so the browser's own constraint validation catches it before submit.
2. **Frontend, `lib/api.ts`**: `formatErrorMessage()` now surfaces the actual Zod field error instead of the generic message, for any future case that gets past step 1 — this is a general improvement to every form in the app, not just Vehicles, since every form goes through the same `apiFetch()`.

This pattern — browser-level constraints as the first line of defense, backend Zod schema as the actual source of truth, and error messages that surface *which* field and *why* — is worth following for any new form.
