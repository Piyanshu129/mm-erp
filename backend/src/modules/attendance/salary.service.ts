import { prisma } from "../../lib/prisma";
import { NotFoundError, ConflictError } from "../../lib/errors";
import { getMonthlySummary } from "./attendance.service";

function daysInMonth(month: number, year: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Salary policy: the employee's monthly salary is the gross figure
// regardless of attendance. Net pay deducts one day's pay (monthlySalary /
// days-in-month) for every absent day, half a day's pay for every half day,
// and a day's pay for every leave day beyond the leave available this month
// — the month's allowance plus the unused leave carried in from earlier
// months (openingLeave). Present days and leave within what's available are
// fully paid. Then any advances given against this month's salary come off.
export function calculateSalary(
  monthlySalary: number,
  monthlyLeaveAllowance: number,
  month: number,
  year: number,
  absentDays: number,
  leaveDays: number,
  advances = 0,
  halfDays = 0,
  openingLeave = 0
) {
  const totalDays = daysInMonth(month, year);
  const perDayRate = monthlySalary / totalDays;
  const leave = leaveAfterMonth(openingLeave, monthlyLeaveAllowance, leaveDays);
  const deductionDays = absentDays + halfDays * 0.5 + leave.unpaid;
  const grossSalary = monthlySalary;
  const netSalary = Math.max(0, round2(grossSalary - deductionDays * perDayRate - advances));
  return { grossSalary, netSalary, perDayRate, deductionDays, unpaidLeaveDays: leave.unpaid, closingLeave: leave.closing };
}

// One month of the leave balance: what's available (carried in + this
// month's allowance), what's left over to carry on, and how many leave days
// went beyond it (unpaid).
export function leaveAfterMonth(opening: number, allowance: number, leaveDays: number) {
  const available = opening + allowance;
  return {
    available,
    unpaid: Math.max(0, leaveDays - available),
    closing: Math.max(0, available - leaveDays),
  };
}

// The leave balance carried into a month: each month's closing balance is
// the next month's opening. It starts from the employee's first month (the
// later of joining and their first attendance mark) at 0. A month whose
// salary has already been calculated uses the closing balance stored with
// it — so a balance is only ever counted once, and a paid month's figures
// never shift because of a later attendance correction.
export async function leaveBalanceFor(employeeId: number, month: number, year: number): Promise<number> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new NotFoundError("Employee not found");

  const firstMark = await prisma.attendance.findFirst({ where: { employeeId }, orderBy: { date: "asc" } });
  if (!firstMark) return 0;
  const joined = employee.joiningDate;
  const startIndex = Math.max(
    joined.getUTCFullYear() * 12 + joined.getUTCMonth(),
    firstMark.date.getUTCFullYear() * 12 + firstMark.date.getUTCMonth()
  );
  const targetIndex = year * 12 + (month - 1);
  if (targetIndex <= startIndex) return 0;

  const [stored, marks] = await Promise.all([
    prisma.salaryPayment.findMany({ where: { employeeId } }),
    prisma.attendance.findMany({
      where: { employeeId, status: "LEAVE", date: { lt: new Date(Date.UTC(year, month - 1, 1)) } },
      select: { date: true },
    }),
  ]);
  const storedClosing = new Map(
    stored
      .filter((s) => s.closingLeaveBalance != null)
      .map((s) => [s.periodYear * 12 + (s.periodMonth - 1), Number(s.closingLeaveBalance)])
  );
  const leaveByMonth = new Map<number, number>();
  for (const m of marks) {
    const idx = m.date.getUTCFullYear() * 12 + m.date.getUTCMonth();
    leaveByMonth.set(idx, (leaveByMonth.get(idx) ?? 0) + 1);
  }

  let balance = 0;
  for (let idx = startIndex; idx < targetIndex; idx++) {
    balance =
      storedClosing.get(idx) ??
      leaveAfterMonth(balance, employee.monthlyLeaveAllowance, leaveByMonth.get(idx) ?? 0).closing;
  }
  return balance;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function advancesForSalaryMonth(employeeId: number, month: number, year: number): Promise<number> {
  const result = await prisma.employeeAdvance.aggregate({
    where: { employeeId, salaryMonth: month, salaryYear: year },
    _sum: { amount: true },
  });
  return Number(result._sum.amount ?? 0);
}

// Keeps an already-calculated salary in step with a change that affects it
// (an advance added or removed) — but only while nothing has been paid;
// after that the stored figures are what was actually agreed and paid.
export async function recalculateIfUnpaid(employeeId: number, month: number, year: number) {
  const existing = await prisma.salaryPayment.findUnique({
    where: { employeeId_periodMonth_periodYear: { employeeId, periodMonth: month, periodYear: year } },
  });
  if (existing && Number(existing.paymentAmount) === 0) {
    await calculateMonthlySalary(employeeId, month, year);
  }
}

export async function listSalaryPayments(month?: number, year?: number) {
  const where: { periodMonth?: number; periodYear?: number } = {};
  if (month) where.periodMonth = month;
  if (year) where.periodYear = year;

  return prisma.salaryPayment.findMany({
    where,
    include: { employee: { select: { id: true, name: true, role: true } } },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { employee: { name: "asc" } }],
  });
}

