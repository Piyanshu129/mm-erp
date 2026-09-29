import { prisma } from "../../lib/prisma";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";
import { accountsBy, accountDetail } from "../invoices/invoices.service";

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

  const accounts = await accountsBy("customer", customers.map((c) => c.id));
  return { total, customers: customers.map((c) => ({ ...c, account: accounts.get(c.id)! })) };
}

// Invoiced / paid / due across all of the customer's vehicles, with every
// invoice and the full payment history.
export async function getCustomerAccount(id: number) {
  const customer = await prisma.customer.findUnique({ where: { id }, select: { id: true, name: true, mobile: true } });
  if (!customer) throw new NotFoundError("Customer not found");
  return { customer, ...(await accountDetail("customer", id)) };
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
