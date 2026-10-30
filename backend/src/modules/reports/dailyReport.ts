import { prisma } from "../../lib/prisma";
import { isInventoryType } from "../purchases/purchases.service";
import { accountsFor } from "../suppliers/suppliers.service";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Everything that happened in a date range (one day by default), in full
// detail:
//   * estimates — every estimate dated in the range, with its lines, tax,
//     total and whether the customer approved it;
//   * sales — every draft invoice dated in the range, with its line items,
//     labour, discount, tax, total, amount received, outstanding and the
//     payments against it;
//   * collections — every customer payment received that day (whichever
//     invoice it was for);
//   * purchases — every purchase line dated that day, with item details and
//     the supplier's payment position.
//
// Only invoices whose job card is Invoiced count as finalised. An invoice
// whose job card has been set back to Open (being changed) is listed
// separately and left out of the totals until it's invoiced again. Cancelled
// job cards can't have invoices, and there are no returns in this system.
//
// `from` and `to` are YYYY-MM-DD on the workshop's own calendar, both
// days included.
export async function getDailyReport(from: string, to: string = from) {
  if (to < from) [from, to] = [to, from];
  const dayStart = new Date(`${from}T00:00:00`);
  const toStart = new Date(`${to}T00:00:00`);
  const dayEnd = new Date(toStart.getFullYear(), toStart.getMonth(), toStart.getDate() + 1);
  // Purchase dates are calendar dates stored at midnight UTC.
  const purchaseDay = new Date(`${from}T00:00:00Z`);
  const purchaseEnd = new Date(new Date(`${to}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000);

  const [estimates, invoices, collections, purchases] = await Promise.all([
    prisma.estimate.findMany({
      where: { estimateDate: { gte: dayStart, lt: dayEnd } },
      include: {
        jobCard: { include: { vehicle: { include: { customer: true } } } },
        lines: { include: { item: { select: { itemCode: true } } }, orderBy: { id: "asc" } },
      },
      orderBy: { id: "asc" },
    }),
    prisma.invoice.findMany({
      where: { invoiceDate: { gte: dayStart, lt: dayEnd } },
      include: {
        jobCard: {
          include: {
            vehicle: { include: { customer: true } },
            parts: { include: { item: true }, orderBy: { id: "asc" } },
            labour: { orderBy: { id: "asc" } },
          },
        },
        payments: { orderBy: [{ paymentDate: "asc" }, { id: "asc" }] },
      },
      orderBy: { id: "asc" },
    }),
    prisma.invoicePayment.findMany({
      where: { paymentDate: { gte: dayStart, lt: dayEnd } },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            jobCard: { select: { vehicle: { select: { registrationNumber: true, customer: { select: { name: true } } } } } },
          },
        },
      },
      orderBy: { id: "asc" },
    }),
    prisma.purchase.findMany({
      // The whole UTC day, so a purchase stored with a time (older entries
      // saved without a date) is still found.
      where: { purchaseDate: { gte: purchaseDay, lt: purchaseEnd } },
      include: { supplier: true, item: true },
      orderBy: { id: "asc" },
    }),
  ]);

  const estimateRows = estimates.map((e) => {
    const subtotal = round2(e.lines.reduce((t, l) => t + Number(l.amount), 0));
    const taxAmount = round2((subtotal * Number(e.taxRate ?? 0)) / 100);
    return {
      id: e.id,
      estimateNumber: e.estimateNumber,
      estimateDate: e.estimateDate,
      approved: e.status === "APPROVED",
      jobCardId: e.jobCardId,
      jobCardNumber: e.jobCard.jobCardNumber,
      customerName: e.jobCard.vehicle.customer.name,
      customerMobile: e.jobCard.vehicle.customer.mobile,
      registrationNumber: e.jobCard.vehicle.registrationNumber,
      lines: e.lines.map((l) => ({
        kind: l.lineType === "LABOUR" ? "Labour" : l.item ? "Part" : "Non-inventory",
        description: l.item ? `${l.item.itemCode} — ${l.description}` : l.description,
        quantity: l.quantity,
        rate: Number(l.rate),
        amount: Number(l.amount),
      })),
      subtotal,
      taxRate: e.taxRate != null ? Number(e.taxRate) : null,
      taxAmount,
      total: round2(subtotal + taxAmount),
    };
  });

  const sales = invoices.map((inv) => {
    const jc = inv.jobCard;
    const total = Number(inv.totalAmount);
    const received = Number(inv.paymentAmount);
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      finalised: jc.status === "INVOICED",
      jobCardId: jc.id,
      jobCardNumber: jc.jobCardNumber,
      customerName: jc.vehicle.customer.name,
      customerMobile: jc.vehicle.customer.mobile,
      registrationNumber: jc.vehicle.registrationNumber,
      lines: [
        ...jc.parts.map((p) => ({
          kind: p.item ? "Part" : "Non-inventory",
          description: p.item ? `${p.item.itemCode} — ${p.item.name}` : p.description ?? "",
          quantity: p.quantity,
          rate: Number(p.rate),
          amount: Number(p.amount),
        })),
        ...jc.labour.map((l) => ({
          kind: "Labour",
          description: l.description,
          quantity: l.quantity,
          rate: Number(l.rate),
          amount: Number(l.amount),
        })),
      ],
      partsTotal: Number(inv.partsTotal),
      labourTotal: Number(inv.labourTotal),
      discount: Number(inv.discount),
      taxAmount: Number(inv.taxAmount ?? 0),
      total,
      received,
      outstanding: round2(total - received),
      payments: inv.payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        discount: Number(p.discount),
        paymentDate: p.paymentDate,
        paymentMode: p.paymentMode,
        reference: p.reference,
        receivedBy: p.receivedBy,
      })),
    };
  });

  const supplierIds = [...new Set(purchases.map((p) => p.supplierId).filter((id): id is number => id != null))];
  const supplierAccounts = await accountsFor(supplierIds);

  const purchaseRows = purchases.map((p) => {
    const inventory = isInventoryType(p.itemType);
    const account = p.supplierId != null ? supplierAccounts.get(p.supplierId) : undefined;
    return {
      id: p.id,
      purchaseDate: p.purchaseDate,
      itemType: p.itemType,
      category: inventory ? "Inventory" : "Expense",
      supplierName: p.supplier?.name ?? null,
      itemCode: p.item?.itemCode ?? null,
      itemName: p.item?.name ?? p.description ?? "",
      brand: p.item?.brand ?? null,
      specification: p.item?.specification ?? null,
      uom: p.item?.uom ?? null,
      quantity: p.quantity,
      rate: Number(p.purchaseCost),
      amount: round2(p.quantity * Number(p.purchaseCost)),
      billUrl: p.billUrl,
      remarks: p.remarks,
      // Payments go against the supplier's account, not one purchase, so
      // this is the supplier's position as of now.
      supplierBalanceDue: account?.balanceDue ?? null,
      paymentStatus: !account ? (inventory ? null : "Paid (expense)") : account.balanceDue <= 0.005 ? "Supplier fully paid" : `₹${account.balanceDue.toFixed(2)} due to supplier`,
    };
  });

  const finalised = sales.filter((s) => s.finalised);
  const sum = <T>(rows: T[], f: (r: T) => number) => round2(rows.reduce((t, r) => t + f(r), 0));
  const byMode = new Map<string, number>();
  for (const c of collections) {
    const mode = c.paymentMode ?? "Not recorded";
    byMode.set(mode, round2((byMode.get(mode) ?? 0) + Number(c.amount)));
  }

  return {
    date: from,
    from,
    to,
    summary: {
      estimatesCount: estimateRows.length,
      estimatesApproved: estimateRows.filter((e) => e.approved).length,
      estimatesTotal: sum(estimateRows, (e) => e.total),
      salesCount: finalised.length,
      salesTotal: sum(finalised, (s) => s.total),
      salesReceived: sum(finalised, (s) => s.received),
      salesOutstanding: sum(finalised, (s) => s.outstanding),
      beingRevisedCount: sales.length - finalised.length,
      collectionsTotal: sum(collections, (c) => Number(c.amount)),
      collectionsDiscount: sum(collections, (c) => Number(c.discount)),
      collectionsByMode: [...byMode.entries()].map(([mode, amount]) => ({ mode, amount })),
      purchaseCount: purchaseRows.length,
      purchaseTotal: sum(purchaseRows, (p) => p.amount),
      inventoryPurchaseTotal: sum(purchaseRows.filter((p) => p.category === "Inventory"), (p) => p.amount),
      expenseTotal: sum(purchaseRows.filter((p) => p.category === "Expense"), (p) => p.amount),
    },
    estimates: estimateRows,
    sales,
    collections: collections.map((c) => ({
      id: c.id,
      amount: Number(c.amount),
      discount: Number(c.discount),
      paymentDate: c.paymentDate,
      paymentMode: c.paymentMode,
      reference: c.reference,
      receivedBy: c.receivedBy,
      notes: c.notes,
      invoiceId: c.invoice.id,
      invoiceNumber: c.invoice.invoiceNumber,
      registrationNumber: c.invoice.jobCard.vehicle.registrationNumber,
      customerName: c.invoice.jobCard.vehicle.customer.name,
    })),
    purchases: purchaseRows,
  };
}
