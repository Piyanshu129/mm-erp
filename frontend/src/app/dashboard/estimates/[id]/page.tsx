"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Camera, Download, Printer, Trash2 } from "lucide-react";
import { AuthedImage, AssetLink } from "@/components/AuthedMedia";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { downloadElementAsPdf, invoiceFileName } from "@/lib/invoicePdf";
import { SharePdfButton } from "@/components/SharePdfButton";
import { GstInvoice, Payer, payerOf } from "@/components/GstInvoice";
import { Bill, EstimateBills } from "@/components/EstimateBills";
import { compressImage } from "@/lib/compressImage";
import { fmtQty } from "@/lib/format";
import { LABOUR_SAC } from "@/lib/gst";

interface EstimateLine {
  id: number;
  lineType: "PART" | "LABOUR";
  itemId: number | null;
  description: string;
  quantity: number;
  rate: string;
  amount: string;
  hsnCode?: string | null;
  gstRate?: string | null;
  // Who pays (accidental claims; older servers don't send it).
  scope?: Payer;
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
  // GST invoice made from this estimate (older servers don't send these).
  gstInvoiceNumber?: string | null;
  gstInvoiceDate?: string | null;
  insuranceGstInvoiceNumber?: string | null;
  insuranceGstInvoiceDate?: string | null;
  supplyType?: "INTRA" | "INTER";
  pricesIncludeGst?: boolean;
  customerGstin?: string | null;
  insuranceGstin?: string | null;
  lines: EstimateLine[];
  partsTotal: number;
  labourTotal: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  jobCard: {
    id: number;
    jobCardNumber: string;
    // INVOICED = closed: the estimate is the bill (older servers don't send these).
    status?: string;
    invoices?: Bill[];
    kmAtService: number | null;
    jobType?: string | null;
    insuranceCompany?: string | null;
    claimNumber?: string | null;
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
  const [tab, setTab] = useState<"estimate" | "claim" | "gst">("estimate");
  // Which GST invoice the GST tab shows on an accidental claim.
  const [gstPayer, setGstPayer] = useState<Payer>("CUSTOMER");

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

  // After a payment: refresh the bills without blanking the page.
  async function reload() {
    try {
      const body = await apiFetch(`/estimates/${id}`);
      apply(body.estimate);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not refresh the estimate");
    }
  }

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
    if (!(qty > 0)) {
      setError("Quantity must be more than 0 (e.g. 1, 2 or 0.5)");
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

  const { jobCard } = estimate;
  // A closed job card's estimate is the bill: it follows the job card and
  // can't be edited here.
  const closed = jobCard.status === "INVOICED";
  const draft = estimate.status === "DRAFT" && !closed;
  const claim = jobCard.jobType === "ACCIDENTAL_CLAIM";
  const parts = estimate.lines.filter((l) => l.lineType === "PART");
  const labour = estimate.lines.filter((l) => l.lineType === "LABOUR");
  const bills = jobCard.invoices ?? [];
  const customerBill = bills.find((b) => b.payer === "CUSTOMER");
  const insuranceBill = bills.find((b) => b.payer === "INSURANCE");
  const billed = bills.reduce((t, b) => t + Number(b.totalAmount), 0);
  const paid = bills.reduce((t, b) => t + Number(b.paymentAmount), 0);
  const insuranceTotal = estimate.lines
    .filter((l) => payerOf(l, jobCard.jobType) === "INSURANCE")
    .reduce((t, l) => t + Number(l.amount), 0);
  const insuranceTag = (l: EstimateLine) =>
    claim && payerOf(l, jobCard.jobType) === "INSURANCE" ? (
      <span className="ml-1 rounded bg-purple-50 px-1 text-[11px] font-medium text-purple-700">Insurance</span>
    ) : null;

  const removeCell = (lineId: number) =>
    draft ? (
      <td className="py-1 pl-2 text-right print:hidden" data-html2canvas-ignore="true">
        <button onClick={() => handleRemoveLine(lineId)} className="text-red-600 hover:text-red-700" title="Remove">
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    ) : null;
  const removeHead = draft ? <th className="print:hidden" data-html2canvas-ignore="true" /> : null;

  const tabClass = (t: typeof tab) =>
    `-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
      tab === t ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={`/dashboard/jobcards/${jobCard.id}`}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> Job card {jobCard.jobCardNumber}
        </Link>
        {tab === "estimate" && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button onClick={downloadPdf} disabled={downloading}>
              <Download className="h-4 w-4" /> {downloading ? "Preparing PDF..." : "Download PDF"}
            </Button>
            {fileName && (
              <SharePdfButton
                getElement={() => printRef.current}
                fileName={fileName}
                mobile={jobCard.vehicle.customer.mobile}
                text={`Dear ${jobCard.vehicle.customer.name} Ji,\nPlease find the estimate ${estimate.estimateNumber} for vehicle ${jobCard.vehicle.registrationNumber}.\n${
                  closed && customerBill
                    ? `Amount payable: ${money(customerBill.totalAmount)}${Number(customerBill.paymentAmount) > 0 ? ` (paid ${money(customerBill.paymentAmount)})` : ""}`
                    : `Estimated amount: ${money(estimate.totalAmount)}`
                }\n— Motors Mitra`}
                onError={setError}
              />
            )}
          </div>
        )}
      </div>

      <div className="flex border-b border-gray-200 print:hidden">
        <button type="button" className={tabClass("estimate")} onClick={() => setTab("estimate")}>
          {closed ? "Estimate & bill" : "Estimate"}
        </button>
        {claim && (
          <button type="button" className={tabClass("claim")} onClick={() => setTab("claim")}>
            Customer / Insurance
          </button>
        )}
        <button type="button" className={tabClass("gst")} onClick={() => setTab("gst")}>
          {claim ? "GST Invoices" : `GST Invoice${estimate.gstInvoiceNumber ? ` · ${estimate.gstInvoiceNumber}` : ""}`}
        </button>
      </div>

      {tab === "claim" && claim ? (
        <ClaimScope estimate={estimate} closed={closed} onUpdated={apply} />
      ) : tab === "gst" ? (
        <div className="space-y-3">
          {claim && (
            <ClaimGstOverview
              estimate={estimate}
              closed={closed}
              shown={gstPayer}
              onShow={setGstPayer}
              onUpdated={apply}
            />
          )}
          <GstInvoice
            key={claim ? gstPayer : "CUSTOMER"}
            estimate={estimate}
            payer={claim ? gstPayer : "CUSTOMER"}
            onUpdated={(e) => apply(e as EstimateDetail)}
          />
        </div>
      ) : (
        <>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {closed ? (
              <Badge tone="blue">Job card closed — this estimate is the bill</Badge>
            ) : draft ? (
              <Badge tone="amber">Draft — awaiting customer approval</Badge>
            ) : null}
            {estimate.status === "APPROVED" && (
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
                {jobCard.insuranceCompany && <p>Insurance: {jobCard.insuranceCompany}</p>}
                {jobCard.claimNumber && <p>Claim No.: {jobCard.claimNumber}</p>}
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
                          {insuranceTag(l)}
                        </td>
                        <td className="py-1 text-right">{fmtQty(l.quantity)}</td>
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
                        <td className="py-1">
                          {l.description}
                          {insuranceTag(l)}
                        </td>
                        <td className="py-1 text-right">{fmtQty(l.quantity)}</td>
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
              {closed && bills.length > 0 ? (
                <>
                  {customerBill && Number(customerBill.discount) > 0 && (
                    <div className="flex justify-between">
                      <span>Discount</span>
                      <span>− {money(customerBill.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-gray-200 pt-1 text-base font-bold">
                    <span>Total</span>
                    <span>{money(billed)}</span>
                  </div>
                  {insuranceBill && (
                    <>
                      <div className="flex justify-between text-gray-700">
                        <span>Insurance company pays</span>
                        <span>{money(insuranceBill.totalAmount)}</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>Customer pays</span>
                        <span>{money(customerBill?.totalAmount ?? 0)}</span>
                      </div>
                    </>
                  )}
                  {paid > 0 && (
                    <div className="flex justify-between text-green-700">
                      <span>Paid</span>
                      <span>{money(paid)}</span>
                    </div>
                  )}
                  {billed - paid > 0.005 && (
                    <div className="flex justify-between font-semibold text-red-700">
                      <span>Balance due</span>
                      <span>{money(billed - paid)}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex justify-between border-t border-gray-200 pt-1 text-base font-bold">
                    <span>Total Estimated Amount</span>
                    <span>{money(estimate.totalAmount)}</span>
                  </div>
                  {claim && insuranceTotal > 0 && (
                    <>
                      <div className="flex justify-between text-gray-700">
                        <span>Insurance company scope</span>
                        <span>{money(insuranceTotal)}</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>Customer scope</span>
                        <span>{money(estimate.subtotal - insuranceTotal)}</span>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {estimate.notes && (
              <p className="mt-4 whitespace-pre-line text-sm">
                <span className="font-semibold">Notes: </span>
                {estimate.notes}
              </p>
            )}

            {!closed && (
              <p className="mt-4 text-xs text-gray-500">
                This is an estimate. The final bill may vary if additional work or parts are found to be needed — any such
                change will be done only with the customer&apos;s consent.
              </p>
            )}

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

          {closed && bills.length > 0 && (
            <EstimateBills
              bills={bills}
              estimateNumber={estimate.estimateNumber}
              insuranceCompany={jobCard.insuranceCompany}
              customer={jobCard.vehicle.customer}
              vehicle={jobCard.vehicle}
              onChanged={reload}
            />
          )}
          {closed && (
            <p className="text-xs text-gray-500 print:hidden">
              This estimate follows job card {jobCard.jobCardNumber}&apos;s parts and labour. To change it, set the job card
              back to Open, change it, and close it again — the bill keeps its payments.
            </p>
          )}

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
                      <Input type="number" min={0.01} step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
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
                <AssetLink href={estimate.approvalPhotoUrl} className="inline-block">
                  <AuthedImage
                    src={estimate.approvalPhotoUrl}
                    alt="Customer-signed estimate"
                    className="max-h-80 rounded-md border border-gray-200 object-contain"
                  />
                </AssetLink>
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
        </>
      )}
    </div>
  );
}

// Accidental claim, GST tab: the two GST invoices — the customer's and the
// insurance company's — side by side: each one's number (or not yet made),
// which one is shown below, and one button that generates both.
function ClaimGstOverview({
  estimate,
  closed,
  shown,
  onShow,
  onUpdated,
}: {
  estimate: EstimateDetail;
  closed: boolean;
  shown: Payer;
  onShow: (p: Payer) => void;
  onUpdated: (e: EstimateDetail) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const jobType = estimate.jobCard.jobType;
  const sides = (["CUSTOMER", "INSURANCE"] as Payer[]).map((p) => {
    const lines = estimate.lines.filter((l) => payerOf(l, jobType) === p);
    return {
      payer: p,
      title: p === "CUSTOMER" ? `Customer — ${estimate.jobCard.vehicle.customer.name}` : `Insurance company — ${estimate.jobCard.insuranceCompany || "not named"}`,
      number: p === "CUSTOMER" ? estimate.gstInvoiceNumber : estimate.insuranceGstInvoiceNumber,
      lines: lines.length,
      amount: lines.reduce((t, l) => t + Number(l.amount), 0),
    };
  });
  const toMake = sides.filter((s) => !s.number && s.lines > 0);

  async function generateBoth() {
    if (
      !window.confirm(
        `Generate ${toMake.length === 2 ? "both GST invoice numbers (customer and insurance company)" : "the remaining GST invoice number"}? After this the HSN/SAC and GST %, who pays for each line, and the estimate's lines can't be changed, and the job card can't be reopened.`
      )
    )
      return;
    setError(null);
    setNotice(null);
    setBusy(true);
    const made: string[] = [];
    try {
      // Lines still without a GST % or code get what the GST details show
      // for them (18%, and the repair SAC for labour) — the same as
      // generating each invoice on its own.
      const unset = estimate.lines.filter(
        (l) => toMake.some((s) => s.payer === payerOf(l, jobType)) && (l.gstRate == null || (!l.hsnCode && l.lineType === "LABOUR"))
      );
      if (unset.length) {
        const body = await apiFetch(`/estimates/${estimate.id}/gst`, {
          method: "PATCH",
          body: JSON.stringify({
            lines: unset.map((l) => ({
              id: l.id,
              hsnCode: l.hsnCode || (l.lineType === "LABOUR" ? LABOUR_SAC : null),
              gstRate: l.gstRate != null ? Number(l.gstRate) : 18,
            })),
          }),
        });
        onUpdated(body.estimate);
      }
      for (const s of toMake) {
        const body = await apiFetch(`/estimates/${estimate.id}/gst-invoice`, { method: "POST", body: JSON.stringify({ payer: s.payer }) });
        onUpdated(body.estimate);
        made.push(s.payer === "CUSTOMER" ? body.estimate.gstInvoiceNumber : body.estimate.insuranceGstInvoiceNumber);
      }
      setNotice(`Generated ${made.join(" and ")}.`);
    } catch (err) {
      const side = toMake[made.length];
      if (side) onShow(side.payer);
      setError(
        `${made.length ? `Generated ${made.join(", ")}. ` : ""}${side?.payer === "INSURANCE" ? "Insurance company's" : "Customer's"} invoice: ${
          err instanceof ApiError ? err.message : "could not generate it"
        } — fix it in the GST details below, then try again.`
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="print:hidden">
      <CardBody className="space-y-3">
        <p className="text-sm font-semibold text-gray-900">Accidental claim — two GST invoices</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {sides.map((s) => (
            <button
              key={s.payer}
              type="button"
              onClick={() => onShow(s.payer)}
              className={`rounded-md border p-3 text-left text-sm ${
                shown === s.payer ? "border-blue-600 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <span className="block font-medium text-gray-900">{s.title}</span>
              <span className="block text-gray-600">
                {s.lines} {s.lines === 1 ? "line" : "lines"} · {money(s.amount)} before GST
              </span>
              <span className={`mt-1 block font-mono text-xs ${s.number ? "text-green-700" : "text-amber-700"}`}>
                {s.number ?? (s.lines === 0 ? "No lines — no invoice needed" : "Not generated yet")}
              </span>
              <span className="mt-1 block text-xs text-blue-600">{shown === s.payer ? "Shown below" : "Show this invoice"}</span>
            </button>
          ))}
        </div>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
        {toMake.length > 0 && (
          <div className="space-y-1">
            <Button type="button" size="sm" onClick={generateBoth} disabled={busy || !closed}>
              {busy ? "Generating..." : toMake.length === 2 ? "Generate both GST invoices" : "Generate the remaining GST invoice"}
            </Button>
            <p className="text-xs text-gray-500">
              {closed
                ? "Set who pays for each line on the Customer / Insurance tab first. Each invoice uses the GST details saved for it below."
                : `Close job card ${estimate.jobCard.jobCardNumber} first.`}
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// Accidental claim: who pays for each line — the customer or the insurance
// company. On a closed job card, saving moves the amounts between the two
// bills. Fixed once either GST invoice is made.
function ClaimScope({
  estimate,
  closed,
  onUpdated,
}: {
  estimate: EstimateDetail;
  closed: boolean;
  onUpdated: (e: EstimateDetail) => void;
}) {
  const initial = () => Object.fromEntries(estimate.lines.map((l) => [l.id, l.scope ?? "CUSTOMER"])) as Record<number, Payer>;
  const [scopes, setScopes] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const locked = estimate.gstInvoiceNumber || estimate.insuranceGstInvoiceNumber;

  useEffect(() => {
    setScopes(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimate]);

  const dirty = estimate.lines.some((l) => scopes[l.id] !== (l.scope ?? "CUSTOMER"));
  const sumFor = (p: Payer) => estimate.lines.filter((l) => scopes[l.id] === p).reduce((t, l) => t + Number(l.amount), 0);

  async function save() {
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const body = await apiFetch(`/estimates/${estimate.id}/gst`, {
        method: "PATCH",
        body: JSON.stringify({ lines: estimate.lines.map((l) => ({ id: l.id, scope: scopes[l.id] })) }),
      });
      onUpdated(body.estimate);
      setNotice(closed ? "Saved — the customer's and insurance company's bills are updated." : "Saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const setAll = (p: Payer) => setScopes(Object.fromEntries(estimate.lines.map((l) => [l.id, p])));

  return (
    <Card className="print:hidden">
      <CardBody className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Customer scope and insurance company scope</p>
          <p className="text-sm text-gray-600">
            Choose who pays for each line
            {estimate.jobCard.insuranceCompany ? ` — the customer or ${estimate.jobCard.insuranceCompany}` : ""}. Each side
            gets its own bill and its own GST invoice.
            {locked ? ` Fixed now that GST invoice ${locked} is made.` : ""}
          </p>
        </div>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
        {!locked && estimate.lines.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={() => setAll("CUSTOMER")} className="font-medium text-blue-600 hover:underline">
              All customer
            </button>
            <button type="button" onClick={() => setAll("INSURANCE")} className="font-medium text-blue-600 hover:underline">
              All insurance
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="py-1 pr-2">Line</th>
                <th className="py-1 pr-2 text-right">Amount</th>
                <th className="py-1 pl-4">Customer</th>
                <th className="py-1">Insurance</th>
              </tr>
            </thead>
            <tbody>
              {estimate.lines.map((l) => (
                <tr key={l.id} className="border-t border-gray-100">
                  <td className="py-1.5 pr-2">
                    {l.description}
                    <span className="ml-1 text-xs text-gray-500">{l.lineType === "LABOUR" ? "(labour)" : ""}</span>
                  </td>
                  <td className="py-1.5 pr-2 text-right">{money(l.amount)}</td>
                  {(["CUSTOMER", "INSURANCE"] as Payer[]).map((p) => (
                    <td key={p} className={p === "CUSTOMER" ? "py-1.5 pl-4" : "py-1.5"}>
                      <input
                        type="radio"
                        name={`scope-${l.id}`}
                        aria-label={`${l.description}: ${p === "CUSTOMER" ? "customer" : "insurance"}`}
                        checked={scopes[l.id] === p}
                        disabled={!!locked}
                        onChange={() => setScopes((prev) => ({ ...prev, [l.id]: p }))}
                      />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-gray-300 font-semibold">
                <td className="py-1.5 pr-2">Totals</td>
                <td />
                <td className="py-1.5 pl-4">{money(sumFor("CUSTOMER"))}</td>
                <td className="py-1.5">{money(sumFor("INSURANCE"))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {!locked && (
          <Button type="button" size="sm" onClick={save} disabled={saving || !dirty}>
            {saving ? "Saving..." : dirty ? "Save" : "Saved"}
          </Button>
        )}
        {closed && <p className="text-xs text-gray-500">The customer&apos;s discount stays on the customer&apos;s bill.</p>}
      </CardBody>
    </Card>
  );
}

export default function EstimatePage() {
  return (
    <RequireAuth permission="JOB_CARDS">
      <EstimatePageContent />
    </RequireAuth>
  );
}
