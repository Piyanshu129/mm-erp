import { Request, Response } from "express";
import { z } from "zod";
import * as attendanceService from "./attendance.service";
import { ATTENDANCE_STATUSES } from "./attendance.service";
import { ForbiddenError } from "../../lib/errors";

export const markAttendanceSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  status: z.enum(ATTENDANCE_STATUSES),
});

export const summaryQuerySchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000),
});

export async function forDate(req: Request, res: Response) {
  const date = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().slice(0, 10);
  const rows = await attendanceService.getAttendanceForDate(date);
  res.json({ date, rows });
}

export async function mark(req: Request, res: Response) {
  const input = req.body as z.infer<typeof markAttendanceSchema>;
  // Past days are settled: only an admin can add or change them.
  if (req.user!.role !== "ADMIN" && input.date.slice(0, 10) < attendanceService.todayLocalISO()) {
    throw new ForbiddenError("Only an admin can add or change attendance for a previous date");
  }
  const attendance = await attendanceService.markAttendance(
    input.employeeId,
    input.date,
    input.status,
    req.user!.id
  );
  res.json({ attendance });
}

export async function summary(req: Request, res: Response) {
  const { employeeId, month, year } = summaryQuerySchema.parse(req.query);
  const result = await attendanceService.getMonthlySummary(employeeId, month, year);
  res.json(result);
}
