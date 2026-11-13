"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, FileCheck2, Pencil, Printer, Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input, Select, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { SharePdfButton } from "@/components/SharePdfButton";
import { downloadElementAsPdf, invoiceFileName } from "@/lib/invoicePdf";
import { GST_RATES, LABOUR_SAC, gstForLine, rupeesInWords } from "@/lib/gst";
import { fmtQty } from "@/lib/format";

export type Payer = "CUSTOMER" | "INSURANCE";

// Who pays for a line: only an accidental claim bills the insurance company.
export function payerOf(line: { scope?: string }, jobType: string | null | undefined): Payer {
  return jobType === "ACCIDENTAL_CLAIM" && line.scope === "INSURANCE" ? "INSURANCE" : "CUSTOMER";
}

// What a line is billed at: after closing, an accidental claim's line can
// have its own bill rate, and lines can be added on the bill only. Older
// servers don't send these, so the estimate's own rate and amount stand in.
export function billAmountOf(line: { amount: string; billAmount?: number | string }): number {
  return line.billAmount != null ? Number(line.billAmount) : Number(line.amount);
}

export function billRateOf(line: { rate: string; billRate?: string | null }): number {
  return Number(line.billRate ?? line.rate);
}

export interface GstEstimate {
  id: number;
  estimateNumber: string;
  estimateDate: string;
  gstInvoiceNumber?: string | null;
  gstInvoiceDate?: string | null;
  insuranceGstInvoiceNumber?: string | null;
  insuranceGstInvoiceDate?: string | null;
  supplyType?: "INTRA" | "INTER";
  pricesIncludeGst?: boolean;
  customerGstin?: string | null;
  insuranceGstin?: string | null;
  lines: {
    id: number;
    lineType: "PART" | "LABOUR";
    description: string;
    quantity: number;
    rate: string;
    amount: string;
    hsnCode?: string | null;
    gstRate?: string | null;
    scope?: Payer;
    billRate?: string | null;
    billAmount?: number;
    billOnly?: boolean;
    item: { itemCode: string } | null;
  }[];
  jobCard: {
    jobCardNumber: string;
    status?: string;
    kmAtService: number | null;
    jobType?: string | null;
    insuranceCompany?: string | null;
    claimNumber?: string | null;
    vehicle: {
      registrationNumber: string;
      make: string;
      model: string;
      variant?: string | null;
      customer: { name: string; mobile: string; address: string | null };
    };
  };
}

interface Business {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  state: string;
  stateCode: string;
}

const money = (n: number) => `₹${n.toFixed(2)}`;
const amt = (n: number) => n.toFixed(2);

