import { prisma } from "../../lib/prisma";
import { purchaseTotals } from "../purchases/purchases.service";
import { upcomingServices } from "../../lib/serviceSchedule";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// "YYYY-MM-DD" dates are whole days on the workshop's own calendar (local
// midnight to midnight), not UTC — otherwise an invoice made before 5:30 am
// IST would fall outside its own day.
function parseRange(from?: string, to?: string) {
  const end = to ? new Date(`${to}T00:00:00`) : new Date();
  const start = from ? new Date(`${from}T00:00:00`) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  // Make the "to" date inclusive of its whole day.
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Backs the Dashboard's widget row: today's activity plus current
// actionable counts (low/out of stock, jobs stuck waiting), all from live
// queries — nothing here is cached or precomputed.
//
// Sales and purchase money figures are for admins only: for anyone else
// they're left out of the response entirely, not just hidden on the page.
// The service-due reminder goes to whoever can see vehicles or job cards.
export async function getDashboardSummary(viewer: { role: string; permissions: string[] }) {
  const isAdmin = viewer.role === "ADMIN";
  const seesServices = isAdmin || viewer.permissions.includes("JOB_CARDS") || viewer.permissions.includes("VEHICLES");
  const todayStart = startOfToday();
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  const nextMonthStart = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 1);

  const [
    todaysJobCards,
    openJobCards,
    cancelledThisMonth,
    todaysInvoices,
    todaysPurchases,
    items,
    monthPurchases,
    services,
  ] = await Promise.all([
    prisma.jobCard.findMany({
      where: { createdAt: { gte: todayStart } },
      select: { vehicleId: true },
    }),
    prisma.jobCard.count({ where: { status: "OPEN" } }),
    prisma.jobCard.count({ where: { status: "CANCELLED", updatedAt: { gte: monthStart } } }),
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
    purchaseTotals({ start: monthStart, end: nextMonthStart }),
    seesServices ? upcomingServices() : Promise.resolve(null),
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
    invoicedToday: todaysInvoices.length,
    cancelledThisMonth,
    lowStockCount,
    outOfStockCount,
    upcomingServices: services,
    ...(isAdmin
      ? {
          todaysSales,
          todaysPurchaseValue,
          monthPurchaseValue: monthPurchases.total,
          monthInventoryPurchaseValue: monthPurchases.inventoryTotal,
          monthExpenseValue: monthPurchases.expenseTotal,
        }
      : {}),
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
    // Invoices are timestamps: grouped by the local calendar day.
    const key = inv.invoiceDate.toLocaleDateString("en-CA");
    const row = byDay.get(key) ?? { count: 0, total: 0 };
    row.count += 1;
    row.total += Number(inv.totalAmount);
    byDay.set(key, row);
  }

  const grandTotal = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);

  return {
    byDay: [...byDay.entries()].map(([date, v]) => ({ date, ...v })),
    // Each with its day, so the report can list a day's invoices under it.
    invoices: invoices.map((inv) => ({ ...inv, day: inv.invoiceDate.toLocaleDateString("en-CA") })),
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

    const supplierName = p.supplier?.name ?? "No supplier (expenses)";
    const supplierRow = bySupplier.get(supplierName) ?? { count: 0, total: 0 };
    supplierRow.count += 1;
    supplierRow.total += value;
    bySupplier.set(supplierName, supplierRow);
  }

  const grandTotal = purchases.reduce((sum, p) => sum + p.quantity * Number(p.purchaseCost), 0);

  return {
    byDay: [...byDay.entries()].map(([date, v]) => ({ date, ...v })),
    bySupplier: [...bySupplier.entries()].map(([supplier, v]) => ({ supplier, ...v })),
    // purchaseDate is a calendar date (stored at midnight UTC), so its UTC
    // date is the day.
    purchases: purchases.map((p) => ({ ...p, day: p.purchaseDate.toISOString().slice(0, 10) })),
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
