import { Request, Response } from "express";
import { z } from "zod";
import * as jobCardsService from "./jobCards.service";
import { parsePageParams } from "../../lib/pagination";
import { JOB_CARD_STATUSES } from "../../lib/jobCardStatus";

const optionalString = z.string().trim().min(1).optional();

export const createJobCardSchema = z.object({
  vehicleId: z.coerce.number().int().positive(),
  kmAtService: z.coerce.number().int().min(0).optional(),
  complaint: optionalString,
  requiredWork: optionalString,
  notes: optionalString,
});

export const updateJobCardSchema = createJobCardSchema.partial().extend({
  status: z.enum(JOB_CARD_STATUSES).optional(),
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
  const input = req.body as z.infer<typeof updateJobCardSchema>;
  const jobCard = await jobCardsService.updateJobCard(Number(req.params.id), input);
  res.json({ jobCard });
}
