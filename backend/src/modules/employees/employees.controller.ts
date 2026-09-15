import { Request, Response } from "express";
import { z } from "zod";
import * as employeesService from "./employees.service";
import { parsePageParams } from "../../lib/pagination";

const optionalString = z.string().trim().min(1).optional();

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(1),
  role: optionalString,
  joiningDate: z.coerce.date(),
  monthlySalary: z.coerce.number().min(0),
  monthlyLeaveAllowance: z.coerce.number().int().min(0).optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export const setActiveSchema = z.object({ isActive: z.boolean() });

export async function list(req: Request, res: Response) {
  const page = parsePageParams(req.query);
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const { total, employees } = await employeesService.listEmployees(q, page);
  res.json({ employees, total, page: page.page, pageSize: page.pageSize });
}

export async function get(req: Request, res: Response) {
  const employee = await employeesService.getEmployee(Number(req.params.id));
  res.json({ employee });
}

export async function create(req: Request, res: Response) {
  const input = req.body as z.infer<typeof createEmployeeSchema>;
  const employee = await employeesService.createEmployee(input);
  res.status(201).json({ employee });
}

export async function update(req: Request, res: Response) {
  const input = req.body as z.infer<typeof updateEmployeeSchema>;
  const employee = await employeesService.updateEmployee(Number(req.params.id), input);
  res.json({ employee });
}

export async function setActive(req: Request, res: Response) {
  const { isActive } = req.body as z.infer<typeof setActiveSchema>;
  const employee = await employeesService.setEmployeeActive(Number(req.params.id), isActive);
  res.json({ employee });
}