// The estimate as a GST tax invoice: HSN/SAC and GST % per line, CGST + SGST
// (within the state) or IGST (to another state) worked out line by line.
// On an accidental claim there are two: the customer's lines and the
// insurance company's lines (payer). The details can be changed until the
// invoice number is generated — which needs the job card closed, since the
// closed estimate is the final bill; after that it's fixed and can be
// printed, downloaded or shared any time.
export function GstInvoice({
  estimate,
  payer = "CUSTOMER",
  onUpdated,
}: {
  estimate: GstEstimate;
  payer?: Payer;
  onUpdated: (estimate: GstEstimate) => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const printRef = useRef<HTMLDivElement>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const insurer = payer === "INSURANCE";
  const shownLines = estimate.lines.filter((l) => payerOf(l, estimate.jobCard.jobType) === payer);
  const invoiceNumber = insurer ? estimate.insuranceGstInvoiceNumber : estimate.gstInvoiceNumber;
  const invoiceDate = insurer ? estimate.insuranceGstInvoiceDate : estimate.gstInvoiceDate;
  const savedGstin = (insurer ? estimate.insuranceGstin : estimate.customerGstin) ?? "";
  const generated = !!invoiceNumber;
  // Either invoice fixes the supply type and whether prices include GST.
  const sharedLocked = !!(estimate.gstInvoiceNumber || estimate.insuranceGstInvoiceNumber);
  // Older servers don't send the status; they allowed generating any time.
  const closed = estimate.jobCard.status === undefined || estimate.jobCard.status === "INVOICED";
  const [supplyType, setSupplyType] = useState<"INTRA" | "INTER">(estimate.supplyType ?? "INTRA");
  const [inclusive, setInclusive] = useState(!!estimate.pricesIncludeGst);
  const [gstin, setGstin] = useState(savedGstin);
  // Per line: HSN/SAC and GST %. Labour without a code gets the motor
  // vehicle repair SAC; a line without a rate gets 18%.
  const initialLines = () =>
    Object.fromEntries(
      shownLines.map((l) => [
        l.id,
        {
          hsn: l.hsnCode ?? (l.lineType === "LABOUR" ? LABOUR_SAC : ""),
          rate: l.gstRate != null ? String(Number(l.gstRate)) : "18",
        },
      ])
    ) as Record<number, { hsn: string; rate: string }>;
  const [lines, setLines] = useState(initialLines);

  useEffect(() => {
    apiFetch("/settings/business")
      .then((body) => setBusiness(body.business))
      .catch(() => setBusiness(null));
  }, []);

  // Keep the form in step when the estimate changes (lines added, saved...).
  useEffect(() => {
    setSupplyType(estimate.supplyType ?? "INTRA");
    setInclusive(!!estimate.pricesIncludeGst);
    setGstin(savedGstin);
    setLines(initialLines());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimate, payer]);

  const fileName = `${(invoiceNumber ?? `GST-${estimate.estimateNumber}${insurer ? "-INS" : ""}`).replace(/\//g, "-")}_${invoiceFileName(
    estimate.jobCard.vehicle.registrationNumber,
    invoiceDate ?? estimate.estimateDate
  )}`;

  useEffect(() => {
    const previous = document.title;
    document.title = fileName;
    return () => {
      document.title = previous;
    };
  }, [fileName]);

  const inter = supplyType === "INTER";
  const rows = shownLines.map((l) => {
    const rate = Number(lines[l.id]?.rate ?? 18);
    return { line: l, hsn: lines[l.id]?.hsn ?? "", ...gstForLine(billAmountOf(l), rate, { inclusive, inter }) };
  });
  const sum = (f: (r: (typeof rows)[number]) => number) => Math.round(rows.reduce((t, r) => t + f(r), 0) * 100) / 100;
  const totals = {
    taxable: sum((r) => r.taxable),
    cgst: sum((r) => r.cgst),
    sgst: sum((r) => r.sgst),
    igst: sum((r) => r.igst),
    total: sum((r) => r.total),
  };
  const grandTotal = Math.round(totals.total);
  const roundOff = Math.round((grandTotal - totals.total) * 100) / 100;

  // Tax summary by GST rate, as printed under the lines.
  const byRate = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const r of rows) {
    const t = byRate.get(r.rate) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    byRate.set(r.rate, { taxable: t.taxable + r.taxable, cgst: t.cgst + r.cgst, sgst: t.sgst + r.sgst, igst: t.igst + r.igst });
  }

  const dirty =
    supplyType !== (estimate.supplyType ?? "INTRA") ||
    inclusive !== !!estimate.pricesIncludeGst ||
    gstin.trim().toUpperCase() !== savedGstin ||
    shownLines.some(
      (l) =>
        (lines[l.id]?.hsn.trim() || null) !== (l.hsnCode ?? null) ||
        Number(lines[l.id]?.rate) !== (l.gstRate != null ? Number(l.gstRate) : NaN)
    );

  async function save(): Promise<GstEstimate | null> {
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const body = await apiFetch(`/estimates/${estimate.id}/gst`, {
        method: "PATCH",
        body: JSON.stringify({
          supplyType,
          pricesIncludeGst: inclusive,
          [insurer ? "insuranceGstin" : "customerGstin"]: gstin.trim(),
          lines: shownLines.map((l) => ({
            id: l.id,
            hsnCode: lines[l.id]?.hsn.trim() || null,
            gstRate: Number(lines[l.id]?.rate),
          })),
        }),
      });
      onUpdated(body.estimate);
      return body.estimate;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the GST details");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    if (
      !window.confirm(
        `Generate the ${insurer ? "insurance company's " : ""}GST invoice number? After this its HSN/SAC and GST %, who pays for each line, and the estimate's lines can't be changed, and the job card can't be reopened.`
      )
    )
      return;
    if (dirty && !(await save())) return;
    setSaving(true);
    try {
      const body = await apiFetch(`/estimates/${estimate.id}/gst-invoice`, { method: "POST", body: JSON.stringify({ payer }) });
      onUpdated(body.estimate);
      setNotice(`GST invoice ${insurer ? body.estimate.insuranceGstInvoiceNumber : body.estimate.gstInvoiceNumber} generated.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate the GST invoice");
    } finally {
      setSaving(false);
    }
  }

  async function removeBillLine(lineId: number) {
    if (!window.confirm("Remove this line from the bill and the tax invoice?")) return;
    setError(null);
    setNotice(null);
    try {
      const body = await apiFetch(`/estimates/${estimate.id}/bill-lines/${lineId}`, { method: "DELETE" });
      onUpdated(body.estimate);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove the line");
    }
  }

  const [numberDraft, setNumberDraft] = useState<string | null>(null);
  async function saveNumber(e: FormEvent) {
    e.preventDefault();
    if (numberDraft == null) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const body = await apiFetch(`/estimates/${estimate.id}/gst-invoice-number`, {
        method: "PATCH",
        body: JSON.stringify({ payer, number: numberDraft }),
      });
      onUpdated(body.estimate);
      setNumberDraft(null);
      setNotice(`Invoice number changed to ${insurer ? body.estimate.insuranceGstInvoiceNumber : body.estimate.gstInvoiceNumber}. The next GST invoice follows on from the last one made.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change the invoice number");
    } finally {
      setSaving(false);
    }
  }

  async function downloadPdf() {
    if (!printRef.current) return;
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

  const { jobCard } = estimate;
  const customer = jobCard.vehicle.customer;
  const shareText = `Dear ${insurer ? "Sir / Madam" : `${customer.name} Ji`},\nPlease find the GST invoice${
    invoiceNumber ? ` ${invoiceNumber}` : ""
  } for vehicle ${jobCard.vehicle.registrationNumber}${insurer && jobCard.claimNumber ? ` (claim ${jobCard.claimNumber})` : ""}.\nTotal: ${money(
    grandTotal
  )}\n— ${business?.businessName ?? "Motors Mitra"}`;
  const th = "border border-gray-300 px-1.5 py-1 text-left font-semibold";
  const td = "border border-gray-300 px-1.5 py-1";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print
        </Button>
        <Button variant="secondary" onClick={downloadPdf} disabled={downloading}>
          <Download className="h-4 w-4" /> {downloading ? "Preparing PDF..." : "Download PDF"}
        </Button>
        <SharePdfButton
          getElement={() => printRef.current}
          fileName={fileName}
          mobile={insurer ? null : customer.mobile}
          text={shareText}
          onError={setError}
        />
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">{error}</p>}
      {notice && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 print:hidden">{notice}</p>}
      {business && !business.gstin && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 print:hidden">
          The workshop&apos;s GSTIN isn&apos;t set yet, so it won&apos;t print on the invoice.{" "}
          {isAdmin ? (
            <Link href="/dashboard/settings" className="font-medium underline">
              Add it in Settings → Business details
            </Link>
          ) : (
            "Ask an admin to add it in Settings."
          )}
        </p>
      )}

      {generated && isAdmin && (
        <Card className="print:hidden">
          <CardBody>
            {numberDraft == null ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-700">
                  Invoice number <span className="font-mono font-semibold">{invoiceNumber}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setNumberDraft(invoiceNumber ?? "")}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  <Pencil className="h-3 w-3" /> Change number
                </button>
              </div>
            ) : (
              <form onSubmit={saveNumber} className="flex flex-wrap items-end gap-2">
                <div>
                  <Label>New invoice number</Label>
                  <Input
                    value={numberDraft}
                    maxLength={16}
                    onChange={(e) => setNumberDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9/-]/g, ""))}
                    className="w-56 font-mono uppercase"
                  />
                </div>
                <Button type="submit" size="sm" disabled={saving || !numberDraft.trim()}>
                  {saving ? "Saving..." : "Save number"}
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setNumberDraft(null)} disabled={saving}>
                  Cancel
                </Button>
                <p className="w-full text-xs text-gray-500">
                  Up to 16 letters or digits, with / or -. The next GST invoice gets the number after the last one made (e.g.
                  GST/2026-27/0151 → GST/2026-27/0152).
                </p>
              </form>
            )}
          </CardBody>
        </Card>
      )}

      {/* GST details — editable until the invoice number is generated */}
      <Card className="print:hidden">
        <CardBody className="space-y-3">
          <p className="text-sm font-semibold text-gray-900">
            GST details{insurer ? " — insurance company's invoice" : ""}{" "}
            {generated && <span className="font-normal text-gray-500">— fixed once the invoice was generated</span>}
          </p>
          {shownLines.length === 0 && (
            <p className="text-sm text-gray-500">
              No lines are billed to the {insurer ? "insurance company" : "customer"} — choose who pays for each line on the
              Customer / Insurance tab.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label>Supply</Label>
              <Select value={supplyType} disabled={sharedLocked} onChange={(e) => setSupplyType(e.target.value as "INTRA" | "INTER")}>
                <option value="INTRA">Within the state — CGST + SGST</option>
                <option value="INTER">To another state — IGST</option>
              </Select>
            </div>
            <div>
              <Label>{insurer ? "Insurance company GSTIN" : "Customer GSTIN (if registered)"}</Label>
              <Input
                value={gstin}
                disabled={generated}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="e.g. 06ABCDE1234F1Z5"
                maxLength={15}
                className="uppercase"
              />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
              <input type="checkbox" checked={inclusive} disabled={sharedLocked} onChange={(e) => setInclusive(e.target.checked)} />
              Estimate prices already include GST
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="py-1 pr-2">Line</th>
                  <th className="py-1 pr-2">HSN / SAC</th>
                  <th className="py-1 pr-2">GST %</th>
                  <th className="py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {shownLines.map((l) => (
                  <tr key={l.id} className="border-t border-gray-100">
                    <td className="py-1.5 pr-2">
                      {l.description}
                      <span className="ml-1 text-xs text-gray-500">{l.lineType === "LABOUR" ? "(labour)" : ""}</span>
                      {l.billOnly && (
                        <span className="ml-1 rounded bg-blue-50 px-1 text-[11px] font-medium text-blue-700">Added on bill</span>
                      )}
                      {!l.billOnly && l.billRate != null && (
                        <span className="block text-xs text-gray-500">
                          Bill rate {money(billRateOf(l))} (estimate {money(Number(l.rate))})
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        value={lines[l.id]?.hsn ?? ""}
                        disabled={generated}
                        inputMode="numeric"
                        maxLength={10}
                        placeholder={l.lineType === "LABOUR" ? LABOUR_SAC : "e.g. 8708"}
                        onChange={(e) =>
                          setLines((prev) => ({ ...prev, [l.id]: { ...prev[l.id], hsn: e.target.value.replace(/\D/g, "") } }))
                        }
                        className="w-28 py-1"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Select
                        value={lines[l.id]?.rate ?? "18"}
                        disabled={generated}
                        onChange={(e) => setLines((prev) => ({ ...prev, [l.id]: { ...prev[l.id], rate: e.target.value } }))}
                        className="w-24 py-1"
                      >
                        {GST_RATES.map((r) => (
                          <option key={r} value={String(r)}>
                            {r}%
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="py-1.5 text-right">
                      {money(billAmountOf(l))}
                      {l.billOnly && !generated && closed && (
                        <button
                          type="button"
                          onClick={() => removeBillLine(l.id)}
                          className="ml-2 align-middle text-red-600 hover:text-red-700"
                          title="Remove from the bill"
                        >
                          <Trash2 className="inline h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!generated && closed && (
            <AddBillLine
              estimateId={estimate.id}
              payer={payer}
              onAdded={(e) => {
                setNotice(null);
                onUpdated(e);
              }}
            />
          )}
          {!generated && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={save} disabled={saving || !dirty}>
                {saving ? "Saving..." : dirty ? "Save GST details" : "Saved"}
              </Button>
              <Button type="button" size="sm" onClick={generate} disabled={saving || shownLines.length === 0 || !closed}>
                <FileCheck2 className="h-4 w-4" /> Generate GST invoice number
              </Button>
              <p className="w-full text-xs text-gray-500">
                {closed
                  ? "Until the number is generated, the invoice below is a preview."
                  : `Close job card ${jobCard.jobCardNumber} first — the GST invoice is made from the final estimate. The invoice below is a preview.`}{" "}
                Numbers follow on from the last GST invoice (GST/2026-27/0001, 0002… each financial year).
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* The printable GST invoice */}
      <div ref={printRef} className="rounded-md border border-gray-200 bg-white p-5 text-gray-900 print:border-0 print:p-0">
        <div className="mb-3 flex items-start justify-between gap-4 border-b border-gray-300 pb-3">
          <div className="text-sm">
            <h1 className="text-xl font-bold">{business?.businessName || "Motors Mitra"}</h1>
            {business?.address && <p className="whitespace-pre-line text-gray-700">{business.address}</p>}
            {(business?.phone || business?.email) && (
              <p className="text-gray-700">{[business?.phone, business?.email].filter(Boolean).join(" · ")}</p>
            )}
            {business?.gstin && <p className="font-semibold">GSTIN: {business.gstin}</p>}
            {business?.state && (
              <p className="text-gray-700">
                State: {business.state}
                {business.stateCode ? ` (${business.stateCode})` : ""}
              </p>
            )}
          </div>
          <div className="text-right text-sm">
            <p className="text-base font-bold tracking-wide">TAX INVOICE</p>
            <p className="font-mono font-semibold">{invoiceNumber ?? "PREVIEW — not generated"}</p>
            <p className="text-gray-600">Date: {new Date(invoiceDate ?? estimate.estimateDate).toLocaleDateString()}</p>
            <p className="text-gray-600">Estimate: {estimate.estimateNumber}</p>
            <p className="text-gray-600">Job Card: {jobCard.jobCardNumber}</p>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="mb-0.5 font-semibold">Bill to</p>
            {insurer ? (
              <>
                <p>{jobCard.insuranceCompany || "Insurance company"}</p>
                {jobCard.claimNumber && <p>Claim No.: {jobCard.claimNumber}</p>}
                {estimate.insuranceGstin && <p className="font-semibold">GSTIN: {estimate.insuranceGstin}</p>}
                <p className="text-gray-600">Insured: {customer.name}</p>
              </>
            ) : (
              <>
                <p>{customer.name}</p>
                <p>Mobile: {customer.mobile}</p>
                {customer.address && <p>{customer.address}</p>}
                {estimate.customerGstin && <p className="font-semibold">GSTIN: {estimate.customerGstin}</p>}
              </>
            )}
            <p className="text-gray-600">Supply: {inter ? "Inter-state (IGST)" : "Within the state (CGST + SGST)"}</p>
          </div>
          <div>
            <p className="mb-0.5 font-semibold">Vehicle</p>
            <p>Reg. No.: {jobCard.vehicle.registrationNumber}</p>
            <p>
              {jobCard.vehicle.make} {jobCard.vehicle.model}
              {jobCard.vehicle.variant ? ` ${jobCard.vehicle.variant}` : ""}
            </p>
            <p>KM reading: {jobCard.kmAtService ?? "—"}</p>
            {jobCard.insuranceCompany && <p>Insurance: {jobCard.insuranceCompany}</p>}
            {jobCard.claimNumber && <p>Claim No.: {jobCard.claimNumber}</p>}
          </div>
        </div>

        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50">
              <th className={th}>#</th>
              <th className={th}>Description</th>
              <th className={th}>HSN/SAC</th>
              <th className={`${th} text-right`}>Qty</th>
              <th className={`${th} text-right`}>Rate</th>
              <th className={`${th} text-right`}>Taxable</th>
              <th className={`${th} text-right`}>GST %</th>
              <th className={`${th} text-right`}>CGST</th>
              <th className={`${th} text-right`}>SGST</th>
              <th className={`${th} text-right`}>IGST</th>
              <th className={`${th} text-right`}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.line.id}>
                <td className={td}>{i + 1}</td>
                <td className={td}>{r.line.description}</td>
                <td className={td}>{r.hsn || "—"}</td>
                <td className={`${td} text-right`}>{fmtQty(r.line.quantity)}</td>
                {/* Rate before GST, so Qty × Rate = Taxable even when prices include GST. */}
                <td className={`${td} text-right`}>{amt(inclusive ? billRateOf(r.line) / (1 + r.rate / 100) : billRateOf(r.line))}</td>
                <td className={`${td} text-right`}>{amt(r.taxable)}</td>
                <td className={`${td} text-right`}>{r.rate}%</td>
                <td className={`${td} text-right`}>{inter ? "—" : amt(r.cgst)}</td>
                <td className={`${td} text-right`}>{inter ? "—" : amt(r.sgst)}</td>
                <td className={`${td} text-right`}>{inter ? amt(r.igst) : "—"}</td>
                <td className={`${td} text-right font-medium`}>{amt(r.total)}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-semibold">
              <td className={td} colSpan={5}>
                Total
              </td>
              <td className={`${td} text-right`}>{amt(totals.taxable)}</td>
              <td className={td} />
              <td className={`${td} text-right`}>{inter ? "—" : amt(totals.cgst)}</td>
              <td className={`${td} text-right`}>{inter ? "—" : amt(totals.sgst)}</td>
              <td className={`${td} text-right`}>{inter ? amt(totals.igst) : "—"}</td>
              <td className={`${td} text-right`}>{amt(totals.total)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-3 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <table className="h-fit w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50">
                <th className={th}>GST %</th>
                <th className={`${th} text-right`}>Taxable</th>
                {inter ? (
                  <th className={`${th} text-right`}>IGST</th>
                ) : (
                  <>
                    <th className={`${th} text-right`}>CGST</th>
                    <th className={`${th} text-right`}>SGST</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {[...byRate.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([rate, t]) => (
                  <tr key={rate}>
                    <td className={td}>{rate}%</td>
                    <td className={`${td} text-right`}>{amt(t.taxable)}</td>
                    {inter ? (
                      <td className={`${td} text-right`}>{amt(t.igst)}</td>
                    ) : (
                      <>
                        <td className={`${td} text-right`}>{amt(t.cgst)}</td>
                        <td className={`${td} text-right`}>{amt(t.sgst)}</td>
                      </>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Taxable value</span>
              <span>{money(totals.taxable)}</span>
            </div>
            {inter ? (
              <div className="flex justify-between">
                <span>IGST</span>
                <span>{money(totals.igst)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <span>CGST</span>
                  <span>{money(totals.cgst)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST</span>
                  <span>{money(totals.sgst)}</span>
                </div>
              </>
            )}
            {roundOff !== 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Round off</span>
                <span>
                  {roundOff > 0 ? "+" : "−"}
                  {money(Math.abs(roundOff))}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-300 pt-1 text-base font-bold">
              <span>Invoice total</span>
              <span>{money(grandTotal)}</span>
            </div>
            <p className="text-xs text-gray-600">Rupees {rupeesInWords(grandTotal)} Only</p>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-10 text-sm">
          <div>
            <div className="h-12 border-b border-gray-400" />
            <p className="mt-1 font-semibold">{insurer ? "Received by (insurance company)" : "Customer Signature"}</p>
          </div>
          <div>
            <div className="h-12 border-b border-gray-400" />
            <p className="mt-1 font-semibold">For {business?.businessName || "Motors Mitra"}</p>
            <p className="text-xs text-gray-500">Authorised signatory</p>
          </div>
        </div>
      </div>
    </div>
  );
}

type LineKind = "INVENTORY" | "OUTSIDE" | "LABOUR";

interface FoundItem {
  id: number;
  itemCode: string;
  name: string;
  uom: string;
  sellingPrice: string;
  currentStock: number;
}

// Adds a line to this payer's bill and tax invoice only: an inventory item
// (by item code — its name, MRP, HSN and GST % fill in), a part that isn't in
// inventory, or labour. It isn't added to the estimate or the job card, so it
// doesn't take anything out of stock.
function AddBillLine({ estimateId, payer, onAdded }: { estimateId: number; payer: Payer; onAdded: (e: GstEstimate) => void }) {
  const [kind, setKind] = useState<LineKind>("INVENTORY");
  const [code, setCode] = useState("");
  const [found, setFound] = useState<FoundItem | null | "notfound">(null);
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const qty = Number(quantity);
    if (!(qty > 0)) return setError("Quantity must be more than 0 (e.g. 1, 2 or 0.5)");
    if (kind === "INVENTORY" && (found == null || found === "notfound")) return setError("Enter the item code of an item in inventory");
    if (kind !== "INVENTORY" && !description.trim()) return setError("Enter a description");
    if (rate.trim() === "" || Number(rate) < 0) return setError("Enter the rate");
    setBusy(true);
    try {
      const body = await apiFetch(`/estimates/${estimateId}/bill-lines`, {
        method: "POST",
        body: JSON.stringify({
          payer,
          lineType: kind === "LABOUR" ? "LABOUR" : "PART",
          itemId: kind === "INVENTORY" && found && found !== "notfound" ? found.id : undefined,
          description: kind === "INVENTORY" ? undefined : description.trim(),
          quantity: qty,
          rate: Number(rate),
        }),
      });
      onAdded(body.estimate);
      setCode("");
      setFound(null);
      setDescription("");
      setQuantity("1");
      setRate("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add the line");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={add} className="space-y-2 border-t border-gray-100 pt-3">
      <p className="text-sm font-semibold text-gray-900">Add a line to this invoice</p>
      <div className="flex flex-wrap gap-4 text-sm text-gray-700">
        {(
          [
            ["INVENTORY", "Item from inventory"],
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
            <Input inputMode="numeric" placeholder="e.g. 0001" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </div>
        ) : (
          <div>
            <Label>{kind === "LABOUR" ? "Labour / service" : "Part description"}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        )}
        <div>
          <Label>Qty</Label>
          <Input type="number" min={0.01} step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div>
          <Label>Rate</Label>
          <Input type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Adding..." : "Add"}
        </Button>
      </div>
      {kind === "INVENTORY" && found === "notfound" && (
        <p className="text-sm text-red-700">No item with code {code}. Use “Part not in inventory” instead.</p>
      )}
      {kind === "INVENTORY" && found && found !== "notfound" && (
        <p className="text-sm text-blue-800">
          {found.itemCode} — {found.name} · MRP {money(Number(found.sellingPrice))}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-gray-500">
        Goes on this bill and tax invoice only — not on the estimate or the job card, and it doesn&apos;t take anything out
        of stock (for a part used from stock, add it on the job card instead). Set its HSN and GST % above.
      </p>
    </form>
  );
}
