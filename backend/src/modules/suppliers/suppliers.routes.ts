import { Router } from "express";
import * as suppliersController from "./suppliers.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../middleware/errorHandler";

export const suppliersRouter = Router();

suppliersRouter.use(authenticate, requirePermission("SUPPLIERS"));

suppliersRouter.get("/", asyncHandler(suppliersController.list));
suppliersRouter.post(
  "/",
  validateBody(suppliersController.createSupplierSchema),
  asyncHandler(suppliersController.create)
);
suppliersRouter.patch(
  "/:id",
  validateBody(suppliersController.updateSupplierSchema),
  asyncHandler(suppliersController.update)
);
suppliersRouter.patch(
  "/:id/status",
  validateBody(suppliersController.setActiveSchema),
  asyncHandler(suppliersController.setActive)
);
