import { prisma } from "../../lib/prisma";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { isLocked } from "../../lib/jobCardStatus";

export interface AddPartInput {
  jobCardId: number;
  itemId: number;
  quantity: number;
  createdById: number;
}

// Checks BOTH the status field and whether an invoice actually exists.
// The status field is a user-editable dropdown — someone can drag an
// invoiced job card's status back to "Completed" — so it alone can't be
// trusted as the lock signal. The invoice row's existence can't be faked
// this way, so it's the authoritative check.
async function assertJobCardEditable(tx: any, jobCardId: number) {
  const jobCard = await tx.jobCard.findUnique({ where: { id: jobCardId } });
  if (!jobCard) throw new NotFoundError("Job card not found");
  if (isLocked(jobCard.status)) {
    throw new ConflictError("This job card is invoiced/closed and can no longer be edited");
  }
  const invoice = await tx.invoice.findUnique({ where: { jobCardId } });
  if (invoice) {
    throw new ConflictError(
      `This job card was already invoiced (${invoice.invoiceNumber}) and can no longer be edited`
    );
  }
  return jobCard;
}

// The core "insufficient stock" guarantee: a single conditional UPDATE that
// only succeeds if enough stock is available, evaluated atomically by
// Postgres's row lock — immune to two staff issuing the last unit at once
// (unlike a findUnique-then-update, where both requests could read the same
// stale stock number before either writes).
async function decrementStockOrThrow(tx: any, itemId: number, quantity: number) {
  const rows = await tx.$queryRaw<{ current_stock: number }[]>`
    UPDATE items
    SET current_stock = current_stock - ${quantity}, updated_at = now()
    WHERE id = ${itemId} AND current_stock >= ${quantity}
    RETURNING current_stock
  `;

  if (rows.length === 0) {
    const item = await tx.item.findUnique({ where: { id: itemId } });
    const available = item?.currentStock ?? 0;
    throw new ConflictError(
      `Insufficient stock: only ${available} available, ${quantity} requested`
    );
  }

  return rows[0].current_stock;
}

export async function addPart(input: AddPartInput) {
  return prisma.$transaction(async (tx) => {
    await assertJobCardEditable(tx, input.jobCardId);

    const item = await tx.item.findUnique({ where: { id: input.itemId } });
    if (!item) throw new NotFoundError("Item not found");

    const unitPrice = item.sellingPrice;
    const amount = Number(unitPrice) * input.quantity;

    const part = await tx.jobCardPart.create({
      data: {
        jobCardId: input.jobCardId,
        itemId: input.itemId,
        quantity: input.quantity,
        unitPrice,
        amount,
        createdById: input.createdById,
      },
      include: { item: true },
    });

    const newStock = await decrementStockOrThrow(tx, input.itemId, input.quantity);

    await tx.stockLedger.create({
      data: {
        itemId: input.itemId,
        direction: "OUT",
        quantity: input.quantity,
        balanceAfter: newStock,
        referenceType: "JOB_CARD",
        jobCardPartId: part.id,
        createdById: input.createdById,
      },
    });

    return part;
  });
}

// Removing a mistakenly-added part restores the stock it took, with its own
// ledger entry — only allowed before the job card is locked, same rule as
// adding one, so a billed record can't be quietly altered after the fact.
export async function removePart(jobCardId: number, partId: number, removedById: number) {
  return prisma.$transaction(async (tx) => {
    await assertJobCardEditable(tx, jobCardId);

    const part = await tx.jobCardPart.findUnique({ where: { id: partId } });
    if (!part || part.jobCardId !== jobCardId) throw new NotFoundError("Part not found on this job card");

    const updatedItem = await tx.item.update({
      where: { id: part.itemId },
      data: { currentStock: { increment: part.quantity } },
    });

    await tx.stockLedger.create({
      data: {
        itemId: part.itemId,
        direction: "IN",
        quantity: part.quantity,
        balanceAfter: updatedItem.currentStock,
        referenceType: "JOB_CARD_REVERSAL",
        note: `Removed from job card #${jobCardId}`,
        createdById: removedById,
      },
    });

    await tx.jobCardPart.delete({ where: { id: partId } });
  });
}
