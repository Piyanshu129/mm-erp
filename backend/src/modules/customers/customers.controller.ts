import { Request, Response } from "express";
import { z } from "zod";
import * as customersService from "./customers.service";
import { parsePageParams } from "../../lib/pagination";

const optionalString = z.string().trim().min(1).optional();

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1),
  mobile: z.string().trim().min(6).max(20),
  whatsapp: optionalString,
  email: z.string().trim().email().optional(),
  address: optionalString,
  notes: optionalString,
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const setActiveSchema = z.object({ isActive: z.boolean() });

export async function list(req: Request, res: Response) {
  const page = parsePageParams(req.query);
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const { total, customers } = await customersService.listCustomers(q, page);
  res.json({ customers, total, page: page.page, pageSize: page.pageSize });
}

export async function get(req: Request, res: Response) {
  const customer = await customersService.getCustomer(Number(req.params.id));
  res.json({ customer });
}

export async function create(req: Request, res: Response) {
  const input = req.body as z.infer<typeof createCustomerSchema>;
  const customer = await customersService.createCustomer(input);
  res.status(201).json({ customer });
}

export async function update(req: Request, res: Response) {
  const input = req.body as z.infer<typeof updateCustomerSchema>;
  const customer = await customersService.updateCustomer(Number(req.params.id), input);
  res.json({ customer });
}

export async function setActive(req: Request, res: Response) {
  const { isActive } = req.body as z.infer<typeof setActiveSchema>;
  const customer = await customersService.setCustomerActive(Number(req.params.id), isActive);
  res.json({ customer });
}
