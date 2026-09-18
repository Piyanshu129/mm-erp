import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { NotFoundError, ConflictError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";

export interface EmployeeInput {
  name: string;
  role?: string;
  email?: string;
  mobile?: string;
  password?: string;
  joiningDate: Date;
  monthlySalary: number;
  monthlyLeaveAllowance?: number;
}

// Never hand passwordHash back to any frontend (admin or employee portal) —
// every place that returns an Employee row, in this module or any other,
// goes through this.
export function sanitizeEmployee<T extends { passwordHash: string | null }>(employee: T) {
  const { passwordHash, ...rest } = employee;
  return { ...rest, hasPortalAccess: passwordHash != null };
}

const sanitize = sanitizeEmployee;

export async function listEmployees(q: string | undefined, page: PageParams) {
  const where = q ? { name: { contains: q, mode: "insensitive" as const } } : {};

  const [total, employees] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({ where, orderBy: { name: "asc" }, ...toSkipTake(page) }),
  ]);

  return { total, employees: employees.map(sanitize) };
}

export async function getEmployee(id: number) {
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) throw new NotFoundError("Employee not found");
  return sanitize(employee);
}

async function hashPassword(password: string): Promise<string> {
  if (password.length < 6) {
    throw new ConflictError("Portal password must be at least 6 characters");
  }
  return bcrypt.hash(password, 12);
}

export async function createEmployee(input: EmployeeInput) {
  const { password, ...rest } = input;
  try {
    const created = await prisma.employee.create({
      data: { ...rest, passwordHash: password ? await hashPassword(password) : undefined },
    });
    return sanitize(created);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError("An employee with this email already exists");
    }
    throw err;
  }
}

export async function updateEmployee(id: number, input: Partial<EmployeeInput>) {
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) throw new NotFoundError("Employee not found");

  const { password, ...rest } = input;
  try {
    const updated = await prisma.employee.update({
      where: { id },
      data: { ...rest, ...(password ? { passwordHash: await hashPassword(password) } : {}) },
    });
    return sanitize(updated);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError("An employee with this email already exists");
    }
    throw err;
  }
}

export async function setEmployeeActive(id: number, isActive: boolean) {
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) throw new NotFoundError("Employee not found");
  const updated = await prisma.employee.update({ where: { id }, data: { isActive } });
  return sanitize(updated);
}
