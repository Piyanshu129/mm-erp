"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Camera, Download, Printer, Trash2 } from "lucide-react";
import { AuthedImage } from "@/components/AuthedMedia";
import { apiFetch, ApiError, assetUrl } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { downloadElementAsPdf, invoiceFileName } from "@/lib/invoicePdf";
import { compressImage } from "@/lib/compressImage";

interface EstimateLine {
  id: number;
  lineType: "PART" | "LABOUR";
  itemId: number | null;
  description: string;
  quantity: number;
  rate: string;
  amount: string;
  item: { id: number; itemCode: string; name: string; uom: string } | null;
}

interface EstimateDetail {
  id: number;
  estimateNumber: string;
  estimateDate: string;
  taxRate: string | null;
  notes: string | null;
  status: "DRAFT" | "APPROVED";
  approvalPhotoUrl: string | null;
  approvedAt: string | null;
  lines: EstimateLine[];
  partsTotal: number;
  labourTotal: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  jobCard: {
    id: number;
    jobCardNumber: string;
    kmAtService: number | null;
    vehicle: {
      registrationNumber: string;
      make: string;
      model: string;
      variant?: string | null;
      customer: { id: number; name: string; mobile: string; address: string | null };
    };
  };
}

interface FoundItem {
  id: number;
  itemCode: string;
  name: string;
  uom: string;
  sellingPrice: string;
  currentStock: number;
}

// What a new line is: an inventory item (by item code), a part that isn't in
// inventory (typed in), or labour / a service.
type LineKind = "INVENTORY" | "OUTSIDE" | "LABOUR";

function money(n: number | string): string {
  return `₹${Number(n).toFixed(2)}`;
}

