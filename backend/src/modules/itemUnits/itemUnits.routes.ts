import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { NotFoundError } from "../../lib/errors";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../middleware/errorHandler";

export const itemUnitsRouter = Router();

// Serial lookup is shared by two workflows (browsing item stock, and
// entering/scanning a serial when issuing a part on a job card) — either
// permission is enough.
itemUnitsRouter.use(authenticate, requirePermission("ITEMS", "JOB_CARDS"));

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
