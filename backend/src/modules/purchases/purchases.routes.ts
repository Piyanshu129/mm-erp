import { Router } from "express";
import * as purchasesController from "./purchases.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { asyncHandler } from "../../middleware/errorHandler";
import { uploadImage } from "../../middleware/upload";

export const purchasesRouter = Router();

const uploadBill = uploadImage("purchase-bills").single("bill");

purchasesRouter.use(authenticate);

purchasesRouter.get("/", asyncHandler(purchasesController.list));
purchasesRouter.post("/", uploadBill, asyncHandler(purchasesController.create));
purchasesRouter.patch(
  "/:id/payment",
  validateBody(purchasesController.recordPaymentSchema),
  asyncHandler(purchasesController.recordPayment)
);
