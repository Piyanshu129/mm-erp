# 01 — Overview

## What this is

MM ERP is a workshop management system for Motors Mitra, a vehicle service/repair shop. It covers the whole shop-floor + back-office flow: a customer brings a vehicle in, it gets a Job Card, parts and labour get logged against it, an invoice gets generated and paid, and all of that rolls up into dashboards, reports, and an HR (attendance/salary) module for staff.

It's a two-app system talking to one database:

```
┌─────────────────────┐        HTTPS (JSON)        ┌──────────────────────┐        ┌──────────────┐
│  frontend/           │ ─────────────────────────> │  backend/              │ ─────> │  PostgreSQL   │
│  Next.js (App Router) │ <───────────────────────── │  Express + TypeScript  │ <───── │  via Prisma    │
│  Tailwind CSS         │        REST API             │  JWT auth               │        └──────────────┘
└─────────────────────┘                             └──────────────────────┘
                                                              │
                                                              ▼
                                                     local disk (uploads/)
                                                     or Cloudflare R2 (prod)
```

There's also a small third surface: the **Employee Portal** (`/portal/*` in the frontend, `/api/employee-portal/*` in the backend) — a separate, lightweight login for shop staff to punch their own daily attendance. It shares the same database but has its own auth system, deliberately kept apart from the admin login (see [04-frontend.md](04-frontend.md) and [05-workflows.md](05-workflows.md)).

## Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express + TypeScript |
| ORM / migrations | Prisma (`backend/prisma/schema.prisma`) |
| Database | PostgreSQL |
| Auth | Hand-rolled JWT: short-lived access token (in memory) + rotating httpOnly refresh cookie |
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS |
| File storage | Local disk (`backend/uploads/`) in dev, Cloudflare R2 (S3-compatible) in some production configs |
| Validation | Zod, on both the backend (request schemas) and implicitly mirrored by frontend form constraints |
| Excel export | ExcelJS — a read-only mirror of the whole database, regenerated every ~60s |

There is **no separate state-management library** on the frontend (no Redux/Zustand) — each page fetches its own data with `useEffect` + local `useState`, and the only global state is two React Contexts (`AuthContext` for the admin dashboard, `EmployeePortalAuthContext` for the portal).

## Repo layout

```
MM/
├── backend/
│   ├── src/
│   │   ├── app.ts            — Express app: middleware + route mounting (the map of the whole API)
│   │   ├── server.ts         — starts the HTTP server + the Excel export scheduler
│   │   ├── config/env.ts     — validates process.env with Zod at startup
│   │   ├── lib/               — cross-cutting helpers (jwt, errors, pagination, backup, excel export, permissions)
│   │   ├── middleware/        — authenticate, authenticateEmployee, authorize, requirePermission, validate, upload, errorHandler
│   │   └── modules/           — one folder per business domain (see 03-backend.md)
│   ├── prisma/
│   │   ├── schema.prisma     — the entire data model
│   │   └── seed.ts           — creates ADMIN/STORE_USER roles + an initial admin user
│   ├── scripts/               — backup.ts / restore.ts (CLI-only restore, see 06-deployment-and-ops.md)
│   └── uploads/                — local file storage root (dev only; gitignored)
├── frontend/
│   └── src/
│       ├── app/                — Next.js App Router pages (dashboard/*, portal/*, login, root)
│       ├── components/         — RequireAuth, RequireEmployeeAuth, AuthedMedia, ui/*
│       ├── context/            — AuthContext, EmployeePortalAuthContext
│       └── lib/                — api.ts (admin API client), employeePortalApi.ts, permissions.ts, csv.ts
├── docs/                       — this folder
├── scripts/                    — Windows PowerShell scripts to run Postgres/the app locally (db-start.ps1, start-app.ps1, …)
├── render.yaml                 — Render.com deploy config for the backend (an alternative to the current local+ngrok setup)
└── README.md / DEPLOYMENT.md   — build history and the current live-deployment runbook
```

## How a request actually flows

1. Browser hits a page under `frontend/src/app/dashboard/**` (or `/portal/**`).
2. The page (a client component) calls `apiFetch("/some/path", …)` from `frontend/src/lib/api.ts`, which prefixes `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:4000/api`), attaches the in-memory access token as `Authorization: Bearer …`, and sends cookies (`credentials: "include"`) for the refresh flow.
3. On the backend, the request passes through `app.ts`'s global middleware (CORS, JSON body parsing, cookies, static `/uploads`), then the matched module's router.
4. Each module's router applies `authenticate` (verifies the JWT) and `requirePermission("SOME_MODULE")` (or `authorize("ADMIN")` for admin-only routes) before any handler runs.
5. `validateBody(schema)` (a Zod schema) parses/coerces `req.body`, throwing a `ZodError` on anything invalid — caught centrally by `errorHandler` and turned into `{"error": "Validation failed", "details": {...}}`.
6. The controller calls into a `*.service.ts` function, which does the actual Prisma work — often inside `prisma.$transaction(...)` when more than one table needs to change atomically (e.g. a purchase creating `Purchase` rows with their sticker ranges and bumping `Item.currentStock` together).
7. The response is plain JSON. Errors are `AppError` subclasses (`UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`) mapped to the right HTTP status by `errorHandler`.

See [03-backend.md](03-backend.md) for the full middleware/route reference, and [05-workflows.md](05-workflows.md) for how several of these requests chain together into one real business process (e.g. "create a job card → issue parts → generate an invoice").
