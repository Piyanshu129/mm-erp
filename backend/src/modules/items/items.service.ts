import { prisma } from "../../lib/prisma";
import { NotFoundError } from "../../lib/errors";
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

// itemCode is derived from the row's own id right after insert (ITM-000123),
// inside one transaction, so it's always unique and never hand-typed.
export async function createItem(input: ItemInput, photoUrl?: string) {
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

// Full traceability trail for one item — every IN (purchase) and, from
// Phase 4 on, every OUT (parts issue) movement, newest first.
export async function getItemStockHistory(id: number) {
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) throw new NotFoundError("Item not found");

  const entries = await prisma.stockLedger.findMany({
    where: { itemId: id },
    include: {
      purchase: { include: { supplier: true } },
      jobCardPart: { include: { jobCard: { include: { vehicle: true } } } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { id: "desc" },
  });

  return entries;
}
