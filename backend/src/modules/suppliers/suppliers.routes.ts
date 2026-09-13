import { Router } from "express";
import * as suppliersController from "./suppliers.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { asyncHandler } from "../../middleware/errorHandler";

export const suppliersRouter = Router();

suppliersRouter.use(authenticate);

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
