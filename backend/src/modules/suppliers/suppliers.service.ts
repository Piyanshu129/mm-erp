import { prisma } from "../../lib/prisma";
import { NotFoundError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";

export interface SupplierInput {
  name: string;
  contactPerson?: string;
  mobile?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export async function listSuppliers(q: string | undefined, page: PageParams) {
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { mobile: { contains: q } },
        ],
      }
    : {};

  const [total, suppliers] = await Promise.all([
    prisma.supplier.count({ where }),
    prisma.supplier.findMany({ where, orderBy: { createdAt: "desc" }, ...toSkipTake(page) }),
  ]);

  return { total, suppliers };
}

export async function createSupplier(input: SupplierInput) {
  return prisma.supplier.create({ data: input });
}

export async function updateSupplier(id: number, input: Partial<SupplierInput>) {
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) throw new NotFoundError("Supplier not found");
  return prisma.supplier.update({ where: { id }, data: input });
}

export async function setSupplierActive(id: number, isActive: boolean) {
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) throw new NotFoundError("Supplier not found");
  return prisma.supplier.update({ where: { id }, data: { isActive } });
}
