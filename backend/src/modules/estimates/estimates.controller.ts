import { Request, Response } from "express";
import { z } from "zod";
import * as estimatesService from "./estimates.service";
import { ESTIMATE_LINE_TYPES, GST_RATES } from "./estimates.service";
import { publicUrlFor } from "../../middleware/upload";
import { AppError } from "../../lib/errors";

export const ESTIMATE_APPROVAL_FOLDER = "estimate-approvals";

const clearableString = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((s) => (s === "" ? null : s));

export const updateEstimateSchema = z.object({
  estimateDate: z.coerce.date().optional(),
  taxRate: z.coerce.number().min(0).max(100).nullable().optional(),
  notes: clearableString,
});

export const addLineSchema = z.object({
  lineType: z.enum(ESTIMATE_LINE_TYPES),
  itemId: z.coerce.number().int().positive().optional(),
  description: z.string().trim().optional(),
  quantity: z.coerce.number().positive().max(100000), // can be part of a unit, e.g. 0.5
  rate: z.coerce.number().min(0).optional(),
});

export async function createForJobCard(req: Request, res: Response) {
  const estimate = await estimatesService.createEstimate(Number(req.params.jobCardId), req.user!.id);
  res.status(201).json({ estimate });
}

export async function get(req: Request, res: Response) {
  const estimate = await estimatesService.getEstimate(Number(req.params.id));
  res.json({ estimate });
}

export async function update(req: Request, res: Response) {
  const input = req.body as z.infer<typeof updateEstimateSchema>;
  const estimate = await estimatesService.updateEstimate(Number(req.params.id), input);
  res.json({ estimate });
}

export async function addLine(req: Request, res: Response) {
  const input = req.body as z.infer<typeof addLineSchema>;
  const estimate = await estimatesService.addLine(Number(req.params.id), input);
  res.status(201).json({ estimate });
}

export async function removeLine(req: Request, res: Response) {
  const estimate = await estimatesService.removeLine(Number(req.params.id), Number(req.params.lineId));
  res.json({ estimate });
}

export async function approve(req: Request, res: Response) {
  if (!req.file) throw new AppError(400, "Upload a photo of the customer-signed estimate");
  const url = publicUrlFor(ESTIMATE_APPROVAL_FOLDER, req.file.filename);
  const estimate = await estimatesService.approveEstimate(Number(req.params.id), url);
  res.json({ estimate });
}

export const gstDetailsSchema = z.object({
  supplyType: z.enum(["INTRA", "INTER"]).optional(),
  pricesIncludeGst: z.boolean().optional(),
  customerGstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[0-9]{2}[A-Z0-9]{13}$/.test(v), "Customer GSTIN must be 15 characters, starting with the 2-digit state code")
    .nullable()
    .optional(),
  lines: z
    .array(
      z.object({
        id: z.coerce.number().int().positive(),
        hsnCode: z.string().trim().max(10, "HSN/SAC is at most 10 digits").nullable().optional(),
        gstRate: z.coerce.number().refine((r) => (GST_RATES as readonly number[]).includes(r), "GST % must be 0, 0.25, 3, 5, 12, 18 or 28").nullable().optional(),
      })
    )
    .optional(),
});

export async function updateGst(req: Request, res: Response) {
  const estimate = await estimatesService.updateGstDetails(Number(req.params.id), req.body as z.infer<typeof gstDetailsSchema>);
  res.json({ estimate });
}

export async function generateGstInvoice(req: Request, res: Response) {
  const estimate = await estimatesService.generateGstInvoice(Number(req.params.id));
  res.json({ estimate });
}
