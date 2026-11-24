import { prisma } from "../../lib/prisma";
import { ConflictError, NotFoundError, plural } from "../../lib/errors";
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

// null clears an optional field.
export type CustomerUpdate = {
  name?: string;
  mobile?: string;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
};

export async function updateCustomer(id: number, input: CustomerUpdate) {
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

// Admin-only. A customer can be deleted only while none of their vehicles has
// a job card (then there are no estimates, bills or payments either). Their
// vehicles and odometer readings are deleted with them.
export async function deleteCustomer(id: number) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { vehicles: { select: { id: true, _count: { select: { jobCards: true } } } } },
  });
  if (!customer) throw new NotFoundError("Customer not found");
  const jobCards = customer.vehicles.reduce((t, v) => t + v._count.jobCards, 0);
  if (jobCards > 0) {
    throw new ConflictError(`${customer.name} has ${plural(jobCards, "job card")}, so this customer can't be deleted — their history has to stay`);
  }
  const vehicleIds = customer.vehicles.map((v) => v.id);
  await prisma.$transaction([
    prisma.odometerReading.deleteMany({ where: { vehicleId: { in: vehicleIds } } }),
    prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } }),
    prisma.customer.delete({ where: { id } }),
  ]);
  return { vehiclesDeleted: vehicleIds.length };
}
