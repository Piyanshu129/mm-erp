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

export type DashboardPeriod = "today" | "month" | "fy";

// The period's start (local time): today, the 1st of this month, or 1 April
// of the current financial year (April–March).
export function periodStart(period: DashboardPeriod, now = new Date()): Date {
  if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1, 3, 1);
}

const localDay = (d: Date) => d.toLocaleDateString("en-CA");
// Purchase dates are calendar dates stored at midnight UTC.
const purchaseDay = (d: Date) => d.toISOString().slice(0, 10);

// Each estimate's value: its lines plus tax.
async function estimatesBetween(start: Date, end: Date) {
  const estimates = await prisma.estimate.findMany({
    where: { estimateDate: { gte: start, lt: end } },
    select: { estimateDate: true, taxRate: true, status: true, lines: { select: { amount: true } } },
  });
  return estimates.map((e) => {
    const subtotal = e.lines.reduce((t, l) => t + Number(l.amount), 0);
    return {
      day: localDay(e.estimateDate),
      approved: e.status === "APPROVED",
      total: Math.round(subtotal * (1 + Number(e.taxRate ?? 0) / 100) * 100) / 100,
    };
  });
}

// Graph buckets for the admin dashboard: the last 7 days for "today", each
// day of the month for "month", each month of the financial year for "fy".
// Per bucket: purchases (stock + expenses), estimates, sales (draft invoice
// totals) and profit = sales − purchases.
async function dashboardSeries(period: DashboardPeriod, now = new Date()) {
  const todayStart = periodStart("today", now);
  const tomorrow = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 1);
  const buckets: { key: string; label: string }[] = [];
  let start: Date;
  if (period === "fy") {
    start = periodStart("fy", now);
    for (let d = new Date(start); d <= now; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      buckets.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("en-IN", { month: "short" }),
      });
    }
  } else {
    start = period === "month" ? periodStart("month", now) : new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() - 6);
    for (let d = new Date(start); d < tomorrow; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      buckets.push({ key: localDay(d), label: period === "month" ? String(d.getDate()) : d.toLocaleDateString("en-IN", { weekday: "short" }) });
    }
  }
  const bucketOf = (day: string) => (period === "fy" ? day.slice(0, 7) : day);
  const purchaseStart = new Date(`${localDay(start)}T00:00:00Z`);
  const purchaseEnd = new Date(`${localDay(tomorrow)}T00:00:00Z`);

  const [purchases, invoices, estimates] = await Promise.all([
    prisma.purchase.findMany({
      where: { purchaseDate: { gte: purchaseStart, lt: purchaseEnd } },
      select: { purchaseDate: true, quantity: true, purchaseCost: true },
    }),
    prisma.invoice.findMany({
      where: { invoiceDate: { gte: start, lt: tomorrow }, jobCard: { status: "INVOICED" } },
      select: { invoiceDate: true, totalAmount: true },
    }),
    estimatesBetween(start, tomorrow),
  ]);

  const rows = new Map(buckets.map((b) => [b.key, { ...b, purchases: 0, estimates: 0, sales: 0, profit: 0 }]));
  for (const p of purchases) {
    const row = rows.get(bucketOf(purchaseDay(p.purchaseDate)));
    if (row) row.purchases += p.quantity * Number(p.purchaseCost);
  }
  for (const i of invoices) {
    const row = rows.get(bucketOf(localDay(i.invoiceDate)));
    if (row) row.sales += Number(i.totalAmount);
  }
  for (const e of estimates) {
    const row = rows.get(bucketOf(e.day));
    if (row) row.estimates += e.total;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return [...rows.values()].map((r) => ({
    ...r,
    purchases: r2(r.purchases),
    estimates: r2(r.estimates),
    sales: r2(r.sales),
    profit: r2(r.sales - r.purchases),
  }));
}

