import { Router } from "express";
import * as salaryController from "./salary.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { asyncHandler } from "../../middleware/errorHandler";

export const salaryRouter = Router();

salaryRouter.use(authenticate);

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
