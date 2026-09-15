import { Request, Response } from "express";
import { z } from "zod";
import * as salaryService from "./salary.service";

export const calculateSalarySchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000),
});

export const recordPaymentSchema = z.object({
  paymentAmount: z.coerce.number().min(0),
  paymentMode: z.string().trim().min(1).optional(),
  paymentBy: z.string().trim().min(1).optional(),
});

export async function list(req: Request, res: Response) {
  const month = req.query.month ? Number(req.query.month) : undefined;
  const year = req.query.year ? Number(req.query.year) : undefined;
  const payments = await salaryService.listSalaryPayments(month, year);
  res.json({ payments });
}

export async function calculate(req: Request, res: Response) {
  const { employeeId, month, year } = req.body as z.infer<typeof calculateSalarySchema>;
  const payment = await salaryService.calculateMonthlySalary(employeeId, month, year);
  res.status(201).json({ payment });
}

export async function recordPayment(req: Request, res: Response) {
  const input = req.body as z.infer<typeof recordPaymentSchema>;
  const payment = await salaryService.recordSalaryPayment(Number(req.params.id), input);
  res.json({ payment });
}
