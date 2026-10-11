import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ConflictError, NotFoundError } from "../../lib/errors";

// A job card's customer estimate: what the work is expected to cost, printed
// for the customer to sign, then approved by uploading a photo of the signed
// copy. One per job card. It starts as a copy of the job card's parts and
// labour, and can have more lines added — including parts that aren't in
// inventory. Once approved it's locked: it's the record of what the customer
// agreed to.

export const ESTIMATE_LINE_TYPES = ["PART", "LABOUR"] as const;

const detailInclude = {
  jobCard: { include: { vehicle: { include: { customer: true } } } },
  lines: { include: { item: { select: { id: true, itemCode: true, name: true, uom: true } } }, orderBy: { id: "asc" as const } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.EstimateInclude;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function totalsFor(lines: { lineType: string; amount: Prisma.Decimal }[], taxRate: Prisma.Decimal | null) {
  const partsTotal = round2(lines.filter((l) => l.lineType === "PART").reduce((s, l) => s + Number(l.amount), 0));
  const labourTotal = round2(lines.filter((l) => l.lineType === "LABOUR").reduce((s, l) => s + Number(l.amount), 0));
  const subtotal = round2(partsTotal + labourTotal);
  const taxAmount = round2((subtotal * Number(taxRate ?? 0)) / 100);
  return { partsTotal, labourTotal, subtotal, taxAmount, totalAmount: round2(subtotal + taxAmount) };
}

async function loadEstimate(db: Prisma.TransactionClient | typeof prisma, id: number) {
  const estimate = await db.estimate.findUnique({ where: { id }, include: detailInclude });
  if (!estimate) throw new NotFoundError("Estimate not found");
  return { ...estimate, ...totalsFor(estimate.lines, estimate.taxRate) };
}

// Keeps the job card's own estimate fields (shown on the job card and in
// reports) in step with its estimate.
async function syncJobCard(tx: Prisma.TransactionClient, estimateId: number) {
  const estimate = await tx.estimate.findUniqueOrThrow({ where: { id: estimateId }, include: { lines: true } });
  const { totalAmount } = totalsFor(estimate.lines, estimate.taxRate);
  await tx.jobCard.update({
    where: { id: estimate.jobCardId },
    data: {
      estimateAmount: totalAmount,
      estimateApproved: estimate.status === "APPROVED",
      estimateApprovedAt: estimate.approvedAt,
    },
  });
}

async function assertDraft(tx: Prisma.TransactionClient, estimateId: number) {
  const estimate = await tx.estimate.findUnique({ where: { id: estimateId } });
  if (!estimate) throw new NotFoundError("Estimate not found");
  if (estimate.status === "APPROVED") {
    throw new ConflictError(`${estimate.estimateNumber} is approved by the customer — it can't be changed`);
  }
  return estimate;
}

export async function getEstimate(id: number) {
  return loadEstimate(prisma, id);
}

// Creates the job card's estimate, pre-filled from its parts and labour. If
// it already has one, that one is returned instead.
export async function createEstimate(jobCardId: number, createdById: number) {
  const id = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM job_cards WHERE id = ${jobCardId} FOR UPDATE`;
    const jobCard = await tx.jobCard.findUnique({
      where: { id: jobCardId },
      include: { estimate: true, parts: { include: { item: true }, orderBy: { id: "asc" } }, labour: { orderBy: { id: "asc" } } },
    });
    if (!jobCard) throw new NotFoundError("Job card not found");
    if (jobCard.estimate) return jobCard.estimate.id;

    const created = await tx.estimate.create({
      data: {
        estimateNumber: `PENDING-${jobCardId}`,
        jobCardId,
        createdById,
        lines: {
          create: [
            ...jobCard.parts.map((p) => ({
              lineType: "PART",
              itemId: p.itemId,
              description: p.item.name,
              quantity: p.quantity,
              rate: p.rate,
              amount: p.amount,
            })),
            ...jobCard.labour.map((l) => ({
              lineType: "LABOUR",
              description: l.description,
              quantity: l.quantity,
              rate: l.rate,
              amount: l.amount,
            })),
          ],
        },
      },
    });
    await tx.estimate.update({
      where: { id: created.id },
      data: { estimateNumber: `EST-${String(created.id).padStart(6, "0")}` },
    });
    await syncJobCard(tx, created.id);
    return created.id;
  });
  return loadEstimate(prisma, id);
}

export interface EstimateUpdateInput {
  estimateDate?: Date;
  taxRate?: number | null;
  notes?: string | null;
}

export async function updateEstimate(id: number, input: EstimateUpdateInput) {
  await prisma.$transaction(async (tx) => {
    await assertDraft(tx, id);
    await tx.estimate.update({ where: { id }, data: input });
    await syncJobCard(tx, id);
  });
  return loadEstimate(prisma, id);
}

export interface EstimateLineInput {
  lineType: (typeof ESTIMATE_LINE_TYPES)[number];
  itemId?: number;
  description?: string;
  quantity: number;
  rate?: number;
}

// A PART line is either an inventory item (picked by item code — its name
// and MRP fill in unless a rate is given) or a part that isn't in inventory
// (typed description and rate). Nothing here touches stock: an estimate is
// only a quote.
export async function addLine(estimateId: number, input: EstimateLineInput) {
  await prisma.$transaction(async (tx) => {
    await assertDraft(tx, estimateId);

    let description = input.description?.trim();
    let rate = input.rate;
    let itemId: number | undefined;

    if (input.lineType === "PART" && input.itemId) {
      const item = await tx.item.findUnique({ where: { id: input.itemId } });
      if (!item) throw new NotFoundError("Item not found");
      itemId = item.id;
      description = description || item.name;
      rate = rate ?? Number(item.sellingPrice);
    }
    if (!description) throw new ConflictError("Enter a description for this line");
    if (rate == null || rate < 0) throw new ConflictError("Enter a rate for this line");

    await tx.estimateLine.create({
      data: {
        estimateId,
        lineType: input.lineType,
        itemId,
        description,
        quantity: input.quantity,
        rate,
        amount: round2(rate * input.quantity),
      },
    });
    await syncJobCard(tx, estimateId);
  });
  return loadEstimate(prisma, estimateId);
}

export async function removeLine(estimateId: number, lineId: number) {
  await prisma.$transaction(async (tx) => {
    await assertDraft(tx, estimateId);
    const line = await tx.estimateLine.findUnique({ where: { id: lineId } });
    if (!line || line.estimateId !== estimateId) throw new NotFoundError("Line not found on this estimate");
    await tx.estimateLine.delete({ where: { id: lineId } });
    await syncJobCard(tx, estimateId);
  });
  return loadEstimate(prisma, estimateId);
}

// Records the customer's approval with a photo of the signed estimate. The
// photo can be replaced later (e.g. a clearer shot), but the estimate stays
// approved and locked.
export async function approveEstimate(estimateId: number, photoUrl: string) {
  await prisma.$transaction(async (tx) => {
    const estimate = await tx.estimate.findUnique({ where: { id: estimateId }, include: { lines: true } });
    if (!estimate) throw new NotFoundError("Estimate not found");
    if (estimate.lines.length === 0) throw new ConflictError("Add at least one line before recording approval");
    await tx.estimate.update({
      where: { id: estimateId },
      data: {
        status: "APPROVED",
        approvalPhotoUrl: photoUrl,
        approvedAt: estimate.approvedAt ?? new Date(),
      },
    });
    await syncJobCard(tx, estimateId);
  });
  return loadEstimate(prisma, estimateId);
}
