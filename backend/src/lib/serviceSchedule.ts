import { prisma } from "./prisma";
import { ConflictError, NotFoundError } from "./errors";

// A general service is due every 6 months or 10,000 km after the last one,
// whichever comes first.
export const SERVICE_INTERVAL_MONTHS = 6;
export const SERVICE_INTERVAL_KM = 10_000;

// "Due soon" window — the schedule page and the dashboard reminder.
export const DUE_SOON_DAYS = 30;
const DUE_SOON_KM = 1_000;

// Average running needs readings at least this many days apart to mean
// anything (two readings a day apart say nothing about monthly use).
const MIN_SPAN_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

interface Reading {
  km: number;
  date: Date;
}

// Every KM reading for a vehicle: job card visits plus readings entered on
// the Service Schedule, oldest first.
async function readingsFor(vehicleIds: number[]): Promise<Map<number, Reading[]>> {
  const [visits, manual] = await Promise.all([
    prisma.jobCard.findMany({
      where: { vehicleId: { in: vehicleIds }, status: { not: "CANCELLED" }, kmAtService: { not: null } },
      select: { vehicleId: true, kmAtService: true, createdAt: true },
    }),
    prisma.odometerReading.findMany({
      where: { vehicleId: { in: vehicleIds } },
      select: { vehicleId: true, km: true, readingDate: true },
    }),
  ]);
  const byVehicle = new Map<number, Reading[]>();
  const add = (vehicleId: number, r: Reading) => byVehicle.set(vehicleId, [...(byVehicle.get(vehicleId) ?? []), r]);
  for (const v of visits) add(v.vehicleId, { km: v.kmAtService!, date: v.createdAt });
  for (const m of manual) add(m.vehicleId, { km: m.km, date: m.readingDate });
  for (const list of byVehicle.values()) list.sort((a, b) => a.date.getTime() - b.date.getTime());
  return byVehicle;
}

// Average km per day over the whole reading history (first to latest), or
// null when there isn't enough history to say.
export function averageKmPerDay(readings: Reading[]): number | null {
  if (readings.length < 2) return null;
  const first = readings[0];
  const last = readings[readings.length - 1];
  const days = (last.date.getTime() - first.date.getTime()) / DAY_MS;
  const km = last.km - first.km;
  if (days < MIN_SPAN_DAYS || km <= 0) return null;
  return km / days;
}

