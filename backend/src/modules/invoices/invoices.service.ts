import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";
import { assertMandatoryPhotos } from "../jobCards/jobCards.service";

const paymentInclude = {
  createdBy: { select: { id: true, name: true } },
} as const;

const detailInclude = {
  jobCard: {
    include: {
      vehicle: { include: { customer: true } },
      parts: { include: { item: true }, orderBy: { id: "asc" as const } },
      labour: { orderBy: { id: "asc" as const } },
    },
  },
  createdBy: { select: { id: true, name: true } },
  payments: { include: paymentInclude, orderBy: [{ paymentDate: "desc" as const }, { id: "desc" as const }] },
};

export async function listInvoices(page: PageParams, q: string | undefined) {
  const where = q
    ? {
        OR: [
          { invoiceNumber: { contains: q, mode: "insensitive" as const } },
          { jobCard: { jobCardNumber: { contains: q, mode: "insensitive" as const } } },
          { jobCard: { vehicle: { registrationNumber: { contains: q.toUpperCase() } } } },
        ],
      }
    : {};

  const [total, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      include: { jobCard: { include: { vehicle: { include: { customer: true } } } } },
      orderBy: { id: "desc" },
      ...toSkipTake(page),
    }),
  ]);

  return { total, invoices };
}

export async function getInvoice(id: number) {
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: detailInclude });
  if (!invoice) throw new NotFoundError("Invoice not found");
  return invoice;
}

// Deliberately does NOT copy parts/labour into the invoice — it reads them
// live from the job card, which is safe because the job card is locked
// (status -> INVOICED, set in this same transaction) the moment this runs.
// This is the only way a job card becomes Invoiced.
export async function createInvoice(jobCardId: number, discount: number, createdById: number) {
  // Status first, so a cancelled or already-invoiced job card gets that
  // reason rather than a list of missing photos. (Re-checked inside the
  // transaction below.)
  const current = await prisma.jobCard.findUnique({ where: { id: jobCardId }, include: { invoice: true } });
  if (!current) throw new NotFoundError("Job card not found");
  if (current.invoice) throw new ConflictError("This job card already has an invoice");
  if (current.status !== "OPEN") {
    throw new ConflictError("Only an open job card can be invoiced — reopen it first if it was cancelled");
  }

  // Every invoice bills at least one labour/service line.
  const labourLines = await prisma.jobCardLabour.count({ where: { jobCardId } });
  if (labourLines === 0) {
    throw new ConflictError("Add at least one labour / service line before generating the invoice");
  }

  // The workshop's before/after comparison photos must be done before the
  // customer is billed.
  await assertMandatoryPhotos(jobCardId, "BEFORE");
  await assertMandatoryPhotos(jobCardId, "AFTER");

  return prisma.$transaction(async (tx) => {
    const jobCard = await tx.jobCard.findUnique({
      where: { id: jobCardId },
      include: { parts: true, labour: true, invoice: true },
    });
    if (!jobCard) throw new NotFoundError("Job card not found");
    if (jobCard.invoice) throw new ConflictError("This job card already has an invoice");
    if (jobCard.status !== "OPEN") {
      throw new ConflictError("Only an open job card can be invoiced — reopen it first if it was cancelled");
    }

    const partsTotal = jobCard.parts.reduce((sum, p) => sum + Number(p.amount), 0);
    const labourTotal = jobCard.labour.reduce((sum, l) => sum + Number(l.amount), 0);
    const subtotal = partsTotal + labourTotal;

    if (discount < 0 || discount > subtotal) {
      throw new ConflictError(`Discount must be between 0 and ${subtotal.toFixed(2)}`);
    }

    const totalAmount = subtotal - discount;

    const created = await tx.invoice.create({
      data: {
        invoiceNumber: "PENDING",
        jobCardId,
        partsTotal,
        labourTotal,
        discount,
        totalAmount,
        createdById,
      },
    });

    const invoiceNumber = `INV-${String(created.id).padStart(6, "0")}`;
    await tx.invoice.update({ where: { id: created.id }, data: { invoiceNumber } });

    await tx.jobCard.update({ where: { id: jobCardId }, data: { status: "INVOICED" } });

    return tx.invoice.findUniqueOrThrow({ where: { id: created.id }, include: detailInclude });
  });
}

export function paymentStatusFor(total: number, paid: number): "PENDING" | "PARTIAL" | "PAID" {
  if (paid <= 0) return "PENDING";
  if (paid >= total) return "PAID";
  return "PARTIAL";
}

export interface InvoicePaymentInput {
  amount: number;
  paymentDate?: string;
  paymentMode?: string;
  reference?: string;
  receivedBy?: string;
  notes?: string;
}