// Backs the Dashboard's widget row for the chosen period (today, this month
// or this financial year), plus current actionable counts (open job cards,
// low/out of stock, services due) — all live queries.
//
// Money figures (estimate value, purchases, the graph) are for admins only:
// for anyone else they're left out of the response entirely, not just
// hidden on the page. The service-due reminder goes to whoever can see
// vehicles or job cards.
export async function getDashboardSummary(viewer: { role: string; permissions: string[] }, period: DashboardPeriod = "today") {
  const isAdmin = viewer.role === "ADMIN";
  const can = (m: string) => viewer.permissions.some((p) => p === m || p.startsWith(`${m}:`));
  const seesServices = isAdmin || can("JOB_CARDS") || can("VEHICLES");
  const now = new Date();
  const start = periodStart(period, now);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const purchaseStart = new Date(`${localDay(start)}T00:00:00Z`);
  const purchaseEnd = new Date(`${localDay(end)}T00:00:00Z`);

  const [jobCards, openJobCards, cancelled, estimates, items, purchases, services, series] = await Promise.all([
    prisma.jobCard.findMany({ where: { createdAt: { gte: start, lt: end } }, select: { vehicleId: true } }),
    prisma.jobCard.count({ where: { status: "OPEN" } }),
    prisma.jobCard.count({ where: { status: "CANCELLED", updatedAt: { gte: start, lt: end } } }),
    estimatesBetween(start, end),
    prisma.item.findMany({ where: { isActive: true }, select: { currentStock: true, minStock: true } }),
    isAdmin ? purchaseTotals({ start: purchaseStart, end: purchaseEnd }) : Promise.resolve(null),
    seesServices ? upcomingServices() : Promise.resolve(null),
    isAdmin ? dashboardSeries(period, now) : Promise.resolve(null),
  ]);

  return {
    period,
    periodStart: localDay(start),
    vehicles: new Set(jobCards.map((jc) => jc.vehicleId)).size,
    openJobCards,
    estimatesCount: estimates.length,
    estimatesApproved: estimates.filter((e) => e.approved).length,
    cancelled,
    lowStockCount: items.filter((i) => i.currentStock > 0 && i.currentStock <= i.minStock).length,
    outOfStockCount: items.filter((i) => i.currentStock <= 0).length,
    upcomingServices: services,
    ...(isAdmin && purchases
      ? {
          estimatesValue: Math.round(estimates.reduce((t, e) => t + e.total, 0) * 100) / 100,
          purchaseValue: purchases.total,
          inventoryPurchaseValue: purchases.inventoryTotal,
          expenseValue: purchases.expenseTotal,
          series,
        }
      : {}),
  };
}

// Estimates in a date range: per-day totals, and every estimate with its
// customer, vehicle, value and whether the customer approved it.
export async function getEstimatesReport(from?: string, to?: string) {
  const { start, end } = parseRange(from, to);
  const estimates = await prisma.estimate.findMany({
    where: { estimateDate: { gte: start, lte: end } },
    include: {
      jobCard: { include: { vehicle: { include: { customer: true } } } },
      lines: { select: { amount: true } },
    },
    orderBy: { estimateDate: "asc" },
  });
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const rows = estimates.map((e) => {
    const subtotal = e.lines.reduce((t, l) => t + Number(l.amount), 0);
    return {
      id: e.id,
      day: localDay(e.estimateDate),
      estimateNumber: e.estimateNumber,
      estimateDate: e.estimateDate,
      approved: e.status === "APPROVED",
      jobCardId: e.jobCardId,
      jobCardNumber: e.jobCard.jobCardNumber,
      registrationNumber: e.jobCard.vehicle.registrationNumber,
      customerName: e.jobCard.vehicle.customer.name,
      customerMobile: e.jobCard.vehicle.customer.mobile,
      total: r2(subtotal * (1 + Number(e.taxRate ?? 0) / 100)),
    };
  });
  const byDay = new Map<string, { count: number; total: number }>();
  for (const r of rows) {
    const d = byDay.get(r.day) ?? { count: 0, total: 0 };
    d.count += 1;
    d.total = r2(d.total + r.total);
    byDay.set(r.day, d);
  }
  return {
    byDay: [...byDay.entries()].map(([date, v]) => ({ date, ...v })),
    estimates: rows,
    grandTotal: r2(rows.reduce((t, r) => t + r.total, 0)),
    approvedTotal: r2(rows.filter((r) => r.approved).reduce((t, r) => t + r.total, 0)),
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
