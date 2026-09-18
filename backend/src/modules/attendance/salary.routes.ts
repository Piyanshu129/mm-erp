import { Router } from "express";
import * as salaryController from "./salary.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../middleware/errorHandler";

export const salaryRouter = Router();

salaryRouter.use(authenticate, requirePermission("SALARY"));

salaryRouter.get("/", asyncHandler(salaryController.list));
salaryRouter.post(
  "/calculate",
  validateBody(salaryController.calculateSalarySchema),
  asyncHandler(salaryController.calculate)
);
salaryRouter.patch(
  "/:id/payment",
  validateBody(salaryController.recordPaymentSchema),
  asyncHandler(salaryController.recordPayment)
);
