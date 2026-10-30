"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer, Download, Phone } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { fmtQty } from "@/lib/format";
import { WhatsAppMessage } from "@/components/WhatsAppMessage";
import { PaymentChangeLog } from "@/components/PaymentChangeLog";
import { paymentReminder } from "@/lib/whatsappMessages";
import { invoiceFileName, downloadElementAsPdf } from "@/lib/invoicePdf";
import {
  InvoiceAccountSummary,
  InvoicePaymentHistory,
  InvoicePaymentRow,
  RecordInvoicePaymentForm,
} from "@/components/InvoiceAccountPanel";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { PaymentStatusBadge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";

interface InvoiceDetail {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  partsTotal: string;
  labourTotal: string;
  discount: string;
  totalAmount: string;
  paymentAmount: string;
  payments: InvoicePaymentRow[];
  jobCard: {
    jobCardNumber: string;
    kmAtService: number | null;
    complaint: string | null;
    vehicle: {
      registrationNumber: string;
      make: string;
      model: string;
      customer: { name: string; mobile: string; address: string | null };
    };
    parts: {
      id: number;
      quantity: number;
      rate: string;
      amount: string;
      // null for a part that isn't in inventory (then description says what it is)
      item: { itemCode: string; name: string; uom: string } | null;
      description: string | null;
    }[];
    labour: { id: number; description: string; technician: string | null; quantity: number; rate: string; amount: string }[];
  };
}

// PAID / PARTLY PAID / UNPAID, printed on the invoice itself so it shows on
// the PDF too.
function PaymentStatusStamp({ total, paid }: { total: number; paid: number }) {
  const status = paid <= 0 ? "UNPAID" : paid >= total ? "PAID" : "PARTLY PAID";
  const tone =
    status === "PAID"
      ? "border-green-600 text-green-700"
      : status === "PARTLY PAID"
        ? "border-amber-500 text-amber-700"
        : "border-red-600 text-red-700";
  return (
    <span className={`inline-block rounded border-2 px-3 py-1 text-sm font-bold tracking-wider ${tone}`}>{status}</span>
  );
}

function InvoiceDetailPageContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?download=1 — sent here by a "Download" link elsewhere; download the PDF
  // as soon as the invoice has rendered.
  const autoDownload = searchParams.get("download") === "1";
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Remounts the payment form after a save so it starts from the new amount due.
  const [payFormKey, setPayFormKey] = useState(0);

  // quiet: refresh after a payment without blanking the page.
  async function load(quiet = false) {
    if (!quiet) setLoading(true);
    const body = await apiFetch(`/invoices/${id}`);
    setInvoice(body.invoice);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fileName = invoice ? invoiceFileName(invoice.jobCard.vehicle.registrationNumber, invoice.invoiceDate) : null;

  // The browser's own Print → "Save as PDF" suggests the page title as the
  // file name, so that route gives the same name as the Download button.
  useEffect(() => {
    if (!fileName) return;
    const previous = document.title;
    document.title = fileName;
    return () => {
      document.title = previous;
    };
  }, [fileName]);

  async function downloadPdf() {
    if (!invoiceRef.current || !fileName) return;
    setDownloadError(null);
    setDownloading(true);
    try {
      await downloadElementAsPdf(invoiceRef.current, fileName);
    } catch {
      setDownloadError("Could not create the PDF — use Print / Save as PDF instead.");
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    if (!autoDownload || !invoice) return;
    // Drop the flag first so a reload doesn't download again.
    router.replace(`/dashboard/invoices/${id}`);
    downloadPdf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDownload, invoice]);


  if (loading || !invoice) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const { jobCard } = invoice;
  const balanceDue = Math.round((Number(invoice.totalAmount) - Number(invoice.paymentAmount)) * 100) / 100;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/dashboard/invoices" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> All draft invoices
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
      {fileName && (
        <p className="-mt-4 text-right text-xs text-gray-500 print:hidden">
          Saves as <span className="font-mono">{fileName}.pdf</span>
        </p>
      )}
      {downloadError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">{downloadError}</p>}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 print:hidden">
        <span className="text-sm text-gray-700">{jobCard.vehicle.customer.name}</span>
        <a
          href={`tel:${jobCard.vehicle.customer.mobile}`}
          className="inline-flex items-center gap-1.5 text-lg font-semibold text-blue-700 hover:underline"
        >
          <Phone className="h-4 w-4" /> {jobCard.vehicle.customer.mobile}
        </a>
      </div>

      <div ref={invoiceRef} className="rounded-md border border-gray-200 bg-white p-6 print:border-0 print:p-0">
        <div className="mb-6 flex items-start justify-between border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-xl font-bold">Motors Mitra</h1>
            <p className="text-sm text-gray-500">Multibrand Car Workshop</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-base font-bold tracking-wide">DRAFT INVOICE</p>
            <p className="font-mono font-semibold">{invoice.invoiceNumber}</p>
            <p className="text-gray-500">{new Date(invoice.invoiceDate).toLocaleDateString()}</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="mb-1 font-semibold">Customer</p>
            <p>{jobCard.vehicle.customer.name}</p>
            <p className="font-semibold">Mobile: {jobCard.vehicle.customer.mobile}</p>
            {jobCard.vehicle.customer.address && <p>{jobCard.vehicle.customer.address}</p>}
          </div>
          <div>
            <p className="mb-1 font-semibold">Vehicle</p>
            <p>
              {jobCard.vehicle.registrationNumber} — {jobCard.vehicle.make} {jobCard.vehicle.model}
            </p>
            <p>Job Card: {jobCard.jobCardNumber}</p>
            {jobCard.kmAtService != null && <p>KM: {jobCard.kmAtService}</p>}
          </div>
        </div>

        {jobCard.complaint && (
          <p className="mb-4 text-sm">
            <span className="font-semibold">Complaint: </span>
            {jobCard.complaint}
          </p>
        )}

        {jobCard.parts.length > 0 && (
          <div className="mb-4">
            <p className="mb-1 text-sm font-semibold">Parts</p>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-300 text-left">
                  <th className="py-1">Item</th>
                  <th className="py-1">Qty</th>
                  <th className="py-1 text-right">Rate</th>
                  <th className="py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {jobCard.parts.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100">
                    <td className="py-1">
                      {p.item ? `${p.item.itemCode} — ${p.item.name}` : (
                        <>
                          {p.description} <span className="text-xs text-gray-500">(non-inventory)</span>
                        </>
                      )}
                    </td>
                    <td className="py-1">
                      {fmtQty(p.quantity)} {p.item?.uom ?? ""}
                    </td>
                    <td className="py-1 text-right">₹{p.rate}</td>
                    <td className="py-1 text-right">₹{p.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {jobCard.labour.length > 0 && (
          <div className="mb-4">
            <p className="mb-1 text-sm font-semibold">Labour / Services</p>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-300 text-left">
                  <th className="py-1">Description</th>
                  <th className="py-1">Technician</th>
                  <th className="py-1">Qty</th>
                  <th className="py-1 text-right">Rate</th>
                  <th className="py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {jobCard.labour.map((l) => (
                  <tr key={l.id} className="border-b border-gray-100">
                    <td className="py-1">{l.description}</td>
                    <td className="py-1">{l.technician ?? "-"}</td>
                    <td className="py-1">{l.quantity}</td>
                    <td className="py-1 text-right">₹{l.rate}</td>
                    <td className="py-1 text-right">₹{l.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="ml-auto max-w-xs text-sm">
          <div className="flex justify-between py-1">
            <span>Parts total</span>
            <span>₹{invoice.partsTotal}</span>
          </div>
          <div className="flex justify-between py-1">
            <span>Labour total</span>
            <span>₹{invoice.labourTotal}</span>
          </div>
          <div className="flex justify-between py-1">
            <span>Discount</span>
            <span>-₹{invoice.discount}</span>
          </div>
          <div className="flex justify-between border-t border-gray-300 py-2 text-base font-bold">
            <span>Total</span>
            <span>₹{invoice.totalAmount}</span>
          </div>
          {Number(invoice.paymentAmount) > 0 && (
            <div className="flex justify-between py-1 text-green-700">
              <span>Paid</span>
              <span>₹{invoice.paymentAmount}</span>
            </div>
          )}
          {Number(invoice.totalAmount) - Number(invoice.paymentAmount) > 0 && (
            <div className="flex justify-between py-1 font-semibold text-red-700">
              <span>Balance due</span>
              <span>₹{(Number(invoice.totalAmount) - Number(invoice.paymentAmount)).toFixed(2)}</span>
            </div>
          )}
          <div className="mt-2 text-right">
            <PaymentStatusStamp total={Number(invoice.totalAmount)} paid={Number(invoice.paymentAmount)} />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">Thank you for choosing Motors Mitra.</p>
      </div>

      <Card className="print:hidden">
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Customer payments</p>
            <PaymentStatusBadge total={Number(invoice.totalAmount)} paid={Number(invoice.paymentAmount)} />
          </div>
          <InvoiceAccountSummary
            account={{
              invoiceCount: 1,
              totalInvoiced: Number(invoice.totalAmount),
              totalPaid: Number(invoice.paymentAmount),
              balanceDue: Number(invoice.totalAmount) - Number(invoice.paymentAmount),
            }}
          />
          <RecordInvoicePaymentForm
            key={payFormKey}
            invoices={[
              {
                id: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                due: Math.round((Number(invoice.totalAmount) - Number(invoice.paymentAmount)) * 100) / 100,
              },
            ]}
            onSaved={async () => {
              await load(true);
              setPayFormKey((k) => k + 1);
            }}
          />
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-900">Payment history</p>
            <InvoicePaymentHistory payments={invoice.payments} onChanged={() => load(true)} />
          </div>
          <PaymentChangeLog url={`/invoices/${invoice.id}/payment-audits`} refreshKey={`${invoice.paymentAmount}:${invoice.totalAmount}:${invoice.payments.length}`} />
        </CardBody>
      </Card>

      {balanceDue > 0.005 && (
        <Card className="print:hidden">
          <CardBody>
            <WhatsAppMessage
              title="Payment reminder (WhatsApp)"
              mobile={jobCard.vehicle.customer.mobile}
              message={paymentReminder({
                customerName: jobCard.vehicle.customer.name,
                registrationNumber: jobCard.vehicle.registrationNumber,
                vehicle: `${jobCard.vehicle.make} ${jobCard.vehicle.model}`.trim(),
                invoiceNumber: invoice.invoiceNumber,
                invoiceDate: invoice.invoiceDate,
                total: Number(invoice.totalAmount),
                paid: Number(invoice.paymentAmount),
                due: balanceDue,
              })}
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export default function InvoiceDetailPage() {
  return (
    <RequireAuth permission="INVOICES">
      <Suspense fallback={<p className="text-sm text-gray-500">Loading...</p>}>
        <InvoiceDetailPageContent />
      </Suspense>
    </RequireAuth>
  );
}
