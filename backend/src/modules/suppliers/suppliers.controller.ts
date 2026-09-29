import { Request, Response } from "express";
import { z } from "zod";
import * as suppliersService from "./suppliers.service";
import { parsePageParams } from "../../lib/pagination";
import { publicUrlFor } from "../../middleware/upload";

const optionalString = z.string().trim().min(1).optional();

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1),
  contactPerson: optionalString,
  mobile: optionalString,
  email: z.string().trim().email().optional(),
  address: optionalString,
  notes: optionalString,
});

export const updateSupplierSchema = createSupplierSchema.partial();

export const setActiveSchema = z.object({ isActive: z.boolean() });

// Multipart (it can carry a photo of the transaction), so fields arrive as
// strings — hence z.coerce for the amount.
export const recordPaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  paymentDate: optionalString,
  paymentMode: optionalString,
  reference: optionalString,
  paidBy: optionalString,
  notes: optionalString,
});

export async function list(req: Request, res: Response) {
  const page = parsePageParams(req.query);
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const { total, suppliers } = await suppliersService.listSuppliers(q, page);
  res.json({ suppliers, total, page: page.page, pageSize: page.pageSize });
}

export async function create(req: Request, res: Response) {
  const input = req.body as z.infer<typeof createSupplierSchema>;
  const supplier = await suppliersService.createSupplier(input);
  res.status(201).json({ supplier });
}

export async function update(req: Request, res: Response) {
  const input = req.body as z.infer<typeof updateSupplierSchema>;
  const supplier = await suppliersService.updateSupplier(Number(req.params.id), input);
  res.json({ supplier });
}

export async function setActive(req: Request, res: Response) {
  const { isActive } = req.body as z.infer<typeof setActiveSchema>;
  const supplier = await suppliersService.setSupplierActive(Number(req.params.id), isActive);
  res.json({ supplier });
}

export async function payments(req: Request, res: Response) {
  const result = await suppliersService.getSupplierPayments(Number(req.params.id));
  res.json(result);
}

export async function recordPayment(req: Request, res: Response) {
  const input = recordPaymentSchema.parse(req.body);
  const proofUrl = req.file ? publicUrlFor("supplier-payments", req.file.filename) : undefined;
  const payment = await suppliersService.recordSupplierPayment(
    Number(req.params.id),
    { ...input, proofUrl },
    req.user!.id
  );
  res.status(201).json({ payment });
}
