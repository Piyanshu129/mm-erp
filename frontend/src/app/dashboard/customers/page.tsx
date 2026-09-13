"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";

interface CustomerRow {
  id: number;
  name: string;
  mobile: string;
  address: string | null;
  isActive: boolean;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadCustomers(query: string) {
    setLoading(true);
    const body = await apiFetch(`/customers?${query ? `q=${encodeURIComponent(query)}` : ""}`);
    setCustomers(body.customers);
    setLoading(false);
  }

  useEffect(() => {
    loadCustomers("");
  }, []);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    await loadCustomers(q);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiFetch("/customers", {
        method: "POST",
        body: JSON.stringify({ name, mobile, address: address || undefined }),
      });
      setName("");
      setMobile("");
      setAddress("");
      setShowForm(false);
      await loadCustomers(q);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create customer");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Customers</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          {showForm ? "Cancel" : "+ New customer"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="max-w-md space-y-3 rounded-md border border-gray-200 p-4">
          <input
            placeholder="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Mobile number"
            required
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Address (optional)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save customer"}
          </button>
        </form>
      )}

      <form onSubmit={handleSearch} className="flex max-w-md gap-2">
        <input
          placeholder="Search by name or mobile"
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
      ) : customers.length === 0 ? (
        <p className="text-sm text-gray-500">No customers found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] border-collapse overflow-hidden rounded-md border border-gray-200 text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Mobile</th>
                <th className="px-3 py-2">Address</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t border-gray-200">
                  <td className="px-3 py-2">
                    <Link
                      href={`/dashboard/customers/${c.id}`}
                      className="text-gray-900 underline hover:no-underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{c.mobile}</td>
                  <td className="px-3 py-2">{c.address ?? "-"}</td>
                  <td className="px-3 py-2">{c.isActive ? "Active" : "Disabled"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
