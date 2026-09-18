"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  Video,
  X,
  Search,
  Trash2,
  Pencil,
  FileText,
  Wrench,
  Receipt,
  ClipboardList,
  Calculator,
  UserCog,
  ShieldCheck,
} from "lucide-react";
import { AuthedImage, AuthedVideo } from "@/components/AuthedMedia";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { JobCardStatusBadge, Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";

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
const LOCKED_STATUSES = ["INVOICED", "READY_FOR_DELIVERY", "DELIVERED", "CLOSED", "CANCELLED"];
const POST_INVOICE_STATUSES = ["INVOICED", "READY_FOR_DELIVERY", "DELIVERED", "CLOSED"];

const JOB_TYPE_LABELS: Record<string, string> = {
  GENERAL_SERVICE: "General Service",
  ACCIDENTAL_CLAIM: "Accidental Claim",
  AC: "AC",
  DENT_PAINT: "Dent & Paint",
  MECHANICAL: "Mechanical",
};

const MEDIA_ANGLES = [
  { value: "FRONT", label: "Front" },
  { value: "REAR", label: "Rear" },
  { value: "LEFT", label: "Left" },
  { value: "RIGHT", label: "Right" },
  { value: "ROOF", label: "Roof" },
  { value: "INTERIOR", label: "Interior" },
  { value: "DASHBOARD", label: "Dashboard / KM" },
  { value: "GLOVE_BOX", label: "Glove Box" },
  { value: "BOOT", label: "Boot" },
  { value: "OTHER", label: "Other" },
];
const MANDATORY_ANGLES = ["FRONT", "REAR", "LEFT", "RIGHT"];

interface JobCardDetail {
  id: number;
  jobCardNumber: string;
  status: string;
  jobType: string | null;
  kmAtService: number | null;
  complaint: string | null;
  requiredWork: string | null;
  expectedDelivery: string | null;
  notes: string | null;
  inspectionFindings: string | null;
  estimateAmount: string | null;
  estimateApproved: boolean | null;
  assignedEmployeeId: number | null;
  assignedEmployee: { id: number; name: string } | null;
  finalInspectionStatus: string | null;
  finalInspectionBy: string | null;
  deliveredAt: string | null;
  createdAt: string;
  vehicle: {
    registrationNumber: string;
    make: string;
    model: string;
    customer: { id: number; name: string; mobile: string };
  };
  media: { id: number; mediaType: string; angle: string | null; phase: string; url: string }[];
  parts: {
    id: number;
    itemUnitId: number;
    amount: string;
    item: { itemCode: string; name: string; uom: string };
  }[];
  labour: { id: number; description: string; technician: string | null; quantity: number; rate: string; amount: string }[];
  partsTotal: number;
  labourTotal: number;
  grandTotal: number;
  invoice: { id: number; invoiceNumber: string } | null;
}

interface ItemOption {
  id: number;
  itemCode: string;
  name: string;
  uom: string;
  currentStock: number;
}

interface UnitOption {
  id: number;
  status: string;
}

interface Employee {
  id: number;
  name: string;
  role: string | null;
}

function SectionHeading({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
      <Icon className="h-4 w-4 text-gray-400" />
      {children}
    </h2>
  );
}

function JobCardDetailPageContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [jobCard, setJobCard] = useState<JobCardDetail | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const [discount, setDiscount] = useState("0");
  const [generatingInvoice, setGeneratingInvoice] = useState(false);

  const [editingDetails, setEditingDetails] = useState(false);
  const [jobType, setJobType] = useState("");
  const [km, setKm] = useState("");
  const [complaint, setComplaint] = useState("");
  const [requiredWork, setRequiredWork] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [notes, setNotes] = useState("");

  const [findings, setFindings] = useState("");
  const [savingFindings, setSavingFindings] = useState(false);

  const [estimateAmount, setEstimateAmount] = useState("");
  const [savingEstimate, setSavingEstimate] = useState(false);

  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [savingAssignment, setSavingAssignment] = useState(false);

  const [finalStatus, setFinalStatus] = useState("");
  const [finalBy, setFinalBy] = useState("");
  const [savingFinal, setSavingFinal] = useState(false);

  const [partMode, setPartMode] = useState<"serial" | "browse">("serial");
  const [serialInput, setSerialInput] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [itemResults, setItemResults] = useState<ItemOption[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemOption | null>(null);
  const [availableUnits, setAvailableUnits] = useState<UnitOption[]>([]);
  const [chosenUnitId, setChosenUnitId] = useState("");
  const [addingPart, setAddingPart] = useState(false);

  const [labourDesc, setLabourDesc] = useState("");
  const [labourTech, setLabourTech] = useState("");
  const [labourQty, setLabourQty] = useState("1");
  const [labourRate, setLabourRate] = useState("");

  const [uploadPhase, setUploadPhase] = useState<"BEFORE" | "AFTER">("BEFORE");
  const [uploadingAngle, setUploadingAngle] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const body = await apiFetch(`/job-cards/${id}`);
    setJobCard(body.jobCard);
    setJobType(body.jobCard.jobType ?? "");
    setKm(body.jobCard.kmAtService?.toString() ?? "");
    setComplaint(body.jobCard.complaint ?? "");
    setRequiredWork(body.jobCard.requiredWork ?? "");
    setExpectedDelivery(body.jobCard.expectedDelivery ? body.jobCard.expectedDelivery.slice(0, 10) : "");
    setNotes(body.jobCard.notes ?? "");
    setFindings(body.jobCard.inspectionFindings ?? "");
    setEstimateAmount(body.jobCard.estimateAmount ?? "");
    setAssignEmployeeId(body.jobCard.assignedEmployeeId?.toString() ?? "");
    setFinalStatus(body.jobCard.finalInspectionStatus ?? "");
    setFinalBy(body.jobCard.finalInspectionBy ?? "");
    setLoading(false);
  }

  useEffect(() => {
    load();
    apiFetch("/employees?pageSize=100").then((body) => setEmployees(body.employees));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const locked = jobCard ? LOCKED_STATUSES.includes(jobCard.status) || !!jobCard.invoice : false;

  async function handleStatusChange(status: string) {
    setActionError(null);
    try {
      await apiFetch(`/job-cards/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not change status");
    }
  }

  async function handleSaveDetails(e: FormEvent) {
    e.preventDefault();
    await apiFetch(`/job-cards/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        jobType: jobType || undefined,
        kmAtService: km || undefined,
        complaint: complaint || undefined,
        requiredWork: requiredWork || undefined,
        expectedDelivery: expectedDelivery || undefined,
        notes: notes || undefined,
      }),
    });
    setEditingDetails(false);
    await load();
  }

  async function handleSaveFindings(e: FormEvent) {
    e.preventDefault();
    setSavingFindings(true);
    try {
      await apiFetch(`/job-cards/${id}`, { method: "PATCH", body: JSON.stringify({ inspectionFindings: findings }) });
      await load();
    } finally {
      setSavingFindings(false);
    }
  }

  async function handleEstimateApproval(approved: boolean) {
    setSavingEstimate(true);
    setActionError(null);
    try {
      await apiFetch(`/job-cards/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ estimateAmount: estimateAmount ? Number(estimateAmount) : undefined, estimateApproved: approved }),
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not save estimate");
    } finally {
      setSavingEstimate(false);
    }
  }

  async function handleSaveEstimateAmount(e: FormEvent) {
    e.preventDefault();
    setSavingEstimate(true);
    try {
      await apiFetch(`/job-cards/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ estimateAmount: Number(estimateAmount) }),
      });
      await load();
    } finally {
      setSavingEstimate(false);
    }
  }

  async function handleAssignEmployee(e: FormEvent) {
    e.preventDefault();
    setSavingAssignment(true);
    setActionError(null);
    try {
      await apiFetch(`/job-cards/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ assignedEmployeeId: Number(assignEmployeeId) }),
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not assign employee");
    } finally {
      setSavingAssignment(false);
    }
  }

  async function handleSaveFinalInspection(e: FormEvent) {
    e.preventDefault();
    setSavingFinal(true);
    setActionError(null);
    try {
      await apiFetch(`/job-cards/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ finalInspectionStatus: finalStatus, finalInspectionBy: finalBy || undefined }),
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not save final inspection");
    } finally {
      setSavingFinal(false);
    }
  }

  async function searchItems() {
    if (!itemQuery.trim()) return;
    const body = await apiFetch(`/items?q=${encodeURIComponent(itemQuery)}`);
    setItemResults(body.items);
  }

  async function selectItemForParts(it: ItemOption) {
    setSelectedItem(it);
    setItemResults([]);
    setChosenUnitId("");
    const body = await apiFetch(`/items/${it.id}/available-units`);
    setAvailableUnits(body.units);
  }

  async function handleAddPart(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    const itemUnitId = partMode === "serial" ? Number(serialInput) : Number(chosenUnitId);
    if (!itemUnitId) {
      setActionError(partMode === "serial" ? "Enter a serial number" : "Search for an item and pick a serial");
      return;
    }
    setAddingPart(true);
    try {
      await apiFetch(`/job-cards/${id}/parts`, {
        method: "POST",
        body: JSON.stringify({ itemUnitId }),
      });
      setSerialInput("");
      setSelectedItem(null);
      setItemQuery("");
      setAvailableUnits([]);
      setChosenUnitId("");
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not add part");
    } finally {
      setAddingPart(false);
    }
  }

  async function handleRemovePart(partId: number) {
    setActionError(null);
    try {
      await apiFetch(`/job-cards/${id}/parts/${partId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not remove part");
    }
  }

  async function handleAddLabour(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    try {
      await apiFetch(`/job-cards/${id}/labour`, {
        method: "POST",
        body: JSON.stringify({
          description: labourDesc,
          technician: labourTech || undefined,
          quantity: Number(labourQty) || 1,
          rate: Number(labourRate),
        }),
      });
      setLabourDesc("");
      setLabourTech("");
      setLabourQty("1");
      setLabourRate("");
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not add labour");
    }
  }

  async function handleRemoveLabour(labourId: number) {
    setActionError(null);
    try {
      await apiFetch(`/job-cards/${id}/labour/${labourId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not remove labour");
    }
  }

  async function handleUploadMedia(angle: string, mediaType: "PHOTO" | "VIDEO", file: File) {
    setActionError(null);
    setUploadingAngle(angle);
    try {
      const formData = new FormData();
      formData.set("mediaType", mediaType);
      formData.set("angle", angle);
      formData.set("phase", uploadPhase);
      formData.set("file", file);
      await apiFetch(`/job-cards/${id}/media`, { method: "POST", body: formData });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not upload media");
    } finally {
      setUploadingAngle(null);
    }
  }

  async function handleRemoveMedia(mediaId: number) {
    await apiFetch(`/job-cards/${id}/media/${mediaId}`, { method: "DELETE" });
    await load();
  }

  async function handleGenerateInvoice(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setGeneratingInvoice(true);
    try {
      const body = await apiFetch(`/job-cards/${id}/invoice`, {
        method: "POST",
        body: JSON.stringify({ discount: Number(discount) || 0 }),
      });
      router.push(`/dashboard/invoices/${body.invoice.id}`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not generate invoice");
      setGeneratingInvoice(false);
    }
  }

  if (loading || !jobCard) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const coveredAngles = new Set(
    jobCard.media.filter((m) => m.phase === uploadPhase && m.mediaType === "PHOTO").map((m) => m.angle)
  );

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard/jobcards" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> All job cards
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-mono text-lg font-semibold text-gray-900">{jobCard.jobCardNumber}</h1>
            <p className="text-sm text-gray-600">
              {jobCard.vehicle.registrationNumber} — {jobCard.vehicle.make} {jobCard.vehicle.model} ·{" "}
              <Link href={`/dashboard/customers/${jobCard.vehicle.customer.id}`} className="text-blue-600 hover:underline">
                {jobCard.vehicle.customer.name}
              </Link>
            </p>
          </div>
          <Select
            value={jobCard.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="w-auto"
          >
            {Object.entries(STATUS_LABELS)
              // Once invoiced, the backend refuses anything but a forward move
              // through delivery/closed — matching that here so the dropdown
              // doesn't offer a choice that would just come back as an error.
              .filter(([value]) => !jobCard.invoice || POST_INVOICE_STATUSES.includes(value))
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </Select>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <JobCardStatusBadge status={jobCard.status} label={STATUS_LABELS[jobCard.status]} />
          {jobCard.jobType && <Badge tone="blue">{JOB_TYPE_LABELS[jobCard.jobType] ?? jobCard.jobType}</Badge>}
          {jobCard.expectedDelivery && (
            <span className="text-sm text-gray-500">
              Expected delivery: {new Date(jobCard.expectedDelivery).toLocaleDateString()}
            </span>
          )}
          {locked && <span className="text-sm text-amber-700">Parts and labour can no longer be changed.</span>}
        </div>
      </div>

      {actionError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}

      {/* Details */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <SectionHeading icon={FileText}>Details</SectionHeading>
          <Button size="sm" variant="ghost" onClick={() => setEditingDetails((v) => !v)}>
            <Pencil className="h-3.5 w-3.5" /> {editingDetails ? "Cancel" : "Edit"}
          </Button>
        </div>
        <Card className="max-w-lg">
          <CardBody>
            {editingDetails ? (
              <form onSubmit={handleSaveDetails} className="space-y-3">
                <div>
                  <Label>Job type</Label>
                  <Select value={jobType} onChange={(e) => setJobType(e.target.value)}>
                    <option value="">Select...</option>
                    {Object.entries(JOB_TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Current KM</Label>
                  <Input type="number" value={km} onChange={(e) => setKm(e.target.value)} />
                </div>
                <div>
                  <Label>Customer complaint</Label>
                  <Textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={2} />
                </div>
                <div>
                  <Label>Required work</Label>
                  <Textarea value={requiredWork} onChange={(e) => setRequiredWork(e.target.value)} rows={2} />
                </div>
                <div>
                  <Label>Expected delivery</Label>
                  <Input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                </div>
                <Button type="submit">Save</Button>
              </form>
            ) : (
              <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
                <dt className="text-gray-500">Job type</dt>
                <dd className="col-span-2 text-gray-900">{jobCard.jobType ? JOB_TYPE_LABELS[jobCard.jobType] : "-"}</dd>
                <dt className="text-gray-500">KM</dt>
                <dd className="col-span-2 text-gray-900">{jobCard.kmAtService ?? "-"}</dd>
                <dt className="text-gray-500">Complaint</dt>
                <dd className="col-span-2 text-gray-900">{jobCard.complaint ?? "-"}</dd>
                <dt className="text-gray-500">Required work</dt>
                <dd className="col-span-2 text-gray-900">{jobCard.requiredWork ?? "-"}</dd>
                <dt className="text-gray-500">Expected delivery</dt>
                <dd className="col-span-2 text-gray-900">
                  {jobCard.expectedDelivery ? new Date(jobCard.expectedDelivery).toLocaleDateString() : "-"}
                </dd>
                <dt className="text-gray-500">Notes</dt>
                <dd className="col-span-2 text-gray-900">{jobCard.notes ?? "-"}</dd>
              </dl>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Initial inspection */}
      <div>
        <SectionHeading icon={ClipboardList}>Initial Inspection</SectionHeading>
        <Card className="max-w-lg">
          <CardBody>
            <form onSubmit={handleSaveFindings} className="space-y-2">
              <Textarea
                placeholder="Findings from the initial inspection..."
                rows={3}
                value={findings}
                onChange={(e) => setFindings(e.target.value)}
              />
              <Button type="submit" size="sm" disabled={savingFindings}>
                {savingFindings ? "Saving..." : "Save findings"}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>

      {/* Estimate & approval */}
      <div>
        <SectionHeading icon={Calculator}>Estimate & Customer Approval</SectionHeading>
        <Card className="max-w-lg">
          <CardBody>
            <div className="flex flex-wrap items-center gap-3">
              <form onSubmit={handleSaveEstimateAmount} className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Estimate amount"
                  value={estimateAmount}
                  onChange={(e) => setEstimateAmount(e.target.value)}
                  className="w-40"
                />
                <Button type="submit" size="sm" variant="secondary" disabled={savingEstimate}>
                  Save
                </Button>
              </form>
              {jobCard.estimateApproved === true ? (
                <Badge tone="green">Approved</Badge>
              ) : jobCard.estimateApproved === false ? (
                <Badge tone="red">Rejected</Badge>
              ) : (
                <Badge tone="amber">Pending decision</Badge>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => handleEstimateApproval(true)} disabled={savingEstimate}>
                Customer approved
              </Button>
              <Button size="sm" variant="secondary" onClick={() => handleEstimateApproval(false)} disabled={savingEstimate}>
                Customer rejected
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Work assignment */}
      <div>
        <SectionHeading icon={UserCog}>Work Assignment</SectionHeading>
        <Card className="max-w-lg">
          <CardBody>
            <form onSubmit={handleAssignEmployee} className="flex flex-wrap items-center gap-2">
              <Select value={assignEmployeeId} onChange={(e) => setAssignEmployeeId(e.target.value)} className="w-auto">
                <option value="">Select employee...</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.role ? ` (${e.role})` : ""}
                  </option>
                ))}
              </Select>
              <Button type="submit" size="sm" disabled={savingAssignment || !assignEmployeeId}>
                Assign
              </Button>
              {jobCard.assignedEmployee && (
                <span className="text-sm text-gray-600">Currently: {jobCard.assignedEmployee.name}</span>
              )}
            </form>
          </CardBody>
        </Card>
      </div>

      {/* Inspection media */}
      <div>
        <SectionHeading icon={Camera}>Vehicle Inspection Photos</SectionHeading>
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => setUploadPhase("BEFORE")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${uploadPhase === "BEFORE" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
          >
            Before work
          </button>
          <button
            type="button"
            onClick={() => setUploadPhase("AFTER")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${uploadPhase === "AFTER" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
          >
            After work
          </button>
        </div>
        <p className="mb-2 text-xs text-gray-500">
          Front, Rear, Left and Right are mandatory for each phase before the job card's status can move forward.
        </p>
        <div className="flex flex-wrap gap-2">
          {MEDIA_ANGLES.map((a) => {
            const covered = coveredAngles.has(a.value);
            const mandatory = MANDATORY_ANGLES.includes(a.value);
            return (
              <label
                key={a.value}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-gray-50 ${
                  covered ? "border-green-300 bg-green-50 text-green-800" : "border-gray-300 bg-white text-gray-700"
                }`}
              >
                <Camera className="h-3.5 w-3.5" />
                {uploadingAngle === a.value ? "Uploading..." : a.label}
                {mandatory && !covered && <span className="text-red-500">*</span>}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadMedia(a.value, "PHOTO", file);
                    e.target.value = "";
                  }}
                />
              </label>
            );
          })}
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            <Video className="h-3.5 w-3.5" />
            {uploadingAngle === "WALKAROUND" ? "Uploading..." : "360° Walk-around video"}
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUploadMedia("WALKAROUND", "VIDEO", file);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        {jobCard.media.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {jobCard.media
              .filter((m) => m.phase === uploadPhase)
              .map((m) => (
                <div key={m.id} className="relative">
                  {m.mediaType === "PHOTO" ? (
                    <AuthedImage src={m.url} alt={m.angle ?? "photo"} className="h-20 w-20 rounded-lg object-cover" />
                  ) : (
                    <AuthedVideo src={m.url} className="h-20 w-32 rounded-lg" />
                  )}
                  <button
                    onClick={() => handleRemoveMedia(m.id)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-red-600 shadow ring-1 ring-gray-200 hover:bg-red-50"
                    title="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Parts */}
      <div>
        <SectionHeading icon={Wrench}>Parts</SectionHeading>
        {!locked && (
          <Card className="mb-3 max-w-lg">
            <CardBody>
              <div className="mb-2 flex gap-4 text-sm text-gray-700">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={partMode === "serial"} onChange={() => setPartMode("serial")} />
                  Enter serial number
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={partMode === "browse"} onChange={() => setPartMode("browse")} />
                  Browse by item
                </label>
              </div>
              <form onSubmit={handleAddPart} className="space-y-2">
                {partMode === "serial" ? (
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Serial number (from the part's sticker)"
                      value={serialInput}
                      onChange={(e) => setSerialInput(e.target.value)}
                      className="flex-1"
                    />
                    <Button type="submit" disabled={addingPart}>
                      Add part
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Search item code, name or part number"
                        value={itemQuery}
                        onChange={(e) => setItemQuery(e.target.value)}
                        className="flex-1"
                      />
                      <Button type="button" variant="secondary" onClick={searchItems}>
                        <Search className="h-4 w-4" /> Search
                      </Button>
                    </div>
                    {selectedItem ? (
                      <div className="space-y-2">
                        <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
                          Selected: <strong>{selectedItem.itemCode}</strong> — {selectedItem.name} ({availableUnits.length}{" "}
                          in stock)
                        </p>
                        {availableUnits.length > 0 ? (
                          <div className="flex gap-2">
                            <Select value={chosenUnitId} onChange={(e) => setChosenUnitId(e.target.value)} className="flex-1">
                              <option value="">Select a serial...</option>
                              {availableUnits.map((u) => (
                                <option key={u.id} value={u.id}>
                                  Serial #{u.id}
                                </option>
                              ))}
                            </Select>
                            <Button type="submit" disabled={addingPart || !chosenUnitId}>
                              Add part
                            </Button>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">No units in stock for this item.</p>
                        )}
                      </div>
                    ) : (
                      itemResults.length > 0 && (
                        <ul className="max-h-40 overflow-y-auto rounded-md border border-gray-200 text-sm">
                          {itemResults.map((it) => (
                            <li key={it.id}>
                              <button
                                type="button"
                                onClick={() => selectItemForParts(it)}
                                className="block w-full px-3 py-2 text-left hover:bg-gray-50"
                              >
                                {it.itemCode} — {it.name} (stock: {it.currentStock})
                              </button>
                            </li>
                          ))}
                        </ul>
                      )
                    )}
                  </>
                )}
              </form>
            </CardBody>
          </Card>
        )}

        {jobCard.parts.length === 0 ? (
          <p className="text-sm text-gray-500">No parts added yet.</p>
        ) : (
          <Table minWidth={550}>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Serial No.</Th>
                <Th>Amount</Th>
                {!locked && <Th></Th>}
              </tr>
            </thead>
            <tbody>
              {jobCard.parts.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    {p.item.itemCode} — {p.item.name}
                  </Td>
                  <Td className="font-mono">#{p.itemUnitId}</Td>
                  <Td>₹{p.amount}</Td>
                  {!locked && (
                    <Td>
                      <button onClick={() => handleRemovePart(p.id)} className="text-red-600 hover:text-red-700" title="Remove">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {/* Labour */}
      <div>
        <SectionHeading icon={Wrench}>Labour / Services</SectionHeading>
        {!locked && (
          <Card className="mb-3 max-w-2xl">
            <CardBody>
              <form onSubmit={handleAddLabour} className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                <Input
                  placeholder="Description"
                  required
                  value={labourDesc}
                  onChange={(e) => setLabourDesc(e.target.value)}
                  className="sm:col-span-2"
                />
                <Input placeholder="Technician (optional)" value={labourTech} onChange={(e) => setLabourTech(e.target.value)} />
                <Input type="number" min={1} placeholder="Qty" value={labourQty} onChange={(e) => setLabourQty(e.target.value)} />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Rate"
                  required
                  value={labourRate}
                  onChange={(e) => setLabourRate(e.target.value)}
                />
                <Button type="submit" className="sm:col-span-5">
                  Add labour
                </Button>
              </form>
            </CardBody>
          </Card>
        )}

        {jobCard.labour.length === 0 ? (
          <p className="text-sm text-gray-500">No labour entries yet.</p>
        ) : (
          <Table minWidth={550}>
            <thead>
              <tr>
                <Th>Description</Th>
                <Th>Technician</Th>
                <Th>Qty</Th>
                <Th>Rate</Th>
                <Th>Amount</Th>
                {!locked && <Th></Th>}
              </tr>
            </thead>
            <tbody>
              {jobCard.labour.map((l) => (
                <Tr key={l.id}>
                  <Td>{l.description}</Td>
                  <Td>{l.technician ?? "-"}</Td>
                  <Td>{l.quantity}</Td>
                  <Td>₹{l.rate}</Td>
                  <Td>₹{l.amount}</Td>
                  {!locked && (
                    <Td>
                      <button onClick={() => handleRemoveLabour(l.id)} className="text-red-600 hover:text-red-700" title="Remove">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {/* Final inspection */}
      <div>
        <SectionHeading icon={ShieldCheck}>Final Inspection Sign-off</SectionHeading>
        <Card className="max-w-lg">
          <CardBody>
            <form onSubmit={handleSaveFinalInspection} className="space-y-2">
              <div className="flex gap-4 text-sm text-gray-700">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={finalStatus === "DONE"} onChange={() => setFinalStatus("DONE")} />
                  Done
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={finalStatus === "NOT_DONE"} onChange={() => setFinalStatus("NOT_DONE")} />
                  Not done
                </label>
              </div>
              <Input placeholder="Inspected by" value={finalBy} onChange={(e) => setFinalBy(e.target.value)} />
              <Button type="submit" size="sm" disabled={savingFinal || !finalStatus}>
                {savingFinal ? "Saving..." : "Save"}
              </Button>
              {jobCard.finalInspectionStatus && (
                <p className="text-xs text-gray-500">
                  Current: {jobCard.finalInspectionStatus === "DONE" ? "Done" : "Not done"}
                  {jobCard.finalInspectionBy ? ` by ${jobCard.finalInspectionBy}` : ""}
                </p>
              )}
            </form>
          </CardBody>
        </Card>
      </div>

      {/* Summary */}
      <Card className="max-w-sm">
        <CardBody>
          <div className="flex justify-between py-1 text-sm">
            <span className="text-gray-500">Parts total</span>
            <span className="text-gray-900">₹{jobCard.partsTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between py-1 text-sm">
            <span className="text-gray-500">Labour total</span>
            <span className="text-gray-900">₹{jobCard.labourTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-200 py-2 text-base font-semibold text-gray-900">
            <span>Grand total</span>
            <span>₹{jobCard.grandTotal.toFixed(2)}</span>
          </div>

          <div className="mt-3 border-t border-gray-200 pt-3">
            {jobCard.invoice ? (
              <Link
                href={`/dashboard/invoices/${jobCard.invoice.id}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
              >
                <Receipt className="h-4 w-4" /> View invoice {jobCard.invoice.invoiceNumber}
              </Link>
            ) : jobCard.status === "COMPLETED" ? (
              <form onSubmit={handleGenerateInvoice} className="space-y-2">
                <Label>Discount (optional)</Label>
                <Input type="number" step="0.01" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} />
                <Button type="submit" disabled={generatingInvoice} className="w-full">
                  {generatingInvoice ? "Generating..." : "Generate invoice"}
                </Button>
              </form>
            ) : (
              <p className="text-xs text-gray-500">Mark this job card as Completed to generate an invoice.</p>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export default function JobCardDetailPage() {
  return (
    <RequireAuth permission="JOB_CARDS">
      <JobCardDetailPageContent />
    </RequireAuth>
  );
}
