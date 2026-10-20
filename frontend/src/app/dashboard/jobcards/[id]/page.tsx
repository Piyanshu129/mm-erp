"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useEffect, useRef, useState } from "react";
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
import { apiFetch, ApiError, assetUrl } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { JobCardStatusBadge, Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { JOB_CARD_STATUS_LABELS } from "@/lib/jobCardStatus";
import { compressImage } from "@/lib/compressImage";

const STATUS_LABELS = JOB_CARD_STATUS_LABELS;

// What the job card page auto-saves — blanks become null so clearing a
// field clears it on the server too.
function autoSavePayload(f: {
  jobType: string;
  km: string;
  complaint: string;
  requiredWork: string;
  expectedDelivery: string;
  notes: string;
  findings: string;
}) {
  return {
    jobType: f.jobType || null,
    kmAtService: f.km.trim() === "" ? null : Number(f.km),
    complaint: f.complaint.trim() || null,
    requiredWork: f.requiredWork.trim() || null,
    expectedDelivery: f.expectedDelivery || null,
    notes: f.notes.trim() || null,
    inspectionFindings: f.findings.trim() || null,
  };
}
const LOCKED_STATUSES = ["INVOICED", "CANCELLED"];

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
    quantity: number;
    rate: string;
    amount: string;
    item: { itemCode: string; name: string; uom: string };
  }[];
  labour: { id: number; description: string; technician: string | null; quantity: number; rate: string; amount: string }[];
  partsTotal: number;
  labourTotal: number;
  grandTotal: number;
  invoice: { id: number; invoiceNumber: string; discount: string; paymentAmount: string } | null;
  estimate: {
    id: number;
    estimateNumber: string;
    status: "DRAFT" | "APPROVED";
    approvalPhotoUrl: string | null;
    approvedAt: string | null;
  } | null;
}

interface ItemOption {
  id: number;
  itemCode: string;
  name: string;
  uom: string;
  sellingPrice: string;
  currentStock: number;
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
  // Choosing "Invoiced" opens this confirmation instead of just changing a
  // label — marking a job card Invoiced means generating its draft invoice.
  const [showInvoicePrompt, setShowInvoicePrompt] = useState(false);

  const [jobType, setJobType] = useState("");
  const [km, setKm] = useState("");
  const [complaint, setComplaint] = useState("");
  const [requiredWork, setRequiredWork] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [notes, setNotes] = useState("");

  const [findings, setFindings] = useState("");

  const [creatingEstimate, setCreatingEstimate] = useState(false);

  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [savingAssignment, setSavingAssignment] = useState(false);

  const [finalStatus, setFinalStatus] = useState("");
  const [finalBy, setFinalBy] = useState("");
  const [savingFinal, setSavingFinal] = useState(false);

  // Parts are added by item code (0001) and the quantity used.
  const [codeInput, setCodeInput] = useState("");
  const [partQty, setPartQty] = useState("1");
  const [itemQuery, setItemQuery] = useState("");
  const [itemResults, setItemResults] = useState<ItemOption[]>([]);
  const [addingPart, setAddingPart] = useState(false);

  const [labourDesc, setLabourDesc] = useState("");
  const [labourTech, setLabourTech] = useState("");
  const [labourQty, setLabourQty] = useState("1");
  const [labourRate, setLabourRate] = useState("");

  const [uploadPhase, setUploadPhase] = useState<"BEFORE" | "AFTER">("BEFORE");
  const [uploadingAngle, setUploadingAngle] = useState<string | null>(null);

  // The auto-saved text fields are filled from the server only on the first
  // load — later reloads (after adding a part, a photo, ...) leave what's
  // being typed alone; auto-save keeps the server in step with it.
  const formInitialised = useRef(false);

