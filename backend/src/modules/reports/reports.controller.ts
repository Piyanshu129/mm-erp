import { Request, Response } from "express";
import * as reportsService from "./reports.service";

function range(req: Request) {
  return {
    from: typeof req.query.from === "string" ? req.query.from : undefined,
    to: typeof req.query.to === "string" ? req.query.to : undefined,
  };
}

export async function dashboard(_req: Request, res: Response) {
  res.json(await reportsService.getDashboardSummary());
}

export async function sales(req: Request, res: Response) {
  const { from, to } = range(req);
  res.json(await reportsService.getSalesReport(from, to));
}

export async function purchases(req: Request, res: Response) {
  const { from, to } = range(req);
  res.json(await reportsService.getPurchasesReport(from, to));
}

export async function inventory(_req: Request, res: Response) {
  res.json(await reportsService.getInventoryReport());
}

export async function workshop(req: Request, res: Response) {
  const { from, to } = range(req);
  res.json(await reportsService.getWorkshopReport(from, to));
}

export async function customers(req: Request, res: Response) {
  const { from, to } = range(req);
  res.json(await reportsService.getCustomersReport(from, to));
}
