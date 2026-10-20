import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { NotFoundError, ConflictError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";
import { formatItemCode } from "../../lib/itemCode";
import { addStock } from "../../lib/stock";

// SPARE_PART/PAINT/TOOL/ELECTRICAL/SETTINGS_ADJUSTMENTS are inventory types — they need an Item and add
// their quantity to its stock. The rest are plain business expenses with no
// stock implications at all.
export const INVENTORY_ITEM_TYPES = ["SPARE_PART", "PAINT", "TOOL", "ELECTRICAL", "SETTINGS_ADJUSTMENTS"] as const;
export const EXPENSE_ITEM_TYPES = ["TRAVEL", "PETROL", "FOOD", "RENT", "BILLS_UTILITIES", "OTHERS"] as const;
export const PURCHASE_ITEM_TYPES = [...INVENTORY_ITEM_TYPES, ...EXPENSE_ITEM_TYPES] as const;
export const PURCHASE_CATEGORIES = ["INVENTORY", "EXPENSE"] as const;

export type PurchaseItemType = (typeof PURCHASE_ITEM_TYPES)[number];
export type PurchaseCategory = (typeof PURCHASE_CATEGORIES)[number];

export interface NewItemInput {
  name: string;
  brand?: string;
  specification?: string;
  category: string;
  uom: string;
  minStock?: number;
  vehicleMake?: string;
  vehicleModel?: string;
  variant?: string;
  photoUrl?: string;
}

// One line of a purchase entry. An inventory line references either an
// existing item (itemId) or registers a new one inline (newItem) — never
// both. An expense line has only a description and a cost.
export interface PurchaseLineInput {
  itemType: (typeof PURCHASE_ITEM_TYPES)[number];
  itemId?: number;
  newItem?: NewItemInput;
  description?: string;
  quantity: number;
  purchaseCost: number;
  sellingPrice?: number;
}

export interface PurchaseEntryInput {
  supplierId?: number;
  purchaseDate?: string;
  billUrl?: string;
  remarks?: string;
  lines: PurchaseLineInput[];
  createdById: number;
}

const purchaseInclude = {
  supplier: true,
  item: true,
  createdBy: { select: { id: true, name: true } },
} as const;

export function isInventoryType(itemType: string): boolean {
  return (INVENTORY_ITEM_TYPES as readonly string[]).includes(itemType);
}

export function categoryOf(itemType: string): PurchaseCategory {
  return isInventoryType(itemType) ? "INVENTORY" : "EXPENSE";
}

export interface PurchaseFilters {
  itemId?: number;
  month?: string; // YYYY-MM
  category?: PurchaseCategory;
  itemType?: PurchaseItemType;
}

export interface DateRange {
  start: Date;
  end: Date; // exclusive
}

// Calendar month in the server's own timezone (the workshop PC, IST), so a
// purchase dated the 1st lands in that month rather than the previous one.
export function monthRange(month: string): DateRange {
  const [year, m] = month.split("-").map(Number);
  return { start: new Date(year, m - 1, 1), end: new Date(year, m, 1) };
}

export interface PurchaseTotals {
  byType: Record<string, { count: number; total: number }>;
  inventoryTotal: number;
  expenseTotal: number;
  total: number;
}

// What was spent in a period, broken down by purchase type — a line's value
// is quantity × per-unit cost. Summed in the database, so it covers every
// purchase in the period, not just the page of rows being shown.
export async function purchaseTotals(range?: DateRange, itemId?: number): Promise<PurchaseTotals> {
  const conditions: Prisma.Sql[] = [];
  if (range) conditions.push(Prisma.sql`purchase_date >= ${range.start} AND purchase_date < ${range.end}`);
  if (itemId) conditions.push(Prisma.sql`item_id = ${itemId}`);
  const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;

  const rows = await prisma.$queryRaw<{ item_type: string; count: bigint; total: Prisma.Decimal }[]>`
    SELECT item_type, COUNT(*) AS count, COALESCE(SUM(quantity * purchase_cost), 0) AS total
    FROM purchases
    ${where}
    GROUP BY item_type
  `;

  const totals: PurchaseTotals = { byType: {}, inventoryTotal: 0, expenseTotal: 0, total: 0 };
  for (const row of rows) {
    const total = Number(row.total);
    totals.byType[row.item_type] = { count: Number(row.count), total };
    if (isInventoryType(row.item_type)) totals.inventoryTotal += total;
    else totals.expenseTotal += total;
    totals.total += total;
  }
  return totals;
}

// The list is filtered by month, category and type, and paged. The summary
// covers the whole month for every type (not just the filtered rows), so
// the page can show the month's totals whichever filter is active.
export async function listPurchases(page: PageParams, filters: PurchaseFilters = {}) {
  const range = filters.month ? monthRange(filters.month) : undefined;

  const where: Prisma.PurchaseWhereInput = {};
  if (filters.itemId) where.itemId = filters.itemId;
  if (range) where.purchaseDate = { gte: range.start, lt: range.end };
  if (filters.itemType) {
    where.itemType = filters.itemType;
  } else if (filters.category) {
    where.itemType = { in: [...(filters.category === "INVENTORY" ? INVENTORY_ITEM_TYPES : EXPENSE_ITEM_TYPES)] };
  }

  const [total, purchases, summary] = await Promise.all([
    prisma.purchase.count({ where }),
    prisma.purchase.findMany({
      where,
      include: purchaseInclude,
      orderBy: [{ purchaseDate: "desc" }, { id: "desc" }],
      ...toSkipTake(page),
    }),
    purchaseTotals(range, filters.itemId),
  ]);
  return { total, purchases, summary };
}

// Every problem with a line is reported against its position in the form
// ("Item 2: ...") so the user can tell which of several lines to fix.
function validateLine(line: PurchaseLineInput, label: string) {
  if (!PURCHASE_ITEM_TYPES.includes(line.itemType)) {
    throw new ConflictError(`${label}: invalid item type ${line.itemType}`);
  }
  if (isInventoryType(line.itemType)) {
    if (!line.itemId && !line.newItem) {
      throw new ConflictError(`${label}: choose an existing item or enter a new one`);
    }
    if (line.itemId && line.newItem) {
      throw new ConflictError(`${label}: can't be both an existing item and a new item`);
    }
    if (line.sellingPrice != null && line.sellingPrice < line.purchaseCost) {
      throw new ConflictError(`${label}: MRP cannot be lower than purchase cost`);
    }
  } else if (!line.description) {
    throw new ConflictError(`${label}: ${line.itemType.toLowerCase()} purchases must have a description`);
  }
}

// The single most business-critical operation in the system. One purchase
// entry (one supplier, one bill) can contain several lines, and the whole
// entry is saved atomically — every line or none. For each inventory line
// this: (a) registers the item first if it's new (Item Code derived from
// its own id, same as the Items page), (b) records the purchase with the
// next sticker range for that item (1.1–1.10, then 1.11… on the next
// purchase), and (c) adds the quantity to the item's stock. An expense line
// (Travel/Petrol/Food/Others) just records the cost — no item, no stock.
export async function createPurchaseEntry(input: PurchaseEntryInput) {
  if (input.lines.length === 0) {
    throw new ConflictError("Add at least one item to the purchase");
  }
  input.lines.forEach((line, i) => validateLine(line, `Item ${i + 1}`));

  // Parts, paint and tools are bought from a supplier and go on their
  // account; an expense-only entry doesn't need one.
  if (!input.supplierId && input.lines.some((line) => isInventoryType(line.itemType))) {
    throw new ConflictError("Choose a supplier — spare parts, paint and tools must come from a supplier");
  }

  // A purchase date is a calendar date, stored at midnight UTC (that's what
  // "YYYY-MM-DD" parses to). With none given it's today on the workshop's
  // calendar — stored the same way, so day-wise reports find it.
  const purchaseDate = new Date(`${input.purchaseDate?.slice(0, 10) ?? new Date().toLocaleDateString("en-CA")}T00:00:00Z`);

  return prisma.$transaction(async (tx) => {
    if (input.supplierId) {
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw new NotFoundError("Supplier not found");
    }

    const createdIds: number[] = [];

    for (const [i, line] of input.lines.entries()) {
      const label = `Item ${i + 1}`;
      const inventory = isInventoryType(line.itemType);

      let itemId: number | undefined;
      if (inventory && line.newItem) {
        const created = await tx.item.create({
          data: {
            name: line.newItem.name,
            brand: line.newItem.brand,
            specification: line.newItem.specification,
            category: line.newItem.category,
            uom: line.newItem.uom,
            minStock: line.newItem.minStock,
            vehicleMake: line.newItem.vehicleMake,
            vehicleModel: line.newItem.vehicleModel,
            variant: line.newItem.variant,
            photoUrl: line.newItem.photoUrl,
            itemCode: `PENDING-${Date.now()}-${i}`,
          },
        });
        await tx.item.update({
          where: { id: created.id },
          data: { itemCode: formatItemCode(created.id) },
        });
        itemId = created.id;
      } else if (inventory) {
        const item = await tx.item.findUnique({ where: { id: line.itemId! } });
        if (!item) throw new NotFoundError(`${label}: item not found`);
        itemId = item.id;
      }

      // Next sticker numbers for this item. The item row is locked first so
      // two purchases of the same item saved at once can't both take the
      // same numbers.
      let stickerFrom: number | undefined;
      let stickerTo: number | undefined;
      if (inventory && itemId != null) {
        await tx.$queryRaw`SELECT id FROM items WHERE id = ${itemId} FOR UPDATE`;
        const last = await tx.purchase.aggregate({ where: { itemId }, _max: { stickerTo: true } });
        stickerFrom = (last._max.stickerTo ?? 0) + 1;
        // One sticker per piece; a part piece (the 0.5 of 2.5 L) gets one too.
        stickerTo = stickerFrom + Math.ceil(line.quantity) - 1;
      }

      const purchase = await tx.purchase.create({
        data: {
          supplierId: input.supplierId,
          itemType: line.itemType,
          itemId,
          description: inventory ? undefined : line.description,
          quantity: inventory ? line.quantity : 1,
          purchaseCost: line.purchaseCost,
          sellingPrice: inventory ? line.sellingPrice : undefined,
          billUrl: input.billUrl,
          stickerFrom,
          stickerTo,
          remarks: input.remarks,
          purchaseDate,
          createdById: input.createdById,
        },
      });
      createdIds.push(purchase.id);

      if (inventory && itemId != null) {
        await addStock(tx, itemId, line.quantity);
        await tx.item.update({
          where: { id: itemId },
          data: {
            purchaseCost: line.purchaseCost,
            ...(line.sellingPrice != null ? { sellingPrice: line.sellingPrice } : {}),
          },
        });
      }
    }

    return tx.purchase.findMany({
      where: { id: { in: createdIds } },
      include: purchaseInclude,
      orderBy: { id: "asc" },
    });
  });
}
