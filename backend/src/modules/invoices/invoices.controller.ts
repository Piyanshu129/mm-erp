import { Request, Response } from "express";
import { z } from "zod";
import * as invoicesService from "./invoices.service";
import { parsePageParams } from "../../lib/pagination";

export const createInvoiceSchema = z.object({
  discount: z.coerce.number().min(0).optional(),
});

export const recordPaymentSchema = z.object({
  paymentAmount: z.coerce.number().min(0),
  paymentMode: z.string().trim().min(1).optional(),
  paymentReference: z.string().trim().min(1).optional(),
  paymentReceivedBy: z.string().trim().min(1).optional(),
});

export async function list(req: Request, res: Response) {
  const page = parsePageParams(req.query);
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const { total, invoices } = await invoicesService.listInvoices(page, q);
  res.json({ invoices, total, page: page.page, pageSize: page.pageSize });
}

export async function get(req: Request, res: Response) {
  const invoice = await invoicesService.getInvoice(Number(req.params.id));
  res.json({ invoice });
}

export async function create(req: Request, res: Response) {
  const { discount } = req.body as z.infer<typeof createInvoiceSchema>;
  const invoice = await invoicesService.createInvoice(
    Number(req.params.jobCardId),
    discount ?? 0,
    req.user!.id
  );
  res.status(201).json({ invoice });
}

export async function recordPayment(req: Request, res: Response) {
  const input = req.body as z.infer<typeof recordPaymentSchema>;
  const invoice = await invoicesService.recordInvoicePayment(Number(req.params.id), input);
  res.json({ invoice });
}
