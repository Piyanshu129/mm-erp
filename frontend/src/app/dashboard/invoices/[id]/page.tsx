"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { PaymentStatusBadge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";

const PAYMENT_MODES = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"];

interface InvoiceDetail {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  partsTotal: string;
  labourTotal: string;
  discount: string;
  totalAmount: string;
  paymentAmount: string;
  paymentMode: string | null;
  paymentReference: string | null;
  paymentReceivedBy: string | null;
  paymentDate: string | null;
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
      itemUnitId: number;
      amount: string;
      item: { itemCode: string; name: string; uom: string };
    }[];
    labour: { id: number; description: string; technician: string | null; quantity: number; rate: string; amount: string }[];
  };
}

function InvoiceDetailPageContent() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("");
  const [payRef, setPayRef] = useState("");
  const [payBy, setPayBy] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [paySubmitting, setPaySubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const body = await apiFetch(`/invoices/${id}`);
    setInvoice(body.invoice);
    setPayAmount(body.invoice.paymentAmount);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function submitPayment(e: FormEvent) {
    e.preventDefault();
    setPayError(null);
    setPaySubmitting(true);
    try {
      await apiFetch(`/invoices/${id}/payment`, {
        method: "PATCH",
        body: JSON.stringify({
          paymentAmount: Number(payAmount),
          paymentMode: payMode || undefined,
          paymentReference: payRef || undefined,
          paymentReceivedBy: payBy || undefined,
        }),
      });
      setPayMode("");
      setPayRef("");
      setPayBy("");
      await load();
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : "Could not record payment");
    } finally {
      setPaySubmitting(false);
    }
  }

  if (loading || !invoice) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const { jobCard } = invoice;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/dashboard/invoices" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> All invoices
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </Button>
      </div>

      <div className="rounded-md border border-gray-200 bg-white p-6 print:border-0 print:p-0">
        <div className="mb-6 flex items-start justify-between border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-xl font-bold">Motors Mitra</h1>
            <p className="text-sm text-gray-500">Multibrand Car Workshop</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-mono font-semibold">{invoice.invoiceNumber}</p>
            <p className="text-gray-500">{new Date(invoice.invoiceDate).toLocaleDateString()}</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="mb-1 font-semibold">Customer</p>
            <p>{jobCard.vehicle.customer.name}</p>
            <p>{jobCard.vehicle.customer.mobile}</p>
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
                  <th className="py-1">Serial No.</th>
                  <th className="py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {jobCard.parts.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100">
                    <td className="py-1">
                      {p.item.itemCode} — {p.item.name}
                    </td>
                    <td className="py-1 font-mono">#{p.itemUnitId}</td>
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
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">Thank you for choosing Motors Mitra.</p>
      </div>

      <Card className="print:hidden">
        <CardBody>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Customer payment</p>
            <PaymentStatusBadge total={Number(invoice.totalAmount)} paid={Number(invoice.paymentAmount)} />
          </div>
          {invoice.paymentDate && (
            <p className="mb-3 text-xs text-gray-500">
              Last recorded: ₹{invoice.paymentAmount} via {invoice.paymentMode ?? "-"} on{" "}
              {new Date(invoice.paymentDate).toLocaleString()}
              {invoice.paymentReceivedBy ? ` (received by ${invoice.paymentReceivedBy})` : ""}
            </p>
          )}
          <form onSubmit={submitPayment} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              type="number"
              step="0.01"
              placeholder="Total amount paid so far"
              required
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
            <Select value={payMode} onChange={(e) => setPayMode(e.target.value)}>
              <option value="">Payment mode...</option>
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m.replace("_", " ")}
                </option>
              ))}
            </Select>
            <Input placeholder="Reference / transaction ID" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
            <Input placeholder="Received by" value={payBy} onChange={(e) => setPayBy(e.target.value)} />
            {payError && <p className="text-sm text-red-600 sm:col-span-2">{payError}</p>}
            <Button type="submit" disabled={paySubmitting} className="sm:col-span-2">
              {paySubmitting ? "Saving..." : "Save payment"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

export default function InvoiceDetailPage() {
  return (
    <RequireAuth permission="INVOICES">
      <InvoiceDetailPageContent />
    </RequireAuth>
  );
}
