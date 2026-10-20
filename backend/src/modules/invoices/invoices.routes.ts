import { Router } from "express";
import * as invoicesController from "./invoices.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../middleware/errorHandler";
import { authorize } from "../../middleware/authorize";

export const invoicesRouter = Router();

invoicesRouter.use(authenticate);

invoicesRouter.get("/", requirePermission("INVOICES"), asyncHandler(invoicesController.list));
invoicesRouter.get("/:id", requirePermission("INVOICES"), asyncHandler(invoicesController.get));
// Payments can also be taken from the Customers and Vehicles pages, against
// one of that customer's/vehicle's invoices — so any of the three
// permissions is enough to record one.
invoicesRouter.post(
  "/:id/payments",
  requirePermission("INVOICES", "CUSTOMERS", "VEHICLES"),
  validateBody(invoicesController.recordPaymentSchema),
  asyncHandler(invoicesController.recordPayment)
);

// Correcting or removing a recorded payment is admin-only.
invoicesRouter.patch(
  "/:id/payments/:paymentId",
  authorize("ADMIN"),
  validateBody(invoicesController.recordPaymentSchema),
  asyncHandler(invoicesController.updatePayment)
);
invoicesRouter.delete("/:id/payments/:paymentId", authorize("ADMIN"), asyncHandler(invoicesController.deletePayment));
