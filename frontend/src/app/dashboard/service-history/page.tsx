"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

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

export default function ServiceHistoryPage() {
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
      <div>
        <h1 className="text-lg font-semibold">Service History</h1>
        <p className="text-sm text-gray-500">
          Search by vehicle registration number, customer mobile, or customer name.
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex max-w-md gap-2">
        <input
          placeholder="e.g. HR06AB1234, 9876543210, or Ramesh"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md border border-gray-300 px-4 py-2 text-sm">
          Search
        </button>
      </form>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}

      {!selectedVehicle && vehicles.length > 1 && (
        <div>
          <p className="mb-2 text-sm text-gray-500">Multiple vehicles matched — pick one:</p>
          <ul className="max-w-md divide-y divide-gray-200 rounded-md border border-gray-200 text-sm">
            {vehicles.map((v) => (
              <li key={v.id}>
                <button
                  onClick={() => selectVehicle(v)}
                  className="block w-full px-3 py-2 text-left hover:bg-gray-50"
                >
                  {v.registrationNumber} — {v.make} {v.model} ({v.customer.name},{" "}
                  {v.customer.mobile})
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && vehicles.length === 0 && q && (
        <p className="text-sm text-gray-500">No matching vehicle or customer found.</p>
      )}

      {selectedVehicle && (
        <div>
          <h2 className="mb-1 text-base font-semibold">
            {selectedVehicle.registrationNumber} — {selectedVehicle.make} {selectedVehicle.model}
          </h2>
          <p className="mb-3 text-sm text-gray-500">
            {selectedVehicle.customer.name} · {selectedVehicle.customer.mobile}
          </p>

          {history.length === 0 ? (
            <p className="text-sm text-gray-500">No service history for this vehicle yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse overflow-hidden rounded-md border border-gray-200 text-sm">
                <thead className="bg-gray-100 text-left">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">KM</th>
                    <th className="px-3 py-2">Complaint / Work</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-t border-gray-200">
                      <td className="px-3 py-2">{new Date(h.createdAt).toLocaleDateString()}</td>
                      <td className="px-3 py-2">{h.kmAtService ?? "-"}</td>
                      <td className="px-3 py-2">{h.complaint ?? h.requiredWork ?? "-"}</td>
                      <td className="px-3 py-2">{STATUS_LABELS[h.status] ?? h.status}</td>
                      <td className="px-3 py-2">
                        {h.invoice ? `₹${h.invoice.totalAmount}` : `₹${h.grandTotal.toFixed(2)}`}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={
                            h.invoice
                              ? `/dashboard/invoices/${h.invoice.id}`
                              : `/dashboard/jobcards/${h.id}`
                          }
                          className="text-gray-900 underline hover:no-underline"
                        >
                          {h.invoice ? "View invoice" : "View job card"}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
