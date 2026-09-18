import { Router } from "express";
import * as employeesController from "./employees.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../middleware/errorHandler";

export const employeesRouter = Router();

employeesRouter.use(authenticate, requirePermission("EMPLOYEES"));

employeesRouter.get("/", asyncHandler(employeesController.list));
employeesRouter.get("/:id", asyncHandler(employeesController.get));
employeesRouter.post(
  "/",
  validateBody(employeesController.createEmployeeSchema),
  asyncHandler(employeesController.create)
);
employeesRouter.patch(
  "/:id",
  validateBody(employeesController.updateEmployeeSchema),
  asyncHandler(employeesController.update)
);
employeesRouter.patch(
  "/:id/status",
  validateBody(employeesController.setActiveSchema),
  asyncHandler(employeesController.setActive)
);
