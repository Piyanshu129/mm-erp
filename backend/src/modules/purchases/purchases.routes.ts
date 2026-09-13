import { Router } from "express";
import * as purchasesController from "./purchases.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { asyncHandler } from "../../middleware/errorHandler";

export const purchasesRouter = Router();

purchasesRouter.use(authenticate);

purchasesRouter.get("/", asyncHandler(purchasesController.list));
purchasesRouter.post(
  "/",
  validateBody(purchasesController.createPurchaseSchema),
  asyncHandler(purchasesController.create)
);
