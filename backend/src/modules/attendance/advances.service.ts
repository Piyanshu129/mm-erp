import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { dateOnly } from "./attendance.service";
import { recalculateIfUnpaid } from "./salary.service";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthName(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

async function salaryPaymentStarted(
  db: Prisma.TransactionClient,
  employeeId: number,
  month: number,
  year: number
): Promise<boolean> {
  const salary = await db.salaryPayment.findUnique({
    where: { employeeId_periodMonth_periodYear: { employeeId, periodMonth: month, periodYear: year } },
    select: { paymentAmount: true },
  });
  return salary != null && Number(salary.paymentAmount) > 0;
}

// An advance comes out of the salary for the month it was given — unless
// that month's salary is already being paid, in which case it's too late to
// deduct there and it comes out of the next unpaid month instead.
async function salaryMonthFor(db: Prisma.TransactionClient, employeeId: number, day: Date) {
  let month = day.getUTCMonth() + 1;
  let year = day.getUTCFullYear();
  for (let i = 0; i < 12; i++) {
    if (!(await salaryPaymentStarted(db, employeeId, month, year))) return { month, year };
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  throw new ConflictError("Could not find an unpaid salary month to deduct this advance from");
}

// Advances given during one calendar month (by the date they were given),
// optionally for one employee — the history shown on the attendance sheet.
export async function listAdvances(month: string, employeeId?: number) {
  const [year, m] = month.split("-").map(Number);
  return prisma.employeeAdvance.findMany({
    where: {
      date: { gte: new Date(Date.UTC(year, m - 1, 1)), lt: new Date(Date.UTC(year, m, 1)) },
      ...(employeeId ? { employeeId } : {}),
    },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
}

// Every advance ever given to one employee, newest first — the full
// history (the month list above is just one month).
export async function advanceHistory(employeeId: number) {
  const advances = await prisma.employeeAdvance.findMany({
    where: { employeeId },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
  const total = Math.round(advances.reduce((t, a) => t + Number(a.amount), 0) * 100) / 100;
  return { advances, total };
}

export interface AdvanceInput {
  employeeId: number;
  date: string;
  amount: number;
  notes?: string;
}

// Records one advance. Going over the month's salary is allowed, but comes
// back with a warning to show — salary can't go below ₹0, so the excess
// isn't recovered from that month's pay. The employee row is locked while
// the total is worked out, so two advances entered at once see each other.
export async function recordAdvance(input: AdvanceInput, createdById: number) {
  if (input.amount <= 0) throw new ConflictError("Advance amount must be greater than zero");
  const day = dateOnly(input.date);
  let warning: string | null = null;

  const advance = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM employees WHERE id = ${input.employeeId} FOR UPDATE
    `;
    if (locked.length === 0) throw new NotFoundError("Employee not found");
    const employee = await tx.employee.findUniqueOrThrow({ where: { id: input.employeeId } });
    if (!employee.isActive) throw new ConflictError("Cannot give an advance to an inactive employee");

    const { month, year } = await salaryMonthFor(tx, employee.id, day);

    const already = await tx.employeeAdvance.aggregate({
      where: { employeeId: employee.id, salaryMonth: month, salaryYear: year },
      _sum: { amount: true },
    });
    const alreadyTotal = Number(already._sum.amount ?? 0);
    const monthlySalary = Number(employee.monthlySalary);
    if (alreadyTotal + input.amount > monthlySalary + 0.005) {
      warning =
        `Advances against ${employee.name}'s ${monthName(month, year)} salary now total ₹${(alreadyTotal + input.amount).toFixed(2)} — ` +
        `more than the monthly salary of ₹${monthlySalary.toFixed(2)}. The salary will come to ₹0; the extra is not deducted automatically.`;
    }

    return tx.employeeAdvance.create({
      data: {
        employeeId: employee.id,
        amount: input.amount,
        date: day,
        salaryMonth: month,
        salaryYear: year,
        notes: input.notes,
        createdById,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
  });

  await recalculateIfUnpaid(advance.employeeId, advance.salaryMonth, advance.salaryYear);
  return { advance, warning };
}

// Only for correcting a mistake, and only while the salary it was charged
// to hasn't started being paid.
export async function deleteAdvance(id: number) {
  const advance = await prisma.employeeAdvance.findUnique({ where: { id } });
  if (!advance) throw new NotFoundError("Advance not found");
  if (await salaryPaymentStarted(prisma, advance.employeeId, advance.salaryMonth, advance.salaryYear)) {
    throw new ConflictError(
      `This advance was deducted from the ${monthName(advance.salaryMonth, advance.salaryYear)} salary, which is already being paid — it can't be removed`
    );
  }
  await prisma.employeeAdvance.delete({ where: { id } });
  await recalculateIfUnpaid(advance.employeeId, advance.salaryMonth, advance.salaryYear);
}
