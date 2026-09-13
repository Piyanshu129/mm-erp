import path from "path";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";
import { customersRouter } from "./modules/customers/customers.routes";
import { vehiclesRouter } from "./modules/vehicles/vehicles.routes";
import { itemsRouter } from "./modules/items/items.routes";
import { suppliersRouter } from "./modules/suppliers/suppliers.routes";
import { purchasesRouter } from "./modules/purchases/purchases.routes";
import { jobCardsRouter } from "./modules/jobCards/jobCards.routes";
import { invoicesRouter } from "./modules/invoices/invoices.routes";
import { reportsRouter } from "./modules/reports/reports.routes";
import { backupRouter } from "./modules/backup/backup.routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export const app = express();

// Vercel gives a project several valid frontend origins at once (the
// production alias, the git-branch URL, per-deployment URLs) — CORS_ORIGIN
// is comma-separated so more than one can be allowed without code changes.
const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} is not allowed by CORS`));
      }
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/customers", customersRouter);
app.use("/api/vehicles", vehiclesRouter);
app.use("/api/items", itemsRouter);
app.use("/api/suppliers", suppliersRouter);
app.use("/api/purchases", purchasesRouter);
app.use("/api/job-cards", jobCardsRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/backup", backupRouter);

app.use(notFoundHandler);
app.use(errorHandler);
