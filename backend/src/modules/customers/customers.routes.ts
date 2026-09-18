import { Router } from "express";
import * as customersController from "./customers.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../middleware/errorHandler";

export const customersRouter = Router();

// Both ADMIN and STORE_USER can manage customers — front-desk/store staff
// need this to open job cards later, it isn't an admin-only master.
customersRouter.use(authenticate, requirePermission("CUSTOMERS"));

customersRouter.get("/", asyncHandler(customersController.list));
customersRouter.get("/:id", asyncHandler(customersController.get));
customersRouter.post(
  "/",
  validateBody(customersController.createCustomerSchema),
  asyncHandler(customersController.create)
);
customersRouter.patch(
  "/:id",
  validateBody(customersController.updateCustomerSchema),
  asyncHandler(customersController.update)
);
customersRouter.patch(
  "/:id/status",
  validateBody(customersController.setActiveSchema),
  asyncHandler(customersController.setActive)
);
