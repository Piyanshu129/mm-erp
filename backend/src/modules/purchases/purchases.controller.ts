import { Request, Response } from "express";
import { z } from "zod";
import * as purchasesService from "./purchases.service";
import { PURCHASE_ITEM_TYPES } from "./purchases.service";
import { ITEM_CATEGORIES } from "../items/items.controller";
import { parsePageParams } from "../../lib/pagination";
import { publicUrlFor, PURCHASE_BILL_FIELD, ITEM_PHOTO_FIELD } from "../../middleware/upload";

const optionalString = z.string().trim().min(1).optional();

const MAX_LINES = 50;

const lineSchema = z.object({
  itemType: z.enum(PURCHASE_ITEM_TYPES),
  itemId: z.coerce.number().int().positive().optional(),
  newItem: z
    .object({
      name: z.string().trim().min(1),
      category: z.enum(ITEM_CATEGORIES),
      uom: z.string().trim().min(1),
      minStock: z.coerce.number().int().min(0).optional(),
    })
    .optional(),
  description: optionalString,
  quantity: z.coerce.number().int().positive(),
  purchaseCost: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0).optional(),
});

// Multipart form fields all arrive as strings — the lines themselves come as
// one JSON-encoded field so each can carry nested new-item details.
export const createPurchaseSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  purchaseDate: optionalString,
  remarks: optionalString,
  lines: z
    .string()
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw);
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "lines must be valid JSON" });
        return z.NEVER;
      }
    })
    .pipe(z.array(lineSchema).min(1, "Add at least one item").max(MAX_LINES, `At most ${MAX_LINES} items per purchase`)),
});

export async function list(req: Request, res: Response) {
  const page = parsePageParams(req.query);
  const itemId = req.query.itemId ? Number(req.query.itemId) : undefined;
  const { total, purchases } = await purchasesService.listPurchases(page, itemId);
  res.json({ purchases, total, page: page.page, pageSize: page.pageSize });
}

export async function create(req: Request, res: Response) {
  const input = createPurchaseSchema.parse(req.body);

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  let billUrl: string | undefined;
  const itemPhotoUrls = new Map<number, string>();
  for (const file of files) {
    if (file.fieldname === PURCHASE_BILL_FIELD) {
      billUrl = publicUrlFor("purchase-bills", file.filename);
      continue;
    }
    const match = ITEM_PHOTO_FIELD.exec(file.fieldname);
    if (match) itemPhotoUrls.set(Number(match[1]), publicUrlFor("items", file.filename));
  }

  const purchases = await purchasesService.createPurchaseEntry({
    supplierId: input.supplierId,
    purchaseDate: input.purchaseDate,
    remarks: input.remarks,
    billUrl,
    lines: input.lines.map((line, i) => ({
      ...line,
      newItem: line.newItem ? { ...line.newItem, photoUrl: itemPhotoUrls.get(i) } : undefined,
    })),
    createdById: req.user!.id,
  });
  res.status(201).json({ purchases });
}
