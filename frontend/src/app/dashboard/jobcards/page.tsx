"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";

interface VehicleOption {
  id: number;
  registrationNumber: string;
  make: string;
  model: string;
  customer: { name: string };
}

interface JobCardRow {
  id: number;
  jobCardNumber: string;
  status: string;
  createdAt: string;
  vehicle: { registrationNumber: string; make: string; model: string; customer: { name: string } };
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

function JobCardsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillVehicleId = searchParams.get("vehicleId");
  const prefillStatus = searchParams.get("status") ?? "";

  const [jobCards, setJobCards] = useState<JobCardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(prefillStatus);
  const [q, setQ] = useState("");

  const [showForm, setShowForm] = useState(!!prefillVehicleId);
  const [vehicleQuery, setVehicleQuery] = useState("");
  const [vehicleResults, setVehicleResults] = useState<VehicleOption[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption | null>(null);
  const [km, setKm] = useState("");
  const [complaint, setComplaint] = useState("");
  const [requiredWork, setRequiredWork] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load(status: string, query: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (query) params.set("q", query);
    const body = await apiFetch(`/job-cards?${params.toString()}`);
    setJobCards(body.jobCards);
    setLoading(false);
  }

  useEffect(() => {
    load(prefillStatus, "");
    if (prefillVehicleId) {
      apiFetch(`/vehicles/${prefillVehicleId}`).then((body) => setSelectedVehicle(body.vehicle));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFilter(e: FormEvent) {
    e.preventDefault();
    await load(statusFilter, q);
  }

  async function searchVehicles() {
    if (!vehicleQuery.trim()) return;
    const body = await apiFetch(`/vehicles?q=${encodeURIComponent(vehicleQuery)}`);
    setVehicleResults(body.vehicles);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!selectedVehicle) {
      setFormError("Search and select a vehicle");
      return;
    }
    setSubmitting(true);
    try {
      const body = await apiFetch("/job-cards", {
        method: "POST",
        body: JSON.stringify({
          vehicleId: selectedVehicle.id,
          kmAtService: km || undefined,
          complaint: complaint || undefined,
          requiredWork: requiredWork || undefined,
        }),
      });
      router.push(`/dashboard/jobcards/${body.jobCard.id}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create job card");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Job Cards</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          {showForm ? "Cancel" : "+ New job card"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="max-w-lg space-y-3 rounded-md border border-gray-200 p-4">
          <div>
            <div className="flex gap-2">
              <input
                placeholder="Search vehicle by registration number"
                value={vehicleQuery}
                onChange={(e) => setVehicleQuery(e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={searchVehicles}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm"
              >
                Search
              </button>
            </div>
            {selectedVehicle ? (
              <p className="mt-2 text-sm">
                Selected: <strong>{selectedVehicle.registrationNumber}</strong> —{" "}
                {selectedVehicle.make} {selectedVehicle.model} ({selectedVehicle.customer.name})
              </p>
            ) : (
              vehicleResults.length > 0 && (
                <ul className="mt-2 max-h-40 overflow-y-auto rounded-md border border-gray-200 text-sm">
                  {vehicleResults.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedVehicle(v);
                          setVehicleResults([]);
                        }}
                        className="block w-full px-3 py-2 text-left hover:bg-gray-50"
                      >
                        {v.registrationNumber} — {v.make} {v.model} ({v.customer.name})
                      </button>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>

          <input
            type="number"
            placeholder="Current KM"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Customer complaint"
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            rows={2}
          />
          <textarea
            placeholder="Required work"
            value={requiredWork}
            onChange={(e) => setRequiredWork(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            rows={2}
          />

          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create job card"}
          </button>
        </form>
      )}

      <form onSubmit={handleFilter} className="flex flex-wrap gap-2">
        <input
          placeholder="Search by job card # or vehicle number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-w-[220px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-gray-300 px-4 py-2 text-sm">
          Filter
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : jobCards.length === 0 ? (
        <p className="text-sm text-gray-500">No job cards found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] border-collapse overflow-hidden rounded-md border border-gray-200 text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-3 py-2">Job Card #</th>
                <th className="px-3 py-2">Vehicle</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {jobCards.map((jc) => (
                <tr key={jc.id} className="border-t border-gray-200">
                  <td className="px-3 py-2">
                    <Link
                      href={`/dashboard/jobcards/${jc.id}`}
                      className="font-mono text-gray-900 underline hover:no-underline"
                    >
                      {jc.jobCardNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {jc.vehicle.registrationNumber} ({jc.vehicle.make} {jc.vehicle.model})
                  </td>
                  <td className="px-3 py-2">{jc.vehicle.customer.name}</td>
                  <td className="px-3 py-2">{STATUS_LABELS[jc.status] ?? jc.status}</td>
                  <td className="px-3 py-2">{new Date(jc.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function JobCardsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Loading...</p>}>
      <JobCardsPageContent />
    </Suspense>
  );
}
