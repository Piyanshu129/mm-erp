import { Router } from "express";
import * as purchasesController from "./purchases.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../middleware/errorHandler";
import { uploadPurchaseFiles } from "../../middleware/upload";
import { authorize } from "../../middleware/authorize";

export const purchasesRouter = Router();

purchasesRouter.use(authenticate, requirePermission("PURCHASES"));

purchasesRouter.get("/", asyncHandler(purchasesController.list));
purchasesRouter.post("/", uploadPurchaseFiles(), asyncHandler(purchasesController.create));
// Correcting a saved purchase is admin-only.
purchasesRouter.patch("/:id", authorize("ADMIN"), asyncHandler(purchasesController.update));
