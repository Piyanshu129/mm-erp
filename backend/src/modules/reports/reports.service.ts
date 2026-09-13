import { prisma } from "../../lib/prisma";
import { LOCKED_STATUSES } from "../../lib/jobCardStatus";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseRange(from?: string, to?: string) {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  // Make the "to" date inclusive of its whole day.
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Backs the Dashboard's widget row: today's activity plus current
// actionable counts (low/out of stock, jobs stuck waiting), all from live
// queries — nothing here is cached or precomputed.
export async function getDashboardSummary() {
  const todayStart = startOfToday();

  const [
    todaysJobCards,
    openJobCards,
    completedJobs,
    waitingForParts,
    todaysInvoices,
    todaysPurchases,
    items,
  ] = await Promise.all([
    prisma.jobCard.findMany({
      where: { createdAt: { gte: todayStart } },
      select: { vehicleId: true },
    }),
    prisma.jobCard.count({ where: { status: { notIn: [...LOCKED_STATUSES] } } }),
    prisma.jobCard.count({ where: { status: "COMPLETED" } }),
    prisma.jobCard.count({ where: { status: "WAITING_FOR_PARTS" } }),
    prisma.invoice.findMany({
      where: { invoiceDate: { gte: todayStart } },
      select: { totalAmount: true },
    }),
    prisma.purchase.findMany({
      where: { purchaseDate: { gte: todayStart } },
      select: { quantity: true, purchaseCost: true },
    }),
    prisma.item.findMany({
      where: { isActive: true },
      select: { currentStock: true, minStock: true },
    }),
  ]);

  const todaysSales = todaysInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
  const todaysPurchaseValue = todaysPurchases.reduce(
    (sum, p) => sum + p.quantity * Number(p.purchaseCost),
    0
  );
  const lowStockCount = items.filter((i) => i.currentStock > 0 && i.currentStock <= i.minStock).length;
  const outOfStockCount = items.filter((i) => i.currentStock <= 0).length;

  return {
    todaysVehicles: new Set(todaysJobCards.map((jc) => jc.vehicleId)).size,
    openJobCards,
    completedJobs,
    pendingJobs: waitingForParts,
    todaysSales,
    todaysPurchaseValue,
    lowStockCount,
    outOfStockCount,
  };
}

export async function getSalesReport(from?: string, to?: string) {
  const { start, end } = parseRange(from, to);
  const invoices = await prisma.invoice.findMany({
    where: { invoiceDate: { gte: start, lte: end } },
    include: { jobCard: { include: { vehicle: { include: { customer: true } } } } },
    orderBy: { invoiceDate: "asc" },
  });

  const byDay = new Map<string, { count: number; total: number }>();
  for (const inv of invoices) {
    const key = inv.invoiceDate.toISOString().slice(0, 10);
    const row = byDay.get(key) ?? { count: 0, total: 0 };
    row.count += 1;
    row.total += Number(inv.totalAmount);
    byDay.set(key, row);
  }

  const grandTotal = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);

  return {
    byDay: [...byDay.entries()].map(([date, v]) => ({ date, ...v })),
    invoices,
    grandTotal,
  };
}

export async function getPurchasesReport(from?: string, to?: string) {
  const { start, end } = parseRange(from, to);
  const purchases = await prisma.purchase.findMany({
    where: { purchaseDate: { gte: start, lte: end } },
    include: { supplier: true, item: true },
    orderBy: { purchaseDate: "asc" },
  });

  const byDay = new Map<string, { count: number; total: number }>();
  const bySupplier = new Map<string, { count: number; total: number }>();

  for (const p of purchases) {
    const value = p.quantity * Number(p.purchaseCost);
    const dayKey = p.purchaseDate.toISOString().slice(0, 10);
    const dayRow = byDay.get(dayKey) ?? { count: 0, total: 0 };
    dayRow.count += 1;
    dayRow.total += value;
    byDay.set(dayKey, dayRow);

    const supplierRow = bySupplier.get(p.supplier.name) ?? { count: 0, total: 0 };
    supplierRow.count += 1;
    supplierRow.total += value;
    bySupplier.set(p.supplier.name, supplierRow);
  }

  const grandTotal = purchases.reduce((sum, p) => sum + p.quantity * Number(p.purchaseCost), 0);

  return {
    byDay: [...byDay.entries()].map(([date, v]) => ({ date, ...v })),
    bySupplier: [...bySupplier.entries()].map(([supplier, v]) => ({ supplier, ...v })),
    purchases,
    grandTotal,
  };
}

export async function getInventoryReport() {
  const items = await prisma.item.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  const rows = items.map((item) => {
    const stockValue = item.currentStock * Number(item.purchaseCost);
    const status = item.currentStock <= 0 ? "OUT_OF_STOCK" : item.currentStock <= item.minStock ? "LOW_STOCK" : "IN_STOCK";
    return {
      itemCode: item.itemCode,
      name: item.name,
      category: item.category,
      uom: item.uom,
      currentStock: item.currentStock,
      minStock: item.minStock,
      stockValue,
      status,
    };
  });

  return {
    rows,
    totalStockValue: rows.reduce((sum, r) => sum + r.stockValue, 0),
    lowStockCount: rows.filter((r) => r.status === "LOW_STOCK").length,
    outOfStockCount: rows.filter((r) => r.status === "OUT_OF_STOCK").length,
  };
}

export async function getWorkshopReport(from?: string, to?: string) {
  const { start, end } = parseRange(from, to);
  const jobCards = await prisma.jobCard.findMany({
    where: { createdAt: { gte: start, lte: end } },
    include: { vehicle: true },
    orderBy: { createdAt: "desc" },
  });

  const byStatus = new Map<string, number>();
  for (const jc of jobCards) {
    byStatus.set(jc.status, (byStatus.get(jc.status) ?? 0) + 1);
  }

  return {
    byStatus: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
    jobCards,
  };
}

export async function getCustomersReport(from?: string, to?: string) {
  const { start, end } = parseRange(from, to);

  const [newCustomers, customersWithVehicles] = await Promise.all([
    prisma.customer.count({ where: { createdAt: { gte: start, lte: end } } }),
    prisma.customer.findMany({
      include: { vehicles: { include: { _count: { select: { jobCards: true } } } } },
    }),
  ]);

  let repeatCustomers = 0;
  for (const c of customersWithVehicles) {
    const totalJobCards = c.vehicles.reduce((sum, v) => sum + v._count.jobCards, 0);
    if (totalJobCards >= 2) repeatCustomers += 1;
  }

  return {
    newCustomers,
    repeatCustomers,
    totalCustomers: customersWithVehicles.length,
  };
}
