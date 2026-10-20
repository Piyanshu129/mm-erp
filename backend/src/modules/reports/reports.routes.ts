import { Router } from "express";
import * as reportsController from "./reports.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../middleware/errorHandler";
import { authorize } from "../../middleware/authorize";

export const reportsRouter = Router();

reportsRouter.use(authenticate);

// The dashboard summary is the landing page after login — every
// authenticated user sees it regardless of granted permissions. The
// deeper analytical reports below are gated behind REPORTS specifically.
reportsRouter.get("/dashboard", asyncHandler(reportsController.dashboard));

reportsRouter.use(requirePermission("REPORTS"));
// Sales and purchase figures are admin-only, even for a user granted REPORTS.
reportsRouter.get("/sales", authorize("ADMIN"), asyncHandler(reportsController.sales));
reportsRouter.get("/purchases", authorize("ADMIN"), asyncHandler(reportsController.purchases));
reportsRouter.get("/inventory", asyncHandler(reportsController.inventory));
reportsRouter.get("/workshop", asyncHandler(reportsController.workshop));
reportsRouter.get("/customers", asyncHandler(reportsController.customers));
