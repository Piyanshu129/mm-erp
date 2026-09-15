import { prisma } from "../../lib/prisma";
import { NotFoundError, ConflictError } from "../../lib/errors";

export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LEAVE"] as const;

// Attendance.date is a plain @db.Date column — normalizing to midnight UTC
// keeps every mark for a given calendar day landing on the same row instead
// of drifting apart by time-of-day/timezone.
function dateOnly(input: string | Date): Date {
  const d = typeof input === "string" ? new Date(input) : input;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Every active employee for the day, joined against whatever's already
// marked — so staff not yet marked still show up as "not marked" instead of
// silently vanishing from the sheet.
export async function getAttendanceForDate(date: string) {
  const day = dateOnly(date);
  const [employees, marked] = await Promise.all([
    prisma.employee.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.attendance.findMany({ where: { date: day }, include: { correctedBy: { select: { id: true, name: true } } } }),
  ]);
  const byEmployee = new Map(marked.map((a) => [a.employeeId, a]));
  return employees.map((e) => ({
    employee: e,
    attendance: byEmployee.get(e.id) ?? null,
  }));
}

export async function markAttendance(
  employeeId: number,
  date: string,
  status: string,
  correctedById?: number
) {
  if (!(ATTENDANCE_STATUSES as readonly string[]).includes(status)) {
    throw new ConflictError(`Invalid attendance status: ${status}`);
  }
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new NotFoundError("Employee not found");

  // correctedById is only meaningful once there's something to correct — the
  // first mark of the day for an employee is the original record, not a
  // correction, even though the same endpoint handles both.
  const day = dateOnly(date);
  const existing = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId, date: day } },
  });

  if (!existing) {
    return prisma.attendance.create({ data: { employeeId, date: day, status } });
  }
  return prisma.attendance.update({
    where: { id: existing.id },
    data: { status, correctedById },
  });
}

// Present/Absent/Leave day counts for one employee across one calendar
// month — exactly the input salary calculation needs.
export async function getMonthlySummary(employeeId: number, month: number, year: number) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new NotFoundError("Employee not found");

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const rows = await prisma.attendance.findMany({
    where: { employeeId, date: { gte: start, lt: end } },
    orderBy: { date: "asc" },
  });

  const presentDays = rows.filter((r) => r.status === "PRESENT").length;
  const absentDays = rows.filter((r) => r.status === "ABSENT").length;
  const leaveDays = rows.filter((r) => r.status === "LEAVE").length;

  return { employee, presentDays, absentDays, leaveDays, days: rows };
}
