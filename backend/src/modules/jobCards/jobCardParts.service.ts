import { prisma } from "../../lib/prisma";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { isLocked } from "../../lib/jobCardStatus";
import { addStock, roundQty, takeStock } from "../../lib/stock";

// A part is either from inventory (itemId — comes out of stock at the item's
// MRP) or not in inventory (description + rate — bought outside for this
// job, no stock involved). Quantity can be part of a unit (0.5).
export interface AddPartInput {
  jobCardId: number;
  itemId?: number;
  description?: string;
  rate?: number;
  quantity: number;
  createdById: number;
}

// Parts and labour can be changed while the job card is Open. An invoiced
// job card can be set back to Open to edit it (its draft invoice is then
// brought up to date when it's invoiced again — see invoices.service.ts).
export async function assertJobCardEditable(db: any, jobCardId: number) {
  const jobCard = await db.jobCard.findUnique({ where: { id: jobCardId } });
  if (!jobCard) throw new NotFoundError("Job card not found");
  if (isLocked(jobCard.status)) {
    throw new ConflictError(
      jobCard.status === "CANCELLED"
        ? "This job card is cancelled — set it back to Open to make changes"
        : "This job card is invoiced — set it back to Open to make changes"
    );
  }
  return jobCard;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function addPart(input: AddPartInput) {
  const quantity = roundQty(input.quantity);
  if (!(quantity > 0)) throw new ConflictError("Quantity must be more than 0");

  return prisma.$transaction(async (tx) => {
    await assertJobCardEditable(tx, input.jobCardId);

    // Not in inventory: recorded as given, no stock.
    if (input.itemId == null) {
      const description = input.description?.trim();
      if (!description) throw new ConflictError("Enter what the part is");
      if (input.rate == null || input.rate < 0) throw new ConflictError("Enter the part's rate");
      return tx.jobCardPart.create({
        data: {
          jobCardId: input.jobCardId,
          description,
          quantity,
          rate: input.rate,
          amount: round2(input.rate * quantity),
          createdById: input.createdById,
        },
        include: { item: true },
      });
    }

    if (!(await takeStock(tx, input.itemId, quantity))) {
      const item = await tx.item.findUnique({ where: { id: input.itemId } });
      if (!item) throw new NotFoundError("Item not found");
      throw new ConflictError(
        `Only ${item.currentStock} ${item.uom} of ${item.name} (${item.itemCode}) available — can't use ${quantity}`
      );
    }

    const item = await tx.item.findUniqueOrThrow({ where: { id: input.itemId } });
    const rate = Number(item.sellingPrice);

    return tx.jobCardPart.create({
      data: {
        jobCardId: input.jobCardId,
        itemId: item.id,
        quantity,
        rate,
        amount: round2(rate * quantity),
        createdById: input.createdById,
      },
      include: { item: true },
    });
  });
}

// Removing a part puts its quantity back into stock (inventory parts only)
// — only while the job card is open, same rule as adding one.
export async function removePart(jobCardId: number, partId: number) {
  return prisma.$transaction(async (tx) => {
    await assertJobCardEditable(tx, jobCardId);

    const part = await tx.jobCardPart.findUnique({ where: { id: partId } });
    if (!part || part.jobCardId !== jobCardId) throw new NotFoundError("Part not found on this job card");

    if (part.itemId != null) await addStock(tx, part.itemId, part.quantity);
    await tx.jobCardPart.delete({ where: { id: partId } });
  });
}
