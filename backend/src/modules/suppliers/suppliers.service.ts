import { Prisma } from "@prisma/client";
import { paymentSnapshot, recordPaymentAudit } from "../../lib/paymentAudit";
import { prisma } from "../../lib/prisma";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";

export interface SupplierInput {
  name: string;
  contactPerson?: string;
  mobile?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface SupplierAccount {
  totalPurchased: number;
  totalPaid: number;
  // Settlement discounts the supplier gave with payments.
  totalDiscount: number;
  balanceDue: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// A supplier's running account: everything bought from them (quantity ×
// per-unit cost across all their purchases) against everything paid to them.
// Always computed from the rows themselves, never stored, so it can't drift.
export async function accountsFor(
  supplierIds: number[],
  db: Prisma.TransactionClient = prisma
): Promise<Map<number, SupplierAccount>> {
  const accounts = new Map<number, SupplierAccount>();
  if (supplierIds.length === 0) return accounts;

  const [purchased, paid] = await Promise.all([
    db.$queryRaw<{ supplier_id: number; total: Prisma.Decimal }[]>`
      SELECT supplier_id, SUM(quantity * purchase_cost) AS total
      FROM purchases
      WHERE supplier_id IN (${Prisma.join(supplierIds)})
      GROUP BY supplier_id
    `,
    db.supplierPayment.groupBy({
      by: ["supplierId"],
      where: { supplierId: { in: supplierIds } },
      _sum: { amount: true, discount: true },
    }),
  ]);

  const purchasedBy = new Map(purchased.map((r) => [r.supplier_id, Number(r.total)]));
  const paidBy = new Map(paid.map((r) => [r.supplierId, Number(r._sum.amount ?? 0)]));
  const discountBy = new Map(paid.map((r) => [r.supplierId, Number(r._sum.discount ?? 0)]));

  for (const id of supplierIds) {
    const totalPurchased = round2(purchasedBy.get(id) ?? 0);
    const totalPaid = round2(paidBy.get(id) ?? 0);
    const totalDiscount = round2(discountBy.get(id) ?? 0);
    accounts.set(id, { totalPurchased, totalPaid, totalDiscount, balanceDue: round2(totalPurchased - totalPaid - totalDiscount) });
  }
  return accounts;
}

export async function listSuppliers(q: string | undefined, page: PageParams) {
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { mobile: { contains: q } },
        ],
      }
    : {};

  const [total, suppliers] = await Promise.all([
    prisma.supplier.count({ where }),
    prisma.supplier.findMany({ where, orderBy: { createdAt: "desc" }, ...toSkipTake(page) }),
  ]);

  const accounts = await accountsFor(suppliers.map((s) => s.id));
  return {
    total,
    suppliers: suppliers.map((s) => ({ ...s, account: accounts.get(s.id)! })),
  };
}

export async function createSupplier(input: SupplierInput) {
  return prisma.supplier.create({ data: input });
}

export async function updateSupplier(id: number, input: Partial<SupplierInput>) {
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) throw new NotFoundError("Supplier not found");
  return prisma.supplier.update({ where: { id }, data: input });
}

export async function setSupplierActive(id: number, isActive: boolean) {
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) throw new NotFoundError("Supplier not found");
  return prisma.supplier.update({ where: { id }, data: { isActive } });
}

// Full payment history for one supplier, newest first, with the account
// summary it adds up to.
export async function getSupplierPayments(id: number) {
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) throw new NotFoundError("Supplier not found");

  const [payments, accounts] = await Promise.all([
    prisma.supplierPayment.findMany({
      where: { supplierId: id },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
    }),
    accountsFor([id]),
  ]);

  return { supplier: { ...supplier, account: accounts.get(id)! }, payments };
}

export interface SupplierPaymentInput {
  amount: number;
  // Settlement discount the supplier gave — comes off the balance too.
  discount?: number;
  paymentDate?: string;
  paymentMode?: string;
  reference?: string;
  paidBy?: string;
  notes?: string;
  proofUrl?: string;
}

// Each call records one payment — the amount being paid now, never a
// running total. Rejects anything more than the balance still due, which
// catches a mistyped extra zero. The supplier row is locked for the length
// of the check-and-insert, so two payments entered at the same moment can't
// both pass the check and together overpay.
// Admin correction of a recorded supplier payment. Checked against the
// supplier's balance as it would be without this payment, with the
// supplier row locked, so a correction can't overpay either.
export async function updateSupplierPayment(
  supplierId: number,
  paymentId: number,
  input: SupplierPaymentInput,
  changedById: number
) {
  const discount = input.discount ?? 0;
  if (input.amount < 0 || discount < 0) throw new ConflictError("Amounts can't be negative");
  if (input.amount + discount <= 0) throw new ConflictError("Enter the amount paid, a discount, or both");

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM suppliers WHERE id = ${supplierId} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError("Supplier not found");
    const payment = await tx.supplierPayment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.supplierId !== supplierId) throw new NotFoundError("Payment not found for this supplier");

    const account = (await accountsFor([supplierId], tx)).get(supplierId)!;
    const dueWithoutThis = account.balanceDue + Number(payment.amount) + Number(payment.discount);
    if (input.amount + discount > dueWithoutThis + 0.005) {
      throw new ConflictError(`That would overpay this supplier — this payment plus its discount can be at most ₹${dueWithoutThis.toFixed(2)}`);
    }

    const updated = await tx.supplierPayment.update({
      where: { id: paymentId },
      data: {
        amount: input.amount,
        discount,
        paymentDate: input.paymentDate ? new Date(input.paymentDate) : payment.paymentDate,
        paymentMode: input.paymentMode ?? null,
        reference: input.reference ?? null,
        paidBy: input.paidBy ?? null,
        notes: input.notes ?? null,
        ...(input.proofUrl ? { proofUrl: input.proofUrl } : {}),
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    await recordPaymentAudit(tx, {
      paymentKind: "SUPPLIER",
      paymentId,
      supplierId,
      action: "EDIT",
      before: paymentSnapshot(payment),
      after: paymentSnapshot(updated),
      changedById,
    });
    return updated;
  });
}

export async function deleteSupplierPayment(supplierId: number, paymentId: number, changedById: number) {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.supplierPayment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.supplierId !== supplierId) throw new NotFoundError("Payment not found for this supplier");
    await tx.supplierPayment.delete({ where: { id: paymentId } });
    await recordPaymentAudit(tx, {
      paymentKind: "SUPPLIER",
      paymentId,
      supplierId,
      action: "DELETE",
      before: paymentSnapshot(payment),
      changedById,
    });
  });
}

export async function recordSupplierPayment(id: number, input: SupplierPaymentInput, createdById: number) {
  const discount = input.discount ?? 0;
  if (input.amount < 0 || discount < 0) throw new ConflictError("Amounts can't be negative");
  if (input.amount + discount <= 0) throw new ConflictError("Enter the amount paid, a discount, or both");

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM suppliers WHERE id = ${id} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError("Supplier not found");

    const account = (await accountsFor([id], tx)).get(id)!;
    if (input.amount + discount > account.balanceDue + 0.005) {
      throw new ConflictError(
        account.balanceDue <= 0
          ? "Nothing is due to this supplier"
          : `That would overpay this supplier — only ₹${account.balanceDue.toFixed(2)} is due (payment + discount)`
      );
    }

    return tx.supplierPayment.create({
      data: {
        supplierId: id,
        amount: input.amount,
        discount,
        paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
        paymentMode: input.paymentMode,
        reference: input.reference,
        paidBy: input.paidBy,
        notes: input.notes,
        proofUrl: input.proofUrl,
        createdById,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
  });
}
