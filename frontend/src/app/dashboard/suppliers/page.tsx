"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";

interface SupplierRow {
  id: number;
  name: string;
  mobile: string | null;
  address: string | null;
  isActive: boolean;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const body = await apiFetch("/suppliers");
    setSuppliers(body.suppliers);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiFetch("/suppliers", {
        method: "POST",
        body: JSON.stringify({ name, mobile: mobile || undefined, address: address || undefined }),
      });
      setName("");
      setMobile("");
      setAddress("");
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create supplier");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Suppliers</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          {showForm ? "Cancel" : "+ New supplier"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="max-w-md space-y-3 rounded-md border border-gray-200 p-4">
          <input
            placeholder="Supplier name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Mobile (optional)"
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
            {submitting ? "Saving..." : "Save supplier"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : suppliers.length === 0 ? (
        <p className="text-sm text-gray-500">No suppliers yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[450px] border-collapse overflow-hidden rounded-md border border-gray-200 text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Mobile</th>
                <th className="px-3 py-2">Address</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-t border-gray-200">
                  <td className="px-3 py-2">{s.name}</td>
                  <td className="px-3 py-2">{s.mobile ?? "-"}</td>
                  <td className="px-3 py-2">{s.address ?? "-"}</td>
                  <td className="px-3 py-2">{s.isActive ? "Active" : "Disabled"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
