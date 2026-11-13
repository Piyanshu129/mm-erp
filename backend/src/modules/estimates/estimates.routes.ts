import { Router } from "express";
import * as estimatesController from "./estimates.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../middleware/errorHandler";
import { uploadImage } from "../../middleware/upload";
import { authorize } from "../../middleware/authorize";

// Estimates are created from their job card (POST /api/job-cards/:id/estimate
// in jobCards.routes.ts); everything else about one lives here.
export const estimatesRouter = Router();

const uploadApprovalPhoto = uploadImage(estimatesController.ESTIMATE_APPROVAL_FOLDER).single("photo");

estimatesRouter.use(authenticate, requirePermission("JOB_CARDS"));

estimatesRouter.get("/", asyncHandler(estimatesController.list));
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
// GST tax invoice(s) made from the estimate: HSN/SAC + GST % (and who pays,
// on an accidental claim) per line, then generate (numbers and locks it).
estimatesRouter.patch(
  "/:id/gst",
  validateBody(estimatesController.gstDetailsSchema),
  asyncHandler(estimatesController.updateGst)
);
estimatesRouter.post(
  "/:id/gst-invoice",
  validateBody(estimatesController.generateGstInvoiceSchema),
  asyncHandler(estimatesController.generateGstInvoice)
);
// Changing a GST invoice's number is admin-only.
estimatesRouter.patch(
  "/:id/gst-invoice-number",
  authorize("ADMIN"),
  validateBody(estimatesController.gstInvoiceNumberSchema),
  asyncHandler(estimatesController.setGstInvoiceNumber)
);
// Lines added to a closed job card's bill and tax invoice only.
estimatesRouter.post(
  "/:id/bill-lines",
  validateBody(estimatesController.billLineSchema),
  asyncHandler(estimatesController.addBillLine)
);
estimatesRouter.delete("/:id/bill-lines/:lineId", asyncHandler(estimatesController.removeBillLine));
