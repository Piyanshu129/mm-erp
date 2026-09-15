import { Request, Response } from "express";
import { z } from "zod";
import * as purchasesService from "./purchases.service";
import { PURCHASE_ITEM_TYPES } from "./purchases.service";
import { parsePageParams } from "../../lib/pagination";
import { publicUrlFor } from "../../middleware/upload";

const optionalString = z.string().trim().min(1).optional();

// Multipart form fields all arrive as strings, hence z.coerce for numbers.
export const createPurchaseSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  itemType: z.enum(PURCHASE_ITEM_TYPES),
  itemId: z.coerce.number().int().positive().optional(),
  description: optionalString,
  quantity: z.coerce.number().int().positive(),
  purchaseCost: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0).optional(),
  paymentAmount: z.coerce.number().min(0).optional(),
  paymentMode: optionalString,
  paymentReference: optionalString,
  paymentBy: optionalString,
  purchaseDate: optionalString,
  remarks: optionalString,
});

export const recordPaymentSchema = z.object({
  paymentAmount: z.coerce.number().min(0),
  paymentMode: optionalString,
  paymentReference: optionalString,
  paymentBy: optionalString,
});

export async function list(req: Request, res: Response) {
  const page = parsePageParams(req.query);
  const itemId = req.query.itemId ? Number(req.query.itemId) : undefined;
  const { total, purchases } = await purchasesService.listPurchases(page, itemId);
  res.json({ purchases, total, page: page.page, pageSize: page.pageSize });
}

export async function create(req: Request, res: Response) {
  const input = createPurchaseSchema.parse(req.body);
  const billUrl = req.file ? publicUrlFor("purchase-bills", req.file.filename) : undefined;
  const purchase = await purchasesService.createPurchase({
    ...input,
    billUrl,
    createdById: req.user!.id,
  });
  res.status(201).json({ purchase });
}

export async function recordPayment(req: Request, res: Response) {
  const input = req.body as z.infer<typeof recordPaymentSchema>;
  const purchase = await purchasesService.recordPurchasePayment(Number(req.params.id), input);
  res.json({ purchase });
}
