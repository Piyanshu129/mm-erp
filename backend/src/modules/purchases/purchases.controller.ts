import { Request, Response } from "express";
import { z } from "zod";
import * as purchasesService from "./purchases.service";
import { PURCHASE_ITEM_TYPES, PURCHASE_CATEGORIES } from "./purchases.service";
import { ITEM_CATEGORIES } from "../items/items.controller";
import { parsePageParams } from "../../lib/pagination";
import { AppError } from "../../lib/errors";
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
      vehicleMake: optionalString,
      vehicleModel: optionalString,
      variant: optionalString,
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
  // Required for spare parts/paint/tools, omitted for expenses — the service
  // enforces which.
  supplierId: z.coerce.number().int().positive().optional(),
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

const listQuerySchema = z.object({
  itemId: z.coerce.number().int().positive().optional(),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM")
    .optional(),
  category: z.enum(PURCHASE_CATEGORIES).optional(),
  itemType: z.enum(PURCHASE_ITEM_TYPES).optional(),
});

export async function list(req: Request, res: Response) {
  const page = parsePageParams(req.query);
  const filters = listQuerySchema.parse(req.query);
  const { total, purchases, summary } = await purchasesService.listPurchases(page, filters);
  res.json({ purchases, total, page: page.page, pageSize: page.pageSize, summary });
}

const FIELD_LABELS: Record<string, string> = {
  itemType: "type",
  itemId: "item",
  quantity: "quantity",
  purchaseCost: "purchase cost",
  sellingPrice: "MRP",
  description: "description",
  name: "item name",
  category: "category",
  uom: "unit of measure",
  minStock: "minimum stock",
  supplierId: "supplier",
  purchaseDate: "purchase date",
};

// "Item 3: purchase cost — Expected number, received string" rather than a
// bare "Validation failed": says which line and which field to fix.
function describeIssue(issue: z.ZodIssue): string {
  const [first, index, ...rest] = issue.path;
  if (first === "lines" && typeof index === "number") {
    const field = rest.filter((p) => typeof p === "string").pop() as string | undefined;
    return `Item ${index + 1}: ${field ? `${FIELD_LABELS[field] ?? field} — ` : ""}${issue.message}`;
  }
  const field = typeof first === "string" ? FIELD_LABELS[first] ?? first : undefined;
  return field ? `${field}: ${issue.message}` : issue.message;
}

export async function create(req: Request, res: Response) {
  const parsed = createPurchaseSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues.slice(0, 3).map(describeIssue).join("; "));
  }
  const input = parsed.data;

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

  // Photos are mandatory: the bill for every purchase, and a photo of every
  // new item (existing items already have theirs).
  if (!billUrl) throw new AppError(400, "A photo of the bill / receipt is required");
  input.lines.forEach((line, i) => {
    if (line.newItem && !itemPhotoUrls.has(i)) {
      throw new AppError(400, `Item ${i + 1}: a photo of the new item is required`);
    }
  });

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
