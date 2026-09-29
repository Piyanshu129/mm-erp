import { prisma } from "../../lib/prisma";
import { NotFoundError, ConflictError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";

// SPARE_PART/PAINT/TOOL are inventory types — they need an Item and generate
// one ItemUnit (a physically-serialed part) per unit of quantity. The rest
// are plain business expenses with no stock implications at all.
export const INVENTORY_ITEM_TYPES = ["SPARE_PART", "PAINT", "TOOL"] as const;
export const EXPENSE_ITEM_TYPES = ["TRAVEL", "PETROL", "FOOD", "OTHERS"] as const;
export const PURCHASE_ITEM_TYPES = [...INVENTORY_ITEM_TYPES, ...EXPENSE_ITEM_TYPES] as const;

export interface NewItemInput {
  name: string;
  category: string;
  uom: string;
  minStock?: number;
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
  supplierId: number;
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
  units: { select: { id: true } },
} as const;

function isInventoryType(itemType: string): boolean {
  return (INVENTORY_ITEM_TYPES as readonly string[]).includes(itemType);
}

export async function listPurchases(page: PageParams, itemId?: number) {
  const where = itemId ? { itemId } : {};
  const [total, purchases] = await Promise.all([
    prisma.purchase.count({ where }),
    prisma.purchase.findMany({
      where,
      include: purchaseInclude,
      orderBy: { id: "desc" },
      ...toSkipTake(page),
    }),
  ]);
  return { total, purchases };
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
// its own id, same as the Items page), (b) records the purchase, (c)
// creates one ItemUnit per unit of quantity — each gets its own permanent
// serial number (its own row id), written on a sticker and placed on the
// physical part — and (d) bumps the item's cached stock count by exactly the
// number of units just created. An expense line (Travel/Petrol/Food/Others)
// just records the cost — no item, no units, no stock change.
export async function createPurchaseEntry(input: PurchaseEntryInput) {
  if (input.lines.length === 0) {
    throw new ConflictError("Add at least one item to the purchase");
  }
  input.lines.forEach((line, i) => validateLine(line, `Item ${i + 1}`));

  const purchaseDate = input.purchaseDate ? new Date(input.purchaseDate) : new Date();

  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier) throw new NotFoundError("Supplier not found");

    const createdIds: number[] = [];

    for (const [i, line] of input.lines.entries()) {
      const label = `Item ${i + 1}`;
      const inventory = isInventoryType(line.itemType);

      let itemId: number | undefined;
      if (inventory && line.newItem) {
        const created = await tx.item.create({
          data: {
            name: line.newItem.name,
            category: line.newItem.category,
            uom: line.newItem.uom,
            minStock: line.newItem.minStock,
            photoUrl: line.newItem.photoUrl,
            itemCode: "PENDING",
          },
        });
        await tx.item.update({
          where: { id: created.id },
          data: { itemCode: `ITM-${String(created.id).padStart(6, "0")}` },
        });
        itemId = created.id;
      } else if (inventory) {
        const item = await tx.item.findUnique({ where: { id: line.itemId! } });
        if (!item) throw new NotFoundError(`${label}: item not found`);
        itemId = item.id;
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
          remarks: input.remarks,
          purchaseDate,
          createdById: input.createdById,
        },
      });
      createdIds.push(purchase.id);

      if (inventory && itemId != null) {
        await tx.itemUnit.createMany({
          data: Array.from({ length: line.quantity }, () => ({ itemId: itemId!, purchaseId: purchase.id })),
        });

        await tx.item.update({
          where: { id: itemId },
          data: {
            currentStock: { increment: line.quantity },
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
