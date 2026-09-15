import { Router } from "express";
import * as invoicesController from "./invoices.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { asyncHandler } from "../../middleware/errorHandler";

export const invoicesRouter = Router();

invoicesRouter.use(authenticate);

invoicesRouter.get("/", asyncHandler(invoicesController.list));
invoicesRouter.get("/:id", asyncHandler(invoicesController.get));
invoicesRouter.patch(
  "/:id/payment",
  validateBody(invoicesController.recordPaymentSchema),
  asyncHandler(invoicesController.recordPayment)
);
