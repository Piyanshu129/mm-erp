"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Search, Receipt, Eye, Download } from "lucide-react";
import { invoiceFileName } from "@/lib/invoicePdf";
import { formatINR } from "@/lib/format";
import { PaymentStatusBadge } from "@/components/ui/Badge";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: string;
  paymentAmount: string;
  jobCard: {
    jobCardNumber: string;
    vehicle: { registrationNumber: string; customer: { name: string } };
  };
}

function InvoicesPageContent() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  async function load(query: string) {
    setLoading(true);
    const body = await apiFetch(`/invoices?${query ? `q=${encodeURIComponent(query)}` : ""}`);
    setInvoices(body.invoices);
    setLoading(false);
  }

  useEffect(() => {
    load("");
  }, []);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    await load(q);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Draft Invoices"
        description="Every draft invoice generated when a job card is marked Invoiced. Downloads are named by car number and date."
      />

      <form onSubmit={handleSearch} className="flex max-w-md gap-2">
        <Input placeholder="Search by invoice #, job card # or vehicle number" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="secondary">
          <Search className="h-4 w-4" /> Search
        </Button>
      </form>

      {loading ? (
        <TableSkeleton cols={6} />
      ) : invoices.length === 0 ? (
        <EmptyState icon={Receipt} title="No draft invoices yet" description="Draft invoices appear here once a job card is marked Invoiced." />
      ) : (
        <Table minWidth={1000}>
          <thead>
            <tr>
              <Th>Draft Invoice #</Th>
              <Th>Date</Th>
              <Th>Job Card</Th>
              <Th>Vehicle</Th>
              <Th>Customer</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">Paid</Th>
              <Th className="text-right">Due</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <Tr key={inv.id}>
                <Td className="font-mono">
                  <Link href={`/dashboard/invoices/${inv.id}`} className="font-medium text-gray-900 hover:text-blue-600 hover:underline">
                    {inv.invoiceNumber}
                  </Link>
                </Td>
                <Td>{new Date(inv.invoiceDate).toLocaleDateString()}</Td>
                <Td className="font-mono">{inv.jobCard.jobCardNumber}</Td>
                <Td>{inv.jobCard.vehicle.registrationNumber}</Td>
                <Td>{inv.jobCard.vehicle.customer.name}</Td>
                <Td className="text-right font-medium text-gray-900">{formatINR(inv.totalAmount)}</Td>
                <Td className="text-right text-green-700">{formatINR(inv.paymentAmount)}</Td>
                <Td
                  className={`text-right font-medium ${Number(inv.totalAmount) - Number(inv.paymentAmount) > 0 ? "text-red-700" : "text-gray-900"}`}
                >
                  {formatINR(Number(inv.totalAmount) - Number(inv.paymentAmount))}
                </Td>
                <Td>
                  <PaymentStatusBadge total={Number(inv.totalAmount)} paid={Number(inv.paymentAmount)} />
                </Td>
                <Td>
                  <div className="flex justify-end gap-3 whitespace-nowrap">
                    <Link
                      href={`/dashboard/invoices/${inv.id}`}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    >
                      <Eye className="h-3 w-3" /> View
                    </Link>
                    <Link
                      href={`/dashboard/invoices/${inv.id}?download=1`}
                      title={`${invoiceFileName(inv.jobCard.vehicle.registrationNumber, inv.invoiceDate)}.pdf`}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    >
                      <Download className="h-3 w-3" /> Download
                    </Link>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <RequireAuth permission="INVOICES">
      <InvoicesPageContent />
    </RequireAuth>
  );
}
