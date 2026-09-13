"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Search, Receipt } from "lucide-react";
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
  jobCard: {
    jobCardNumber: string;
    vehicle: { registrationNumber: string; customer: { name: string } };
  };
}

export default function InvoicesPage() {
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
      <PageHeader title="Invoices" description="Every invoice generated from a completed job card." />

      <form onSubmit={handleSearch} className="flex max-w-md gap-2">
        <Input placeholder="Search by invoice #, job card # or vehicle number" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="secondary">
          <Search className="h-4 w-4" /> Search
        </Button>
      </form>

      {loading ? (
        <TableSkeleton cols={6} />
      ) : invoices.length === 0 ? (
        <EmptyState icon={Receipt} title="No invoices yet" description="Invoices appear here once a job card is completed and billed." />
      ) : (
        <Table minWidth={650}>
          <thead>
            <tr>
              <Th>Invoice #</Th>
              <Th>Date</Th>
              <Th>Job Card</Th>
              <Th>Vehicle</Th>
              <Th>Customer</Th>
              <Th>Total</Th>
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
                <Td className="font-medium text-gray-900">₹{inv.totalAmount}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
