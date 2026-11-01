import { JobCardLabour, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";

// A job card's customer estimate: what the work is expected to cost, printed
// for the customer to sign, then approved by uploading a photo of the signed
// copy. One per job card. It starts as a copy of the job card's parts and
// labour, and can have more lines added — including parts that aren't in
// inventory. Once approved it's locked: it's the record of what the customer
// agreed to.
//
// Closing the job card makes the estimate the bill: it's brought in step with
// the job card's final parts and labour (syncEstimateWithJobCard) and the
// money side — totals, payments, what's due — is kept on one Invoice row per
// payer (syncBills). On an accidental claim each line is billed to the
// customer or to the insurance company, so there can be two bills and two GST
// invoices.

export const ESTIMATE_LINE_TYPES = ["PART", "LABOUR"] as const;
export const PAYERS = ["CUSTOMER", "INSURANCE"] as const;
export type Payer = (typeof PAYERS)[number];

const CLOSED = "INVOICED";

const detailInclude = {
  jobCard: {
    include: {
      vehicle: { include: { customer: true } },
      invoices: {
        include: {
          payments: {
            include: { createdBy: { select: { id: true, name: true } } },
            orderBy: [{ paymentDate: "desc" as const }, { id: "desc" as const }],
          },
        },
        orderBy: { id: "asc" as const },
      },
    },
  },
  lines: {
    include: { item: { select: { id: true, itemCode: true, name: true, uom: true, hsnCode: true, gstRate: true } } },
    orderBy: { id: "asc" as const },
  },
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

// Who pays for a line. Only an accidental claim bills the insurance company;
// on any other job type every line is the customer's.
function payerOf(line: { scope: string }, jobType: string | null): Payer {
  return jobType === "ACCIDENTAL_CLAIM" && line.scope === "INSURANCE" ? "INSURANCE" : "CUSTOMER";
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
  const estimate = await tx.estimate.findUnique({ where: { id: estimateId }, include: { jobCard: true } });
  if (!estimate) throw new NotFoundError("Estimate not found");
  if (estimate.jobCard.status === CLOSED) {
    throw new ConflictError(
      `Job card ${estimate.jobCard.jobCardNumber} is closed — set it back to Open to change its parts or labour`
    );
  }
  if (estimate.status === "APPROVED") {
    throw new ConflictError(`${estimate.estimateNumber} is approved by the customer — it can't be changed`);
  }
  const gst = estimate.gstInvoiceNumber ?? estimate.insuranceGstInvoiceNumber;
  if (gst) {
    throw new ConflictError(`GST invoice ${gst} has been made from this estimate — it can't be changed`);
  }
  return estimate;
}

// Labour is a service: GST 18% unless changed. Parts take their item's
// HSN and GST % when the item has them.
const LABOUR_GST_RATE = 18;

export async function getEstimate(id: number) {
  return loadEstimate(prisma, id);
}

// The Estimates list: newest first, searchable by estimate / job card /
// vehicle number or customer, with each one's bill position once closed.
export async function listEstimates(page: PageParams, q: string | undefined) {
  const where: Prisma.EstimateWhereInput = q
    ? {
        OR: [
          { estimateNumber: { contains: q, mode: "insensitive" } },
          { jobCard: { jobCardNumber: { contains: q, mode: "insensitive" } } },
          { jobCard: { vehicle: { registrationNumber: { contains: q.replace(/\s+/g, "").toUpperCase() } } } },
          { jobCard: { vehicle: { customer: { name: { contains: q, mode: "insensitive" } } } } },
          { jobCard: { vehicle: { customer: { mobile: { contains: q } } } } },
        ],
      }
    : {};
  const [total, estimates] = await Promise.all([
    prisma.estimate.count({ where }),
    prisma.estimate.findMany({
      where,
      include: {
        jobCard: {
          select: {
            id: true,
            jobCardNumber: true,
            status: true,
            jobType: true,
            vehicle: { select: { registrationNumber: true, customer: { select: { name: true, mobile: true } } } },
            invoices: { select: { id: true, payer: true, totalAmount: true, paymentAmount: true } },
          },
        },
        lines: { select: { lineType: true, amount: true } },
      },
      orderBy: { id: "desc" },
      ...toSkipTake(page),
    }),
  ]);
  return {
    total,
    estimates: estimates.map(({ lines, ...e }) => ({ ...e, totalAmount: totalsFor(lines, e.taxRate).totalAmount })),
  };
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
            ...jobCard.parts.map((p) => ({ ...partLine(p), hsnCode: p.item?.hsnCode ?? null, gstRate: p.item?.gstRate ?? null })),
            ...jobCard.labour.map((l) => ({ ...labourLine(l), gstRate: LABOUR_GST_RATE })),
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

type PartRow = Prisma.JobCardPartGetPayload<{ include: { item: true } }>;

// What an estimate line copies from a job card part / labour line.
function partLine(p: PartRow) {
  return {
    lineType: "PART",
    itemId: p.itemId,
    description: p.item?.name ?? p.description ?? "Part",
    quantity: p.quantity,
    rate: p.rate,
    amount: p.amount,
    jobCardPartId: p.id,
  };
}

function labourLine(l: JobCardLabour) {
  return {
    lineType: "LABOUR",
    description: l.description,
    quantity: l.quantity,
    rate: l.rate,
    amount: l.amount,
    jobCardLabourId: l.id,
  };
}

// Run when the job card is closed: the estimate becomes exactly the job
// card's parts and labour — the work actually done — creating the estimate if
// there isn't one. Lines copied from the job card keep their HSN, GST % and
// who pays; lines that aren't on the job card are dropped. A GST invoice
// already made from the estimate fixes its lines, so they're left alone.
// Returns the estimate's id.
export async function syncEstimateWithJobCard(tx: Prisma.TransactionClient, jobCardId: number, createdById: number) {
  const jobCard = await tx.jobCard.findUniqueOrThrow({
    where: { id: jobCardId },
    include: {
      estimate: { include: { lines: true } },
      parts: { include: { item: true }, orderBy: { id: "asc" } },
      labour: { orderBy: { id: "asc" } },
    },
  });

  let estimate = jobCard.estimate;
  if (!estimate) {
    const created = await tx.estimate.create({
      data: { estimateNumber: `PENDING-${jobCardId}`, jobCardId, createdById },
    });
    estimate = await tx.estimate.update({
      where: { id: created.id },
      data: { estimateNumber: `EST-${String(created.id).padStart(6, "0")}` },
      include: { lines: true },
    });
  }
  if (estimate.gstInvoiceNumber || estimate.insuranceGstInvoiceNumber) return estimate.id;

  const byPart = new Map(estimate.lines.filter((l) => l.jobCardPartId != null).map((l) => [l.jobCardPartId!, l]));
  const byLabour = new Map(estimate.lines.filter((l) => l.jobCardLabourId != null).map((l) => [l.jobCardLabourId!, l]));
  const keep: number[] = [];

  for (const p of jobCard.parts) {
    const existing = byPart.get(p.id);
    if (existing) {
      await tx.estimateLine.update({ where: { id: existing.id }, data: partLine(p) });
      keep.push(existing.id);
    } else {
      const created = await tx.estimateLine.create({
        data: { ...partLine(p), estimateId: estimate.id, hsnCode: p.item?.hsnCode ?? null, gstRate: p.item?.gstRate ?? null },
      });
      keep.push(created.id);
    }
  }
  for (const l of jobCard.labour) {
    const existing = byLabour.get(l.id);
    if (existing) {
      await tx.estimateLine.update({ where: { id: existing.id }, data: labourLine(l) });
      keep.push(existing.id);
    } else {
      const created = await tx.estimateLine.create({
        data: { ...labourLine(l), estimateId: estimate.id, gstRate: LABOUR_GST_RATE },
      });
      keep.push(created.id);
    }
  }
  await tx.estimateLine.deleteMany({ where: { estimateId: estimate.id, id: { notIn: keep } } });
  await syncJobCard(tx, estimate.id);
  return estimate.id;
}

// The money side of a closed job card: one bill per payer, each the total of
// that payer's estimate lines. The customer's bill carries the discount given
// when closing (left out, the bill's current discount stays — that includes
// discounts given with payments). A bill can't drop below what's already
// been paid on it. An insurance bill left with no lines is removed, unless
// payments were recorded on it.
export async function syncBills(tx: Prisma.TransactionClient, jobCardId: number, createdById: number, discount?: number) {
  const jobCard = await tx.jobCard.findUniqueOrThrow({
    where: { id: jobCardId },
    include: { estimate: { include: { lines: true } }, invoices: { include: { _count: { select: { payments: true } } } } },
  });
  const lines = jobCard.estimate?.lines ?? [];
  const label = jobCard.estimate?.estimateNumber ?? jobCard.jobCardNumber;

  for (const payer of PAYERS) {
    const mine = lines.filter((l) => payerOf(l, jobCard.jobType) === payer);
    const existing = jobCard.invoices.find((i) => i.payer === payer);
    const who = payer === "INSURANCE" ? "the insurance company's bill" : "the customer's bill";

    if (payer === "INSURANCE" && mine.length === 0) {
      if (!existing) continue;
      if (existing._count.payments > 0) {
        throw new ConflictError(
          `Payments are recorded on ${who} for ${label} — keep at least one line on the insurance company, or remove those payments first`
        );
      }
      await tx.invoice.delete({ where: { id: existing.id } });
      continue;
    }

    const partsTotal = round2(mine.filter((l) => l.lineType === "PART").reduce((s, l) => s + Number(l.amount), 0));
    const labourTotal = round2(mine.filter((l) => l.lineType === "LABOUR").reduce((s, l) => s + Number(l.amount), 0));
    const subtotal = round2(partsTotal + labourTotal);
    const billDiscount = payer === "CUSTOMER" && discount !== undefined ? discount : Number(existing?.discount ?? 0);
    if (billDiscount < 0 || billDiscount > subtotal + 0.005) {
      throw new ConflictError(`Discount on ${who} must be between 0 and ${subtotal.toFixed(2)}`);
    }
    const totalAmount = round2(subtotal - billDiscount);

    if (existing) {
      const paid = Number(existing.paymentAmount);
      if (totalAmount < paid - 0.005) {
        throw new ConflictError(
          `${who.charAt(0).toUpperCase()}${who.slice(1)} would be ₹${totalAmount.toFixed(2)}, less than the ₹${paid.toFixed(2)} already paid on it`
        );
      }
      await tx.invoice.update({
        where: { id: existing.id },
        data: { partsTotal, labourTotal, discount: billDiscount, totalAmount },
      });
    } else {
      const created = await tx.invoice.create({
        data: {
          invoiceNumber: `PENDING-${jobCardId}-${payer}`,
          jobCardId,
          payer,
          partsTotal,
          labourTotal,
          discount: billDiscount,
          totalAmount,
          createdById,
        },
      });
      await tx.invoice.update({
        where: { id: created.id },
        data: { invoiceNumber: `INV-${String(created.id).padStart(6, "0")}` },
      });
    }
  }
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
    let hsnCode: string | null = null;
    let gstRate: number | null = input.lineType === "LABOUR" ? LABOUR_GST_RATE : null;

    if (input.lineType === "PART" && input.itemId) {
      const item = await tx.item.findUnique({ where: { id: input.itemId } });
      if (!item) throw new NotFoundError("Item not found");
      itemId = item.id;
      description = description || item.name;
      rate = rate ?? Number(item.sellingPrice);
      hsnCode = item.hsnCode;
      gstRate = item.gstRate != null ? Number(item.gstRate) : null;
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
        hsnCode,
        gstRate,
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

// ---- GST tax invoice ---------------------------------------------------------

export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28] as const;

export interface GstDetailsInput {
  supplyType?: "INTRA" | "INTER";
  pricesIncludeGst?: boolean;
  customerGstin?: string | null;
  insuranceGstin?: string | null;
  lines?: { id: number; hsnCode?: string | null; gstRate?: number | null; scope?: Payer }[];
}

// HSN/SAC and GST % per line, who pays for each line (accidental claims),
// intra/inter-state, whether rates include GST, and the GSTINs. Editable
// (even on an approved estimate — these don't change what the work costs)
// until the GST invoices are made: a payer's GST invoice fixes its own lines
// and GSTIN; either one fixes who pays for what and the supply type.
// Changing who pays on a closed job card moves the amounts between the two
// bills.
export async function updateGstDetails(estimateId: number, input: GstDetailsInput, userId: number) {
  await prisma.$transaction(async (tx) => {
    const estimate = await tx.estimate.findUnique({ where: { id: estimateId }, include: { jobCard: true } });
    if (!estimate) throw new NotFoundError("Estimate not found");
    const locked: Record<Payer, string | null> = {
      CUSTOMER: estimate.gstInvoiceNumber,
      INSURANCE: estimate.insuranceGstInvoiceNumber,
    };
    const anyLocked = locked.CUSTOMER ?? locked.INSURANCE;
    const refuse = (what: string, number: string) => {
      throw new ConflictError(`GST invoice ${number} is already made — ${what} can't be changed`);
    };

    if (anyLocked && input.supplyType && input.supplyType !== estimate.supplyType) refuse("the supply type", anyLocked);
    if (anyLocked && input.pricesIncludeGst !== undefined && input.pricesIncludeGst !== estimate.pricesIncludeGst) {
      refuse("whether prices include GST", anyLocked);
    }
    if (locked.CUSTOMER && input.customerGstin !== undefined && (input.customerGstin || null) !== estimate.customerGstin) {
      refuse("the customer's GSTIN", locked.CUSTOMER);
    }
    if (locked.INSURANCE && input.insuranceGstin !== undefined && (input.insuranceGstin || null) !== estimate.insuranceGstin) {
      refuse("the insurance company's GSTIN", locked.INSURANCE);
    }
    await tx.estimate.update({
      where: { id: estimateId },
      data: {
        ...(input.supplyType ? { supplyType: input.supplyType } : {}),
        ...(input.pricesIncludeGst !== undefined ? { pricesIncludeGst: input.pricesIncludeGst } : {}),
        ...(input.customerGstin !== undefined ? { customerGstin: input.customerGstin || null } : {}),
        ...(input.insuranceGstin !== undefined ? { insuranceGstin: input.insuranceGstin || null } : {}),
      },
    });

    const claim = estimate.jobCard.jobType === "ACCIDENTAL_CLAIM";
    let scopeChanged = false;
    for (const line of input.lines ?? []) {
      const existing = await tx.estimateLine.findUnique({ where: { id: line.id } });
      if (!existing || existing.estimateId !== estimateId) throw new NotFoundError("Line not found on this estimate");
      const payer = payerOf(existing, estimate.jobCard.jobType);
      const hsnCode = line.hsnCode !== undefined ? line.hsnCode?.trim() || null : existing.hsnCode;
      const gstRate = line.gstRate !== undefined ? line.gstRate : existing.gstRate != null ? Number(existing.gstRate) : null;
      const scope = line.scope ?? existing.scope;
      const gstChanged =
        hsnCode !== existing.hsnCode || (gstRate ?? null) !== (existing.gstRate != null ? Number(existing.gstRate) : null);
      if (gstChanged && locked[payer]) refuse(`the HSN / GST % of "${existing.description}"`, locked[payer]!);
      if (scope !== existing.scope) {
        if (scope === "INSURANCE" && !claim) {
          throw new ConflictError("Only an accidental claim can bill lines to the insurance company");
        }
        if (anyLocked) refuse("who pays for each line", anyLocked);
        scopeChanged = true;
      }
      if (gstChanged || scope !== existing.scope) {
        await tx.estimateLine.update({ where: { id: line.id }, data: { hsnCode, gstRate, scope } });
      }
    }
    if (scopeChanged && estimate.jobCard.status === CLOSED) {
      await syncBills(tx, estimate.jobCardId, userId);
    }
  });
  return loadEstimate(prisma, estimateId);
}

// Indian financial year label for a date: April–March, e.g. "2026-27".
function financialYear(d: Date): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String(y + 1).slice(2)}`;
}

// Makes a GST tax invoice for one payer's lines: numbered GST/<FY>/0001,
// 0002, ... in order within each financial year across both kinds (an
// advisory lock makes two at once take different numbers), dated today, and
// locked from then on. Only from a closed job card, whose estimate is the
// final bill.
export async function generateGstInvoice(estimateId: number, payer: Payer = "CUSTOMER") {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7311)`;
    const estimate = await tx.estimate.findUnique({ where: { id: estimateId }, include: { jobCard: true, lines: true } });
    if (!estimate) throw new NotFoundError("Estimate not found");
    const existing = payer === "INSURANCE" ? estimate.insuranceGstInvoiceNumber : estimate.gstInvoiceNumber;
    if (existing) throw new ConflictError(`GST invoice ${existing} is already made`);
    if (estimate.jobCard.status !== CLOSED) {
      throw new ConflictError(`Close job card ${estimate.jobCard.jobCardNumber} first — the GST invoice is made from the final estimate`);
    }
    if (payer === "INSURANCE" && estimate.jobCard.jobType !== "ACCIDENTAL_CLAIM") {
      throw new ConflictError("Only an accidental claim has an insurance company invoice");
    }

    const lines = estimate.lines.filter((l) => payerOf(l, estimate.jobCard.jobType) === payer);
    if (lines.length === 0) {
      throw new ConflictError(`No lines are billed to the ${payer === "INSURANCE" ? "insurance company" : "customer"}`);
    }
    const missing = lines.filter((l) => l.gstRate == null).map((l) => l.description);
    if (missing.length) {
      throw new ConflictError(`Set the GST % for: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`);
    }
    const now = new Date();
    const prefix = `GST/${financialYear(now)}/`;
    const count = await tx.estimate.count({
      where: { OR: [{ gstInvoiceNumber: { startsWith: prefix } }, { insuranceGstInvoiceNumber: { startsWith: prefix } }] },
    });
    const both = await tx.estimate.count({
      where: { gstInvoiceNumber: { startsWith: prefix }, insuranceGstInvoiceNumber: { startsWith: prefix } },
    });
    const number = `${prefix}${String(count + both + 1).padStart(4, "0")}`;
    await tx.estimate.update({
      where: { id: estimate.id },
      data:
        payer === "INSURANCE"
          ? { insuranceGstInvoiceNumber: number, insuranceGstInvoiceDate: now }
          : { gstInvoiceNumber: number, gstInvoiceDate: now },
    });
  });
  return loadEstimate(prisma, estimateId);
}
