import { prisma } from "../../lib/prisma";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";

export interface CustomerInput {
  name: string;
  mobile: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export async function listCustomers(q: string | undefined, page: PageParams) {
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { mobile: { contains: q } },
        ],
      }
    : {};

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...toSkipTake(page),
    }),
  ]);

  return { total, customers };
}

export async function getCustomer(id: number) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { vehicles: { orderBy: { createdAt: "desc" } } },
  });
  if (!customer) throw new NotFoundError("Customer not found");
  return customer;
}

export async function createCustomer(input: CustomerInput) {
  const existing = await prisma.customer.findUnique({ where: { mobile: input.mobile } });
  if (existing) throw new ConflictError("A customer with this mobile number already exists");

  return prisma.customer.create({ data: input });
}

export async function updateCustomer(id: number, input: Partial<CustomerInput>) {
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) throw new NotFoundError("Customer not found");

  if (input.mobile && input.mobile !== customer.mobile) {
    const existing = await prisma.customer.findUnique({ where: { mobile: input.mobile } });
    if (existing) throw new ConflictError("A customer with this mobile number already exists");
  }

  return prisma.customer.update({ where: { id }, data: input });
}

export async function setCustomerActive(id: number, isActive: boolean) {
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) throw new NotFoundError("Customer not found");
  return prisma.customer.update({ where: { id }, data: { isActive } });
}
