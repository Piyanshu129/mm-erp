import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { NotFoundError, ConflictError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";
import { JOB_CARD_STATUSES } from "../../lib/jobCardStatus";

export interface JobCardInput {
  vehicleId: number;
  kmAtService?: number;
  complaint?: string;
  requiredWork?: string;
  notes?: string;
}

const detailInclude = {
  vehicle: { include: { customer: true } },
  media: { orderBy: { createdAt: "asc" as const } },
  parts: { include: { item: true }, orderBy: { id: "asc" as const } },
  labour: { orderBy: { id: "asc" as const } },
  createdBy: { select: { id: true, name: true } },
  invoice: { select: { id: true, invoiceNumber: true } },
} satisfies Prisma.JobCardInclude;

function withTotals<T extends { parts: { amount: Prisma.Decimal }[]; labour: { amount: Prisma.Decimal }[] }>(
  jobCard: T
) {
  const partsTotal = jobCard.parts.reduce((sum, p) => sum + Number(p.amount), 0);
  const labourTotal = jobCard.labour.reduce((sum, l) => sum + Number(l.amount), 0);
  return { ...jobCard, partsTotal, labourTotal, grandTotal: partsTotal + labourTotal };
}

export async function listJobCards(
  page: PageParams,
  filters: { status?: string; q?: string }
) {
  const where: Prisma.JobCardWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.q) {
    const q = filters.q.replace(/\s+/g, "").toUpperCase();
    where.OR = [
      { jobCardNumber: { contains: filters.q, mode: "insensitive" } },
      { vehicle: { registrationNumber: { contains: q } } },
    ];
  }

  const [total, jobCards] = await Promise.all([
    prisma.jobCard.count({ where }),
    prisma.jobCard.findMany({
      where,
      include: { vehicle: { include: { customer: true } } },
      orderBy: { id: "desc" },
      ...toSkipTake(page),
    }),
  ]);

  return { total, jobCards };
}

export async function getJobCard(id: number) {
  const jobCard = await prisma.jobCard.findUnique({ where: { id }, include: detailInclude });
  if (!jobCard) throw new NotFoundError("Job card not found");
  return withTotals(jobCard);
}

// jobCardNumber follows the same derive-from-own-id pattern as Item Code.
export async function createJobCard(input: JobCardInput, createdById: number) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: input.vehicleId } });
  if (!vehicle) throw new NotFoundError("Vehicle not found");

  return prisma.$transaction(async (tx) => {
    const created = await tx.jobCard.create({
      data: { ...input, jobCardNumber: "PENDING", createdById },
    });
    const jobCardNumber = `JC-${String(created.id).padStart(6, "0")}`;
    return tx.jobCard.update({
      where: { id: created.id },
      data: { jobCardNumber },
      include: { vehicle: { include: { customer: true } } },
    });
  });
}

export interface JobCardUpdateInput extends Partial<JobCardInput> {
  status?: string;
}

export async function updateJobCard(id: number, input: JobCardUpdateInput) {
  const jobCard = await prisma.jobCard.findUnique({ where: { id }, include: { invoice: true } });
  if (!jobCard) throw new NotFoundError("Job card not found");

  if (input.status && !(JOB_CARD_STATUSES as readonly string[]).includes(input.status)) {
    throw new ConflictError(`Invalid status: ${input.status}`);
  }

  // The status dropdown is otherwise freely editable, but once an invoice
  // exists it must stay INVOICED or move forward to CLOSED — never back to
  // an "open" status, which would silently make the job card look editable
  // again even though jobCardParts/jobCardLabour still refuse the edit.
  if (jobCard.invoice && input.status && !["INVOICED", "CLOSED"].includes(input.status)) {
    throw new ConflictError(
      `This job card was already invoiced (${jobCard.invoice.invoiceNumber}) — status can only move to Closed`
    );
  }

  return prisma.jobCard.update({
    where: { id },
    data: input,
    include: { vehicle: { include: { customer: true } } },
  });
}
