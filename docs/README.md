# MM ERP — System Documentation

This folder has two different kinds of document:

- **`Motors-Mitra-Manual.pdf` / `motors-mitra-manual.html`** — the end-user manual, written for shop staff who use the app.
- **Everything below** — technical/system documentation written for a developer reading or extending this codebase. It explains *how the system actually works*: the stack, the data model, every API route, the frontend structure, and the key business workflows end to end.

This developer documentation is generated from the code itself (not just the plan), so it should stay accurate as long as it's updated alongside future changes.

## Contents

1. **[01-overview.md](01-overview.md)** — what MM ERP is, the tech stack, repo layout, and how the pieces fit together at a glance.
2. **[02-database-schema.md](02-database-schema.md)** — every table in the Postgres/Prisma schema, grouped by domain, with the *why* behind the non-obvious design choices.
3. **[03-backend.md](03-backend.md)** — Express app structure, the request pipeline (auth/permissions/validation/errors), file uploads, and a full reference of every API route.
4. **[04-frontend.md](04-frontend.md)** — Next.js App Router structure, the two separate auth systems (admin dashboard vs. employee portal), the API client, and a page-by-page map.
5. **[05-workflows.md](05-workflows.md)** — the key business processes traced end-to-end through frontend → API → database: onboarding a vehicle, purchasing, stock and stickers, estimates, the job card lifecycle, invoicing, attendance → salary, and permissions.
6. **[06-deployment-and-ops.md](06-deployment-and-ops.md)** — how the system actually runs today (local Postgres + backend, ngrok tunnel, Vercel frontend), environment variables, storage, and backup/restore.

## Where to start

- New to the codebase? Read **01 → 02 → 03 → 04** in order, then skim **05** for how it all connects.
- Trying to trace one specific bug or feature? Jump straight to **05-workflows.md** and follow the file references from there into **03**/**04**.
- Setting the app up on a machine, or debugging why it's not reachable? **06-deployment-and-ops.md**.

The root [`README.md`](../README.md) is the project's phase-by-phase build history (what was built when, and why) — this `docs/` set is the "how it works right now" reference instead.
