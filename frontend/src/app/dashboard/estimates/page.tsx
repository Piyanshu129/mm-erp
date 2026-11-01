"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Search, Receipt } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { Badge, PaymentStatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface EstimateRow {
  id: number;
  estimateNumber: string;
  estimateDate: string;
  status: "DRAFT" | "APPROVED";
  totalAmount: number;
  gstInvoiceNumber: string | null;
  insuranceGstInvoiceNumber?: string | null;
  jobCard: {
    id: number;
    jobCardNumber: string;
    status: string;
    jobType: string | null;
    vehicle: { registrationNumber: string; customer: { name: string; mobile: string } };
    invoices: { id: number; payer: "CUSTOMER" | "INSURANCE"; totalAmount: string; paymentAmount: string }[];
  };
}

const PAGE_SIZE = 50;

// Every estimate, newest first. Once its job card is closed an estimate is
// the bill: the customer's (and, on an accidental claim, the insurance
// company's) total, paid and due show here.
function EstimatesPageContent() {
  const [rows, setRows] = useState<EstimateRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");

  async function load(nextPage: number, search: string) {
    setError(null);
    if (nextPage === 1) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(PAGE_SIZE) });
      if (search) params.set("q", search);
      const body = await apiFetch(`/estimates?${params}`);
      setRows((prev) => (nextPage === 1 ? body.estimates : [...prev, ...body.estimates]));
      setTotal(body.total);
      setPage(nextPage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the estimates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1, "");
  }, []);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    setQuery(q.trim());
    load(1, q.trim());
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estimates"
        description="Every job card's estimate. Closing a job card makes its estimate the bill — payments are taken on the estimate."
      />

      <form onSubmit={handleSearch} className="flex max-w-md gap-2">
        <Input placeholder="Estimate, job card, vehicle number or customer" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="secondary">
          <Search className="h-4 w-4" /> Search
        </Button>
      </form>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <TableSkeleton cols={8} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No estimates found"
          description={query ? "Try a different search." : "An estimate is made from a job card, or when the job card is closed."}
        />
      ) : (
        <>
          <Table minWidth={980}>
            <thead>
              <tr>
                <Th>Estimate</Th>
                <Th>Date</Th>
                <Th>Job Card</Th>
                <Th>Vehicle / Customer</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Paid</Th>
                <Th className="text-right">Due</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const closed = e.jobCard.status === "INVOICED";
                const bills = e.jobCard.invoices;
                const billed = bills.reduce((t, b) => t + Number(b.totalAmount), 0);
                const paid = bills.reduce((t, b) => t + Number(b.paymentAmount), 0);
                const insurance = bills.find((b) => b.payer === "INSURANCE");
                return (
                  <Tr key={e.id}>
                    <Td>
                      <Link href={`/dashboard/estimates/${e.id}`} className="font-mono font-medium text-blue-600 hover:underline">
                        {e.estimateNumber}
                      </Link>
                      {(e.gstInvoiceNumber || e.insuranceGstInvoiceNumber) && (
                        <span className="block text-xs text-gray-500">
                          {[e.gstInvoiceNumber, e.insuranceGstInvoiceNumber].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">{new Date(e.estimateDate).toLocaleDateString()}</Td>
                    <Td>
                      <Link href={`/dashboard/jobcards/${e.jobCard.id}`} className="font-mono text-gray-900 hover:text-blue-600 hover:underline">
                        {e.jobCard.jobCardNumber}
                      </Link>
                    </Td>
                    <Td>
                      <span className="font-medium text-gray-900">{e.jobCard.vehicle.registrationNumber}</span>
                      <span className="block text-xs text-gray-500">
                        {e.jobCard.vehicle.customer.name} · {e.jobCard.vehicle.customer.mobile}
                      </span>
                    </Td>
                    <Td className="text-right">
                      {formatINR(bills.length ? billed : e.totalAmount)}
                      {insurance && (
                        <span className="block text-xs text-gray-500">Insurance {formatINR(insurance.totalAmount)}</span>
                      )}
                    </Td>
                    <Td className="text-right text-green-700">{bills.length ? formatINR(paid) : "—"}</Td>
                    <Td className={`text-right font-medium ${billed - paid > 0.005 ? "text-red-700" : "text-gray-900"}`}>
                      {bills.length ? formatINR(Math.max(0, billed - paid)) : "—"}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {closed ? (
                          <>
                            <Badge tone="blue">Closed — billed</Badge>
                            <PaymentStatusBadge total={billed} paid={paid} />
                          </>
                        ) : e.status === "APPROVED" ? (
                          <Badge tone="green">Customer approved</Badge>
                        ) : (
                          <Badge tone="amber">Draft</Badge>
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          {rows.length < total && (
            <Button variant="secondary" onClick={() => load(page + 1, query)}>
              Show more ({total - rows.length} more)
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export default function EstimatesPage() {
  return (
    <RequireAuth permission="JOB_CARDS">
      <EstimatesPageContent />
    </RequireAuth>
  );
}
