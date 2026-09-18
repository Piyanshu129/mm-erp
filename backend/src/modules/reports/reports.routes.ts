import { Router } from "express";
import * as reportsController from "./reports.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../middleware/errorHandler";

export const reportsRouter = Router();

reportsRouter.use(authenticate);

// The dashboard summary is the landing page after login — every
// authenticated user sees it regardless of granted permissions. The
// deeper analytical reports below are gated behind REPORTS specifically.
reportsRouter.get("/dashboard", asyncHandler(reportsController.dashboard));

reportsRouter.use(requirePermission("REPORTS"));
reportsRouter.get("/sales", asyncHandler(reportsController.sales));
reportsRouter.get("/purchases", asyncHandler(reportsController.purchases));
reportsRouter.get("/inventory", asyncHandler(reportsController.inventory));
reportsRouter.get("/workshop", asyncHandler(reportsController.workshop));
reportsRouter.get("/customers", asyncHandler(reportsController.customers));
