import { prisma } from "./prisma";

// A general service is due every 6 months or 10,000 km after the last one,
// whichever comes first.
export const SERVICE_INTERVAL_MONTHS = 6;
export const SERVICE_INTERVAL_KM = 10_000;

// "Due soon" window for the schedule page.
const DUE_SOON_DAYS = 30;
const DUE_SOON_KM = 1_000;

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// Brings a vehicle's schedule up to date from its visits. Run whenever a job
// card is created or changes type / KM / status:
//   * the latest KM seen on any (non-cancelled) visit becomes currentKm;
//   * the latest General Service visit resets the next service to
//     +6 months / +10,000 km from that visit.
// With no General Service visit yet, the next service entered when the
// vehicle was added is left as it is.
export async function refreshVehicleService(vehicleId: number) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return;

  const visits = await prisma.jobCard.findMany({
    where: { vehicleId, status: { not: "CANCELLED" } },
    select: { jobType: true, kmAtService: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const kms = visits.map((v) => v.kmAtService).filter((km): km is number => km != null);
  const highestKm = Math.max(vehicle.currentKm ?? 0, ...kms);

  const lastService = visits.find((v) => v.jobType === "GENERAL_SERVICE");
  const data: { currentKm?: number; nextServiceDue?: Date; nextServiceKm?: number | null } = {};
  if (highestKm > 0 && highestKm !== vehicle.currentKm) data.currentKm = highestKm;
  if (lastService) {
    data.nextServiceDue = addMonths(lastService.createdAt, SERVICE_INTERVAL_MONTHS);
    data.nextServiceKm = lastService.kmAtService != null ? lastService.kmAtService + SERVICE_INTERVAL_KM : null;
  }
  if (Object.keys(data).length > 0) {
    await prisma.vehicle.update({ where: { id: vehicleId }, data });
  }
}

export type ServiceStatus = "OVERDUE" | "DUE_SOON" | "OK" | "NOT_SCHEDULED";

// One row per active vehicle: last general service, latest KM, and when the
// next one is due — soonest (and overdue) first.
export async function getServiceSchedule() {
  const vehicles = await prisma.vehicle.findMany({
    where: { isActive: true },
    include: {
      customer: { select: { id: true, name: true, mobile: true } },
      jobCards: {
        where: { jobType: "GENERAL_SERVICE", status: { not: "CANCELLED" } },
        select: { id: true, jobCardNumber: true, createdAt: true, kmAtService: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const now = new Date();
  const soon = new Date(now.getTime() + DUE_SOON_DAYS * 24 * 60 * 60 * 1000);

  const rows = vehicles.map((v) => {
    const last = v.jobCards[0] ?? null;
    const km = v.currentKm;
    const dateOverdue = v.nextServiceDue != null && v.nextServiceDue < now;
    const kmOverdue = v.nextServiceKm != null && km != null && km >= v.nextServiceKm;
    const dateSoon = v.nextServiceDue != null && v.nextServiceDue <= soon;
    const kmSoon = v.nextServiceKm != null && km != null && km >= v.nextServiceKm - DUE_SOON_KM;

    let status: ServiceStatus = "NOT_SCHEDULED";
    if (dateOverdue || kmOverdue) status = "OVERDUE";
    else if (dateSoon || kmSoon) status = "DUE_SOON";
    else if (v.nextServiceDue != null || v.nextServiceKm != null) status = "OK";

    return {
      vehicleId: v.id,
      registrationNumber: v.registrationNumber,
      make: v.make,
      model: v.model,
      customer: v.customer,
      lastServiceDate: last?.createdAt ?? null,
      lastServiceKm: last?.kmAtService ?? null,
      lastServiceJobCard: last ? { id: last.id, jobCardNumber: last.jobCardNumber } : null,
      updatedKm: km,
      nextServiceDue: v.nextServiceDue,
      nextServiceKm: v.nextServiceKm,
      status,
    };
  });

  const rank: Record<ServiceStatus, number> = { OVERDUE: 0, DUE_SOON: 1, OK: 2, NOT_SCHEDULED: 3 };
  rows.sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      (a.nextServiceDue?.getTime() ?? Infinity) - (b.nextServiceDue?.getTime() ?? Infinity)
  );
  return rows;
}