// Records one payment: a history row, plus the invoice's running total
// moved on by the same amount, in one transaction. `amount` is what's being
// paid now, never a running total. The invoice row is locked for the length
// of the check-and-write, so two payments entered at the same moment can't
// both pass the overpay check and together overpay.
export async function recordInvoicePayment(invoiceId: number, input: InvoicePaymentInput, createdById: number) {
  if (input.amount <= 0) {
    throw new ConflictError("Payment amount must be greater than zero");
  }

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError("Invoice not found");
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });

    const alreadyPaid = Number(invoice.paymentAmount);
    const due = Number(invoice.totalAmount) - alreadyPaid;
    if (input.amount > due + 0.005) {
      throw new ConflictError(
        due <= 0
          ? `${invoice.invoiceNumber} is already fully paid`
          : `That would overpay ${invoice.invoiceNumber} — only ₹${due.toFixed(2)} is still due`
      );
    }

    await tx.invoicePayment.create({
      data: {
        invoiceId,
        amount: input.amount,
        paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
        paymentMode: input.paymentMode,
        reference: input.reference,
        receivedBy: input.receivedBy,
        notes: input.notes,
        createdById,
      },
    });
    return tx.invoice.update({
      where: { id: invoiceId },
      data: { paymentAmount: { increment: input.amount } },
      include: detailInclude,
    });
  });
}

// ---- Customer / vehicle accounts -------------------------------------------
// What a customer (or one vehicle) has been invoiced, what they've paid, and
// what's still due — always computed from the invoices themselves.

export interface InvoiceAccount {
  invoiceCount: number;
  totalInvoiced: number;
  totalPaid: number;
  balanceDue: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toAccount(row?: { count: bigint; invoiced: Prisma.Decimal | null; paid: Prisma.Decimal | null }): InvoiceAccount {
  const totalInvoiced = round2(Number(row?.invoiced ?? 0));
  const totalPaid = round2(Number(row?.paid ?? 0));
  return {
    invoiceCount: Number(row?.count ?? 0),
    totalInvoiced,
    totalPaid,
    balanceDue: round2(totalInvoiced - totalPaid),
  };
}

// Accounts for several customers or vehicles at once — one query for a
// whole page of the Customers/Vehicles list.
export async function accountsBy(kind: "customer" | "vehicle", ids: number[]): Promise<Map<number, InvoiceAccount>> {
  const accounts = new Map<number, InvoiceAccount>();
  if (ids.length === 0) return accounts;
  const key = kind === "customer" ? Prisma.sql`v.customer_id` : Prisma.sql`v.id`;
  const rows = await prisma.$queryRaw<
    { owner_id: number; count: bigint; invoiced: Prisma.Decimal | null; paid: Prisma.Decimal | null }[]
  >`
    SELECT ${key} AS owner_id, COUNT(i.id) AS count, SUM(i.total_amount) AS invoiced, SUM(i.payment_amount) AS paid
    FROM invoices i
    JOIN job_cards jc ON jc.id = i.job_card_id
    JOIN vehicles v ON v.id = jc.vehicle_id
    WHERE ${key} IN (${Prisma.join(ids)})
    GROUP BY ${key}
  `;
  const byOwner = new Map(rows.map((r) => [r.owner_id, r]));
  for (const id of ids) accounts.set(id, toAccount(byOwner.get(id)));
  return accounts;
}

// Everything the account panel shows for one customer or vehicle: the
// summary, every invoice (with what's due on each, for choosing which one a
// payment is against), and the full payment history across them.
export async function accountDetail(kind: "customer" | "vehicle", id: number) {
  const vehicleWhere: Prisma.VehicleWhereInput = kind === "customer" ? { customerId: id } : { id };
  const invoiceWhere: Prisma.InvoiceWhereInput = { jobCard: { vehicle: vehicleWhere } };

  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({
      where: invoiceWhere,
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        totalAmount: true,
        paymentAmount: true,
        jobCard: { select: { jobCardNumber: true, vehicle: { select: { registrationNumber: true } } } },
      },
      orderBy: [{ invoiceDate: "asc" }, { id: "asc" }],
    }),
    prisma.invoicePayment.findMany({
      where: { invoice: invoiceWhere },
      include: {
        ...paymentInclude,
        invoice: {
          select: { id: true, invoiceNumber: true, jobCard: { select: { vehicle: { select: { registrationNumber: true } } } } },
        },
      },
      orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
    }),
  ]);

  const totalInvoiced = round2(invoices.reduce((sum, i) => sum + Number(i.totalAmount), 0));
  const totalPaid = round2(invoices.reduce((sum, i) => sum + Number(i.paymentAmount), 0));
  return {
    account: { invoiceCount: invoices.length, totalInvoiced, totalPaid, balanceDue: round2(totalInvoiced - totalPaid) },
    invoices: invoices.map((i) => ({
      ...i,
      due: round2(Number(i.totalAmount) - Number(i.paymentAmount)),
    })),
    payments,
  };
}