  async function load() {
    if (!formInitialised.current) setLoading(true);
    const body = await apiFetch(`/job-cards/${id}`);
    const jc = body.jobCard;
    setJobCard(jc);
    if (!formInitialised.current) {
      const fields = {
        jobType: jc.jobType ?? "",
        km: jc.kmAtService?.toString() ?? "",
        complaint: jc.complaint ?? "",
        requiredWork: jc.requiredWork ?? "",
        expectedDelivery: jc.expectedDelivery ? jc.expectedDelivery.slice(0, 10) : "",
        notes: jc.notes ?? "",
        findings: jc.inspectionFindings ?? "",
      };
      setJobType(fields.jobType);
      setKm(fields.km);
      setComplaint(fields.complaint);
      setRequiredWork(fields.requiredWork);
      setExpectedDelivery(fields.expectedDelivery);
      setNotes(fields.notes);
      setFindings(fields.findings);
      lastSavedRef.current = JSON.stringify(autoSavePayload(fields));
      formInitialised.current = true;
    }
    setAssignEmployeeId(jc.assignedEmployeeId?.toString() ?? "");
    setFinalStatus(jc.finalInspectionStatus ?? "");
    setFinalBy(jc.finalInspectionBy ?? "");
    setLoading(false);
  }

  // ---- Auto-save --------------------------------------------------------
  const lastSavedRef = useRef("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const currentPayload = autoSavePayload({ jobType, km, complaint, requiredWork, expectedDelivery, notes, findings });
  const currentPayloadJson = JSON.stringify(currentPayload);

  useEffect(() => {
    if (!formInitialised.current || currentPayloadJson === lastSavedRef.current) return;
    const timer = setTimeout(async () => {
      setSaveState("saving");
      setSaveError(null);
      try {
        await apiFetch(`/job-cards/${id}`, { method: "PATCH", body: currentPayloadJson });
        lastSavedRef.current = currentPayloadJson;
        setSaveState("saved");
        // Keep the header (job type badge, delivery date) in step.
        setJobCard((prev) =>
          prev
            ? {
                ...prev,
                jobType: currentPayload.jobType,
                kmAtService: currentPayload.kmAtService,
                expectedDelivery: currentPayload.expectedDelivery,
              }
            : prev
        );
      } catch (err) {
        setSaveState("error");
        setSaveError(err instanceof ApiError ? err.message : "Could not save");
      }
    }, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPayloadJson, id]);

  useEffect(() => {
    load();
    apiFetch("/employees?pageSize=100").then((body) => setEmployees(body.employees));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // An invoiced job card can be set back to Open to change it; its draft
  // invoice is brought up to date when it's invoiced again.
  const locked = jobCard ? LOCKED_STATUSES.includes(jobCard.status) : false;

  async function handleStatusChange(status: string) {
    setActionError(null);
    // Choosing Invoiced generates the draft invoice right away (or updates
    // the existing one, keeping its discount) and opens it. If something is
    // missing, the server says what (labour line, photos).
    if (status === "INVOICED") {
      setShowInvoicePrompt(false);
      setGeneratingInvoice(true);
      try {
        const body = await apiFetch(`/job-cards/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
        router.push(`/dashboard/invoices/${body.invoice.id}`);
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : "Could not generate the draft invoice");
        setGeneratingInvoice(false);
        await load();
      }
      return;
    }
    setShowInvoicePrompt(false);
    if (
      jobCard?.status === "INVOICED" &&
      status === "OPEN" &&
      !window.confirm(
        `Set ${jobCard.jobCardNumber} back to Open to make changes? Its draft invoice ${jobCard.invoice?.invoiceNumber ?? ""} keeps its number and payments, and is updated when you mark the job card Invoiced again.`
      )
    ) {
      return;
    }
    try {
      await apiFetch(`/job-cards/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not change status");
    }
  }

  // Opens the job card's estimate, creating it (pre-filled from the parts
  // and labour so far) the first time.
  async function openEstimate() {
    if (!jobCard) return;
    if (jobCard.estimate) {
      router.push(`/dashboard/estimates/${jobCard.estimate.id}`);
      return;
    }
    setCreatingEstimate(true);
    setActionError(null);
    try {
      const body = await apiFetch(`/job-cards/${id}/estimate`, { method: "POST" });
      router.push(`/dashboard/estimates/${body.estimate.id}`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not create estimate");
      setCreatingEstimate(false);
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

  async function handleAddPart(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    if (codePreview.state !== "found") {
      setActionError("Enter the item code of an item in inventory");
      return;
    }
    const quantity = Number(partQty);
    if (!Number.isInteger(quantity) || quantity < 1) {
      setActionError("Enter the quantity used — a whole number, at least 1");
      return;
    }
    setAddingPart(true);
    try {
      await apiFetch(`/job-cards/${id}/parts`, {
        method: "POST",
        body: JSON.stringify({ itemId: codePreview.item.id, quantity }),
      });
      setCodeInput("");
      setPartQty("1");
      setItemQuery("");
      setItemResults([]);
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
      // Photos are shrunk before upload (videos go as they are).
      formData.set("file", mediaType === "PHOTO" ? await compressImage(file) : file);
      await apiFetch(`/job-cards/${id}/media`, { method: "POST", body: formData });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not upload media");
    } finally {
      setUploadingAngle(null);
    }
  }

  // Item code typed in → look the item up, so its details and available
  // quantity show before it's added.
  const [codePreview, setCodePreview] = useState<
    { state: "idle" | "loading" | "notfound" } | { state: "found"; item: ItemOption }
  >({ state: "idle" });

  useEffect(() => {
    const code = codeInput.trim();
    if (!/^\d+$/.test(code) || Number(code) === 0) {
      setCodePreview({ state: "idle" });
      return;
    }
    setCodePreview({ state: "loading" });
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const body = await apiFetch(`/item-lookup/${code}`);
        if (!cancelled) setCodePreview({ state: "found", item: body.item });
      } catch {
        if (!cancelled) setCodePreview({ state: "notfound" });
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [codeInput]);

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
      setActionError(err instanceof ApiError ? err.message : "Could not generate the draft invoice");
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

  // What invoicing needs (the backend checks the same): at least one labour
  // line, and the four mandatory photos both before and after the work.
  const missingPhotos = (phase: "BEFORE" | "AFTER") => {
    const have = new Set(jobCard.media.filter((m) => m.phase === phase && m.mediaType === "PHOTO").map((m) => m.angle));
    return MANDATORY_ANGLES.filter((a) => !have.has(a)).map((a) => a.charAt(0) + a.slice(1).toLowerCase());
  };
  const invoiceChecks = [
    { label: "At least one labour / service line", ok: jobCard.labour.length > 0, missing: "" },
    { label: "Before-work photos (Front, Rear, Left, Right)", ok: missingPhotos("BEFORE").length === 0, missing: missingPhotos("BEFORE").join(", ") },
    { label: "After-work photos (Front, Rear, Left, Right)", ok: missingPhotos("AFTER").length === 0, missing: missingPhotos("AFTER").join(", ") },
  ];
  const invoiceReady = invoiceChecks.every((c) => c.ok);

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
          <div>
            <Label>Status</Label>
            {/* An invoiced job card can go back to Open (to change it), but
                one with a draft invoice can't be cancelled. */}
            <Select
              value={showInvoicePrompt || generatingInvoice ? "INVOICED" : jobCard.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={generatingInvoice}
              className="w-auto"
            >
              {Object.entries(STATUS_LABELS)
                .filter(([value]) => !(value === "CANCELLED" && jobCard.invoice))
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </Select>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <JobCardStatusBadge status={jobCard.status} label={STATUS_LABELS[jobCard.status]} />
          {jobCard.jobType && <Badge tone="blue">{JOB_TYPE_LABELS[jobCard.jobType] ?? jobCard.jobType}</Badge>}
          {jobCard.expectedDelivery && (
            <span className="text-sm text-gray-500">
              Expected delivery: {new Date(jobCard.expectedDelivery).toLocaleDateString()}
            </span>
          )}
          {locked && (
            <span className="text-sm text-amber-700">
              {jobCard.status === "INVOICED"
                ? "Invoiced — set the status back to Open to change parts or labour."
                : "Cancelled — set the status back to Open to make changes."}
            </span>
          )}
        </div>
      </div>

      {generatingInvoice && !showInvoicePrompt && (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">Generating the draft invoice...</p>
      )}
      {actionError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}

      {showInvoicePrompt && jobCard.status === "OPEN" && (
        <Card className="max-w-md border-blue-200">
          <CardBody>
            <form onSubmit={handleGenerateInvoice} className="space-y-3">
              <p className="text-base font-semibold text-gray-900">Mark as Invoiced</p>
              <p className="text-sm text-gray-600">
                {jobCard.invoice ? (
                  <>
                    This updates draft invoice {jobCard.invoice.invoiceNumber} to match {jobCard.jobCardNumber} as it is now
                    (same number; payments already received stay on it).
                  </>
                ) : (
                  <>This generates the draft invoice for {jobCard.jobCardNumber}. It will appear in the Draft Invoices tab.</>
                )}{" "}
                To change parts or labour afterwards, set the status back to Open.
              </p>
              <ul className="space-y-1 text-sm">
                {invoiceChecks.map((c) => (
                  <li key={c.label} className={`flex items-start gap-2 ${c.ok ? "text-green-700" : "text-red-700"}`}>
                    <span className="font-semibold">{c.ok ? "✓" : "✗"}</span>
                    <span>
                      {c.label}
                      {!c.ok && c.missing && <span className="block text-xs">Missing: {c.missing}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="rounded-md bg-gray-50 px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Parts</span>
                  <span>₹{jobCard.partsTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Labour</span>
                  <span>₹{jobCard.labourTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Discount</span>
                  <span>− ₹{(Number(discount) || 0).toFixed(2)}</span>
                </div>
                <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-semibold text-gray-900">
                  <span>Draft invoice total</span>
                  <span>₹{Math.max(0, jobCard.grandTotal - (Number(discount) || 0)).toFixed(2)}</span>
                </div>
              </div>
              <div>
                <Label>Discount (optional)</Label>
                <Input type="number" step="0.01" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={generatingInvoice || !invoiceReady}>
                  <Receipt className="h-4 w-4" /> {generatingInvoice ? "Saving..." : jobCard.invoice ? "Update draft invoice" : "Generate draft invoice"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowInvoicePrompt(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* Details */}
      <div>
        <div className="mb-3 flex max-w-lg items-center justify-between">
          <SectionHeading icon={FileText}>Details</SectionHeading>
          <span
            className={`text-xs ${
              saveState === "error" ? "text-red-600" : saveState === "saving" ? "text-gray-500" : "text-green-700"
            }`}
            aria-live="polite"
          >
            {saveState === "saving"
              ? "Saving..."
              : saveState === "saved"
                ? "All changes saved"
                : saveState === "error"
                  ? `Not saved — ${saveError}`
                  : "Saves automatically"}
          </span>
        </div>
        <Card className="max-w-lg">
          <CardBody>
              <div className="space-y-3">
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
              </div>
          </CardBody>
        </Card>
      </div>

      {/* Initial inspection */}
      <div>
        <SectionHeading icon={ClipboardList}>Initial Inspection</SectionHeading>
        <Card className="max-w-lg">
          <CardBody>
            <Textarea
              placeholder="Findings from the initial inspection... (saves automatically)"
              rows={3}
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
            />
          </CardBody>
        </Card>
      </div>

      {/* Estimate & approval */}
      <div>
        <SectionHeading icon={Calculator}>Estimate & Customer Approval</SectionHeading>
        <Card className="max-w-lg">
          <CardBody className="space-y-3">
            {jobCard.estimate ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono font-semibold text-gray-900">{jobCard.estimate.estimateNumber}</span>
                {jobCard.estimate.status === "APPROVED" ? (
                  <Badge tone="green">
                    Customer approved
                    {jobCard.estimate.approvedAt ? ` · ${new Date(jobCard.estimate.approvedAt).toLocaleDateString()}` : ""}
                  </Badge>
                ) : (
                  <Badge tone="amber">Awaiting customer approval</Badge>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                Make an estimate for the customer to sign. It starts with this job card&apos;s parts and labour, and you
                can add more — including parts that aren&apos;t in inventory.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={openEstimate} disabled={creatingEstimate}>
                <Calculator className="h-4 w-4" />
                {creatingEstimate ? "Creating..." : jobCard.estimate ? "Open estimate" : "Create estimate"}
              </Button>
              {jobCard.estimate?.approvalPhotoUrl && (
                <a
                  href={assetUrl(jobCard.estimate.approvalPhotoUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
                >
                  <FileText className="h-4 w-4" /> Signed estimate photo
                </a>
              )}
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
          Front, Rear, Left and Right are mandatory for both phases before the draft invoice can be generated.
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
                  accept="image/*"
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
              <form onSubmit={handleAddPart} className="space-y-2">
                <div className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
                  <div>
                    <Label>Item code</Label>
                    <Input
                      inputMode="numeric"
                      placeholder="e.g. 0001"
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                  <div>
                    <Label>Qty used</Label>
                    <Input type="number" min={1} step={1} value={partQty} onChange={(e) => setPartQty(e.target.value)} />
                  </div>
                  <Button
                    type="submit"
                    disabled={
                      addingPart ||
                      codePreview.state !== "found" ||
                      !(Number(partQty) >= 1) ||
                      Number(partQty) > codePreview.item.currentStock
                    }
                  >
                    Add part
                  </Button>
                </div>
                {codePreview.state === "loading" && <p className="text-xs text-gray-500">Looking up item {codeInput}...</p>}
                {codePreview.state === "notfound" && (
                  <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">No item with code {codeInput}.</p>
                )}
                {codePreview.state === "found" && (
                  <div
                    className={`rounded-md px-3 py-2 text-sm ${
                      codePreview.item.currentStock > 0 ? "bg-blue-50 text-blue-900" : "bg-amber-50 text-amber-800"
                    }`}
                  >
                    <p>
                      <strong>{codePreview.item.itemCode}</strong> — {codePreview.item.name} · MRP ₹
                      {Number(codePreview.item.sellingPrice).toFixed(2)}
                    </p>
                    <p className="mt-0.5">
                      Available: <strong>{codePreview.item.currentStock}</strong> {codePreview.item.uom}
                      {Number(partQty) >= 1 && Number(partQty) <= codePreview.item.currentStock && (
                        <>
                          {" "}
                          · Used: {Number(partQty)} · Balance: <strong>{codePreview.item.currentStock - Number(partQty)}</strong>
                        </>
                      )}
                      {Number(partQty) > codePreview.item.currentStock && (
                        <span className="text-red-700"> · only {codePreview.item.currentStock} available</span>
                      )}
                    </p>
                  </div>
                )}
              </form>

              <div className="mt-3 border-t border-gray-100 pt-3">
                <p className="mb-1 text-xs text-gray-500">Don&apos;t know the code? Find the item:</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Search by name or part number"
                    value={itemQuery}
                    onChange={(e) => setItemQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchItems();
                      }
                    }}
                    className="flex-1"
                  />
                  <Button type="button" variant="secondary" onClick={searchItems}>
                    <Search className="h-4 w-4" /> Search
                  </Button>
                </div>
                {itemResults.length > 0 && (
                  <ul className="mt-2 max-h-40 overflow-y-auto rounded-md border border-gray-200 text-sm">
                    {itemResults.map((it) => (
                      <li key={it.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setCodeInput(it.itemCode);
                            setItemResults([]);
                          }}
                          className="block w-full px-3 py-2 text-left hover:bg-gray-50"
                        >
                          {it.itemCode} — {it.name} (available: {it.currentStock})
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardBody>
          </Card>
        )}

        {jobCard.parts.length === 0 ? (
          <p className="text-sm text-gray-500">No parts added yet.</p>
        ) : (
          <Table minWidth={550}>
            <thead>
              <tr>
                <Th>Item Code</Th>
                <Th>Item</Th>
                <Th>Qty Used</Th>
                <Th>Rate</Th>
                <Th>Amount</Th>
                {!locked && <Th></Th>}
              </tr>
            </thead>
            <tbody>
              {jobCard.parts.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-mono">{p.item.itemCode}</Td>
                  <Td>{p.item.name}</Td>
                  <Td>
                    {p.quantity} {p.item.uom}
                  </Td>
                  <Td>₹{p.rate}</Td>
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
            {jobCard.invoice && (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <Link
                  href={`/dashboard/invoices/${jobCard.invoice.id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
                >
                  <Receipt className="h-4 w-4" /> View draft invoice {jobCard.invoice.invoiceNumber}
                </Link>
                <Link
                  href={`/dashboard/invoices/${jobCard.invoice.id}?download=1`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
                >
                  Download PDF
                </Link>
              </div>
            )}
            {jobCard.status === "OPEN" ? (
              <Button
                type="button"
                className={jobCard.invoice ? "mt-2 w-full" : "w-full"}
                onClick={() => {
                  setActionError(null);
                  if (jobCard.invoice) setDiscount(String(Number(jobCard.invoice.discount)));
                  setShowInvoicePrompt(true);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                <Receipt className="h-4 w-4" /> {jobCard.invoice ? "Update draft invoice" : "Mark as Invoiced"}
              </Button>
            ) : jobCard.status === "CANCELLED" ? (
              <p className="text-xs text-gray-500">This job card is cancelled. Set it back to Open to invoice it.</p>
            ) : null}
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
