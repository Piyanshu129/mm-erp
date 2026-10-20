import { prisma } from "../../lib/prisma";
import { NotFoundError } from "../../lib/errors";
import { roundQty } from "../../lib/stock";
import { assertJobCardEditable } from "./jobCardParts.service";

export interface AddLabourInput {
  jobCardId: number;
  description: string;
  technician?: string;
  quantity?: number;
  rate: number;
}

export async function addLabour(input: AddLabourInput) {
  await assertJobCardEditable(prisma, input.jobCardId);

  const quantity = roundQty(input.quantity ?? 1);
  const amount = Math.round(quantity * input.rate * 100) / 100;

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
  await assertJobCardEditable(prisma, jobCardId);

  const labour = await prisma.jobCardLabour.findUnique({ where: { id: labourId } });
  if (!labour || labour.jobCardId !== jobCardId) {
    throw new NotFoundError("Labour entry not found on this job card");
  }

  await prisma.jobCardLabour.delete({ where: { id: labourId } });
}
