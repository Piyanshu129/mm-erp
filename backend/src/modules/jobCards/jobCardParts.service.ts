import { prisma } from "../../lib/prisma";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { isLocked } from "../../lib/jobCardStatus";

export interface AddPartInput {
  jobCardId: number;
  itemUnitId: number;
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

// Parts are issued by their physical unit serial number — the number
// written on the sticker placed on that exact part at Purchase time — not
// by "an item, minus a quantity". This is a single conditional UPDATE that
// only flips a unit from IN_STOCK to ISSUED if it's still IN_STOCK,
// evaluated atomically by Postgres's row lock, so two staff scanning the
// same physical sticker at once can't both succeed.
async function issueUnitOrThrow(tx: any, itemUnitId: number) {
  const rows: { id: number; item_id: number }[] = await tx.$queryRaw`
    UPDATE item_units
    SET status = 'ISSUED'
    WHERE id = ${itemUnitId} AND status = 'IN_STOCK'
    RETURNING id, item_id
  `;

  if (rows.length === 0) {
    const unit = await tx.itemUnit.findUnique({ where: { id: itemUnitId } });
    if (!unit) throw new NotFoundError(`No item unit with serial number ${itemUnitId}`);
    throw new ConflictError(
      `Serial number ${itemUnitId} is already issued — it can't be used on another job card`
    );
  }

  return rows[0];
}

export async function addPart(input: AddPartInput) {
  return prisma.$transaction(async (tx) => {
    await assertJobCardEditable(tx, input.jobCardId);

    const unitRow = await issueUnitOrThrow(tx, input.itemUnitId);

    const item = await tx.item.findUniqueOrThrow({ where: { id: unitRow.item_id } });

    const part = await tx.jobCardPart.create({
      data: {
        jobCardId: input.jobCardId,
        itemUnitId: input.itemUnitId,
        itemId: item.id,
        amount: item.sellingPrice,
        createdById: input.createdById,
      },
      include: { item: true, itemUnit: true },
    });

    await tx.item.update({
      where: { id: item.id },
      data: { currentStock: { decrement: 1 } },
    });

    return part;
  });
}

// Removing a mistakenly-added part puts the unit back into stock under its
// same permanent serial number (units are never deleted, only re-flagged)
// — only allowed before the job card is locked, same rule as adding one.
export async function removePart(jobCardId: number, partId: number) {
  return prisma.$transaction(async (tx) => {
    await assertJobCardEditable(tx, jobCardId);

    const part = await tx.jobCardPart.findUnique({ where: { id: partId } });
    if (!part || part.jobCardId !== jobCardId) throw new NotFoundError("Part not found on this job card");

    await tx.itemUnit.update({ where: { id: part.itemUnitId }, data: { status: "IN_STOCK" } });
    await tx.item.update({ where: { id: part.itemId }, data: { currentStock: { increment: 1 } } });
    await tx.jobCardPart.delete({ where: { id: partId } });
  });
}
