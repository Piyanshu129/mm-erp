"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";

interface Vehicle {
  id: number;
  registrationNumber: string;
  make: string;
  model: string;
  currentKm: number | null;
}

interface CustomerDetail {
  id: number;
  name: string;
  mobile: string;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  vehicles: Vehicle[];
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [regNumber, setRegNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [currentKm, setCurrentKm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const body = await apiFetch(`/customers/${id}`);
    setCustomer(body.customer);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAddVehicle(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiFetch("/vehicles", {
        method: "POST",
        body: JSON.stringify({
          registrationNumber: regNumber,
          make,
          model,
          currentKm: currentKm || undefined,
          customerId: Number(id),
        }),
      });
      setRegNumber("");
      setMake("");
      setModel("");
      setCurrentKm("");
      setShowVehicleForm(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not add vehicle");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !customer) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard/customers" className="text-sm text-gray-500 underline">
          ← All customers
        </Link>
        <h1 className="mt-2 text-lg font-semibold">{customer.name}</h1>
        <dl className="mt-2 grid max-w-md grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-600">
          <dt>Mobile</dt>
          <dd>{customer.mobile}</dd>
          <dt>Email</dt>
          <dd>{customer.email ?? "-"}</dd>
          <dt>Address</dt>
          <dd>{customer.address ?? "-"}</dd>
          <dt>Status</dt>
          <dd>{customer.isActive ? "Active" : "Disabled"}</dd>
        </dl>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Vehicles</h2>
          <button
            onClick={() => setShowVehicleForm((s) => !s)}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            {showVehicleForm ? "Cancel" : "+ Add vehicle"}
          </button>
        </div>

        {showVehicleForm && (
          <form
            onSubmit={handleAddVehicle}
            className="mb-4 max-w-md space-y-3 rounded-md border border-gray-200 p-4"
          >
            <input
              placeholder="Registration number (e.g. HR06AB1234)"
              required
              value={regNumber}
              onChange={(e) => setRegNumber(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Make (e.g. Maruti)"
              required
              value={make}
              onChange={(e) => setMake(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Model (e.g. Swift)"
              required
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="number"
              placeholder="Current KM (optional)"
              value={currentKm}
              onChange={(e) => setCurrentKm(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save vehicle"}
            </button>
          </form>
        )}

        {customer.vehicles.length === 0 ? (
          <p className="text-sm text-gray-500">No vehicles on file for this customer.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[450px] border-collapse overflow-hidden rounded-md border border-gray-200 text-sm">
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th className="px-3 py-2">Registration</th>
                  <th className="px-3 py-2">Make / Model</th>
                  <th className="px-3 py-2">KM</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {customer.vehicles.map((v) => (
                  <tr key={v.id} className="border-t border-gray-200">
                    <td className="px-3 py-2 font-medium">{v.registrationNumber}</td>
                    <td className="px-3 py-2">
                      {v.make} {v.model}
                    </td>
                    <td className="px-3 py-2">{v.currentKm ?? "-"}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/dashboard/jobcards?vehicleId=${v.id}`}
                        className="text-gray-600 underline hover:no-underline"
                      >
                        New job card
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
