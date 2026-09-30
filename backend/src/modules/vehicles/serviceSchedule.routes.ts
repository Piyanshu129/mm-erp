import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../middleware/errorHandler";
import { getServiceSchedule } from "../../lib/serviceSchedule";

export const serviceScheduleRouter = Router();

// A workshop view of vehicles, so either permission is enough.
serviceScheduleRouter.use(authenticate, requirePermission("JOB_CARDS", "VEHICLES"));

serviceScheduleRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ rows: await getServiceSchedule() });
  })
);
