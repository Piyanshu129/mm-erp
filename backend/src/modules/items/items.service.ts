import { prisma } from "../../lib/prisma";
import { NotFoundError, ConflictError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";

export interface ItemInput {
  name: string;
  category: string;
  subCategory?: string;
  partNumber?: string;
  brand?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  variant?: string;
  uom: string;
  purchaseCost?: number;
  sellingPrice?: number;
  minStock?: number;
  remarks?: string;
}

export async function listItems(
  q: string | undefined,
  category: string | undefined,
  page: PageParams
) {
  const where: any = {};
  if (q) {
    where.OR = [
      { itemCode: { contains: q, mode: "insensitive" as const } },
      { name: { contains: q, mode: "insensitive" as const } },
      { partNumber: { contains: q, mode: "insensitive" as const } },
    ];
  }
  if (category) {
    where.category = category;
  }

  const [total, items] = await Promise.all([
    prisma.item.count({ where }),
    prisma.item.findMany({ where, orderBy: { createdAt: "desc" }, ...toSkipTake(page) }),
  ]);

  return { total, items };
}

export async function getItem(id: number) {
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) throw new NotFoundError("Item not found");
  return item;
}

function assertSellingPriceValid(purchaseCost: number | undefined, sellingPrice: number | undefined) {
  if (purchaseCost != null && sellingPrice != null && sellingPrice < purchaseCost) {
    throw new ConflictError("Selling price cannot be lower than purchase cost");
  }
}

// itemCode is derived from the row's own id right after insert (ITM-000123),
// inside one transaction, so it's always unique and never hand-typed.
export async function createItem(input: ItemInput, photoUrl?: string) {
  assertSellingPriceValid(input.purchaseCost, input.sellingPrice);
  return prisma.$transaction(async (tx) => {
    const created = await tx.item.create({
      data: {
        ...input,
        itemCode: "PENDING",
        photoUrl,
      },
    });

    const itemCode = `ITM-${String(created.id).padStart(6, "0")}`;
    return tx.item.update({ where: { id: created.id }, data: { itemCode } });
  });
}

export async function updateItem(id: number, input: Partial<ItemInput>, photoUrl?: string) {
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) throw new NotFoundError("Item not found");

  assertSellingPriceValid(
    input.purchaseCost ?? Number(item.purchaseCost),
    input.sellingPrice ?? Number(item.sellingPrice)
  );

  return prisma.item.update({
    where: { id },
    data: { ...input, ...(photoUrl ? { photoUrl } : {}) },
  });
}

export async function setItemActive(id: number, isActive: boolean) {
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) throw new NotFoundError("Item not found");
  return prisma.item.update({ where: { id }, data: { isActive } });
}

// Full traceability trail for one item: every physical unit ever
// purchased, newest first — each one's own serial number, where it came
// from (purchase + supplier), and where it went (job card + vehicle) if
// issued. This replaced a separate stock-ledger table entirely: a unit's
// own relations already say everything a ledger entry would have.
export async function getItemStockHistory(id: number) {
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) throw new NotFoundError("Item not found");

  const units = await prisma.itemUnit.findMany({
    where: { itemId: id },
    include: {
      purchase: { include: { supplier: true } },
      jobCardPart: { include: { jobCard: { include: { vehicle: true } } } },
    },
    orderBy: { id: "desc" },
  });

  return units;
}

// The "browse and pick" convenience for Parts Issue — every serial of this
// item still sitting on the shelf, for when staff doesn't already have the
// physical part (and its sticker) in hand.
export async function getAvailableUnits(id: number) {
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) throw new NotFoundError("Item not found");

  return prisma.itemUnit.findMany({
    where: { itemId: id, status: "IN_STOCK" },
    orderBy: { id: "asc" },
  });
}
