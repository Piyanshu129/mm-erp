import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// The fields of a payment that an audit entry records, as plain JSON.
export function paymentSnapshot(p: {
  amount: Prisma.Decimal | number;
  discount?: Prisma.Decimal | number;
  paymentDate: Date;
  paymentMode: string | null;
  reference: string | null;
  notes: string | null;
  receivedBy?: string | null;
  paidBy?: string | null;
}) {
  return {
    amount: Number(p.amount),
    discount: Number(p.discount ?? 0),
    paymentDate: p.paymentDate.toISOString(),
    paymentMode: p.paymentMode,
    reference: p.reference,
    ...(p.receivedBy !== undefined ? { receivedBy: p.receivedBy } : {}),
    ...(p.paidBy !== undefined ? { paidBy: p.paidBy } : {}),
    notes: p.notes,
  };
}

// Written inside the same transaction as the change, so a change can't
// happen without its audit entry.
export async function recordPaymentAudit(
  tx: Prisma.TransactionClient,
  entry: {
    paymentKind: "INVOICE" | "SUPPLIER";
    paymentId: number;
    invoiceId?: number;
    supplierId?: number;
    action: "EDIT" | "DELETE";
    before: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
    changedById: number;
  }
) {
  await tx.paymentAudit.create({
    data: { ...entry, after: entry.after ?? Prisma.JsonNull },
  });
}

export async function listPaymentAudits(where: { paymentKind: "INVOICE"; invoiceId: number } | { paymentKind: "SUPPLIER"; supplierId: number }) {
  return prisma.paymentAudit.findMany({
    where,
    include: { changedBy: { select: { id: true, name: true } } },
    orderBy: { changedAt: "desc" },
  });
}
