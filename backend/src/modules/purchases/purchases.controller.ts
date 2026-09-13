import { Request, Response } from "express";
import { z } from "zod";
import * as purchasesService from "./purchases.service";
import { parsePageParams } from "../../lib/pagination";

export const createPurchaseSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  itemId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive(),
  purchaseCost: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0).optional(),
  purchaseDate: z.string().trim().min(1).optional(),
  remarks: z.string().trim().min(1).optional(),
});

export async function list(req: Request, res: Response) {
  const page = parsePageParams(req.query);
  const itemId = req.query.itemId ? Number(req.query.itemId) : undefined;
  const { total, purchases } = await purchasesService.listPurchases(page, itemId);
  res.json({ purchases, total, page: page.page, pageSize: page.pageSize });
}

export async function create(req: Request, res: Response) {
  const input = req.body as z.infer<typeof createPurchaseSchema>;
  const purchase = await purchasesService.createPurchase({ ...input, createdById: req.user!.id });
  res.status(201).json({ purchase });
}
