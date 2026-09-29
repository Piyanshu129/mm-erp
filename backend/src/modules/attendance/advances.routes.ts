import { Router } from "express";
import * as advancesController from "./advances.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../middleware/errorHandler";

export const advancesRouter = Router();

// Entered from the attendance sheet and deducted in salary, so either
// permission is enough.
advancesRouter.use(authenticate, requirePermission("ATTENDANCE", "SALARY"));

advancesRouter.get("/", asyncHandler(advancesController.list));
advancesRouter.post("/", validateBody(advancesController.recordAdvanceSchema), asyncHandler(advancesController.create));
advancesRouter.delete("/:id", asyncHandler(advancesController.remove));
