import { Router } from "express";
import * as usersController from "./users.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { asyncHandler } from "../../middleware/errorHandler";

export const usersRouter = Router();

// Every route here is admin-only: user/role management is not a Store User capability.
usersRouter.use(authenticate, authorize("ADMIN"));

usersRouter.get("/", asyncHandler(usersController.list));
usersRouter.post(
  "/",
  validateBody(usersController.createUserSchema),
  asyncHandler(usersController.create)
);
usersRouter.patch(
  "/:id/status",
  validateBody(usersController.updateUserStatusSchema),
  asyncHandler(usersController.updateStatus)
);
usersRouter.get("/roles", asyncHandler(usersController.roles));
