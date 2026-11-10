import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";
import { assertMandatoryPhotos } from "../jobCards/jobCards.service";
import { paymentSnapshot, recordPaymentAudit } from "../../lib/paymentAudit";
import { syncBills, syncEstimateWithJobCard } from "../estimates/estimates.service";

const paymentInclude = {
  createdBy: { select: { id: true, name: true } },
} as const;

const detailInclude = {
  jobCard: {
    include: {
      vehicle: { include: { customer: true } },
      parts: { include: { item: true }, orderBy: { id: "asc" as const } },
      labour: { orderBy: { id: "asc" as const } },
      estimate: { select: { id: true, estimateNumber: true } },
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
  if (!invoice) throw new NotFoundError("Bill not found");
  return invoice;
}

// Closing a job card (the only way it becomes Closed — status INVOICED):
// its estimate is brought in step with the final parts and labour and
// becomes the bill, and the bills behind it — the customer's, plus the
// insurance company's on an accidental claim — are made or brought up to
// date (estimates.service.ts). There's no separate draft invoice any more.
//
// A closed job card that was set back to Open (to change it) keeps its
// bills: closing it again updates them — same numbers, same payments.
//
// discount (the customer's) left undefined, as when closing from the status
// dropdown, keeps the bill's current discount, or none the first time.
//
// payment (optional) is taken on the customer's bill in the same
// transaction — if it can't be (e.g. more than is due), nothing is closed.
export async function closeJobCard(
  jobCardId: number,
  discount: number | undefined,
  createdById: number,
  payment?: InvoicePaymentInput
) {
  // Status first, so a cancelled or already-closed job card gets that
  // reason rather than a list of missing photos. (Re-checked inside the
  // transaction below.)
  const current = await prisma.jobCard.findUnique({ where: { id: jobCardId } });
  if (!current) throw new NotFoundError("Job card not found");
  if (current.status !== "OPEN") {
    throw new ConflictError(
      current.status === "INVOICED"
        ? "This job card is already closed"
        : "Only an open job card can be closed — set it back to Open first if it was cancelled"
    );
  }

  // Every bill has at least one labour/service line.
  const labourLines = await prisma.jobCardLabour.count({ where: { jobCardId } });
  if (labourLines === 0) {
    throw new ConflictError("Add at least one labour / service line before closing the job card");
  }

  // The workshop's before/after comparison photos must be done before the
  // customer is billed.
  await assertMandatoryPhotos(jobCardId, "BEFORE");
  await assertMandatoryPhotos(jobCardId, "AFTER");

  return prisma.$transaction(async (tx) => {
    // The job card row is locked for the whole close, so two clicks (or two
    // people) at the same moment can't both make bills: the second waits,
    // then sees the job card is already closed.
    await tx.$queryRaw`SELECT id FROM job_cards WHERE id = ${jobCardId} FOR UPDATE`;
    const jobCard = await tx.jobCard.findUnique({ where: { id: jobCardId } });
    if (!jobCard) throw new NotFoundError("Job card not found");
    if (jobCard.status !== "OPEN") {
      throw new ConflictError(jobCard.status === "INVOICED" ? "This job card is already closed" : "Only an open job card can be closed");
    }

    const estimateId = await syncEstimateWithJobCard(tx, jobCardId, createdById);
    await syncBills(tx, jobCardId, createdById, discount);
    await tx.jobCard.update({ where: { id: jobCardId }, data: { status: "INVOICED" } });

    if (payment) {
      const customerBill = await tx.invoice.findUnique({ where: { jobCardId_payer: { jobCardId, payer: "CUSTOMER" } } });
      if (!customerBill) throw new ConflictError("There's no customer bill to take the payment on");
      await recordInvoicePaymentTx(tx, customerBill.id, payment, createdById);
    }

    const invoices = await tx.invoice.findMany({ where: { jobCardId }, include: detailInclude, orderBy: { id: "asc" } });
    return { estimateId, invoices };
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

// How a bill is named to staff: by its estimate number (the estimate is the
// bill), the insurance company's one marked as such.
function billNameOf(invoice: { invoiceNumber: string; payer: string; jobCard: { estimate: { estimateNumber: string } | null } }) {
  const number = invoice.jobCard.estimate?.estimateNumber ?? invoice.invoiceNumber;
  return invoice.payer === "INSURANCE" ? `the insurance bill on ${number}` : `bill ${number}`;
}

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
  return prisma.$transaction((tx) => recordInvoicePaymentTx(tx, invoiceId, input, createdById));
}

// The same, inside a transaction the caller already has open (closing a job
// card with a payment taken at the counter).
async function recordInvoicePaymentTx(tx: Prisma.TransactionClient, invoiceId: number, input: InvoicePaymentInput, createdById: number) {
  const discount = input.discount ?? 0;
  checkAmounts(input.amount, discount);
  {
    const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError("Bill not found");
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { jobCard: { select: { estimate: { select: { estimateNumber: true } } } } } });
    const billName = billNameOf(invoice);

    const due = Number(invoice.totalAmount) - Number(invoice.paymentAmount);
    if (input.amount + discount > due + 0.005) {
      throw new ConflictError(
        due <= 0
          ? `${billName} is already fully paid`
          : `That would overpay ${billName} — only ₹${due.toFixed(2)} is still due (payment + discount)`
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
  }
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
    if (locked.length === 0) throw new NotFoundError("Bill not found");
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { jobCard: { select: { estimate: { select: { estimateNumber: true } } } } } });
    const billName = billNameOf(invoice);
    const payment = await tx.invoicePayment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.invoiceId !== invoiceId) throw new NotFoundError("Payment not found on this bill");

    const discountChange = discount - Number(payment.discount);
    const newTotal = Number(invoice.totalAmount) - discountChange;
    const newPaid = Number(invoice.paymentAmount) - Number(payment.amount) + input.amount;
    if (newPaid > newTotal + 0.005) {
      const max = Number(invoice.totalAmount) + Number(payment.discount) - (Number(invoice.paymentAmount) - Number(payment.amount));
      throw new ConflictError(
        `That would overpay ${billName} — this payment plus its discount can be at most ₹${max.toFixed(2)}`
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
    if (locked.length === 0) throw new NotFoundError("Bill not found");
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const payment = await tx.invoicePayment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.invoiceId !== invoiceId) throw new NotFoundError("Payment not found on this bill");

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
// What a customer (or one vehicle) has been billed, what they've paid, and
// what's still due — always computed from the bills themselves. Only the
// customer's own bills: what an insurance company owes on a claim is on that
// estimate, not on the customer's account.

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
    WHERE ${key} IN (${Prisma.join(ids)}) AND i.payer = 'CUSTOMER'
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
  const invoiceWhere: Prisma.InvoiceWhereInput = { jobCard: { vehicle: vehicleWhere }, payer: "CUSTOMER" };

  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({
      where: invoiceWhere,
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        totalAmount: true,
        paymentAmount: true,
        jobCard: {
          select: {
            jobCardNumber: true,
            vehicle: { select: { registrationNumber: true } },
            estimate: { select: { id: true, estimateNumber: true } },
          },
        },
      },
      orderBy: [{ invoiceDate: "asc" }, { id: "asc" }],
    }),
    prisma.invoicePayment.findMany({
      where: { invoice: invoiceWhere },
      include: {
        ...paymentInclude,
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            jobCard: {
              select: { vehicle: { select: { registrationNumber: true } }, estimate: { select: { id: true, estimateNumber: true } } },
            },
          },
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
