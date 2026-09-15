import { prisma } from "../../lib/prisma";
import { NotFoundError, ConflictError } from "../../lib/errors";
import { getMonthlySummary } from "./attendance.service";

function daysInMonth(month: number, year: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Salary policy: the employee's monthly salary is the gross figure
// regardless of attendance. Net pay deducts one day's pay (monthlySalary /
// days-in-month) for every absent day and for every leave day taken beyond
// the employee's monthlyLeaveAllowance — present days and leave within the
// allowance are fully paid.
export function calculateSalary(
  monthlySalary: number,
  monthlyLeaveAllowance: number,
  month: number,
  year: number,
  absentDays: number,
  leaveDays: number
) {
  const totalDays = daysInMonth(month, year);
  const perDayRate = monthlySalary / totalDays;
  const unpaidLeaveDays = Math.max(0, leaveDays - monthlyLeaveAllowance);
  const deductionDays = absentDays + unpaidLeaveDays;
  const grossSalary = monthlySalary;
  const netSalary = Math.max(0, grossSalary - deductionDays * perDayRate);
  return { grossSalary, netSalary, perDayRate, deductionDays };
}

export async function listSalaryPayments(month?: number, year?: number) {
  const where: { periodMonth?: number; periodYear?: number } = {};
  if (month) where.periodMonth = month;
  if (year) where.periodYear = year;

  return prisma.salaryPayment.findMany({
    where,
    include: { employee: true },
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

  const { presentDays, absentDays, leaveDays } = await getMonthlySummary(employeeId, month, year);
  const { grossSalary, netSalary } = calculateSalary(
    Number(employee.monthlySalary),
    employee.monthlyLeaveAllowance,
    month,
    year,
    absentDays,
    leaveDays
  );

  return prisma.salaryPayment.upsert({
    where: { employeeId_periodMonth_periodYear: { employeeId, periodMonth: month, periodYear: year } },
    create: {
      employeeId,
      periodMonth: month,
      periodYear: year,
      presentDays,
      absentDays,
      leaveDays,
      grossSalary,
      netSalary,
    },
    update: { presentDays, absentDays, leaveDays, grossSalary, netSalary },
    include: { employee: true },
  });
}

export async function recordSalaryPayment(
  salaryPaymentId: number,
  input: { paymentAmount: number; paymentMode?: string; paymentBy?: string }
) {
  const payment = await prisma.salaryPayment.findUnique({ where: { id: salaryPaymentId } });
  if (!payment) throw new NotFoundError("Salary payment not found");
  if (input.paymentAmount > Number(payment.netSalary)) {
    throw new ConflictError(`Payment cannot exceed net salary of ${Number(payment.netSalary).toFixed(2)}`);
  }

  return prisma.salaryPayment.update({
    where: { id: salaryPaymentId },
    data: {
      paymentAmount: input.paymentAmount,
      paymentMode: input.paymentMode,
      paymentBy: input.paymentBy,
      paymentDate: new Date(),
    },
    include: { employee: true },
  });
}
