import { Router } from "express";
import * as jobCardsController from "./jobCards.controller";
import * as jobCardPartsController from "./jobCardParts.controller";
import * as jobCardLabourController from "./jobCardLabour.controller";
import * as jobCardMediaController from "./jobCardMedia.controller";
import * as invoicesController from "../invoices/invoices.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../middleware/errorHandler";
import { uploadMedia } from "../../middleware/upload";

export const jobCardsRouter = Router();

const uploadJobCardMedia = uploadMedia("job-cards").single("file");

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

jobCardsRouter.post(
  "/:jobCardId/invoice",
  validateBody(invoicesController.createInvoiceSchema),
  asyncHandler(invoicesController.create)
);
