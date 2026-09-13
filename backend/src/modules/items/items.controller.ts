import { Request, Response } from "express";
import { z } from "zod";
import * as itemsService from "./items.service";
import { parsePageParams } from "../../lib/pagination";
import { publicUrlFor } from "../../middleware/upload";

const optionalString = z.string().trim().min(1).optional();

export const ITEM_CATEGORIES = ["OEM", "Local", "Imported", "Old/Used"] as const;

// Multipart form fields all arrive as strings, hence z.coerce for numbers.
export const itemFieldsSchema = z.object({
  name: z.string().trim().min(1),
  category: z.enum(ITEM_CATEGORIES),
  subCategory: optionalString,
  partNumber: optionalString,
  brand: optionalString,
  vehicleMake: optionalString,
  vehicleModel: optionalString,
  variant: optionalString,
  uom: z.string().trim().min(1),
  purchaseCost: z.coerce.number().min(0).optional(),
  sellingPrice: z.coerce.number().min(0).optional(),
  minStock: z.coerce.number().int().min(0).optional(),
  remarks: optionalString,
});

export const updateItemFieldsSchema = itemFieldsSchema.partial();

export const setActiveSchema = z.object({ isActive: z.boolean() });

export async function list(req: Request, res: Response) {
  const page = parsePageParams(req.query);
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const { total, items } = await itemsService.listItems(q, category, page);
  res.json({ items, total, page: page.page, pageSize: page.pageSize });
}

export async function get(req: Request, res: Response) {
  const item = await itemsService.getItem(Number(req.params.id));
  res.json({ item });
}

export async function create(req: Request, res: Response) {
  const input = itemFieldsSchema.parse(req.body);
  const photoUrl = req.file ? publicUrlFor("items", req.file.filename) : undefined;
  const item = await itemsService.createItem(input, photoUrl);
  res.status(201).json({ item });
}

export async function update(req: Request, res: Response) {
  const input = updateItemFieldsSchema.parse(req.body);
  const photoUrl = req.file ? publicUrlFor("items", req.file.filename) : undefined;
  const item = await itemsService.updateItem(Number(req.params.id), input, photoUrl);
  res.json({ item });
}

export async function setActive(req: Request, res: Response) {
  const { isActive } = req.body as z.infer<typeof setActiveSchema>;
  const item = await itemsService.setItemActive(Number(req.params.id), isActive);
  res.json({ item });
}

export async function stockHistory(req: Request, res: Response) {
  const entries = await itemsService.getItemStockHistory(Number(req.params.id));
  res.json({ entries });
}
