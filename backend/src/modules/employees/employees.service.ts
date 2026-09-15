import { prisma } from "../../lib/prisma";
import { NotFoundError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";

export interface EmployeeInput {
  name: string;
  role?: string;
  joiningDate: Date;
  monthlySalary: number;
  monthlyLeaveAllowance?: number;
}

export async function listEmployees(q: string | undefined, page: PageParams) {
  const where = q ? { name: { contains: q, mode: "insensitive" as const } } : {};

  const [total, employees] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({ where, orderBy: { name: "asc" }, ...toSkipTake(page) }),
  ]);

  return { total, employees };
}

export async function getEmployee(id: number) {
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) throw new NotFoundError("Employee not found");
  return employee;
}

export async function createEmployee(input: EmployeeInput) {
  return prisma.employee.create({ data: input });
}

export async function updateEmployee(id: number, input: Partial<EmployeeInput>) {
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) throw new NotFoundError("Employee not found");
  return prisma.employee.update({ where: { id }, data: input });
}

export async function setEmployeeActive(id: number, isActive: boolean) {
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) throw new NotFoundError("Employee not found");
  return prisma.employee.update({ where: { id }, data: { isActive } });
}
