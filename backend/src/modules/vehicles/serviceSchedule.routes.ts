import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { validateBody } from "../../middleware/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { getServiceSchedule, recordOdometerReading } from "../../lib/serviceSchedule";

export const serviceScheduleRouter = Router();

// A workshop view of vehicles, so either permission is enough.
serviceScheduleRouter.use(authenticate, requirePermission("JOB_CARDS", "VEHICLES"));

serviceScheduleRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ rows: await getServiceSchedule() });
  })
);

const odometerSchema = z.object({
  km: z.coerce.number().int().min(0).max(9_999_999),
  readingDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "readingDate must be YYYY-MM-DD")
    .optional(),
});

// A current KM reading, typically what the customer sent on WhatsApp.
serviceScheduleRouter.post(
  "/:vehicleId/odometer",
  validateBody(odometerSchema),
  asyncHandler(async (req, res) => {
    const { km, readingDate } = req.body as z.infer<typeof odometerSchema>;
    // A date-only reading is taken as midday that day, so it never lands on
    // the previous day in any timezone.
    const date = readingDate ? new Date(`${readingDate}T12:00:00`) : undefined;
    await recordOdometerReading(Number(req.params.vehicleId), km, req.user!.id, date);
    const row = (await getServiceSchedule()).find((r) => r.vehicleId === Number(req.params.vehicleId));
    res.status(201).json({ row });
  })
);
