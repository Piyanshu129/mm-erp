import { prisma } from "../../lib/prisma";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";

export interface VehicleInput {
  registrationNumber: string;
  make: string;
  model: string;
  variant?: string;
  year?: number;
  fuelType?: string;
  transmission?: string;
  currentKm?: number;
  chassisNumber?: string;
  engineNumber?: string;
  nextServiceDue?: string;
  customerId: number;
}

// Registration numbers are entered in all sorts of casing/spacing by staff;
// normalizing here is what makes the uniqueness constraint and search
// actually work as "one vehicle" instead of accidental duplicates.
function normalizeRegistration(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

// Search covers everything the spec's Service History lookup needs: vehicle
// number, make/model, or the owning customer's name/mobile (section 18/26).
export async function listVehicles(q: string | undefined, page: PageParams) {
  const where = q
    ? {
        OR: [
          { registrationNumber: { contains: normalizeRegistration(q) } },
          { make: { contains: q, mode: "insensitive" as const } },
          { model: { contains: q, mode: "insensitive" as const } },
          { customer: { name: { contains: q, mode: "insensitive" as const } } },
          { customer: { mobile: { contains: q } } },
        ],
      }
    : {};

  const [total, vehicles] = await Promise.all([
    prisma.vehicle.count({ where }),
    prisma.vehicle.findMany({
      where,
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      ...toSkipTake(page),
    }),
  ]);

  return { total, vehicles };
}

export async function getVehicle(id: number) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: { customer: true },
  });
  if (!vehicle) throw new NotFoundError("Vehicle not found");
  return vehicle;
}

async function assertCustomerExists(customerId: number) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer not found");
}

export async function createVehicle(input: VehicleInput) {
  await assertCustomerExists(input.customerId);

  const registrationNumber = normalizeRegistration(input.registrationNumber);
  const existing = await prisma.vehicle.findUnique({ where: { registrationNumber } });
  if (existing) throw new ConflictError("A vehicle with this registration number already exists");

  return prisma.vehicle.create({
    data: {
      ...input,
      registrationNumber,
      nextServiceDue: input.nextServiceDue ? new Date(input.nextServiceDue) : undefined,
    },
    include: { customer: true },
  });
}

export async function updateVehicle(id: number, input: Partial<VehicleInput>) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle) throw new NotFoundError("Vehicle not found");

  if (input.customerId) {
    await assertCustomerExists(input.customerId);
  }

  let registrationNumber: string | undefined;
  if (input.registrationNumber) {
    registrationNumber = normalizeRegistration(input.registrationNumber);
    if (registrationNumber !== vehicle.registrationNumber) {
      const existing = await prisma.vehicle.findUnique({ where: { registrationNumber } });
      if (existing) {
        throw new ConflictError("A vehicle with this registration number already exists");
      }
    }
  }

  return prisma.vehicle.update({
    where: { id },
    data: {
      ...input,
      registrationNumber,
      nextServiceDue: input.nextServiceDue ? new Date(input.nextServiceDue) : undefined,
    },
    include: { customer: true },
  });
}

export async function setVehicleActive(id: number, isActive: boolean) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle) throw new NotFoundError("Vehicle not found");
  return prisma.vehicle.update({ where: { id }, data: { isActive } });
}

// Master spec section 18: every past job card for this vehicle, with enough
// on each row (date, KM, complaint, parts/labour totals, invoice amount) to
// scan without opening each one — full line items are one click away via
// the job card / invoice id already included here.
export async function getVehicleServiceHistory(id: number) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id }, include: { customer: true } });
  if (!vehicle) throw new NotFoundError("Vehicle not found");

  const jobCards = await prisma.jobCard.findMany({
    where: { vehicleId: id },
    include: {
      parts: true,
      labour: true,
      invoice: { select: { id: true, invoiceNumber: true, totalAmount: true } },
    },
    orderBy: { id: "desc" },
  });

  const history = jobCards.map((jc) => {
    const partsTotal = jc.parts.reduce((sum, p) => sum + Number(p.amount), 0);
    const labourTotal = jc.labour.reduce((sum, l) => sum + Number(l.amount), 0);
    return {
      id: jc.id,
      jobCardNumber: jc.jobCardNumber,
      status: jc.status,
      createdAt: jc.createdAt,
      kmAtService: jc.kmAtService,
      complaint: jc.complaint,
      requiredWork: jc.requiredWork,
      partsTotal,
      labourTotal,
      grandTotal: partsTotal + labourTotal,
      invoice: jc.invoice,
    };
  });

  return { vehicle, history };
}
