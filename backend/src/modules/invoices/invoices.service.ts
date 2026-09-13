import { prisma } from "../../lib/prisma";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";

const detailInclude = {
  jobCard: {
    include: {
      vehicle: { include: { customer: true } },
      parts: { include: { item: true }, orderBy: { id: "asc" as const } },
      labour: { orderBy: { id: "asc" as const } },
    },
  },
  createdBy: { select: { id: true, name: true } },
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
export async function createInvoice(jobCardId: number, discount: number, createdById: number) {
  return prisma.$transaction(async (tx) => {
    const jobCard = await tx.jobCard.findUnique({
      where: { id: jobCardId },
      include: { parts: true, labour: true, invoice: true },
    });
    if (!jobCard) throw new NotFoundError("Job card not found");
    if (jobCard.invoice) throw new ConflictError("This job card already has an invoice");
    if (jobCard.status !== "COMPLETED") {
      throw new ConflictError("Job card must be marked Completed before generating an invoice");
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
