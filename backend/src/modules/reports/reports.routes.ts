import { Router } from "express";
import * as reportsController from "./reports.controller";
import { authenticate } from "../../middleware/authenticate";
import { asyncHandler } from "../../middleware/errorHandler";

export const reportsRouter = Router();

reportsRouter.use(authenticate);

reportsRouter.get("/dashboard", asyncHandler(reportsController.dashboard));
reportsRouter.get("/sales", asyncHandler(reportsController.sales));
reportsRouter.get("/purchases", asyncHandler(reportsController.purchases));
reportsRouter.get("/inventory", asyncHandler(reportsController.inventory));
reportsRouter.get("/workshop", asyncHandler(reportsController.workshop));
reportsRouter.get("/customers", asyncHandler(reportsController.customers));
