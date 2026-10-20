import { Router } from "express";
import * as suppliersController from "./suppliers.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../middleware/errorHandler";
import { authorize } from "../../middleware/authorize";
import { uploadImage } from "../../middleware/upload";

export const suppliersRouter = Router();

const uploadPaymentProof = uploadImage("supplier-payments").single("proof");

suppliersRouter.use(authenticate);

// Searching and adding a supplier are also part of the Purchases workflow
// (the purchase form's supplier search can add a missing supplier inline) —
// either permission is enough. Editing/deactivating stays Suppliers-only.
suppliersRouter.get("/", requirePermission("SUPPLIERS", "PURCHASES"), asyncHandler(suppliersController.list));
suppliersRouter.post(
  "/",
  requirePermission("SUPPLIERS", "PURCHASES"),
  validateBody(suppliersController.createSupplierSchema),
  asyncHandler(suppliersController.create)
);
suppliersRouter.patch(
  "/:id",
  requirePermission("SUPPLIERS"),
  validateBody(suppliersController.updateSupplierSchema),
  asyncHandler(suppliersController.update)
);
suppliersRouter.patch(
  "/:id/status",
  requirePermission("SUPPLIERS"),
  validateBody(suppliersController.setActiveSchema),
  asyncHandler(suppliersController.setActive)
);

// Supplier payments live on the Suppliers page, so they follow that page's
// permission.
suppliersRouter.get("/:id/payments", requirePermission("SUPPLIERS"), asyncHandler(suppliersController.payments));
suppliersRouter.post(
  "/:id/payments",
  requirePermission("SUPPLIERS"),
  uploadPaymentProof,
  asyncHandler(suppliersController.recordPayment)
);
// Correcting or removing a recorded payment is admin-only.
suppliersRouter.patch(
  "/:id/payments/:paymentId",
  authorize("ADMIN"),
  uploadPaymentProof,
  asyncHandler(suppliersController.updatePayment)
);
suppliersRouter.delete("/:id/payments/:paymentId", authorize("ADMIN"), asyncHandler(suppliersController.deletePayment));
