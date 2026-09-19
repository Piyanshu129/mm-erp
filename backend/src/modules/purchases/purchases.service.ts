import { prisma } from "../../lib/prisma";
import { NotFoundError, ConflictError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";

// SPARE_PART/PAINT/TOOL are inventory types — they need an Item and generate
// one ItemUnit (a physically-serialed part) per unit of quantity. The rest
// are plain business expenses with no stock implications at all.
export const INVENTORY_ITEM_TYPES = ["SPARE_PART", "PAINT", "TOOL"] as const;
export const EXPENSE_ITEM_TYPES = ["TRAVEL", "PETROL", "FOOD", "OTHERS"] as const;
export const PURCHASE_ITEM_TYPES = [...INVENTORY_ITEM_TYPES, ...EXPENSE_ITEM_TYPES] as const;

export interface PurchaseInput {
  supplierId: number;
  itemType: (typeof PURCHASE_ITEM_TYPES)[number];
  itemId?: number;
  description?: string;
  quantity: number;
  purchaseCost: number;
  sellingPrice?: number;
  billUrl?: string;
  paymentAmount?: number;
  paymentMode?: string;
  paymentReference?: string;
  paymentBy?: string;
  purchaseDate?: string;
  remarks?: string;
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

export function paymentStatusFor(total: number, paid: number): "PENDING" | "PARTIAL" | "PAID" {
  if (paid <= 0) return "PENDING";
  if (paid >= total) return "PAID";
  return "PARTIAL";
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

// The single most business-critical operation in the system. For an
// inventory purchase this atomically: (a) records the purchase, (b) creates
// one ItemUnit per unit of quantity — each gets its own permanent serial
// number (its own row id), written on a sticker and placed on the physical
// part — and (c) bumps the item's cached stock count by exactly the number
// of units just created. An expense purchase (Travel/Petrol/Food/Others)
// just records the cost — no item, no units, no stock change.
export async function createPurchase(input: PurchaseInput) {
  if (!PURCHASE_ITEM_TYPES.includes(input.itemType)) {
    throw new ConflictError(`Invalid item type: ${input.itemType}`);
  }
  const inventoryType = isInventoryType(input.itemType);
  if (inventoryType && !input.itemId) {
    throw new ConflictError(`${input.itemType} purchases must reference an item`);
  }
  if (!inventoryType && !input.description) {
    throw new ConflictError(`${input.itemType} purchases must have a description`);
  }
  if (inventoryType && input.sellingPrice != null && input.sellingPrice < input.purchaseCost) {
    throw new ConflictError("Selling price cannot be lower than purchase cost");
  }

  return prisma.$transaction(async (tx) => {
    let item = null;
    if (inventoryType) {
      item = await tx.item.findUnique({ where: { id: input.itemId! } });
      if (!item) throw new NotFoundError("Item not found");
    }

    const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier) throw new NotFoundError("Supplier not found");

    const purchase = await tx.purchase.create({
      data: {
        supplierId: input.supplierId,
        itemType: input.itemType,
        itemId: inventoryType ? input.itemId : undefined,
        description: input.description,
        quantity: input.quantity,
        purchaseCost: input.purchaseCost,
        sellingPrice: input.sellingPrice,
        billUrl: input.billUrl,
        paymentAmount: input.paymentAmount ?? 0,
        paymentMode: input.paymentMode,
        paymentReference: input.paymentReference,
        paymentBy: input.paymentBy,
        paymentDate: (input.paymentAmount ?? 0) > 0 ? new Date() : undefined,
        remarks: input.remarks,
        purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : new Date(),
        createdById: input.createdById,
      },
    });

    if (inventoryType && item) {
      await tx.itemUnit.createMany({
        data: Array.from({ length: input.quantity }, () => ({
          itemId: item!.id,
          purchaseId: purchase.id,
        })),
      });

      await tx.item.update({
        where: { id: item.id },
        data: {
          currentStock: { increment: input.quantity },
          purchaseCost: input.purchaseCost,
          ...(input.sellingPrice != null ? { sellingPrice: input.sellingPrice } : {}),
        },
      });
    }

    return tx.purchase.findUniqueOrThrow({ where: { id: purchase.id }, include: purchaseInclude });
  });
}

// input.paymentAmount is what's being paid right now, added on top of
// whatever's already recorded — never the new running total. A caller that
// passed the cumulative total here (easy mistake — that's exactly the bug
// this replaced) would silently double-count every payment after the
// first, which is why this rejects anything that would overpay.
export async function recordPurchasePayment(
  purchaseId: number,
  input: { paymentAmount: number; paymentMode?: string; paymentReference?: string; paymentBy?: string }
) {
  const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) throw new NotFoundError("Purchase not found");
  if (input.paymentAmount <= 0) {
    throw new ConflictError("Payment amount must be greater than zero");
  }

  const total = purchase.quantity * Number(purchase.purchaseCost);
  const alreadyPaid = Number(purchase.paymentAmount);
  const newTotalPaid = alreadyPaid + input.paymentAmount;
  if (newTotalPaid > total) {
    throw new ConflictError(
      `That would overpay this purchase — only ₹${(total - alreadyPaid).toFixed(2)} is still due`
    );
  }

  return prisma.purchase.update({
    where: { id: purchaseId },
    data: {
      paymentAmount: newTotalPaid,
      paymentMode: input.paymentMode,
      paymentReference: input.paymentReference,
      paymentBy: input.paymentBy,
      paymentDate: new Date(),
    },
    include: purchaseInclude,
  });
}
