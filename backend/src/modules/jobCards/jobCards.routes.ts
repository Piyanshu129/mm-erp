import { Router } from "express";
import * as jobCardsController from "./jobCards.controller";
import * as jobCardPartsController from "./jobCardParts.controller";
import * as jobCardLabourController from "./jobCardLabour.controller";
import * as jobCardMediaController from "./jobCardMedia.controller";
import * as invoicesController from "../invoices/invoices.controller";
import * as estimatesController from "../estimates/estimates.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../middleware/errorHandler";
import { uploadImage, uploadMedia } from "../../middleware/upload";

export const jobCardsRouter = Router();

const uploadJobCardMedia = uploadMedia("job-cards").single("file");
const uploadSignOffPhoto = uploadImage(jobCardsController.SIGN_OFF_FOLDER).single("photo");

jobCardsRouter.use(authenticate, requirePermission("JOB_CARDS"));

jobCardsRouter.get("/", asyncHandler(jobCardsController.list));
jobCardsRouter.get("/:id", asyncHandler(jobCardsController.get));
jobCardsRouter.post(
  "/",
  validateBody(jobCardsController.createJobCardSchema),
  asyncHandler(jobCardsController.create)
);
jobCardsRouter.patch(
  "/:id",
  validateBody(jobCardsController.updateJobCardSchema),
  asyncHandler(jobCardsController.update)
);

jobCardsRouter.post(
  "/:jobCardId/parts",
  validateBody(jobCardPartsController.addPartSchema),
  asyncHandler(jobCardPartsController.addPart)
);
jobCardsRouter.delete("/:jobCardId/parts/:partId", asyncHandler(jobCardPartsController.removePart));

jobCardsRouter.post(
  "/:jobCardId/labour",
  validateBody(jobCardLabourController.addLabourSchema),
  asyncHandler(jobCardLabourController.addLabour)
);
jobCardsRouter.delete(
  "/:jobCardId/labour/:labourId",
  asyncHandler(jobCardLabourController.removeLabour)
);

jobCardsRouter.post(
  "/:jobCardId/media",
  uploadJobCardMedia,
  asyncHandler(jobCardMediaController.addMedia)
);
jobCardsRouter.delete(
  "/:jobCardId/media/:mediaId",
  asyncHandler(jobCardMediaController.removeMedia)
);

// Close the job card — its estimate becomes the bill. (/invoice is the old
// name, kept for pages loaded before the change.)
for (const path of ["/:jobCardId/close", "/:jobCardId/invoice"]) {
  jobCardsRouter.post(path, validateBody(invoicesController.closeJobCardSchema), asyncHandler(invoicesController.close));
}

// Signed-copy photos: the vehicle trial sign-off and, once closed, the gate pass.
jobCardsRouter.post("/:jobCardId/sign-off/:kind", uploadSignOffPhoto, asyncHandler(jobCardsController.signOff));

jobCardsRouter.post("/:jobCardId/estimate", asyncHandler(estimatesController.createForJobCard));
