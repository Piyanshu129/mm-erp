import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";
import { assertMandatoryPhotos } from "../jobCards/jobCards.service";
import { paymentSnapshot, recordPaymentAudit } from "../../lib/paymentAudit";

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
  if (!invoice) throw new NotFoundError("Draft invoice not found");
  return invoice;
}

// Deliberately does NOT copy parts/labour into the invoice — it reads them
// live from the job card, which is safe because the job card is locked
// (status -> INVOICED, set in this same transaction) the moment this runs.
// This is the only way a job card becomes Invoiced.
//
// A job card that was invoiced and then set back to Open (to change it)
// keeps its draft invoice: invoicing it again brings that same invoice —
// same number, same payments — up to date with the job card, rather than
// creating a second one.
//
// discount left undefined (marking Invoiced from the status dropdown) keeps
// the existing draft invoice's discount, or none for a first invoice.
export async function createInvoice(jobCardId: number, discount: number | undefined, createdById: number) {
  // Status first, so a cancelled or already-invoiced job card gets that
  // reason rather than a list of missing photos. (Re-checked inside the
  // transaction below.)
  const current = await prisma.jobCard.findUnique({ where: { id: jobCardId } });
  if (!current) throw new NotFoundError("Job card not found");
  if (current.status !== "OPEN") {
    throw new ConflictError(
      current.status === "INVOICED"
        ? "This job card is already invoiced"
        : "Only an open job card can be invoiced — set it back to Open first if it was cancelled"
    );
  }

  // Every draft invoice bills at least one labour/service line.
  const labourLines = await prisma.jobCardLabour.count({ where: { jobCardId } });
  if (labourLines === 0) {
    throw new ConflictError("Add at least one labour / service line before generating the draft invoice");
  }

  // The workshop's before/after comparison photos must be done before the
  // customer is billed.
  await assertMandatoryPhotos(jobCardId, "BEFORE");
  await assertMandatoryPhotos(jobCardId, "AFTER");

  return prisma.$transaction(async (tx) => {
    // The job card row is locked for the whole generation, so two clicks
    // (or two people) at the same moment can't both create a draft invoice:
    // the second waits, then sees the status is already INVOICED.
    await tx.$queryRaw`SELECT id FROM job_cards WHERE id = ${jobCardId} FOR UPDATE`;
    const jobCard = await tx.jobCard.findUnique({
      where: { id: jobCardId },
      include: { parts: true, labour: true, invoice: true },
    });
    if (!jobCard) throw new NotFoundError("Job card not found");
    if (jobCard.status !== "OPEN") {
      throw new ConflictError(
        jobCard.status === "INVOICED" ? "This job card is already invoiced" : "Only an open job card can be invoiced"
      );
    }

    const partsTotal = jobCard.parts.reduce((sum, p) => sum + Number(p.amount), 0);
    const labourTotal = jobCard.labour.reduce((sum, l) => sum + Number(l.amount), 0);
    const subtotal = partsTotal + labourTotal;
    discount = discount ?? Number(jobCard.invoice?.discount ?? 0);

    if (discount < 0 || discount > subtotal) {
      throw new ConflictError(`Discount must be between 0 and ${subtotal.toFixed(2)}`);
    }

    const totalAmount = subtotal - discount;
    let invoiceId: number;

    if (jobCard.invoice) {
      // Re-invoicing after the job card was reopened: update the same draft
      // invoice. It can't drop below what the customer has already paid.
      const paid = Number(jobCard.invoice.paymentAmount);
      if (totalAmount < paid) {
        throw new ConflictError(
          `The new total ₹${totalAmount.toFixed(2)} is less than the ₹${paid.toFixed(2)} already paid on ${jobCard.invoice.invoiceNumber}`
        );
      }
      await tx.invoice.update({
        where: { id: jobCard.invoice.id },
        data: { partsTotal, labourTotal, discount, totalAmount },
      });
      invoiceId = jobCard.invoice.id;
    } else {
      const created = await tx.invoice.create({
        data: {
          invoiceNumber: `PENDING-${jobCardId}`,
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
      invoiceId = created.id;
    }

    await tx.jobCard.update({ where: { id: jobCardId }, data: { status: "INVOICED" } });

    return tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: detailInclude });
  });
}

export function paymentStatusFor(total: number, paid: number): "PENDING" | "PARTIAL" | "PAID" {
  if (paid <= 0) return "PENDING";
  if (paid >= total) return "PAID";
  return "PARTIAL";
}

export interface InvoicePaymentInput {
  amount: number;
  // Settlement discount given with this payment — written off the balance.
  discount?: number;
  paymentDate?: string;
  paymentMode?: string;
  reference?: string;
  receivedBy?: string;
  notes?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function checkAmounts(amount: number, discount: number) {
  if (amount < 0 || discount < 0) throw new ConflictError("Amounts can't be negative");
  if (amount + discount <= 0) throw new ConflictError("Enter the amount received, a discount, or both");
}

// Records one payment: a history row, plus the invoice's running total
// moved on by the same amount, in one transaction. `amount` is what's being
// paid now, never a running total. A discount given with it comes off the
// invoice (its discount goes up and its total down by the same amount), so
// every "amount due" stays simply total − paid. The invoice row is locked
// for the length of the check-and-write, so two payments entered at the
// same moment can't both pass the overpay check and together overpay.
export async function recordInvoicePayment(invoiceId: number, input: InvoicePaymentInput, createdById: number) {
  const discount = input.discount ?? 0;
  checkAmounts(input.amount, discount);

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError("Draft invoice not found");
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });

    const due = Number(invoice.totalAmount) - Number(invoice.paymentAmount);
    if (input.amount + discount > due + 0.005) {
      throw new ConflictError(
        due <= 0
          ? `${invoice.invoiceNumber} is already fully paid`
          : `That would overpay ${invoice.invoiceNumber} — only ₹${due.toFixed(2)} is still due (payment + discount)`
      );
    }

    await tx.invoicePayment.create({
      data: {
        invoiceId,
        amount: input.amount,
        discount,
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
      data: {
        paymentAmount: r2(Number(invoice.paymentAmount) + input.amount),
        discount: r2(Number(invoice.discount) + discount),
        totalAmount: r2(Number(invoice.totalAmount) - discount),
      },
      include: detailInclude,
    });
  });
}

