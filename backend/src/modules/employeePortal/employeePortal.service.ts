import bcrypt from "bcrypt";
import { prisma } from "../../lib/prisma";
import { signEmployeeToken } from "../../lib/jwt";
import { UnauthorizedError, ConflictError, NotFoundError } from "../../lib/errors";
import { dateOnly, getMonthlySummary } from "../attendance/attendance.service";

export async function login(email: string, password: string) {
  const employee = await prisma.employee.findUnique({ where: { email } });

  if (!employee || !employee.isActive || !employee.passwordHash) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const passwordMatches = await bcrypt.compare(password, employee.passwordHash);
  if (!passwordMatches) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const accessToken = signEmployeeToken({ employeeId: employee.id });
  return {
    accessToken,
    employee: { id: employee.id, name: employee.name, role: employee.role, email: employee.email },
  };
}

export async function getMe(employeeId: number) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || !employee.isActive) throw new NotFoundError("Employee not found");
  return { id: employee.id, name: employee.name, role: employee.role, email: employee.email, mobile: employee.mobile };
}

export async function getTodayAttendance(employeeId: number) {
  const today = dateOnly(new Date());
  return prisma.attendance.findUnique({ where: { employeeId_date: { employeeId, date: today } } });
}

export interface PunchInput {
  latitude: number;
  longitude: number;
  selfieUrl?: string;
}

// The core of the self-service portal: one tap marks today PRESENT with
// exactly when/where it happened. Re-punching the same day is refused once
// a punch has actually happened — an admin correction (attendance.service's
// markAttendance) is the only way to change today's status after that.
export async function punchAttendance(employeeId: number, input: PunchInput) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || !employee.isActive) throw new NotFoundError("Employee not found");

  const today = dateOnly(new Date());
  const existing = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId, date: today } },
  });

  if (existing?.punchedAt) {
    throw new ConflictError(`Already punched in today at ${existing.punchedAt.toLocaleTimeString()}`);
  }

  const data = {
    status: "PRESENT",
    markedBy: "SELF",
    punchedAt: new Date(),
    latitude: input.latitude,
    longitude: input.longitude,
    selfieUrl: input.selfieUrl,
  };

  if (!existing) {
    return prisma.attendance.create({ data: { employeeId, date: today, ...data } });
  }
  // Overwrites a same-day row an admin had pre-marked (e.g. ABSENT before
  // the employee showed up) — the live punch is the more authoritative
  // signal that they're actually here.
  return prisma.attendance.update({ where: { id: existing.id }, data });
}

export async function getMyMonthlySummary(employeeId: number, month: number, year: number) {
  return getMonthlySummary(employeeId, month, year);
}
