"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

interface VehicleRow {
  id: number;
  registrationNumber: string;
  make: string;
  model: string;
  currentKm: number | null;
  isActive: boolean;
  customer: { id: number; name: string; mobile: string };
}

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  async function load(query: string) {
    setLoading(true);
    const body = await apiFetch(`/vehicles?${query ? `q=${encodeURIComponent(query)}` : ""}`);
    setVehicles(body.vehicles);
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
      <div>
        <h1 className="text-lg font-semibold">Vehicles</h1>
        <p className="text-sm text-gray-500">
          Search by registration number, make or model. To add a vehicle, open the owner&apos;s
          customer page.
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex max-w-md gap-2">
        <input
          placeholder="e.g. HR06AB1234 or Swift"
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
      ) : vehicles.length === 0 ? (
        <p className="text-sm text-gray-500">No vehicles found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[550px] border-collapse overflow-hidden rounded-md border border-gray-200 text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-3 py-2">Registration</th>
                <th className="px-3 py-2">Make / Model</th>
                <th className="px-3 py-2">KM</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} className="border-t border-gray-200">
                  <td className="px-3 py-2 font-medium">{v.registrationNumber}</td>
                  <td className="px-3 py-2">
                    {v.make} {v.model}
                  </td>
                  <td className="px-3 py-2">{v.currentKm ?? "-"}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/dashboard/customers/${v.customer.id}`}
                      className="text-gray-900 underline hover:no-underline"
                    >
                      {v.customer.name}
                    </Link>
                  </td>
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
  );
}
