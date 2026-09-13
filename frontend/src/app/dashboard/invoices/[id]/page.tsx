"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

interface InvoiceDetail {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  partsTotal: string;
  labourTotal: string;
  discount: string;
  totalAmount: string;
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
      unitPrice: string;
      amount: string;
      item: { itemCode: string; name: string; uom: string };
    }[];
    labour: { id: number; description: string; technician: string | null; quantity: number; rate: string; amount: string }[];
  };
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const body = await apiFetch(`/invoices/${id}`);
      setInvoice(body.invoice);
      setLoading(false);
    })();
  }, [id]);

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
                  <th className="py-1">Qty</th>
                  <th className="py-1 text-right">Unit Price</th>
                  <th className="py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {jobCard.parts.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100">
                    <td className="py-1">
                      {p.item.itemCode} — {p.item.name}
                    </td>
                    <td className="py-1">
                      {p.quantity} {p.item.uom}
                    </td>
                    <td className="py-1 text-right">₹{p.unitPrice}</td>
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
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">Thank you for choosing Motors Mitra.</p>
      </div>
    </div>
  );
}
