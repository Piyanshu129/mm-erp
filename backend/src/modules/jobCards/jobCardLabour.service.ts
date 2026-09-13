import { prisma } from "../../lib/prisma";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { isLocked } from "../../lib/jobCardStatus";

export interface AddLabourInput {
  jobCardId: number;
  description: string;
  technician?: string;
  quantity?: number;
  rate: number;
}

// See jobCardParts.service.ts's assertJobCardEditable for why both the
// status field and the invoice row itself are checked.
async function assertJobCardEditable(jobCardId: number) {
  const jobCard = await prisma.jobCard.findUnique({ where: { id: jobCardId } });
  if (!jobCard) throw new NotFoundError("Job card not found");
  if (isLocked(jobCard.status)) {
    throw new ConflictError("This job card is invoiced/closed and can no longer be edited");
  }
  const invoice = await prisma.invoice.findUnique({ where: { jobCardId } });
  if (invoice) {
    throw new ConflictError(
      `This job card was already invoiced (${invoice.invoiceNumber}) and can no longer be edited`
    );
  }
}

export async function addLabour(input: AddLabourInput) {
  await assertJobCardEditable(input.jobCardId);

  const quantity = input.quantity ?? 1;
  const amount = quantity * input.rate;

  return prisma.jobCardLabour.create({
    data: {
      jobCardId: input.jobCardId,
      description: input.description,
      technician: input.technician,
      quantity,
      rate: input.rate,
      amount,
    },
  });
}

export async function removeLabour(jobCardId: number, labourId: number) {
  await assertJobCardEditable(jobCardId);

  const labour = await prisma.jobCardLabour.findUnique({ where: { id: labourId } });
  if (!labour || labour.jobCardId !== jobCardId) {
    throw new NotFoundError("Labour entry not found on this job card");
  }

  await prisma.jobCardLabour.delete({ where: { id: labourId } });
}
