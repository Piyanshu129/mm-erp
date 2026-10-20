import { Request, Response } from "express";
import { z } from "zod";
import * as jobCardPartsService from "./jobCardParts.service";

// Either an inventory item (itemId) or a part not in inventory
// (description + rate) — the service says which is missing. Quantity can
// be part of a unit, e.g. 0.5.
export const addPartSchema = z.object({
  itemId: z.coerce.number().int().positive().optional(),
  description: z.string().trim().min(1).optional(),
  rate: z.coerce.number().min(0).optional(),
  quantity: z.coerce.number().positive("Quantity must be more than 0").max(100000),
});

export async function addPart(req: Request, res: Response) {
  const input = req.body as z.infer<typeof addPartSchema>;
  const part = await jobCardPartsService.addPart({
    jobCardId: Number(req.params.jobCardId),
    itemId: input.itemId,
    description: input.description,
    rate: input.rate,
    quantity: input.quantity,
    createdById: req.user!.id,
  });
  res.status(201).json({ part });
}

export async function removePart(req: Request, res: Response) {
  await jobCardPartsService.removePart(Number(req.params.jobCardId), Number(req.params.partId));
  res.status(204).send();
}
