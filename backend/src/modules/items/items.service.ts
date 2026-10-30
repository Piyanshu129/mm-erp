import { prisma } from "../../lib/prisma";
import { NotFoundError, ConflictError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";
import { formatItemCode, normalizeItemCode } from "../../lib/itemCode";

export interface ItemInput {
  name: string;
  category: string;
  subCategory?: string;
  partNumber?: string;
  brand?: string;
  specification?: string;
  hsnCode?: string;
  gstRate?: number;
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
      { brand: { contains: q, mode: "insensitive" as const } },
    ];
  }
  if (category) {
    where.category = category;
  }

  const [total, items] = await Promise.all([
    prisma.item.count({ where }),
    prisma.item.findMany({ where, orderBy: { createdAt: "desc" }, ...toSkipTake(page) }),
  ]);

  // Purchased Qty (everything ever bought) alongside Available Qty
  // (currentStock — what's left after job cards used some).
  const purchased = await prisma.purchase.groupBy({
    by: ["itemId"],
    where: { itemId: { in: items.map((i) => i.id) } },
    _sum: { quantity: true },
  });
  const purchasedByItem = new Map(purchased.map((p) => [p.itemId, p._sum.quantity ?? 0]));

  return { total, items: items.map((i) => ({ ...i, purchasedQty: purchasedByItem.get(i.id) ?? 0 })) };
}

// The item for a code typed on a job card or estimate ("1", "0001", ...),
// with what's available — the job card's parts entry fetches this.
export async function getItemByCode(code: string) {
  const itemCode = normalizeItemCode(code);
  const item = itemCode ? await prisma.item.findUnique({ where: { itemCode } }) : null;
  if (!item) throw new NotFoundError(`No item with code ${code}`);
  return item;
}

export async function getItem(id: number) {
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) throw new NotFoundError("Item not found");
  return item;
}

function assertSellingPriceValid(purchaseCost: number | undefined, sellingPrice: number | undefined) {
  if (purchaseCost != null && sellingPrice != null && sellingPrice < purchaseCost) {
    throw new ConflictError("MRP cannot be lower than purchase cost");
  }
}

// itemCode is derived from the row's own id right after insert (0001,
// 0002, ...), inside one transaction, so it's always unique and never
// hand-typed.
export async function createItem(input: ItemInput, photoUrl?: string) {
  assertSellingPriceValid(input.purchaseCost, input.sellingPrice);
  return prisma.$transaction(async (tx) => {
    const created = await tx.item.create({
      data: {
        ...input,
        itemCode: `PENDING-${Date.now()}-${Math.random()}`,
        photoUrl,
      },
    });

    return tx.item.update({ where: { id: created.id }, data: { itemCode: formatItemCode(created.id) } });
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

// The item's stock movements: every purchase that brought quantity in
// (with its sticker labels) and every job card that used some.
export async function getItemStockHistory(id: number) {
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) throw new NotFoundError("Item not found");

  const [purchases, issues] = await Promise.all([
    prisma.purchase.findMany({
      where: { itemId: id },
      select: {
        id: true,
        purchaseDate: true,
        quantity: true,
        purchaseCost: true,
        stickerFrom: true,
        stickerTo: true,
        supplier: { select: { name: true } },
      },
      orderBy: { id: "desc" },
    }),
    prisma.jobCardPart.findMany({
      where: { itemId: id },
      select: {
        id: true,
        quantity: true,
        createdAt: true,
        jobCard: { select: { id: true, jobCardNumber: true, vehicle: { select: { registrationNumber: true } } } },
      },
      orderBy: { id: "desc" },
    }),
  ]);

  return { purchases, issues };
}
