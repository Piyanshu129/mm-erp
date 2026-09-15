import { Router } from "express";
import * as attendanceController from "./attendance.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { asyncHandler } from "../../middleware/errorHandler";

export const attendanceRouter = Router();

attendanceRouter.use(authenticate);

attendanceRouter.get("/", asyncHandler(attendanceController.forDate));
attendanceRouter.get("/summary", asyncHandler(attendanceController.summary));
attendanceRouter.post(
  "/",
  validateBody(attendanceController.markAttendanceSchema),
  asyncHandler(attendanceController.mark)
);
