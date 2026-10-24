import { Request, Response } from "express";
import { z } from "zod";
import * as advancesService from "./advances.service";

export const recordAdvanceSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  amount: z.coerce.number().positive(),
  notes: z.string().trim().min(1).optional(),
});

const listQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM"),
  employeeId: z.coerce.number().int().positive().optional(),
});

export async function list(req: Request, res: Response) {
  const { month, employeeId } = listQuerySchema.parse(req.query);
  const advances = await advancesService.listAdvances(month, employeeId);
  res.json({ advances });
}

export async function history(req: Request, res: Response) {
  res.json(await advancesService.advanceHistory(Number(req.params.employeeId)));
}

export async function create(req: Request, res: Response) {
  const input = req.body as z.infer<typeof recordAdvanceSchema>;
  const { advance, warning } = await advancesService.recordAdvance(input, req.user!.id);
  res.status(201).json({ advance, warning });
}

export async function remove(req: Request, res: Response) {
  await advancesService.deleteAdvance(Number(req.params.id));
  res.status(204).send();
}