function EstimatePageContent() {
  const { id } = useParams<{ id: string }>();
  const [estimate, setEstimate] = useState<EstimateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  // New line
  const [kind, setKind] = useState<LineKind>("INVENTORY");
  const [code, setCode] = useState("");
  const [found, setFound] = useState<FoundItem | null | "notfound">(null);
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [rate, setRate] = useState("");
  const [addingLine, setAddingLine] = useState(false);

  // Header fields
  const [taxRate, setTaxRate] = useState("");
  const [notes, setNotes] = useState("");
  const [savingHeader, setSavingHeader] = useState(false);

  const [uploading, setUploading] = useState(false);

  function apply(e: EstimateDetail) {
    setEstimate(e);
    setTaxRate(e.taxRate != null ? String(Number(e.taxRate)) : "");
    setNotes(e.notes ?? "");
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const body = await apiFetch(`/estimates/${id}`);
        apply(body.estimate);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load the estimate");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Item code typed in → look it up so its name and MRP fill in.
  useEffect(() => {
    if (kind !== "INVENTORY") return;
    const c = code.trim();
    if (!/^\d+$/.test(c) || Number(c) === 0) {
      setFound(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const body = await apiFetch(`/item-lookup/${c}`);
        if (cancelled) return;
        setFound(body.item);
        setRate(String(Number(body.item.sellingPrice)));
      } catch {
        if (!cancelled) setFound("notfound");
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, kind]);

  const fileName = estimate
    ? `${estimate.estimateNumber}_${invoiceFileName(estimate.jobCard.vehicle.registrationNumber, estimate.estimateDate)}`
    : null;

  // Browser Print → "Save as PDF" suggests the page title as the file name.
  useEffect(() => {
    if (!fileName) return;
    const previous = document.title;
    document.title = fileName;
    return () => {
      document.title = previous;
    };
  }, [fileName]);

  async function downloadPdf() {
    if (!printRef.current || !fileName) return;
    setError(null);
    setDownloading(true);
    try {
      await downloadElementAsPdf(printRef.current, fileName);
    } catch {
      setError("Could not create the PDF — use Print / Save as PDF instead.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleAddLine(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      setError("Quantity must be a whole number, at least 1");
      return;
    }
    if (kind === "INVENTORY" && (found == null || found === "notfound")) {
      setError("Enter the item code of an item in inventory");
      return;
    }
    setAddingLine(true);
    try {
      const body = await apiFetch(`/estimates/${id}/lines`, {
        method: "POST",
        body: JSON.stringify({
          lineType: kind === "LABOUR" ? "LABOUR" : "PART",
          itemId: kind === "INVENTORY" && found && found !== "notfound" ? found.id : undefined,
          description: kind === "INVENTORY" ? undefined : description,
          quantity: qty,
          rate: rate.trim() === "" ? undefined : Number(rate),
        }),
      });
      apply(body.estimate);
      setCode("");
      setFound(null);
      setDescription("");
      setQuantity("1");
      setRate("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add the line");
    } finally {
      setAddingLine(false);
    }
  }

  async function handleRemoveLine(lineId: number) {
    setError(null);
    try {
      const body = await apiFetch(`/estimates/${id}/lines/${lineId}`, { method: "DELETE" });
      apply(body.estimate);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove the line");
    }
  }

  async function handleSaveHeader(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSavingHeader(true);
    try {
      const body = await apiFetch(`/estimates/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ taxRate: taxRate.trim() === "" ? null : Number(taxRate), notes }),
      });
      apply(body.estimate);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSavingHeader(false);
    }
  }

  async function handleApprovalPhoto(file: File) {
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("photo", await compressImage(file));
      const body = await apiFetch(`/estimates/${id}/approval`, { method: "POST", body: formData });
      apply(body.estimate);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload the photo");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (!estimate) {
    return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error ?? "Estimate not found"}</p>;
  }

  const draft = estimate.status === "DRAFT";
  const { jobCard } = estimate;
  const parts = estimate.lines.filter((l) => l.lineType === "PART");
  const labour = estimate.lines.filter((l) => l.lineType === "LABOUR");

  const removeCell = (lineId: number) =>
    draft ? (
      <td className="py-1 pl-2 text-right print:hidden" data-html2canvas-ignore="true">
        <button onClick={() => handleRemoveLine(lineId)} className="text-red-600 hover:text-red-700" title="Remove">
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    ) : null;
  const removeHead = draft ? <th className="print:hidden" data-html2canvas-ignore="true" /> : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={`/dashboard/jobcards/${jobCard.id}`}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> Job card {jobCard.jobCardNumber}
        </Link>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button onClick={downloadPdf} disabled={downloading}>
            <Download className="h-4 w-4" /> {downloading ? "Preparing PDF..." : "Download PDF"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {draft ? (
          <Badge tone="amber">Draft — awaiting customer approval</Badge>
        ) : (
          <Badge tone="green">
            Customer approved{estimate.approvedAt ? ` on ${new Date(estimate.approvedAt).toLocaleDateString()}` : ""}
          </Badge>
        )}
        {fileName && (
          <span className="text-xs text-gray-500">
            Saves as <span className="font-mono">{fileName}.pdf</span>
          </span>
        )}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">{error}</p>}

      {/* The printable estimate */}
      <div ref={printRef} className="rounded-md border border-gray-200 bg-white p-6 text-gray-900 print:border-0 print:p-0">
        <div className="mb-5 flex items-start justify-between border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-xl font-bold">Motors Mitra</h1>
            <p className="text-sm text-gray-500">Multibrand Car Workshop</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-base font-bold tracking-wide">ESTIMATE</p>
            <p className="font-mono font-semibold">{estimate.estimateNumber}</p>
            <p className="text-gray-500">Date: {new Date(estimate.estimateDate).toLocaleDateString()}</p>
            <p className="text-gray-500">Job Card: {jobCard.jobCardNumber}</p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="mb-1 font-semibold">Customer</p>
            <p>{jobCard.vehicle.customer.name}</p>
            <p>Mobile: {jobCard.vehicle.customer.mobile}</p>
            {jobCard.vehicle.customer.address && <p>{jobCard.vehicle.customer.address}</p>}
          </div>
          <div>
            <p className="mb-1 font-semibold">Vehicle</p>
            <p>Reg. No.: {jobCard.vehicle.registrationNumber}</p>
            <p>
              {jobCard.vehicle.make} {jobCard.vehicle.model}
              {jobCard.vehicle.variant ? ` ${jobCard.vehicle.variant}` : ""}
            </p>
            <p>KM reading: {jobCard.kmAtService != null ? jobCard.kmAtService : "—"}</p>
          </div>
        </div>

        <div className="mb-4">
          <p className="mb-1 text-sm font-semibold">Parts / Items</p>
          {parts.length === 0 ? (
            <p className="text-sm text-gray-500">No parts.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-300 text-left">
                  <th className="py-1">#</th>
                  <th className="py-1">Description</th>
                  <th className="py-1 text-right">Qty</th>
                  <th className="py-1 text-right">Rate</th>
                  <th className="py-1 text-right">Amount</th>
                  {removeHead}
                </tr>
              </thead>
              <tbody>
                {parts.map((l, i) => (
                  <tr key={l.id} className="border-b border-gray-100">
                    <td className="py-1">{i + 1}</td>
                    <td className="py-1">
                      {l.description}
                      {l.item ? (
                        <span className="text-gray-500"> ({l.item.itemCode})</span>
                      ) : (
                        <span className="text-gray-500"> (not in stock)</span>
                      )}
                    </td>
                    <td className="py-1 text-right">{l.quantity}</td>
                    <td className="py-1 text-right">{money(l.rate)}</td>
                    <td className="py-1 text-right">{money(l.amount)}</td>
                    {removeCell(l.id)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mb-4">
          <p className="mb-1 text-sm font-semibold">Labour / Service Charges</p>
          {labour.length === 0 ? (
            <p className="text-sm text-gray-500">No labour.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-300 text-left">
                  <th className="py-1">#</th>
                  <th className="py-1">Description</th>
                  <th className="py-1 text-right">Qty</th>
                  <th className="py-1 text-right">Rate</th>
                  <th className="py-1 text-right">Amount</th>
                  {removeHead}
                </tr>
              </thead>
              <tbody>
                {labour.map((l, i) => (
                  <tr key={l.id} className="border-b border-gray-100">
                    <td className="py-1">{i + 1}</td>
                    <td className="py-1">{l.description}</td>
                    <td className="py-1 text-right">{l.quantity}</td>
                    <td className="py-1 text-right">{money(l.rate)}</td>
                    <td className="py-1 text-right">{money(l.amount)}</td>
                    {removeCell(l.id)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="ml-auto max-w-xs space-y-1 border-t border-gray-300 pt-2 text-sm">
          <div className="flex justify-between">
            <span>Parts</span>
            <span>{money(estimate.partsTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Labour / Service</span>
            <span>{money(estimate.labourTotal)}</span>
          </div>
          {estimate.taxRate != null && Number(estimate.taxRate) > 0 && (
            <>
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{money(estimate.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax ({Number(estimate.taxRate)}%)</span>
                <span>{money(estimate.taxAmount)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between border-t border-gray-200 pt-1 text-base font-bold">
            <span>Total Estimated Amount</span>
            <span>{money(estimate.totalAmount)}</span>
          </div>
        </div>

        {estimate.notes && (
          <p className="mt-4 whitespace-pre-line text-sm">
            <span className="font-semibold">Notes: </span>
            {estimate.notes}
          </p>
        )}

        <p className="mt-4 text-xs text-gray-500">
          This is an estimate. The final bill may vary if additional work or parts are found to be needed — any such
          change will be done only with the customer&apos;s consent.
        </p>

        <div className="mt-12 grid grid-cols-2 gap-10 text-sm">
          <div>
            <div className="h-14 border-b border-gray-400" />
            <p className="mt-1 font-semibold">Customer Signature</p>
            <p className="text-xs text-gray-500">I approve the above estimate. Name &amp; date:</p>
          </div>
          <div>
            <div className="h-14 border-b border-gray-400" />
            <p className="mt-1 font-semibold">For Motors Mitra</p>
            <p className="text-xs text-gray-500">Authorised signatory</p>
          </div>
        </div>
      </div>

      {/* Editing — only while the estimate is a draft */}
      {draft && (
        <Card className="print:hidden">
          <CardBody className="space-y-4">
            <p className="text-sm font-semibold text-gray-900">Add a line</p>
            <form onSubmit={handleAddLine} className="space-y-3">
              <div className="flex flex-wrap gap-4 text-sm text-gray-700">
                {(
                  [
                    ["INVENTORY", "Part from inventory"],
                    ["OUTSIDE", "Part not in inventory"],
                    ["LABOUR", "Labour / service"],
                  ] as [LineKind, string][]
                ).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      checked={kind === value}
                      onChange={() => {
                        setKind(value);
                        setFound(null);
                        setCode("");
                        setRate("");
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_6rem_8rem_auto] sm:items-end">
                {kind === "INVENTORY" ? (
                  <div>
                    <Label>Item code</Label>
                    <Input
                      inputMode="numeric"
                      placeholder="e.g. 0001"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                ) : (
                  <div>
                    <Label>{kind === "LABOUR" ? "Labour / service" : "Part description"}</Label>
                    <Input value={description} onChange={(e) => setDescription(e.target.value)} required />
                  </div>
                )}
                <div>
                  <Label>Qty</Label>
                  <Input type="number" min={1} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </div>
                <div>
                  <Label>Rate</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    required={kind !== "INVENTORY"}
                  />
                </div>
                <Button type="submit" disabled={addingLine}>
                  {addingLine ? "Adding..." : "Add"}
                </Button>
              </div>
              {kind === "INVENTORY" && found === "notfound" && (
                <p className="text-sm text-red-700">No item with code {code}. Use “Part not in inventory” instead.</p>
              )}
              {kind === "INVENTORY" && found && found !== "notfound" && (
                <p className="text-sm text-blue-800">
                  {found.itemCode} — {found.name} · MRP {money(found.sellingPrice)} · available {found.currentStock}{" "}
                  {found.uom}
                </p>
              )}
            </form>

            <form onSubmit={handleSaveHeader} className="grid grid-cols-1 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-[8rem_1fr]">
              <div>
                <Label>Tax % (if any)</Label>
                <Input type="number" min={0} max={100} step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
              </div>
              <div>
                <Label>Notes (printed on the estimate)</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" size="sm" variant="secondary" disabled={savingHeader}>
                  {savingHeader ? "Saving..." : "Save tax & notes"}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* Customer approval */}
      <Card className="print:hidden">
        <CardBody className="space-y-3">
          <p className="text-sm font-semibold text-gray-900">Customer approval</p>
          {draft ? (
            <p className="text-sm text-gray-600">
              Print or download the estimate, get it signed by the customer, then upload or take a photo of the signed copy.
              That marks it approved and locks it.
            </p>
          ) : (
            <p className="text-sm text-gray-600">
              Signed by the customer — kept with job card {jobCard.jobCardNumber}, the vehicle&apos;s service history, and
              customer {jobCard.vehicle.customer.name}.
            </p>
          )}
          {estimate.approvalPhotoUrl && (
            <a href={assetUrl(estimate.approvalPhotoUrl)} target="_blank" rel="noreferrer" className="inline-block">
              <AuthedImage
                src={estimate.approvalPhotoUrl}
                alt="Customer-signed estimate"
                className="max-h-80 rounded-md border border-gray-200 object-contain"
              />
            </a>
          )}
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Camera className="h-4 w-4" />
            {uploading
              ? "Uploading..."
              : estimate.approvalPhotoUrl
                ? "Replace signed estimate photo"
                : "Upload / take photo of signed estimate"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && (!draft || window.confirm("Mark this estimate approved by the customer? It can't be edited after this."))) {
                  handleApprovalPhoto(file);
                }
                e.target.value = "";
              }}
            />
          </label>
        </CardBody>
      </Card>
    </div>
  );
}

export default function EstimatePage() {
  return (
    <RequireAuth permission="JOB_CARDS">
      <EstimatePageContent />
    </RequireAuth>
  );
}
