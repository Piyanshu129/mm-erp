"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, Search, Receipt } from "lucide-react";
import { WhatsAppMessage } from "@/components/WhatsAppMessage";
import { paymentReminder } from "@/lib/whatsappMessages";
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
    vehicle: { registrationNumber: string; make?: string; model?: string; variant?: string | null; customer: { name: string; mobile: string } };
    invoices: { id: number; payer: "CUSTOMER" | "INSURANCE"; totalAmount: string; paymentAmount: string }[];
  };
}

const PAGE_SIZE = 50;

type PaymentFilter = "" | "PENDING" | "PAID" | "OPEN";
const PAYMENT_FILTERS: { value: PaymentFilter; label: string }[] = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Payment pending" },
  { value: "PAID", label: "Paid" },
  { value: "OPEN", label: "Job card not closed" },
];

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
  const [payment, setPayment] = useState<PaymentFilter>("");
  // The estimate whose WhatsApp payment reminder is open.
  const [remindId, setRemindId] = useState<number | null>(null);

  async function load(nextPage: number, search: string, paymentFilter: PaymentFilter = payment) {
    setError(null);
    if (nextPage === 1) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(PAGE_SIZE) });
      if (search) params.set("q", search);
      if (paymentFilter) params.set("payment", paymentFilter);
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

  function changePayment(next: PaymentFilter) {
    setPayment(next);
    load(1, query, next);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estimates"
        description="Every job card's estimate. Closing a job card makes its estimate the bill — payments are taken on the estimate."
      />

      <form onSubmit={handleSearch} className="flex max-w-md gap-2">
        <Input placeholder="Estimate, job card, vehicle, car or customer" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="secondary">
          <Search className="h-4 w-4" /> Search
        </Button>
      </form>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Payment">
        {PAYMENT_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={payment === f.value}
            onClick={() => changePayment(f.value)}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${
              payment === f.value ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {f.label}
            {payment === f.value && !loading ? ` (${total})` : ""}
          </button>
        ))}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <TableSkeleton cols={8} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No estimates found"
          description={
            query || payment ? "Try a different search or filter." : "An estimate is made from a job card, or when the job card is closed."
          }
        />
      ) : (
        <>
          <Table minWidth={760}>
            <thead>
              <tr>
                <Th>Estimate</Th>
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
                // The reminder is for what the customer owes (not the insurance company).
                const customerBill = bills.find((b) => b.payer === "CUSTOMER");
                const customerDue = customerBill ? Number(customerBill.totalAmount) - Number(customerBill.paymentAmount) : 0;
                const v = e.jobCard.vehicle;
                return (
                  <Fragment key={e.id}>
                  <Tr>
                    <Td>
                      <Link href={`/dashboard/estimates/${e.id}`} className="font-mono font-medium text-blue-600 hover:underline">
                        {e.estimateNumber}
                      </Link>
                      {(e.gstInvoiceNumber || e.insuranceGstInvoiceNumber) && (
                        <span className="block text-xs text-gray-500">
                          {[e.gstInvoiceNumber, e.insuranceGstInvoiceNumber].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      <span className="block text-xs text-gray-500">{new Date(e.estimateDate).toLocaleDateString()}</span>
                    </Td>
                    <Td>
                      <Link href={`/dashboard/jobcards/${e.jobCard.id}`} className="font-mono text-gray-900 hover:text-blue-600 hover:underline">
                        {e.jobCard.jobCardNumber}
                      </Link>
                    </Td>
                    <Td>
                      <span className="font-medium text-gray-900">{e.jobCard.vehicle.registrationNumber}</span>
                      {e.jobCard.vehicle.make && (
                        <span className="block text-xs font-medium text-gray-700">
                          {[e.jobCard.vehicle.make, e.jobCard.vehicle.model, e.jobCard.vehicle.variant].filter(Boolean).join(" ")}
                        </span>
                      )}
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
                      {closed && customerDue > 0.005 && (
                        <button
                          type="button"
                          onClick={() => setRemindId(remindId === e.id ? null : e.id)}
                          className="mt-1 inline-flex items-center gap-1 text-xs font-normal text-green-700 hover:underline"
                        >
                          <MessageCircle className="h-3 w-3" /> WhatsApp reminder
                        </button>
                      )}
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
                  {remindId === e.id && customerBill && (
                    <tr>
                      <td colSpan={7} className="border-t border-gray-100 bg-green-50 px-3 py-3">
                        <div className="max-w-xl">
                          <WhatsAppMessage
                            title={`Payment reminder to ${v.customer.name} (English + Hindi)`}
                            mobile={v.customer.mobile}
                            message={paymentReminder({
                              customerName: v.customer.name,
                              registrationNumber: v.registrationNumber,
                              vehicle: [v.make, v.model].filter(Boolean).join(" "),
                              invoiceNumber: e.estimateNumber,
                              invoiceDate: e.estimateDate,
                              total: Number(customerBill.totalAmount),
                              paid: Number(customerBill.paymentAmount),
                              due: customerDue,
                            })}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
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
