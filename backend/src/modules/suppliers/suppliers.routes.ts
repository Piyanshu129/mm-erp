import { Router } from "express";
import * as suppliersController from "./suppliers.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../middleware/errorHandler";

export const suppliersRouter = Router();

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
