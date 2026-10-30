"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, FileCheck2, Printer } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input, Select, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { SharePdfButton } from "@/components/SharePdfButton";
import { downloadElementAsPdf, invoiceFileName } from "@/lib/invoicePdf";
import { GST_RATES, LABOUR_SAC, gstForLine, rupeesInWords } from "@/lib/gst";
import { fmtQty } from "@/lib/format";

export interface GstEstimate {
  id: number;
  estimateNumber: string;
  estimateDate: string;
  gstInvoiceNumber?: string | null;
  gstInvoiceDate?: string | null;
  supplyType?: "INTRA" | "INTER";
  pricesIncludeGst?: boolean;
  customerGstin?: string | null;
  lines: {
    id: number;
    lineType: "PART" | "LABOUR";
    description: string;
    quantity: number;
    rate: string;
    amount: string;
    hsnCode?: string | null;
    gstRate?: string | null;
    item: { itemCode: string } | null;
  }[];
  jobCard: {
    jobCardNumber: string;
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
// The details can be changed until the invoice number is generated; after
// that it's fixed and can be printed, downloaded or shared any time.
export function GstInvoice({
  estimate,
  onUpdated,
}: {
  estimate: GstEstimate;
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

  const generated = !!estimate.gstInvoiceNumber;
  const [supplyType, setSupplyType] = useState<"INTRA" | "INTER">(estimate.supplyType ?? "INTRA");
  const [inclusive, setInclusive] = useState(!!estimate.pricesIncludeGst);
  const [customerGstin, setCustomerGstin] = useState(estimate.customerGstin ?? "");
  // Per line: HSN/SAC and GST %. Labour without a code gets the motor
  // vehicle repair SAC; a line without a rate gets 18%.
  const initialLines = () =>
    Object.fromEntries(
      estimate.lines.map((l) => [
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
    setCustomerGstin(estimate.customerGstin ?? "");
    setLines(initialLines());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimate]);

  const fileName = `${(estimate.gstInvoiceNumber ?? `GST-${estimate.estimateNumber}`).replace(/\//g, "-")}_${invoiceFileName(
    estimate.jobCard.vehicle.registrationNumber,
    estimate.gstInvoiceDate ?? estimate.estimateDate
  )}`;

  useEffect(() => {
    const previous = document.title;
    document.title = fileName;
    return () => {
      document.title = previous;
    };
  }, [fileName]);

  const inter = supplyType === "INTER";
  const rows = estimate.lines.map((l) => {
    const rate = Number(lines[l.id]?.rate ?? 18);
    return { line: l, hsn: lines[l.id]?.hsn ?? "", ...gstForLine(Number(l.amount), rate, { inclusive, inter }) };
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
    customerGstin.trim().toUpperCase() !== (estimate.customerGstin ?? "") ||
    estimate.lines.some(
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
          customerGstin: customerGstin.trim(),
          lines: estimate.lines.map((l) => ({
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
        "Generate the GST invoice number? After this the HSN/SAC, GST % and the estimate's lines can't be changed."
      )
    )
      return;
    if (dirty && !(await save())) return;
    setSaving(true);
    try {
      const body = await apiFetch(`/estimates/${estimate.id}/gst-invoice`, { method: "POST" });
      onUpdated(body.estimate);
      setNotice(`GST invoice ${body.estimate.gstInvoiceNumber} generated.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate the GST invoice");
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
  const shareText = `Dear ${customer.name} Ji,\nPlease find the GST invoice${
    estimate.gstInvoiceNumber ? ` ${estimate.gstInvoiceNumber}` : ""
  } for vehicle ${jobCard.vehicle.registrationNumber}.\nTotal: ${money(grandTotal)}\n— ${business?.businessName ?? "Motors Mitra"}`;
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
          mobile={customer.mobile}
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

      {/* GST details — editable until the invoice number is generated */}
      <Card className="print:hidden">
        <CardBody className="space-y-3">
          <p className="text-sm font-semibold text-gray-900">
            GST details{" "}
            {generated && <span className="font-normal text-gray-500">— fixed once the invoice was generated</span>}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label>Supply</Label>
              <Select value={supplyType} disabled={generated} onChange={(e) => setSupplyType(e.target.value as "INTRA" | "INTER")}>
                <option value="INTRA">Within the state — CGST + SGST</option>
                <option value="INTER">To another state — IGST</option>
              </Select>
            </div>
            <div>
              <Label>Customer GSTIN (if registered)</Label>
              <Input
                value={customerGstin}
                disabled={generated}
                onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                placeholder="e.g. 06ABCDE1234F1Z5"
                maxLength={15}
                className="uppercase"
              />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
              <input type="checkbox" checked={inclusive} disabled={generated} onChange={(e) => setInclusive(e.target.checked)} />
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
                {estimate.lines.map((l) => (
                  <tr key={l.id} className="border-t border-gray-100">
                    <td className="py-1.5 pr-2">
                      {l.description}
                      <span className="ml-1 text-xs text-gray-500">{l.lineType === "LABOUR" ? "(labour)" : ""}</span>
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
                    <td className="py-1.5 text-right">{money(Number(l.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!generated && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={save} disabled={saving || !dirty}>
                {saving ? "Saving..." : dirty ? "Save GST details" : "Saved"}
              </Button>
              <Button type="button" size="sm" onClick={generate} disabled={saving || estimate.lines.length === 0}>
                <FileCheck2 className="h-4 w-4" /> Generate GST invoice number
              </Button>
              <p className="w-full text-xs text-gray-500">
                Until the number is generated, the invoice below is a preview. Numbers run GST/2026-27/0001, 0002… each
                financial year.
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
            <p className="font-mono font-semibold">{estimate.gstInvoiceNumber ?? "PREVIEW — not generated"}</p>
            <p className="text-gray-600">
              Date: {new Date(estimate.gstInvoiceDate ?? estimate.estimateDate).toLocaleDateString()}
            </p>
            <p className="text-gray-600">Estimate: {estimate.estimateNumber}</p>
            <p className="text-gray-600">Job Card: {jobCard.jobCardNumber}</p>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="mb-0.5 font-semibold">Bill to</p>
            <p>{customer.name}</p>
            <p>Mobile: {customer.mobile}</p>
            {customer.address && <p>{customer.address}</p>}
            {estimate.customerGstin && <p className="font-semibold">GSTIN: {estimate.customerGstin}</p>}
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
                <td className={`${td} text-right`}>{amt(inclusive ? Number(r.line.rate) / (1 + r.rate / 100) : Number(r.line.rate))}</td>
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
            <p className="mt-1 font-semibold">Customer Signature</p>
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
