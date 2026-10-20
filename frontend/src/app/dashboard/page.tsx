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
import { apiFetch } from "@/lib/api";
import { Card, CardBody } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

interface Summary {
  todaysVehicles: number;
  openJobCards: number;
  invoicedToday: number;
  cancelledThisMonth: number;
  lowStockCount: number;
  outOfStockCount: number;
  // Only sent to admins (sales and purchase figures).
  todaysSales?: number;
  todaysPurchaseValue?: number;
  monthPurchaseValue?: number;
  monthInventoryPurchaseValue?: number;
  monthExpenseValue?: number;
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

  useEffect(() => {
    apiFetch("/reports/dashboard").then(setSummary);
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Welcome, {user?.name}</h1>
        <p className="mt-1 text-sm text-gray-500">Here&apos;s what&apos;s happening at the workshop today.</p>
      </div>

      {summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Today's Vehicles" value={summary.todaysVehicles} href="/dashboard/jobcards" icon={Car} />
          <StatCard label="Open Job Cards" value={summary.openJobCards} href="/dashboard/jobcards?status=OPEN" icon={ClipboardList} />
          <StatCard label="Invoiced Today" value={summary.invoicedToday} href="/dashboard/invoices" icon={CheckCircle2} />
          <StatCard
            label="Cancelled This Month"
            value={summary.cancelledThisMonth}
            href="/dashboard/jobcards?status=CANCELLED"
            icon={Ban}
            tone={summary.cancelledThisMonth > 0 ? "warning" : "default"}
          />
          {summary.todaysSales != null && (
            <StatCard label="Today's Sales" value={`₹${summary.todaysSales.toFixed(0)}`} href="/dashboard/reports" icon={IndianRupee} />
          )}
          {summary.todaysPurchaseValue != null && (
            <StatCard
              label="Today's Purchases"
              value={`₹${summary.todaysPurchaseValue.toFixed(0)}`}
              href="/dashboard/reports"
              icon={ShoppingCart}
            />
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
          {summary.monthPurchaseValue != null && (
          <Link href="/dashboard/purchases" className="col-span-2 block transition-transform hover:-translate-y-0.5">
            <Card>
              <CardBody className="flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <ShoppingCart className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs text-gray-500">
                    Total Purchases — {new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </p>
                  <p className="text-xl font-semibold text-gray-900">{rupees(summary.monthPurchaseValue)}</p>
                  <p className="truncate text-xs text-gray-500">
                    Inventory {rupees(summary.monthInventoryPurchaseValue ?? 0)} · Expenses {rupees(summary.monthExpenseValue ?? 0)}
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
