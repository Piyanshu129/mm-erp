import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { NotFoundError } from "../../lib/errors";
import { authenticate } from "../../middleware/authenticate";
import { asyncHandler } from "../../middleware/errorHandler";

export const itemUnitsRouter = Router();

itemUnitsRouter.use(authenticate);

// Looking up one serial directly — the primary "scan/type the sticker"
// workflow for Parts Issue.
itemUnitsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const unit = await prisma.itemUnit.findUnique({
      where: { id: Number(req.params.id) },
      include: { item: true, purchase: { include: { supplier: true } } },
    });
    if (!unit) throw new NotFoundError(`No item unit with serial number ${req.params.id}`);
    res.json({ unit });
  })
);
