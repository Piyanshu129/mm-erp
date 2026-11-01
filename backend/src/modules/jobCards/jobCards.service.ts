import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { NotFoundError, ConflictError } from "../../lib/errors";
import { PageParams, toSkipTake } from "../../lib/pagination";
import { JOB_CARD_STATUSES } from "../../lib/jobCardStatus";
import { refreshVehicleService } from "../../lib/serviceSchedule";
import { syncBills } from "../estimates/estimates.service";

export const JOB_TYPES = [
  "GENERAL_SERVICE",
  "ACCIDENTAL_CLAIM",
  "AC",
  "DENT_PAINT",
  "MECHANICAL",
  "DETAILING",
  "SETTING_ADJUSTMENT",
] as const;

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
  insuranceCompany?: string;
  claimNumber?: string;
}

const detailInclude = {
  vehicle: { include: { customer: true } },
  media: { orderBy: { createdAt: "asc" as const } },
  parts: { include: { item: true }, orderBy: { id: "asc" as const } },
  labour: { orderBy: { id: "asc" as const } },
  assignedEmployee: { select: { id: true, name: true, role: true } },
  createdBy: { select: { id: true, name: true } },
  invoices: {
    select: { id: true, invoiceNumber: true, payer: true, discount: true, totalAmount: true, paymentAmount: true },
    orderBy: { id: "asc" as const },
  },
  estimate: {
    select: {
      id: true,
      estimateNumber: true,
      status: true,
      approvalPhotoUrl: true,
      approvedAt: true,
      gstInvoiceNumber: true,
      insuranceGstInvoiceNumber: true,
    },
  },
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
  insuranceCompany?: string | null;
  claimNumber?: string | null;
  trialBy?: string | null;
  trialRemarks?: string | null;
}

// Every photo taken for a phase must cover all four mandatory angles — this
// is what actually enforces the workshop's "before" and "after" comparison
// shots, rather than just letting staff upload anything and call it done.
// Checked when the job card is closed (invoices.service.ts).
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

export async function updateJobCard(id: number, input: JobCardUpdateInput, userId: number) {
  const jobCard = await prisma.jobCard.findUnique({ where: { id }, include: { invoices: true, estimate: true } });
  if (!jobCard) throw new NotFoundError("Job card not found");

  if (input.jobType && !(JOB_TYPES as readonly string[]).includes(input.jobType)) {
    throw new ConflictError(`Invalid job type: ${input.jobType}`);
  }

  if (input.status && !(JOB_CARD_STATUSES as readonly string[]).includes(input.status)) {
    throw new ConflictError(`Invalid status: ${input.status}`);
  }

  // A closed job card can be set back to Open to change it; its bills keep
  // their numbers and payments, and are brought up to date when it's closed
  // again. Not once a GST invoice has been made from its estimate — that's
  // final. It can't be cancelled while it has bills.
  const gstInvoice = jobCard.estimate?.gstInvoiceNumber ?? jobCard.estimate?.insuranceGstInvoiceNumber;
  if (jobCard.invoices.length > 0 && input.status === "CANCELLED") {
    throw new ConflictError(
      `This job card has been closed and billed (${jobCard.estimate?.estimateNumber ?? "its estimate"}) — it can't be cancelled`
    );
  }
  if (jobCard.status === "INVOICED" && input.status === "OPEN" && gstInvoice) {
    throw new ConflictError(`GST invoice ${gstInvoice} has been made from this job card's estimate — it can't be reopened`);
  }

  // Closed is reached only by closing the job card (which makes the bills in
  // the same transaction), never by setting the status directly — otherwise
  // a job card could say Closed with out-of-date bills.
  if (input.status === "INVOICED" && jobCard.status !== "INVOICED") {
    throw new ConflictError("Use Close job card to close this job card");
  }

  // On a closed job card, changing to or from Accidental Claim moves lines
  // between the customer's and the insurance company's bills.
  const claimChanged =
    input.jobType !== undefined && (input.jobType === "ACCIDENTAL_CLAIM") !== (jobCard.jobType === "ACCIDENTAL_CLAIM");
  const rebill = jobCard.status === "INVOICED" && input.status === undefined && claimChanged;
  if (rebill && gstInvoice) {
    throw new ConflictError(`GST invoice ${gstInvoice} has been made — the job type can't be changed to or from Accidental Claim`);
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

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.jobCard.update({
      where: { id },
      data: data as Prisma.JobCardUpdateInput,
      include: { vehicle: { include: { customer: true } }, assignedEmployee: { select: { id: true, name: true, role: true } } },
    });
    if (rebill) await syncBills(tx, id, userId);
    return row;
  });
  if (input.jobType !== undefined || input.kmAtService !== undefined || input.status !== undefined) {
    await refreshVehicleService(updated.vehicleId);
  }
  return updated;
}

// A photo of a signed slip. The vehicle trial is signed off with the
// customer while the job card is open or closed; the gate pass only once
// it's closed — and the vehicle leaving marks it delivered. A later photo
// replaces the earlier one, keeping the first sign-off time.
export async function recordSignOff(id: number, kind: "trial" | "gate-pass", photoUrl: string) {
  const jobCard = await prisma.jobCard.findUnique({ where: { id } });
  if (!jobCard) throw new NotFoundError("Job card not found");
  if (jobCard.status === "CANCELLED") throw new ConflictError("This job card is cancelled");
  if (kind === "gate-pass") {
    if (jobCard.status !== "INVOICED") throw new ConflictError("Close the job card before issuing the gate pass");
    const now = new Date();
    await prisma.jobCard.update({
      where: { id },
      data: { gatePassPhotoUrl: photoUrl, gatePassAt: jobCard.gatePassAt ?? now, deliveredAt: jobCard.deliveredAt ?? now },
    });
  } else {
    await prisma.jobCard.update({
      where: { id },
      data: { trialPhotoUrl: photoUrl, trialAt: jobCard.trialAt ?? new Date() },
    });
  }
  return getJobCard(id);
}
