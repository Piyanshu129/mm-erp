import { Request, Response } from "express";
import * as reportsService from "./reports.service";
import { getDailyReport } from "./dailyReport";
import { AppError } from "../../lib/errors";

function range(req: Request) {
  return {
    from: typeof req.query.from === "string" ? req.query.from : undefined,
    to: typeof req.query.to === "string" ? req.query.to : undefined,
  };
}

export async function dashboard(req: Request, res: Response) {
  res.json(await reportsService.getDashboardSummary(req.user!));
}

// One day in full detail (dailyReport.ts). ?date=YYYY-MM-DD, default today.
export async function daily(req: Request, res: Response) {
  const date = typeof req.query.date === "string" ? req.query.date : new Date().toLocaleDateString("en-CA");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError(400, "date must be YYYY-MM-DD");
  res.json(await getDailyReport(date));
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
