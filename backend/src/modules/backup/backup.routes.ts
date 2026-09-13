import fs from "fs";
import { Router } from "express";
import { buildBackupBundle } from "../../lib/backup";
import { EXCEL_EXPORT_PATH } from "../../lib/excelExport";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { asyncHandler } from "../../middleware/errorHandler";
import { NotFoundError } from "../../lib/errors";

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

// Serves the pre-generated workbook directly (kept fresh by
// startExcelExportScheduler, ~60s staleness at most) rather than
// regenerating on every download.
backupRouter.get(
  "/excel",
  authenticate,
  authorize("ADMIN"),
  asyncHandler(async (_req, res) => {
    if (!fs.existsSync(EXCEL_EXPORT_PATH)) {
      throw new NotFoundError("Excel export not generated yet — try again in a moment");
    }
    res.download(EXCEL_EXPORT_PATH, "mm-erp-data.xlsx");
  })
);
