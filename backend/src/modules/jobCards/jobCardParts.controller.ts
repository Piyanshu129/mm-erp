import { Request, Response } from "express";
import { z } from "zod";
import * as jobCardPartsService from "./jobCardParts.service";

export const addPartSchema = z.object({
  itemUnitId: z.coerce.number().int().positive(),
});

export async function addPart(req: Request, res: Response) {
  const input = req.body as z.infer<typeof addPartSchema>;
  const part = await jobCardPartsService.addPart({
    jobCardId: Number(req.params.jobCardId),
    itemUnitId: input.itemUnitId,
    createdById: req.user!.id,
  });
  res.status(201).json({ part });
}

export async function removePart(req: Request, res: Response) {
  await jobCardPartsService.removePart(Number(req.params.jobCardId), Number(req.params.partId));
  res.status(204).send();
}
