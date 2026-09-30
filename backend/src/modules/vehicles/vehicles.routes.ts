import { Router } from "express";
import * as vehiclesController from "./vehicles.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../middleware/errorHandler";
import { uploadImage } from "../../middleware/upload";

export const vehiclesRouter = Router();

const uploadRcPhoto = uploadImage("vehicle-rc").single("rcPhoto");

vehiclesRouter.use(authenticate, requirePermission("VEHICLES"));

vehiclesRouter.get("/", asyncHandler(vehiclesController.list));
vehiclesRouter.get("/:id", asyncHandler(vehiclesController.get));
vehiclesRouter.get("/:id/service-history", asyncHandler(vehiclesController.serviceHistory));
vehiclesRouter.get("/:id/account", asyncHandler(vehiclesController.account));
// Multipart — carries the RC photo, which is required.
vehiclesRouter.post("/", uploadRcPhoto, asyncHandler(vehiclesController.create));
vehiclesRouter.patch(
  "/:id",
  validateBody(vehiclesController.updateVehicleSchema),
  asyncHandler(vehiclesController.update)
);
vehiclesRouter.patch(
  "/:id/status",
  validateBody(vehiclesController.setActiveSchema),
  asyncHandler(vehiclesController.setActive)
);
