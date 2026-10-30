"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, ClipboardList, Car } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { JobCardStatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { JOB_CARD_STATUS_LABELS } from "@/lib/jobCardStatus";

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

const STATUS_LABELS = JOB_CARD_STATUS_LABELS;

const JOB_TYPE_LABELS: Record<string, string> = {
  GENERAL_SERVICE: "General Service",
  ACCIDENTAL_CLAIM: "Accidental Claim",
  AC: "AC",
  DENT_PAINT: "Dent & Paint",
  MECHANICAL: "Mechanical",
};

interface JobCardDraft {
  jobType: string;
  km: string;
  complaint: string;
  requiredWork: string;
  expectedDelivery: string;
  insuranceCompany?: string;
  claimNumber?: string;
}

function draftKey(vehicleId: number): string {
  return `mm_jobcard_draft_${vehicleId}`;
}

function readDraft(vehicleId: number): JobCardDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(vehicleId));
    return raw ? (JSON.parse(raw) as JobCardDraft) : null;
  } catch {
    return null;
  }
}

function JobCardsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillVehicleId = searchParams.get("vehicleId");
  const prefillStatus = searchParams.get("status") ?? "";

  const [jobCards, setJobCards] = useState<JobCardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(prefillStatus);
  const [q, setQ] = useState("");

  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption | null>(null);
  const [jobType, setJobType] = useState("");
  const [km, setKm] = useState("");
  const [complaint, setComplaint] = useState("");
  const [requiredWork, setRequiredWork] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [insuranceCompany, setInsuranceCompany] = useState("");
  const [claimNumber, setClaimNumber] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ id: number; jobCardNumber: string; registrationNumber: string } | null>(null);

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
      apiFetch(`/vehicles/${prefillVehicleId}`).then((body) => {
        setSelectedVehicle(body.vehicle);
        // Bring back anything typed for this vehicle before (see below).
        const draft = readDraft(body.vehicle.id);
        if (draft) {
          setJobType(draft.jobType);
          setKm(draft.km);
          setComplaint(draft.complaint);
          setRequiredWork(draft.requiredWork);
          setExpectedDelivery(draft.expectedDelivery);
          setInsuranceCompany(draft.insuranceCompany ?? "");
          setClaimNumber(draft.claimNumber ?? "");
          setDraftRestored(true);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save the new job card form as it's filled: kept on this device per
  // vehicle until the job card is created, so nothing typed is lost if the
  // page is left or reloaded.
  const [draftRestored, setDraftRestored] = useState(false);
  useEffect(() => {
    if (!selectedVehicle) return;
    const draft = { jobType, km, complaint, requiredWork, expectedDelivery, insuranceCompany, claimNumber };
    const empty = Object.values(draft).every((v) => v === "");
    try {
      if (empty) window.localStorage.removeItem(draftKey(selectedVehicle.id));
      else window.localStorage.setItem(draftKey(selectedVehicle.id), JSON.stringify(draft));
    } catch {
      // Storage unavailable (private mode) — the form still works, just unsaved.
    }
  }, [selectedVehicle, jobType, km, complaint, requiredWork, expectedDelivery, insuranceCompany, claimNumber]);

  async function handleFilter(e: FormEvent) {
    e.preventDefault();
    await load(statusFilter, q);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!selectedVehicle) {
      setFormError("No vehicle selected — go to the Vehicles page and use its \"New job card\" action.");
      return;
    }
    setSubmitting(true);
    setCreated(null);
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
          ...(jobType === "ACCIDENTAL_CLAIM"
            ? { insuranceCompany: insuranceCompany.trim() || undefined, claimNumber: claimNumber.trim() || undefined }
            : {}),
        }),
      });
      // Back to the plain list, with the new job card at the top and a link
      // to open it. The vehicleId is dropped from the URL so a reload doesn't
      // reopen the form.
      setCreated({
        id: body.jobCard.id,
        jobCardNumber: body.jobCard.jobCardNumber,
        registrationNumber: selectedVehicle.registrationNumber,
      });
      try {
        window.localStorage.removeItem(draftKey(selectedVehicle.id));
      } catch {
        // ignore
      }
      setDraftRestored(false);
      setSelectedVehicle(null);
      setJobType("");
      setKm("");
      setComplaint("");
      setRequiredWork("");
      setExpectedDelivery("");
      setInsuranceCompany("");
      setClaimNumber("");
      router.replace("/dashboard/jobcards");
      setStatusFilter("");
      setQ("");
      await load("", "");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create job card");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Job Cards"
        description="Track every vehicle from drop-off to invoice."
        action={
          <Link href="/dashboard/vehicles">
            <Button>
              <Car className="h-4 w-4" /> Find or add a vehicle to start
            </Button>
          </Link>
        }
      />

      {created && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          <span>
            Job card <strong>{created.jobCardNumber}</strong> created for {created.registrationNumber}.
          </span>
          <Link href={`/dashboard/jobcards/${created.id}`} className="font-medium text-green-900 hover:underline">
            Open job card →
          </Link>
        </div>
      )}

      {selectedVehicle && (
        <Card className="max-w-lg">
          <CardBody>
            <form onSubmit={handleCreate} className="space-y-3">
              <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
                New job card for <strong>{selectedVehicle.registrationNumber}</strong> — {selectedVehicle.make}{" "}
                {selectedVehicle.model} ({selectedVehicle.customer.name})
              </p>
              <p className="text-xs text-gray-500">
                {draftRestored ? "Restored what you'd already typed. " : ""}Saves automatically as you type, until you create the
                job card.
              </p>

              <Select value={jobType} onChange={(e) => setJobType(e.target.value)}>
                <option value="">Job type (optional)...</option>
                {Object.entries(JOB_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
              {jobType === "ACCIDENTAL_CLAIM" && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="Insurance company (optional)"
                    value={insuranceCompany}
                    onChange={(e) => setInsuranceCompany(e.target.value)}
                  />
                  <Input placeholder="Claim number (optional)" value={claimNumber} onChange={(e) => setClaimNumber(e.target.value)} />
                </div>
              )}
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
          onChange={(e) => setQ(e.target.value.toUpperCase())}
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
    <RequireAuth permission="JOB_CARDS">
      <Suspense fallback={<p className="text-sm text-gray-500">Loading...</p>}>
        <JobCardsPageContent />
      </Suspense>
    </RequireAuth>
  );
}
