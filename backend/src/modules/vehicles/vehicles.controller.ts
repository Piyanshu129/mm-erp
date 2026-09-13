import { Request, Response } from "express";
import { z } from "zod";
import * as vehiclesService from "./vehicles.service";
import { parsePageParams } from "../../lib/pagination";

const optionalString = z.string().trim().min(1).optional();

export const createVehicleSchema = z.object({
  registrationNumber: z.string().trim().min(4).max(20),
  make: z.string().trim().min(1),
  model: z.string().trim().min(1),
  variant: optionalString,
  year: z.coerce.number().int().min(1980).max(2100).optional(),
  fuelType: optionalString,
  transmission: optionalString,
  currentKm: z.coerce.number().int().min(0).optional(),
  chassisNumber: optionalString,
  engineNumber: optionalString,
  nextServiceDue: z.string().trim().min(1).optional(),
  customerId: z.coerce.number().int().positive(),
});

export const updateVehicleSchema = createVehicleSchema.partial();

export const setActiveSchema = z.object({ isActive: z.boolean() });

export async function list(req: Request, res: Response) {
  const page = parsePageParams(req.query);
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const { total, vehicles } = await vehiclesService.listVehicles(q, page);
  res.json({ vehicles, total, page: page.page, pageSize: page.pageSize });
}

export async function get(req: Request, res: Response) {
  const vehicle = await vehiclesService.getVehicle(Number(req.params.id));
  res.json({ vehicle });
}

export async function create(req: Request, res: Response) {
  const input = req.body as z.infer<typeof createVehicleSchema>;
  const vehicle = await vehiclesService.createVehicle(input);
  res.status(201).json({ vehicle });
}

export async function update(req: Request, res: Response) {
  const input = req.body as z.infer<typeof updateVehicleSchema>;
  const vehicle = await vehiclesService.updateVehicle(Number(req.params.id), input);
  res.json({ vehicle });
}

export async function setActive(req: Request, res: Response) {
  const { isActive } = req.body as z.infer<typeof setActiveSchema>;
  const vehicle = await vehiclesService.setVehicleActive(Number(req.params.id), isActive);
  res.json({ vehicle });
}

export async function serviceHistory(req: Request, res: Response) {
  const result = await vehiclesService.getVehicleServiceHistory(Number(req.params.id));
  res.json(result);
}
