import { Router } from "express";
import * as itemsController from "./items.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { asyncHandler } from "../../middleware/errorHandler";
import { uploadImage } from "../../middleware/upload";

export const itemsRouter = Router();

const uploadItemPhoto = uploadImage("items").single("photo");

itemsRouter.use(authenticate);

itemsRouter.get("/", asyncHandler(itemsController.list));
itemsRouter.get("/:id", asyncHandler(itemsController.get));
itemsRouter.get("/:id/stock-history", asyncHandler(itemsController.stockHistory));
itemsRouter.post("/", uploadItemPhoto, asyncHandler(itemsController.create));
itemsRouter.patch("/:id", uploadItemPhoto, asyncHandler(itemsController.update));
itemsRouter.patch(
  "/:id/status",
  validateBody(itemsController.setActiveSchema),
  asyncHandler(itemsController.setActive)
);
