import { Request, Response } from "express";
import { z } from "zod";
import * as jobCardsService from "./jobCards.service";
import * as invoicesService from "../invoices/invoices.service";
import { JOB_TYPES } from "./jobCards.service";
import { parsePageParams } from "../../lib/pagination";
import { JOB_CARD_STATUSES } from "../../lib/jobCardStatus";

const optionalString = z.string().trim().min(1).optional();

export const createJobCardSchema = z.object({
  vehicleId: z.coerce.number().int().positive(),
  jobType: z.enum(JOB_TYPES).optional(),
  kmAtService: z.coerce.number().int().min(0).optional(),
  complaint: optionalString,
  requiredWork: optionalString,
  expectedDelivery: z.coerce.date().optional(),
  notes: optionalString,
  insuranceCompany: optionalString,
  claimNumber: optionalString,
});

// The job card page auto-saves as it's filled, so an update can also clear
// a field: an empty string or null sets it back to empty.
const clearableString = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((s) => (s === "" ? null : s));

export const updateJobCardSchema = z.object({
  jobType: z.enum(JOB_TYPES).nullable().optional(),
  kmAtService: z.coerce.number().int().min(0).nullable().optional(),
  complaint: clearableString,
  requiredWork: clearableString,
  expectedDelivery: z.coerce.date().nullable().optional(),
  notes: clearableString,
  status: z.enum(JOB_CARD_STATUSES).optional(),
  inspectionFindings: clearableString,
  estimateAmount: z.coerce.number().min(0).nullable().optional(),
  estimateApproved: z.coerce.boolean().optional(),
  assignedEmployeeId: z.coerce.number().int().positive().optional(),
  finalInspectionStatus: z.enum(["DONE", "NOT_DONE"]).optional(),
  finalInspectionBy: clearableString,
  // Accidental repairs (optional).
  insuranceCompany: clearableString,
  claimNumber: clearableString,
});

export async function list(req: Request, res: Response) {
  const page = parsePageParams(req.query);
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const { total, jobCards } = await jobCardsService.listJobCards(page, { status, q });
  res.json({ jobCards, total, page: page.page, pageSize: page.pageSize });
}

export async function get(req: Request, res: Response) {
  const jobCard = await jobCardsService.getJobCard(Number(req.params.id));
  res.json({ jobCard });
}

export async function create(req: Request, res: Response) {
  const input = req.body as z.infer<typeof createJobCardSchema>;
  const jobCard = await jobCardsService.createJobCard(input, req.user!.id);
  res.status(201).json({ jobCard });
}

export async function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { status, ...rest } = req.body as z.infer<typeof updateJobCardSchema>;

  // Marking a job card Invoiced generates its draft invoice (or, for one
  // that was reopened, brings its existing draft invoice up to date) — the
  // two always happen together, in one transaction (invoices.service.ts).
  if (status === "INVOICED") {
    const current = await jobCardsService.getJobCard(id);
    if (current.status !== "INVOICED") {
      if (Object.keys(rest).length > 0) await jobCardsService.updateJobCard(id, rest);
      const invoice = await invoicesService.createInvoice(id, undefined, req.user!.id);
      res.json({ jobCard: await jobCardsService.getJobCard(id), invoice });
      return;
    }
  }

  const jobCard = await jobCardsService.updateJobCard(id, status ? { ...rest, status } : rest);
  res.json({ jobCard });
}
