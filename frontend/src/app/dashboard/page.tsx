"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";

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

function StatCard({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: string | number;
  href?: string;
  tone?: "default" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger" ? "text-red-600" : tone === "warning" ? "text-amber-600" : "text-gray-900";

  const content = (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );

  return href ? (
    <Link href={href} className="block hover:border-gray-400">
      {content}
    </Link>
  ) : (
    content
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
        <h1 className="text-lg font-semibold">Welcome, {user?.name}</h1>
        <p className="text-sm text-gray-500">Signed in as {user?.role}.</p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Today's Vehicles" value={summary.todaysVehicles} href="/dashboard/jobcards" />
          <StatCard label="Open Job Cards" value={summary.openJobCards} href="/dashboard/jobcards" />
          <StatCard label="Completed (awaiting invoice)" value={summary.completedJobs} href="/dashboard/jobcards?status=COMPLETED" />
          <StatCard label="Waiting for Parts" value={summary.pendingJobs} href="/dashboard/jobcards?status=WAITING_FOR_PARTS" tone={summary.pendingJobs > 0 ? "warning" : "default"} />
          <StatCard label="Today's Sales" value={`₹${summary.todaysSales.toFixed(2)}`} href="/dashboard/reports" />
          <StatCard label="Today's Purchases" value={`₹${summary.todaysPurchaseValue.toFixed(2)}`} href="/dashboard/reports" />
          <StatCard label="Low Stock" value={summary.lowStockCount} href="/dashboard/items" tone={summary.lowStockCount > 0 ? "warning" : "default"} />
          <StatCard label="Out of Stock" value={summary.outOfStockCount} href="/dashboard/items" tone={summary.outOfStockCount > 0 ? "danger" : "default"} />
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-500">Quick actions</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/jobcards" className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white">
            + New Job Card
          </Link>
          <Link href="/dashboard/purchases" className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white">
            + New Purchase
          </Link>
          <Link href="/dashboard/items" className="rounded-md border border-gray-300 px-4 py-2 text-sm">
            Inventory
          </Link>
          <Link href="/dashboard/customers" className="rounded-md border border-gray-300 px-4 py-2 text-sm">
            Customers
          </Link>
          <Link href="/dashboard/vehicles" className="rounded-md border border-gray-300 px-4 py-2 text-sm">
            Vehicles
          </Link>
        </div>
      </div>
    </div>
  );
}
