import { Request, Response } from "express";
import { z } from "zod";
import * as invoicesService from "./invoices.service";
import { listPaymentAudits } from "../../lib/paymentAudit";
import { parsePageParams } from "../../lib/pagination";

export const createInvoiceSchema = z.object({
  discount: z.coerce.number().min(0).optional(),
});

const optionalString = z.string().trim().min(1).optional();

export const recordPaymentSchema = z.object({
  // Either may be 0 (all discount, or no discount) but not both.
  amount: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).optional(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "paymentDate must be YYYY-MM-DD").optional(),
  paymentMode: optionalString,
  reference: optionalString,
  receivedBy: optionalString,
  notes: optionalString,
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

export async function updatePayment(req: Request, res: Response) {
  const input = req.body as z.infer<typeof recordPaymentSchema>;
  const invoice = await invoicesService.updateInvoicePayment(Number(req.params.id), Number(req.params.paymentId), input, req.user!.id);
  res.json({ invoice });
}

export async function deletePayment(req: Request, res: Response) {
  const invoice = await invoicesService.deleteInvoicePayment(Number(req.params.id), Number(req.params.paymentId), req.user!.id);
  res.json({ invoice });
}

// The change log of this invoice's payments (admin edits and deletions).
export async function paymentAudits(req: Request, res: Response) {
  res.json({ audits: await listPaymentAudits({ paymentKind: "INVOICE", invoiceId: Number(req.params.id) }) });
}

export async function recordPayment(req: Request, res: Response) {
  const input = req.body as z.infer<typeof recordPaymentSchema>;
  const invoice = await invoicesService.recordInvoicePayment(Number(req.params.id), input, req.user!.id);
  res.status(201).json({ invoice });
}
