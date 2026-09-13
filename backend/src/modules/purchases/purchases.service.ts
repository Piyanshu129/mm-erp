import { prisma } from "../../lib/prisma";
import { NotFoundError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";

export interface PurchaseInput {
  supplierId: number;
  itemId: number;
  quantity: number;
  purchaseCost: number;
  sellingPrice?: number;
  purchaseDate?: string;
  remarks?: string;
  createdById: number;
}

const purchaseInclude = {
  supplier: true,
  item: true,
  createdBy: { select: { id: true, name: true } },
} as const;

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

// The single most business-critical operation in the system: one purchase
// atomically (a) records the transaction with its serial number (the row's
// own id), (b) increments the item's stock via a DB-level atomic increment
// (not read-then-write, so two simultaneous purchases of the same item can
// never lose an update), and (c) appends a ledger entry for traceability.
// If any step fails, all of it rolls back — stock and the ledger can never
// drift out of sync with the purchases that supposedly caused them.
export async function createPurchase(input: PurchaseInput) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.item.findUnique({ where: { id: input.itemId } });
    if (!item) throw new NotFoundError("Item not found");

    const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier) throw new NotFoundError("Supplier not found");

    const purchase = await tx.purchase.create({
      data: {
        supplierId: input.supplierId,
        itemId: input.itemId,
        quantity: input.quantity,
        purchaseCost: input.purchaseCost,
        sellingPrice: input.sellingPrice,
        remarks: input.remarks,
        purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : new Date(),
        createdById: input.createdById,
      },
      include: purchaseInclude,
    });

    const updatedItem = await tx.item.update({
      where: { id: item.id },
      data: {
        currentStock: { increment: input.quantity },
        purchaseCost: input.purchaseCost,
        ...(input.sellingPrice != null ? { sellingPrice: input.sellingPrice } : {}),
      },
    });

    await tx.stockLedger.create({
      data: {
        itemId: item.id,
        direction: "IN",
        quantity: input.quantity,
        balanceAfter: updatedItem.currentStock,
        referenceType: "PURCHASE",
        purchaseId: purchase.id,
        createdById: input.createdById,
      },
    });

    return purchase;
  });
}
