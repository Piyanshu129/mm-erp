"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Search, Car, ClipboardPlus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";

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
      <PageHeader
        title="Vehicles"
        description="Search by registration number, make or model. To add a vehicle, open the owner's customer page."
      />

      <form onSubmit={handleSearch} className="flex max-w-md gap-2">
        <Input placeholder="e.g. HR06AB1234 or Swift" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="secondary">
          <Search className="h-4 w-4" /> Search
        </Button>
      </form>

      {loading ? (
        <TableSkeleton cols={5} />
      ) : vehicles.length === 0 ? (
        <EmptyState icon={Car} title="No vehicles found" description="Try a different search term." />
      ) : (
        <Table minWidth={600}>
          <thead>
            <tr>
              <Th>Registration</Th>
              <Th>Make / Model</Th>
              <Th>KM</Th>
              <Th>Owner</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <Tr key={v.id}>
                <Td className="font-medium text-gray-900">{v.registrationNumber}</Td>
                <Td>
                  {v.make} {v.model}
                </Td>
                <Td>{v.currentKm ?? "-"}</Td>
                <Td>
                  <Link href={`/dashboard/customers/${v.customer.id}`} className="text-gray-900 hover:text-blue-600 hover:underline">
                    {v.customer.name}
                  </Link>
                </Td>
                <Td>
                  <Link
                    href={`/dashboard/jobcards?vehicleId=${v.id}`}
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    <ClipboardPlus className="h-3.5 w-3.5" /> New job card
                  </Link>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
