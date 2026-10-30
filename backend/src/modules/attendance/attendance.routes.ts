import { Router } from "express";
import * as attendanceController from "./attendance.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../middleware/errorHandler";

export const attendanceRouter = Router();

attendanceRouter.use(authenticate, requirePermission("ATTENDANCE"));

attendanceRouter.get("/", asyncHandler(attendanceController.forDate));
attendanceRouter.get("/summary", asyncHandler(attendanceController.summary));
attendanceRouter.get("/month-summary", asyncHandler(attendanceController.monthSummary));
attendanceRouter.post(
  "/",
  validateBody(attendanceController.markAttendanceSchema),
  asyncHandler(attendanceController.mark)
);
