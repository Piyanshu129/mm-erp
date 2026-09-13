"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Car,
  ClipboardList,
  CheckCircle2,
  Clock,
  IndianRupee,
  ShoppingCart,
  AlertTriangle,
  XCircle,
  Plus,
  Package,
  Users,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { Card, CardBody } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

interface Summary {
  todaysVehicles: number;
  openJobCards: number;
  completedJobs: number;
  pendingJobs: number;
  todaysSales: number;
  todaysPurchaseValue: number;
  lowStockCount: number;
  outOfStockCount: number;
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
          <StatCard label="Open Job Cards" value={summary.openJobCards} href="/dashboard/jobcards" icon={ClipboardList} />
          <StatCard
            label="Awaiting Invoice"
            value={summary.completedJobs}
            href="/dashboard/jobcards?status=COMPLETED"
            icon={CheckCircle2}
          />
          <StatCard
            label="Waiting for Parts"
            value={summary.pendingJobs}
            href="/dashboard/jobcards?status=WAITING_FOR_PARTS"
            icon={Clock}
            tone={summary.pendingJobs > 0 ? "warning" : "default"}
          />
          <StatCard label="Today's Sales" value={`₹${summary.todaysSales.toFixed(0)}`} href="/dashboard/reports" icon={IndianRupee} />
          <StatCard
            label="Today's Purchases"
            value={`₹${summary.todaysPurchaseValue.toFixed(0)}`}
            href="/dashboard/reports"
            icon={ShoppingCart}
          />
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
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px]" />
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-500">Quick actions</h2>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/dashboard/jobcards">
            <Plus className="h-4 w-4" /> New Job Card
          </LinkButton>
          <LinkButton href="/dashboard/purchases">
            <Plus className="h-4 w-4" /> New Purchase
          </LinkButton>
          <LinkButton href="/dashboard/items" variant="secondary">
            <Package className="h-4 w-4" /> Inventory
          </LinkButton>
          <LinkButton href="/dashboard/customers" variant="secondary">
            <Users className="h-4 w-4" /> Customers
          </LinkButton>
          <LinkButton href="/dashboard/vehicles" variant="secondary">
            <Car className="h-4 w-4" /> Vehicles
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
