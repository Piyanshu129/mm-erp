import { Request, Response } from "express";
import { z } from "zod";
import * as jobCardLabourService from "./jobCardLabour.service";

export const addLabourSchema = z.object({
  description: z.string().trim().min(1),
  technician: z.string().trim().min(1).optional(),
  quantity: z.coerce.number().int().positive().optional(),
  rate: z.coerce.number().min(0),
});

export async function addLabour(req: Request, res: Response) {
  const input = req.body as z.infer<typeof addLabourSchema>;
  const labour = await jobCardLabourService.addLabour({
    jobCardId: Number(req.params.jobCardId),
    ...input,
  });
  res.status(201).json({ labour });
}

export async function removeLabour(req: Request, res: Response) {
  await jobCardLabourService.removeLabour(Number(req.params.jobCardId), Number(req.params.labourId));
  res.status(204).send();
}
