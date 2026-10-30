import { prisma } from "../../lib/prisma";
import { NotFoundError, ConflictError } from "../../lib/errors";

// HALF_DAY: worked half the day — half a day's pay is deducted.
export const ATTENDANCE_STATUSES = ["PRESENT", "HALF_DAY", "ABSENT", "LEAVE"] as const;

// Minutes between an "HH:MM" in time and out time, or null unless both are
// set and out is after in.
export function minutesWorked(inTime: string | null, outTime: string | null): number | null {
  if (!inTime || !outTime) return null;
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const diff = toMin(outTime) - toMin(inTime);
  return diff > 0 ? diff : null;
}

// Today's date (YYYY-MM-DD) on the server's own calendar — the workshop PC's.
export function todayLocalISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

// Attendance.date is a plain @db.Date column — normalizing to midnight UTC
// keeps every mark for a given calendar day landing on the same row instead
// of drifting apart by time-of-day/timezone. Exported so employeePortal's
// self-punch endpoint stays on the exact same "what day is this" logic.
export function dateOnly(input: string | Date): Date {
  const d = typeof input === "string" ? new Date(input) : input;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Every active employee for the day, joined against whatever's already
// marked — so staff not yet marked still show up as "not marked" instead of
// silently vanishing from the sheet.
export async function getAttendanceForDate(date: string) {
  const day = dateOnly(date);
  const [employees, marked] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
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
  correctedById?: number,
  times: { inTime?: string | null; outTime?: string | null } = {}
) {
  if (!(ATTENDANCE_STATUSES as readonly string[]).includes(status)) {
    throw new ConflictError(`Invalid attendance status: ${status}`);
  }
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new NotFoundError("Employee not found");
  if (times.inTime && times.outTime && times.outTime <= times.inTime) {
    throw new ConflictError("Out time must be after in time");
  }
  // Only the times that were sent are changed (undefined = leave as is).
  const timeData = {
    ...(times.inTime !== undefined ? { inTime: times.inTime } : {}),
    ...(times.outTime !== undefined ? { outTime: times.outTime } : {}),
  };

  // correctedById is only meaningful once there's something to correct — the
  // first mark of the day for an employee is the original record, not a
  // correction, even though the same endpoint handles both.
  const day = dateOnly(date);
  const existing = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId, date: day } },
  });

  if (!existing) {
    return prisma.attendance.create({ data: { employeeId, date: day, status, markedBy: "ADMIN", ...timeData } });
  }
  // An admin correction always wins over a prior self-punch for the same
  // day — flip markedBy back to ADMIN, but leave the punch metadata
  // (punchedAt/location/selfie) in place as an audit trail of what the
  // employee actually did before the override.
  return prisma.attendance.update({
    where: { id: existing.id },
    data: { status, correctedById, markedBy: "ADMIN", ...timeData },
  });
}

// Present/Absent/Leave day counts for one employee across one calendar
// month — exactly the input salary calculation needs. select excludes
// passwordHash — this return value reaches both the admin summary endpoint
// and the employee's own portal summary, neither of which should ever see it.
export async function getMonthlySummary(employeeId: number, month: number, year: number) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, name: true, role: true },
  });
  if (!employee) throw new NotFoundError("Employee not found");

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const rows = await prisma.attendance.findMany({
    where: { employeeId, date: { gte: start, lt: end } },
    orderBy: { date: "asc" },
  });

  // Hours worked, from the days that have both an in and an out time.
  const workedMinutes = rows.reduce((sum, r) => sum + (minutesWorked(r.inTime, r.outTime) ?? 0), 0);
  const presentDays = rows.filter((r) => r.status === "PRESENT").length;
  const halfDays = rows.filter((r) => r.status === "HALF_DAY").length;
  const absentDays = rows.filter((r) => r.status === "ABSENT").length;
  const leaveDays = rows.filter((r) => r.status === "LEAVE").length;

  return { employee, presentDays, halfDays, absentDays, leaveDays, workedMinutes, days: rows };
}

// Every active employee's day counts for one calendar month, for the
// attendance sheet's month total. Days not marked = days of the month so
// far (up to today) with no mark at all.
export async function getMonthSummaryForAll(month: number, year: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const today = todayLocalISO();
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const daysSoFar =
    monthKey < today.slice(0, 7) ? daysInMonth : monthKey === today.slice(0, 7) ? Number(today.slice(8, 10)) : 0;

  const [employees, counts] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.attendance.groupBy({
      by: ["employeeId", "status"],
      where: { date: { gte: start, lt: end } },
      _count: { _all: true },
    }),
  ]);

  return {
    month,
    year,
    daysInMonth,
    daysSoFar,
    rows: employees.map((employee) => {
      const n = (status: string) =>
        counts.find((c) => c.employeeId === employee.id && c.status === status)?._count._all ?? 0;
      const presentDays = n("PRESENT");
      const halfDays = n("HALF_DAY");
      const absentDays = n("ABSENT");
      const leaveDays = n("LEAVE");
      const marked = presentDays + halfDays + absentDays + leaveDays;
      return {
        employee,
        presentDays,
        halfDays,
        absentDays,
        leaveDays,
        // A half day counts as half a day present.
        effectivePresent: presentDays + halfDays / 2,
        notMarked: Math.max(0, daysSoFar - marked),
      };
    }),
  };
}
