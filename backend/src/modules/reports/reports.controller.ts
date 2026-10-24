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
  const period = req.query.period === "month" || req.query.period === "fy" ? req.query.period : "today";
  res.json(await reportsService.getDashboardSummary(req.user!, period));
}

// A date range in full detail (dailyReport.ts). ?from=&to= (YYYY-MM-DD,
// both included; ?date= still works for one day). Default: today.
export async function daily(req: Request, res: Response) {
  const today = new Date().toLocaleDateString("en-CA");
  const q = (k: string) => (typeof req.query[k] === "string" ? (req.query[k] as string) : undefined);
  const from = q("from") ?? q("date") ?? today;
  const to = q("to") ?? from;
  if (![from, to].every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) throw new AppError(400, "dates must be YYYY-MM-DD");
  res.json(await getDailyReport(from, to));
}

export async function estimates(req: Request, res: Response) {
  const { from, to } = range(req);
  res.json(await reportsService.getEstimatesReport(from, to));
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
