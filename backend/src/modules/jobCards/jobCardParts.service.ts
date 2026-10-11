import { prisma } from "../../lib/prisma";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { isLocked } from "../../lib/jobCardStatus";

export interface AddPartInput {
  jobCardId: number;
  itemId: number;
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

// Takes `quantity` of the item out of stock and records it on the job card
// at the item's current MRP. The stock check and the deduction are one
// conditional UPDATE, so two job cards using the last few pieces at the
// same moment can't take more than there is.
export async function addPart(input: AddPartInput) {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new ConflictError("Quantity must be a whole number, at least 1");
  }

  return prisma.$transaction(async (tx) => {
    await assertJobCardEditable(tx, input.jobCardId);

    const rows: { id: number }[] = await tx.$queryRaw`
      UPDATE items
      SET current_stock = current_stock - ${input.quantity}
      WHERE id = ${input.itemId} AND current_stock >= ${input.quantity}
      RETURNING id
    `;
    if (rows.length === 0) {
      const item = await tx.item.findUnique({ where: { id: input.itemId } });
      if (!item) throw new NotFoundError("Item not found");
      throw new ConflictError(
        `Only ${item.currentStock} ${item.uom} of ${item.name} (${item.itemCode}) available — can't use ${input.quantity}`
      );
    }

    const item = await tx.item.findUniqueOrThrow({ where: { id: input.itemId } });
    const rate = Number(item.sellingPrice);

    return tx.jobCardPart.create({
      data: {
        jobCardId: input.jobCardId,
        itemId: item.id,
        quantity: input.quantity,
        rate,
        amount: rate * input.quantity,
        createdById: input.createdById,
      },
      include: { item: true },
    });
  });
}

// Removing a part puts its quantity back into stock — only while the job
// card is open, same rule as adding one.
export async function removePart(jobCardId: number, partId: number) {
  return prisma.$transaction(async (tx) => {
    await assertJobCardEditable(tx, jobCardId);

    const part = await tx.jobCardPart.findUnique({ where: { id: partId } });
    if (!part || part.jobCardId !== jobCardId) throw new NotFoundError("Part not found on this job card");

    await tx.item.update({ where: { id: part.itemId }, data: { currentStock: { increment: part.quantity } } });
    await tx.jobCardPart.delete({ where: { id: partId } });
  });
}