// Computes and stores this month's salary from the current attendance
// record. Deliberately a one-time snapshot, not a live view — a later
// attendance correction won't silently change an already-calculated (or
// already-paid) salary; recalculating is this same explicit action, run
// again, and it's blocked once payment has actually started.
export async function calculateMonthlySalary(employeeId: number, month: number, year: number) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new NotFoundError("Employee not found");

  const existing = await prisma.salaryPayment.findUnique({
    where: { employeeId_periodMonth_periodYear: { employeeId, periodMonth: month, periodYear: year } },
  });
  if (existing && Number(existing.paymentAmount) > 0) {
    throw new ConflictError("This month's salary already has a payment recorded — cannot recalculate");
  }

  const [{ presentDays, halfDays, absentDays, leaveDays }, advanceDeduction, openingLeaveBalance] = await Promise.all([
    getMonthlySummary(employeeId, month, year),
    advancesForSalaryMonth(employeeId, month, year),
    leaveBalanceFor(employeeId, month, year),
  ]);
  const { grossSalary, netSalary, closingLeave } = calculateSalary(
    Number(employee.monthlySalary),
    employee.monthlyLeaveAllowance,
    month,
    year,
    absentDays,
    leaveDays,
    advanceDeduction,
    halfDays,
    openingLeaveBalance
  );
  const figures = {
    presentDays,
    halfDays,
    absentDays,
    leaveDays,
    grossSalary,
    advanceDeduction,
    netSalary,
    openingLeaveBalance,
    closingLeaveBalance: closingLeave,
  };

  return prisma.salaryPayment.upsert({
    where: { employeeId_periodMonth_periodYear: { employeeId, periodMonth: month, periodYear: year } },
    create: { employeeId, periodMonth: month, periodYear: year, ...figures },
    update: figures,
    include: { employee: { select: { id: true, name: true, role: true } } },
  });
}

// input.paymentAmount is what's being paid right now, added on top of
// whatever's already recorded — never the new running total (see the
// identical fix in purchases.service.ts's recordPurchasePayment).
export async function recordSalaryPayment(
  salaryPaymentId: number,
  input: { paymentAmount: number; paymentMode?: string; paymentBy?: string }
) {
  const payment = await prisma.salaryPayment.findUnique({ where: { id: salaryPaymentId } });
  if (!payment) throw new NotFoundError("Salary payment not found");
  if (input.paymentAmount <= 0) {
    throw new ConflictError("Payment amount must be greater than zero");
  }

  const alreadyPaid = Number(payment.paymentAmount);
  const newTotalPaid = alreadyPaid + input.paymentAmount;
  if (newTotalPaid > Number(payment.netSalary)) {
    throw new ConflictError(
      `That would overpay this salary — only ₹${(Number(payment.netSalary) - alreadyPaid).toFixed(2)} is still due`
    );
  }

  return prisma.salaryPayment.update({
    where: { id: salaryPaymentId },
    data: {
      paymentAmount: newTotalPaid,
      paymentMode: input.paymentMode,
      paymentBy: input.paymentBy,
      paymentDate: new Date(),
    },
    include: { employee: { select: { id: true, name: true, role: true } } },
  });
}
