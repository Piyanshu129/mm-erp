"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Car,
  ClipboardList,
  CheckCircle2,
  Ban,
  IndianRupee,
  ShoppingCart,
  AlertTriangle,
  XCircle,
  Plus,
  CalendarCheck,
  CalendarClock,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, ApiError } from "@/lib/api";
import { Card, CardBody } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { DashboardCharts, SeriesPoint } from "@/components/DashboardCharts";

type Period = "today" | "month" | "fy";

const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "month", label: "This month" },
  { value: "fy", label: "This financial year" },
];

interface Summary {
  period: Period;
  periodStart: string;
  vehicles: number;
  openJobCards: number;
  estimatesCount: number;
  estimatesApproved: number;
  cancelled: number;
  lowStockCount: number;
  outOfStockCount: number;
  // Only sent to admins (money figures and graphs).
  estimatesValue?: number;
  purchaseValue?: number;
  inventoryPurchaseValue?: number;
  expenseValue?: number;
  series?: SeriesPoint[];
  // Only sent to users who can see vehicles or job cards.
  upcomingServices: {
    count: number;
    vehicles: { vehicleId: number; registrationNumber: string; customerName: string; nextServiceDue: string | null; status: string }[];
  } | null;
}

function rupees(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

type Tone = "default" | "warning" | "danger";

const TONE_ICON_CLASS: Record<Tone, string> = {
  default: "bg-blue-50 text-blue-600",
  warning: "bg-amber-50 text-amber-600",
  danger: "bg-red-50 text-red-600",
};

function StatCard({
  label,
  value,
  href,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: string | number;
  href: string;
  tone?: Tone;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link href={href} className="block transition-transform hover:-translate-y-0.5">
      <Card>
        <CardBody className="flex items-center gap-3">
          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${TONE_ICON_CLASS[tone]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs text-gray-500">{label}</p>
            <p className="text-xl font-semibold text-gray-900">{value}</p>
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Remembered on this device between visits.
  const [period, setPeriod] = useState<Period | null>(null);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("mm-dashboard-period");
    } catch {
      /* not available — fine */
    }
    setPeriod(saved === "month" || saved === "fy" ? saved : "today");
  }, []);

  useEffect(() => {
    if (!period) return;
    setSummary(null);
    setLoadError(null);
    apiFetch(`/reports/dashboard?period=${period}`)
      .then(setSummary)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load the dashboard"));
    try {
      localStorage.setItem("mm-dashboard-period", period);
    } catch {
      /* not available — fine */
    }
  }, [period]);

  const word = period === "today" ? "Today" : period === "month" ? "This Month" : "This FY";
  const fyLabel = summary
    ? `FY ${summary.periodStart.slice(0, 4)}–${String(Number(summary.periodStart.slice(0, 4)) + 1).slice(2)}`
    : "";
  const graphLabel =
    period === "today" ? "Last 7 days" : period === "month" ? new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" }) : fyLabel;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Welcome, {user?.name}</h1>
        <p className="mt-1 text-sm text-gray-500">Here&apos;s what&apos;s happening at the workshop.</p>
      </div>

      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5" role="tablist" aria-label="Dashboard period">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            role="tab"
            aria-selected={period === p.value}
            onClick={() => setPeriod(p.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${period === p.value ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loadError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>}

      {loadError ? null : summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={`Vehicles — ${word}`} value={summary.vehicles} href="/dashboard/jobcards" icon={Car} />
          <StatCard label="Open Job Cards" value={summary.openJobCards} href="/dashboard/jobcards?status=OPEN" icon={ClipboardList} />
          <StatCard
            label={`Estimates — ${word}`}
            value={`${summary.estimatesCount}${summary.estimatesCount ? ` (${summary.estimatesApproved} approved)` : ""}`}
            href="/dashboard/reports"
            icon={CheckCircle2}
          />
          <StatCard
            label={`Cancelled — ${word}`}
            value={summary.cancelled}
            href="/dashboard/jobcards?status=CANCELLED"
            icon={Ban}
            tone={summary.cancelled > 0 ? "warning" : "default"}
          />
          {summary.estimatesValue != null && (
            <StatCard label={`Estimate Value — ${word}`} value={rupees(summary.estimatesValue)} href="/dashboard/reports" icon={IndianRupee} />
          )}
          {summary.purchaseValue != null && (
            <StatCard label={`Purchases — ${word}`} value={rupees(summary.purchaseValue)} href="/dashboard/purchases" icon={ShoppingCart} />
          )}
          <StatCard
            label="Low Stock"
            value={summary.lowStockCount}
            href="/dashboard/items"
            icon={AlertTriangle}
            tone={summary.lowStockCount > 0 ? "warning" : "default"}
          />
          <StatCard
            label="Out of Stock"
            value={summary.outOfStockCount}
            href="/dashboard/items"
            icon={XCircle}
            tone={summary.outOfStockCount > 0 ? "danger" : "default"}
          />
          {summary.upcomingServices && (
            <StatCard
              label="Service Due in 30 Days"
              value={summary.upcomingServices.count}
              href="/dashboard/service-schedule"
              icon={CalendarClock}
              tone={summary.upcomingServices.count > 0 ? "danger" : "default"}
            />
          )}
          {summary.purchaseValue != null && (
          <Link href="/dashboard/purchases" className="col-span-2 block transition-transform hover:-translate-y-0.5">
            <Card>
              <CardBody className="flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <ShoppingCart className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs text-gray-500">Total Purchases — {word}</p>
                  <p className="text-xl font-semibold text-gray-900">{rupees(summary.purchaseValue)}</p>
                  <p className="truncate text-xs text-gray-500">
                    Inventory {rupees(summary.inventoryPurchaseValue ?? 0)} · Expenses {rupees(summary.expenseValue ?? 0)}
                  </p>
                </div>
              </CardBody>
            </Card>
          </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px]" />
          ))}
        </div>
      )}

      {summary?.series && <DashboardCharts series={summary.series} periodLabel={`Graphs — ${graphLabel}`} />}

      {summary?.upcomingServices && summary.upcomingServices.count > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-red-700">
            Service due within 30 days ({summary.upcomingServices.count})
          </h2>
          <Card className="border-red-200">
            <ul className="divide-y divide-red-100">
              {summary.upcomingServices.vehicles.map((v) => (
                <li key={v.vehicleId}>
                  <Link
                    href="/dashboard/service-schedule"
                    className="flex flex-wrap items-center justify-between gap-2 bg-red-50 px-4 py-2.5 text-sm text-red-800 hover:bg-red-100"
                  >
                    <span>
                      <span className="font-mono font-semibold">{v.registrationNumber}</span> · {v.customerName}
                    </span>
                    <span className="font-medium">
                      {v.status === "OVERDUE" ? "Overdue" : "Due"}
                      {v.nextServiceDue ? ` — ${new Date(v.nextServiceDue).toLocaleDateString()}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {summary.upcomingServices.count > summary.upcomingServices.vehicles.length && (
              <Link href="/dashboard/service-schedule" className="block px-4 py-2 text-xs font-medium text-red-700 hover:underline">
                See all {summary.upcomingServices.count} on the Service Schedule
              </Link>
            )}
          </Card>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-500">Quick actions</h2>
        <div className="flex flex-wrap gap-2">
          {/* A job card needs a vehicle, so start with the new vehicle form. */}
          <LinkButton href="/dashboard/vehicles?for=jobcard">
            <Plus className="h-4 w-4" /> New Job Card
          </LinkButton>
          <LinkButton href="/dashboard/purchases">
            <Plus className="h-4 w-4" /> New Purchase
          </LinkButton>
          <LinkButton href="/dashboard/attendance">
            <CalendarCheck className="h-4 w-4" /> Attendance
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