// Brings a vehicle's schedule up to date from its visits and readings. Run
// whenever a job card is created or changes type / KM / status, and when a
// reading is entered:
//   * the highest KM seen becomes currentKm;
//   * the latest General Service visit resets the next service to
//     +6 months / +10,000 km from that visit.
// With no General Service visit yet, the next service entered when the
// vehicle was added is left as it is.
export async function refreshVehicleService(vehicleId: number) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return;

  const [visits, latestManual] = await Promise.all([
    prisma.jobCard.findMany({
      where: { vehicleId, status: { not: "CANCELLED" } },
      select: { jobType: true, kmAtService: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.odometerReading.aggregate({ where: { vehicleId }, _max: { km: true } }),
  ]);

  const kms = visits.map((v) => v.kmAtService).filter((km): km is number => km != null);
  const highestKm = Math.max(vehicle.currentKm ?? 0, latestManual._max.km ?? 0, ...kms);

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

// Records a reading entered on the Service Schedule (e.g. the KM a customer
// sent on WhatsApp) and updates the schedule from it.
export async function recordOdometerReading(vehicleId: number, km: number, createdById: number, readingDate?: Date) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) throw new NotFoundError("Vehicle not found");
  const date = readingDate ?? new Date();
  if (date.getTime() > Date.now() + DAY_MS) throw new ConflictError("The reading date can't be in the future");

  // An odometer only goes up: refuse a reading below one already recorded
  // on or before that date (usually a typo).
  const readings = (await readingsFor([vehicleId])).get(vehicleId) ?? [];
  const earlier = readings.filter((r) => r.date.getTime() <= date.getTime());
  const highestEarlier = earlier.reduce<Reading | null>((best, r) => (!best || r.km > best.km ? r : best), null);
  if (highestEarlier && km < highestEarlier.km) {
    throw new ConflictError(
      `${km.toLocaleString("en-IN")} km is lower than the ${highestEarlier.km.toLocaleString("en-IN")} km already recorded on ${highestEarlier.date.toLocaleDateString("en-IN")} — check the reading`
    );
  }

  await prisma.odometerReading.create({ data: { vehicleId, km, readingDate: date, createdById } });
  await refreshVehicleService(vehicleId);
}

export type ServiceStatus = "OVERDUE" | "DUE_SOON" | "OK" | "NOT_SCHEDULED";

// One row per active vehicle: last general service, latest KM, average
// running, and when the next one is due — soonest (and overdue) first.
//
// The due date is estimated: whichever comes first of
//   * the time limit (6 months after the last service, or the date entered
//     when the vehicle was added), and
//   * the date the vehicle is expected to reach its next-service KM, from
//     its latest reading and its average running per day.
// Without enough reading history for an average, it's the time limit alone.
export async function getServiceSchedule() {
  // Only vehicles that come for general service: those with a (not
  // cancelled) General Service job card. Vehicles seen only for AC, dent &
  // paint, accidents etc. aren't on the schedule.
  const vehicles = await prisma.vehicle.findMany({
    where: { isActive: true, jobCards: { some: { jobType: "GENERAL_SERVICE", status: { not: "CANCELLED" } } } },
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
  const readings = await readingsFor(vehicles.map((v) => v.id));

  const now = new Date();
  const soon = new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS);

  const rows = vehicles.map((v) => {
    const last = v.jobCards[0] ?? null;
    const history = readings.get(v.id) ?? [];
    const latest = history.length ? history.reduce((a, b) => (b.km >= a.km ? b : a)) : null;
    const avgPerDay = averageKmPerDay(history);

    // Where the KM is likely to be today, from the latest reading.
    const estimatedKmNow =
      latest && avgPerDay != null
        ? Math.round(latest.km + (avgPerDay * Math.max(0, now.getTime() - latest.date.getTime())) / DAY_MS)
        : v.currentKm;

    let kmDueDate: Date | null = null;
    if (v.nextServiceKm != null && latest && avgPerDay != null) {
      kmDueDate = new Date(latest.date.getTime() + ((v.nextServiceKm - latest.km) / avgPerDay) * DAY_MS);
    }
    const timeDue = v.nextServiceDue;
    let estimatedDue: Date | null = timeDue;
    let dueBasis: "TIME" | "KM" | null = timeDue ? "TIME" : null;
    if (kmDueDate && (!estimatedDue || kmDueDate < estimatedDue)) {
      estimatedDue = kmDueDate;
      dueBasis = "KM";
    }

    const kmReached = v.nextServiceKm != null && v.currentKm != null && v.currentKm >= v.nextServiceKm;
    const kmSoon = v.nextServiceKm != null && estimatedKmNow != null && estimatedKmNow >= v.nextServiceKm - DUE_SOON_KM;

    let status: ServiceStatus = "NOT_SCHEDULED";
    if (kmReached || (estimatedDue != null && estimatedDue < now)) status = "OVERDUE";
    else if ((estimatedDue != null && estimatedDue <= soon) || kmSoon) status = "DUE_SOON";
    else if (estimatedDue != null || v.nextServiceKm != null) status = "OK";

    return {
      vehicleId: v.id,
      registrationNumber: v.registrationNumber,
      make: v.make,
      model: v.model,
      customer: v.customer,
      lastServiceDate: last?.createdAt ?? null,
      lastServiceKm: last?.kmAtService ?? null,
      lastServiceJobCard: last ? { id: last.id, jobCardNumber: last.jobCardNumber } : null,
      updatedKm: v.currentKm,
      lastReadingDate: latest?.date ?? null,
      avgKmPerMonth: avgPerDay != null ? Math.round(avgPerDay * 30) : null,
      estimatedKmNow,
      nextServiceDue: estimatedDue,
      dueBasis,
      timeDue,
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

// For the dashboard: vehicles whose service falls due within the next 30
// days, including any already overdue.
export async function upcomingServices() {
  const rows = (await getServiceSchedule()).filter((r) => r.status === "OVERDUE" || r.status === "DUE_SOON");
  return {
    count: rows.length,
    vehicles: rows.slice(0, 10).map((r) => ({
      vehicleId: r.vehicleId,
      registrationNumber: r.registrationNumber,
      customerName: r.customer.name,
      nextServiceDue: r.nextServiceDue,
      status: r.status,
    })),
  };
}
