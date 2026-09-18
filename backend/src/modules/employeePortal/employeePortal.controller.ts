import { Request, Response } from "express";
import { z } from "zod";
import * as employeePortalService from "./employeePortal.service";
import { publicUrlFor } from "../../middleware/upload";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const punchSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

export const summaryQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000),
});

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as z.infer<typeof loginSchema>;
  const result = await employeePortalService.login(email, password);
  res.json(result);
}

export async function me(req: Request, res: Response) {
  const employee = await employeePortalService.getMe(req.employee!.id);
  res.json({ employee });
}

export async function today(req: Request, res: Response) {
  const attendance = await employeePortalService.getTodayAttendance(req.employee!.id);
  res.json({ attendance });
}

export async function punch(req: Request, res: Response) {
  const input = punchSchema.parse(req.body);
  const selfieUrl = req.file ? publicUrlFor("employee-selfies", req.file.filename) : undefined;
  const attendance = await employeePortalService.punchAttendance(req.employee!.id, { ...input, selfieUrl });
  res.status(201).json({ attendance });
}

export async function summary(req: Request, res: Response) {
  const { month, year } = summaryQuerySchema.parse(req.query);
  const result = await employeePortalService.getMyMonthlySummary(req.employee!.id, month, year);
  res.json(result);
}
