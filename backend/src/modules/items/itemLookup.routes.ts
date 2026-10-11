import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../middleware/errorHandler";
import { getItemByCode } from "./items.service";

export const itemLookupRouter = Router();

// Typing an item code on a job card (or estimate) fetches the item and its
// available quantity — shared by both workflows, so either permission works.
itemLookupRouter.use(authenticate, requirePermission("ITEMS", "JOB_CARDS"));

itemLookupRouter.get(
  "/:code",
  asyncHandler(async (req, res) => {
    res.json({ item: await getItemByCode(String(req.params.code)) });
  })
);
