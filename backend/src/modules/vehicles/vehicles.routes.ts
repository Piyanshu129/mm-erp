import { Router } from "express";
import * as vehiclesController from "./vehicles.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { asyncHandler } from "../../middleware/errorHandler";

export const vehiclesRouter = Router();

vehiclesRouter.use(authenticate);

vehiclesRouter.get("/", asyncHandler(vehiclesController.list));
vehiclesRouter.get("/:id", asyncHandler(vehiclesController.get));
vehiclesRouter.get("/:id/service-history", asyncHandler(vehiclesController.serviceHistory));
vehiclesRouter.post(
  "/",
  validateBody(vehiclesController.createVehicleSchema),
  asyncHandler(vehiclesController.create)
);
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
