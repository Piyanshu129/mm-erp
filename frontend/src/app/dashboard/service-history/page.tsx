"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Search, History } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { JobCardStatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

interface VehicleOption {
  id: number;
  registrationNumber: string;
  make: string;
  model: string;
  customer: { name: string; mobile: string };
}

interface HistoryEntry {
  id: number;
  jobCardNumber: string;
  status: string;
  createdAt: string;
  kmAtService: number | null;
  complaint: string | null;
  requiredWork: string | null;
  partsTotal: number;
  labourTotal: number;
  grandTotal: number;
  invoice: { id: number; invoiceNumber: string; totalAmount: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  VEHICLE_RECEIVED: "Vehicle Received",
  WORK_STARTED: "Work Started",
  WAITING_FOR_PARTS: "Waiting for Parts",
  WORK_IN_PROGRESS: "Work in Progress",
  COMPLETED: "Completed",
  INVOICED: "Invoiced",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

function ServiceHistoryPageContent() {
  const [q, setQ] = useState("");
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setSelectedVehicle(null);
    setHistory([]);
    const body = await apiFetch(`/vehicles?q=${encodeURIComponent(q)}`);
    setVehicles(body.vehicles);
    setLoading(false);

    if (body.vehicles.length === 1) {
      await selectVehicle(body.vehicles[0]);
    }
  }

  async function selectVehicle(vehicle: VehicleOption) {
    setSelectedVehicle(vehicle);
    setLoading(true);
    const body = await apiFetch(`/vehicles/${vehicle.id}/service-history`);
    setHistory(body.history);
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Service History" description="Search by vehicle registration number, customer mobile, or customer name." />

      <form onSubmit={handleSearch} className="flex max-w-md gap-2">
        <Input placeholder="e.g. HR06AB1234, 9876543210, or Ramesh" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="secondary">
          <Search className="h-4 w-4" /> Search
        </Button>
      </form>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}

      {!selectedVehicle && vehicles.length > 1 && (
        <div>
          <p className="mb-2 text-sm text-gray-500">Multiple vehicles matched — pick one:</p>
          <ul className="max-w-md divide-y divide-gray-200 rounded-lg border border-gray-200 text-sm">
            {vehicles.map((v) => (
              <li key={v.id}>
                <button onClick={() => selectVehicle(v)} className="block w-full px-3 py-2 text-left hover:bg-gray-50">
                  {v.registrationNumber} — {v.make} {v.model} ({v.customer.name}, {v.customer.mobile})
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && vehicles.length === 0 && q && (
        <EmptyState icon={History} title="No matching vehicle or customer found" />
      )}

      {selectedVehicle && (
        <div>
          <h2 className="mb-1 text-base font-semibold text-gray-900">
            {selectedVehicle.registrationNumber} — {selectedVehicle.make} {selectedVehicle.model}
          </h2>
          <p className="mb-3 text-sm text-gray-500">
            {selectedVehicle.customer.name} · {selectedVehicle.customer.mobile}
          </p>

          {history.length === 0 ? (
            <EmptyState icon={History} title="No service history for this vehicle yet" />
          ) : (
            <Table minWidth={700}>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>KM</Th>
                  <Th>Complaint / Work</Th>
                  <Th>Status</Th>
                  <Th>Amount</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <Tr key={h.id}>
                    <Td>{new Date(h.createdAt).toLocaleDateString()}</Td>
                    <Td>{h.kmAtService ?? "-"}</Td>
                    <Td>{h.complaint ?? h.requiredWork ?? "-"}</Td>
                    <Td>
                      <JobCardStatusBadge status={h.status} label={STATUS_LABELS[h.status] ?? h.status} />
                    </Td>
                    <Td className="font-medium text-gray-900">
                      {h.invoice ? `₹${h.invoice.totalAmount}` : `₹${h.grandTotal.toFixed(2)}`}
                    </Td>
                    <Td>
                      <Link
                        href={h.invoice ? `/dashboard/invoices/${h.invoice.id}` : `/dashboard/jobcards/${h.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {h.invoice ? "View invoice" : "View job card"}
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}

export default function ServiceHistoryPage() {
  return (
    <RequireAuth permission="JOB_CARDS">
      <ServiceHistoryPageContent />
    </RequireAuth>
  );
}
