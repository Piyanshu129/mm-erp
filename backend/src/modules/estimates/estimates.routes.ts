import { Router } from "express";
import * as estimatesController from "./estimates.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../middleware/errorHandler";
import { uploadImage } from "../../middleware/upload";

// Estimates are created from their job card (POST /api/job-cards/:id/estimate
// in jobCards.routes.ts); everything else about one lives here.
export const estimatesRouter = Router();

const uploadApprovalPhoto = uploadImage(estimatesController.ESTIMATE_APPROVAL_FOLDER).single("photo");

estimatesRouter.use(authenticate, requirePermission("JOB_CARDS"));

estimatesRouter.get("/:id", asyncHandler(estimatesController.get));
estimatesRouter.patch(
  "/:id",
  validateBody(estimatesController.updateEstimateSchema),
  asyncHandler(estimatesController.update)
);
estimatesRouter.post(
  "/:id/lines",
  validateBody(estimatesController.addLineSchema),
  asyncHandler(estimatesController.addLine)
);
estimatesRouter.delete("/:id/lines/:lineId", asyncHandler(estimatesController.removeLine));
estimatesRouter.post("/:id/approval", uploadApprovalPhoto, asyncHandler(estimatesController.approve));
// GST tax invoice made from the estimate: HSN/SAC + GST % per line, then
// generate (numbers and locks it).
estimatesRouter.patch(
  "/:id/gst",
  validateBody(estimatesController.gstDetailsSchema),
  asyncHandler(estimatesController.updateGst)
);
estimatesRouter.post("/:id/gst-invoice", asyncHandler(estimatesController.generateGstInvoice));
