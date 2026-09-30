import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { NotFoundError, ConflictError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";
import { JOB_CARD_STATUSES } from "../../lib/jobCardStatus";
import { refreshVehicleService } from "../../lib/serviceSchedule";

export const JOB_TYPES = ["GENERAL_SERVICE", "ACCIDENTAL_CLAIM", "AC", "DENT_PAINT", "MECHANICAL"] as const;

// The four sides every "before" and "after" comparison shot must cover,
// regardless of which other optional angles staff also capture.
export const MANDATORY_PHOTO_ANGLES = ["FRONT", "REAR", "LEFT", "RIGHT"] as const;

export interface JobCardInput {
  vehicleId: number;
  jobType?: string;
  kmAtService?: number;
  complaint?: string;
  requiredWork?: string;
  expectedDelivery?: Date;
  notes?: string;
}

const detailInclude = {
  vehicle: { include: { customer: true } },
  media: { orderBy: { createdAt: "asc" as const } },
  parts: { include: { item: true, itemUnit: true }, orderBy: { id: "asc" as const } },
  labour: { orderBy: { id: "asc" as const } },
  assignedEmployee: { select: { id: true, name: true, role: true } },
  createdBy: { select: { id: true, name: true } },
  invoice: { select: { id: true, invoiceNumber: true } },
} satisfies Prisma.JobCardInclude;

function withTotals<T extends { parts: { amount: Prisma.Decimal }[]; labour: { amount: Prisma.Decimal }[] }>(
  jobCard: T
) {
  const partsTotal = jobCard.parts.reduce((sum, p) => sum + Number(p.amount), 0);
  const labourTotal = jobCard.labour.reduce((sum, l) => sum + Number(l.amount), 0);
  return { ...jobCard, partsTotal, labourTotal, grandTotal: partsTotal + labourTotal };
}

export async function listJobCards(
  page: PageParams,
  filters: { status?: string; q?: string }
) {
  const where: Prisma.JobCardWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.q) {
    const q = filters.q.replace(/\s+/g, "").toUpperCase();
    where.OR = [
      { jobCardNumber: { contains: filters.q, mode: "insensitive" } },
      { vehicle: { registrationNumber: { contains: q } } },
    ];
  }

  const [total, jobCards] = await Promise.all([
    prisma.jobCard.count({ where }),
    prisma.jobCard.findMany({
      where,
      include: { vehicle: { include: { customer: true } }, assignedEmployee: { select: { id: true, name: true, role: true } } },
      orderBy: { id: "desc" },
      ...toSkipTake(page),
    }),
  ]);

  return { total, jobCards };
}

export async function getJobCard(id: number) {
  const jobCard = await prisma.jobCard.findUnique({ where: { id }, include: detailInclude });
  if (!jobCard) throw new NotFoundError("Job card not found");
  return withTotals(jobCard);
}

// jobCardNumber follows the same derive-from-own-id pattern as Item Code.
export async function createJobCard(input: JobCardInput, createdById: number) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: input.vehicleId } });
  if (!vehicle) throw new NotFoundError("Vehicle not found");

  if (input.jobType && !(JOB_TYPES as readonly string[]).includes(input.jobType)) {
    throw new ConflictError(`Invalid job type: ${input.jobType}`);
  }

  const jobCard = await prisma.$transaction(async (tx) => {
    const created = await tx.jobCard.create({
      data: { ...input, jobCardNumber: "PENDING", createdById },
    });
    const jobCardNumber = `JC-${String(created.id).padStart(6, "0")}`;
    return tx.jobCard.update({
      where: { id: created.id },
      data: { jobCardNumber },
      include: { vehicle: { include: { customer: true } } },
    });
  });
  // A visit updates the vehicle's KM, and a general service resets its
  // next-service date/KM.
  await refreshVehicleService(jobCard.vehicleId);
  return jobCard;
}

// null clears a field (the job card page auto-saves, including clearing).
export interface JobCardUpdateInput {
  jobType?: string | null;
  kmAtService?: number | null;
  complaint?: string | null;
  requiredWork?: string | null;
  expectedDelivery?: Date | null;
  notes?: string | null;
  status?: string;
  inspectionFindings?: string | null;
  estimateAmount?: number | null;
  estimateApproved?: boolean;
  assignedEmployeeId?: number;
  finalInspectionStatus?: string;
  finalInspectionBy?: string | null;
}

// Every photo taken for a phase must cover all four mandatory angles — this
// is what actually enforces the workshop's "before" and "after" comparison
// shots, rather than just letting staff upload anything and call it done.
// Checked when the job card is invoiced (invoices.service.ts).
export async function assertMandatoryPhotos(jobCardId: number, phase: "BEFORE" | "AFTER") {
  const media = await prisma.jobCardMedia.findMany({
    where: { jobCardId, phase, mediaType: "PHOTO" },
    select: { angle: true },
  });
  const covered = new Set(media.map((m) => m.angle));
  const missing = MANDATORY_PHOTO_ANGLES.filter((angle) => !covered.has(angle));
  if (missing.length > 0) {
    throw new ConflictError(
      `Missing mandatory ${phase === "BEFORE" ? "before-work" : "after-work"} photos: ${missing.join(", ")}`
    );
  }
}

export async function updateJobCard(id: number, input: JobCardUpdateInput) {
  const jobCard = await prisma.jobCard.findUnique({ where: { id }, include: { invoice: true } });
  if (!jobCard) throw new NotFoundError("Job card not found");

  if (input.jobType && !(JOB_TYPES as readonly string[]).includes(input.jobType)) {
    throw new ConflictError(`Invalid job type: ${input.jobType}`);
  }

  if (input.status && !(JOB_CARD_STATUSES as readonly string[]).includes(input.status)) {
    throw new ConflictError(`Invalid status: ${input.status}`);
  }

  // Once invoiced, a job card's status is final — moving it back to Open
  // or Cancelled would make it look editable (or void) while its invoice
  // still stands.
  if (jobCard.invoice && input.status && input.status !== "INVOICED") {
    throw new ConflictError(
      `This job card was already invoiced (${jobCard.invoice.invoiceNumber}) — its status can't be changed`
    );
  }

  // Invoiced is reached only by generating the invoice (which sets it in the
  // same transaction), never by setting the status directly — otherwise a
  // job card could say Invoiced with no invoice behind it.
  if (input.status === "INVOICED" && !jobCard.invoice) {
    throw new ConflictError("Generate the invoice to mark this job card Invoiced");
  }

  if (input.assignedEmployeeId != null) {
    const employee = await prisma.employee.findUnique({ where: { id: input.assignedEmployeeId } });
    if (!employee) throw new NotFoundError("Employee not found");
    if (!employee.isActive) throw new ConflictError("Cannot assign an inactive employee");
  }

  const data: Record<string, unknown> = { ...input };
  if (input.estimateApproved !== undefined) {
    data.estimateApprovedAt = new Date();
  }
  if (input.finalInspectionStatus !== undefined) {
    data.finalInspectionAt = new Date();
  }

  const updated = await prisma.jobCard.update({
    where: { id },
    data: data as Prisma.JobCardUpdateInput,
    include: { vehicle: { include: { customer: true } }, assignedEmployee: { select: { id: true, name: true, role: true } } },
  });
  if (input.jobType !== undefined || input.kmAtService !== undefined || input.status !== undefined) {
    await refreshVehicleService(updated.vehicleId);
  }
  return updated;
}
