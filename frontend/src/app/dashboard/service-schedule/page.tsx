"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, BadgeTone } from "@/components/ui/Badge";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";

type ServiceStatus = "OVERDUE" | "DUE_SOON" | "OK" | "NOT_SCHEDULED";

interface ScheduleRow {
  vehicleId: number;
  registrationNumber: string;
  make: string;
  model: string;
  customer: { id: number; name: string; mobile: string };
  lastServiceDate: string | null;
  lastServiceKm: number | null;
  lastServiceJobCard: { id: number; jobCardNumber: string } | null;
  updatedKm: number | null;
  nextServiceDue: string | null;
  nextServiceKm: number | null;
  status: ServiceStatus;
}

const STATUS: Record<ServiceStatus, { label: string; tone: BadgeTone }> = {
  OVERDUE: { label: "Passed", tone: "red" },
  DUE_SOON: { label: "Due soon", tone: "amber" },
  OK: { label: "On track", tone: "green" },
  NOT_SCHEDULED: { label: "Not scheduled", tone: "gray" },
};

function km(value: number | null): string {
  return value == null ? "-" : `${value.toLocaleString("en-IN")} km`;
}

function date(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function ServiceSchedulePageContent() {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"" | ServiceStatus>("");

  useEffect(() => {
    apiFetch("/service-schedule").then((body) => {
      setRows(body.rows);
      setLoading(false);
    });
  }, []);

  const counts = rows.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
    {} as Partial<Record<ServiceStatus, number>>
  );
  const shown = filter ? rows.filter((r) => r.status === filter) : rows;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Schedule"
        description="When each vehicle's next general service is due — every 6 months or 10,000 km after the last one, whichever comes first. Each General Service job card moves it on automatically."
      />

      <div className="flex flex-wrap gap-2">
        {(["", "OVERDUE", "DUE_SOON", "OK", "NOT_SCHEDULED"] as const).map((f) => (
          <button
            key={f || "all"}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-sm ${
              filter === f ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {f === "" ? `All (${rows.length})` : `${STATUS[f].label} (${counts[f] ?? 0})`}
          </button>
        ))}
      </div>

      {loading ? (
        <TableSkeleton cols={9} />
      ) : shown.length === 0 ? (
        <EmptyState icon={CalendarClock} title={filter ? "No vehicles in this group" : "No vehicles yet"} />
      ) : (
        <Table minWidth={1100}>
          <thead>
            <tr>
              <Th>Vehicle No.</Th>
              <Th>Customer</Th>
              <Th>Customer No.</Th>
              <Th>Last Service</Th>
              <Th className="text-right">Last KM</Th>
              <Th className="text-right">Updated KM</Th>
              <Th>Next Service Due</Th>
              <Th className="text-right">Next Service KM</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <Tr key={r.vehicleId}>
                <Td className="font-mono font-medium text-gray-900">
                  {r.registrationNumber}
                  <span className="block font-sans text-xs font-normal text-gray-500">
                    {r.make} {r.model}
                  </span>
                </Td>
                <Td>
                  <Link href={`/dashboard/customers/${r.customer.id}`} className="text-gray-900 hover:text-blue-600 hover:underline">
                    {r.customer.name}
                  </Link>
                </Td>
                <Td>{r.customer.mobile}</Td>
                <Td className="whitespace-nowrap">
                  {date(r.lastServiceDate)}
                  {r.lastServiceJobCard && (
                    <Link
                      href={`/dashboard/jobcards/${r.lastServiceJobCard.id}`}
                      className="block font-mono text-xs text-blue-600 hover:underline"
                    >
                      {r.lastServiceJobCard.jobCardNumber}
                    </Link>
                  )}
                </Td>
                <Td className="text-right">{km(r.lastServiceKm)}</Td>
                <Td className="text-right">{km(r.updatedKm)}</Td>
                <Td className={`whitespace-nowrap ${r.status === "OVERDUE" ? "font-semibold text-red-700" : ""}`}>
                  {date(r.nextServiceDue)}
                </Td>
                <Td className="text-right">{km(r.nextServiceKm)}</Td>
                <Td>
                  <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

export default function ServiceSchedulePage() {
  return (
    <RequireAuth permission="JOB_CARDS">
      <ServiceSchedulePageContent />
    </RequireAuth>
  );
}
