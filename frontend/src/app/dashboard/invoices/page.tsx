"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

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
      <h1 className="text-lg font-semibold">Invoices</h1>

      <form onSubmit={handleSearch} className="flex max-w-md gap-2">
        <input
          placeholder="Search by invoice #, job card # or vehicle number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md border border-gray-300 px-4 py-2 text-sm">
          Search
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-gray-500">No invoices yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse overflow-hidden rounded-md border border-gray-200 text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-3 py-2">Invoice #</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Job Card</th>
                <th className="px-3 py-2">Vehicle</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-gray-200">
                  <td className="px-3 py-2">
                    <Link
                      href={`/dashboard/invoices/${inv.id}`}
                      className="font-mono text-gray-900 underline hover:no-underline"
                    >
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{new Date(inv.invoiceDate).toLocaleDateString()}</td>
                  <td className="px-3 py-2 font-mono">{inv.jobCard.jobCardNumber}</td>
                  <td className="px-3 py-2">{inv.jobCard.vehicle.registrationNumber}</td>
                  <td className="px-3 py-2">{inv.jobCard.vehicle.customer.name}</td>
                  <td className="px-3 py-2">₹{inv.totalAmount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
