import { Router } from "express";
import { buildBackupBundle } from "../../lib/backup";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { asyncHandler } from "../../middleware/errorHandler";

export const backupRouter = Router();

// Download-only: restoring is a rare, high-stakes, whole-database operation
// (see backend/scripts/restore.ts) and deliberately isn't exposed as a
// one-click web action.
backupRouter.get(
  "/",
  authenticate,
  authorize("ADMIN"),
  asyncHandler(async (_req, res) => {
    const bundle = await buildBackupBundle();
    const filename = `mm-erp-backup-${bundle.generatedAt.replace(/[:.]/g, "-")}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json(bundle);
  })
);