// Admin correction of a recorded payment (wrong amount, discount, date,
// mode...). The invoice's paid total, discount and total move by the
// differences, in the same transaction with the invoice row locked, and it
// can't end up overpaid.
export async function updateInvoicePayment(
  invoiceId: number,
  paymentId: number,
  input: InvoicePaymentInput,
  changedById: number
) {
  const discount = input.discount ?? 0;
  checkAmounts(input.amount, discount);

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError("Draft invoice not found");
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const payment = await tx.invoicePayment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.invoiceId !== invoiceId) throw new NotFoundError("Payment not found on this draft invoice");

    const discountChange = discount - Number(payment.discount);
    const newTotal = Number(invoice.totalAmount) - discountChange;
    const newPaid = Number(invoice.paymentAmount) - Number(payment.amount) + input.amount;
    if (newPaid > newTotal + 0.005) {
      const max = Number(invoice.totalAmount) + Number(payment.discount) - (Number(invoice.paymentAmount) - Number(payment.amount));
      throw new ConflictError(
        `That would overpay ${invoice.invoiceNumber} — this payment plus its discount can be at most ₹${max.toFixed(2)}`
      );
    }

    const updated = await tx.invoicePayment.update({
      where: { id: paymentId },
      data: {
        amount: input.amount,
        discount,
        paymentDate: input.paymentDate ? new Date(input.paymentDate) : payment.paymentDate,
        paymentMode: input.paymentMode ?? null,
        reference: input.reference ?? null,
        receivedBy: input.receivedBy ?? null,
        notes: input.notes ?? null,
      },
    });
    await recordPaymentAudit(tx, {
      paymentKind: "INVOICE",
      paymentId,
      invoiceId,
      action: "EDIT",
      before: paymentSnapshot(payment),
      after: paymentSnapshot(updated),
      changedById,
    });
    return tx.invoice.update({
      where: { id: invoiceId },
      data: {
        paymentAmount: r2(newPaid),
        discount: r2(Number(invoice.discount) + discountChange),
        totalAmount: r2(newTotal),
      },
      include: detailInclude,
    });
  });
}

// Admin removal of a payment recorded by mistake — its discount is undone too.
export async function deleteInvoicePayment(invoiceId: number, paymentId: number, changedById: number) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError("Draft invoice not found");
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const payment = await tx.invoicePayment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.invoiceId !== invoiceId) throw new NotFoundError("Payment not found on this draft invoice");

    await tx.invoicePayment.delete({ where: { id: paymentId } });
    await recordPaymentAudit(tx, {
      paymentKind: "INVOICE",
      paymentId,
      invoiceId,
      action: "DELETE",
      before: paymentSnapshot(payment),
      changedById,
    });
    return tx.invoice.update({
      where: { id: invoiceId },
      data: {
        paymentAmount: r2(Number(invoice.paymentAmount) - Number(payment.amount)),
        discount: r2(Number(invoice.discount) - Number(payment.discount)),
        totalAmount: r2(Number(invoice.totalAmount) + Number(payment.discount)),
      },
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
