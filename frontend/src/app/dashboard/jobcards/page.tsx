"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Search, ClipboardList } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { JobCardStatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";

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
  READY_FOR_DELIVERY: "Ready for Delivery",
  DELIVERED: "Delivered",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

const JOB_TYPE_LABELS: Record<string, string> = {
  GENERAL_SERVICE: "General Service",
  ACCIDENTAL_CLAIM: "Accidental Claim",
  AC: "AC",
  DENT_PAINT: "Dent & Paint",
  MECHANICAL: "Mechanical",
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
  const [jobType, setJobType] = useState("");
  const [km, setKm] = useState("");
  const [complaint, setComplaint] = useState("");
  const [requiredWork, setRequiredWork] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
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
          jobType: jobType || undefined,
          kmAtService: km || undefined,
          complaint: complaint || undefined,
          requiredWork: requiredWork || undefined,
          expectedDelivery: expectedDelivery || undefined,
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
      <PageHeader
        title="Job Cards"
        description="Track every vehicle from drop-off to invoice."
        action={
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4" /> New job card
          </Button>
        }
      />

      {showForm && (
        <Card className="max-w-lg">
          <CardBody>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Search vehicle by registration number"
                    value={vehicleQuery}
                    onChange={(e) => setVehicleQuery(e.target.value)}
                    className="flex-1"
                  />
                  <Button type="button" variant="secondary" onClick={searchVehicles}>
                    <Search className="h-4 w-4" /> Search
                  </Button>
                </div>
                {selectedVehicle ? (
                  <p className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
                    Selected: <strong>{selectedVehicle.registrationNumber}</strong> — {selectedVehicle.make}{" "}
                    {selectedVehicle.model} ({selectedVehicle.customer.name})
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

              <Select value={jobType} onChange={(e) => setJobType(e.target.value)}>
                <option value="">Job type (optional)...</option>
                {Object.entries(JOB_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
              <Input type="number" placeholder="Current KM" value={km} onChange={(e) => setKm(e.target.value)} />
              <Textarea placeholder="Customer complaint" value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={2} />
              <Textarea placeholder="Required work" value={requiredWork} onChange={(e) => setRequiredWork(e.target.value)} rows={2} />
              <div>
                <label className="mb-1 block text-xs text-gray-500">Expected delivery (optional)</label>
                <Input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create job card"}
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      <form onSubmit={handleFilter} className="flex flex-wrap gap-2">
        <Input
          placeholder="Search by job card # or vehicle number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-w-[220px] flex-1"
        />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          <Search className="h-4 w-4" /> Filter
        </Button>
      </form>

      {loading ? (
        <TableSkeleton cols={5} />
      ) : jobCards.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No job cards found" description="Try a different filter, or create a new job card." />
      ) : (
        <Table minWidth={650}>
          <thead>
            <tr>
              <Th>Job Card #</Th>
              <Th>Vehicle</Th>
              <Th>Customer</Th>
              <Th>Status</Th>
              <Th>Date</Th>
            </tr>
          </thead>
          <tbody>
            {jobCards.map((jc) => (
              <Tr key={jc.id}>
                <Td className="font-mono">
                  <Link href={`/dashboard/jobcards/${jc.id}`} className="font-medium text-gray-900 hover:text-blue-600 hover:underline">
                    {jc.jobCardNumber}
                  </Link>
                </Td>
                <Td>
                  {jc.vehicle.registrationNumber} ({jc.vehicle.make} {jc.vehicle.model})
                </Td>
                <Td>{jc.vehicle.customer.name}</Td>
                <Td>
                  <JobCardStatusBadge status={jc.status} label={STATUS_LABELS[jc.status] ?? jc.status} />
                </Td>
                <Td>{new Date(jc.createdAt).toLocaleDateString()}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
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
