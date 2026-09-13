"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Car, ClipboardPlus } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { ActiveBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

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
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full max-w-md" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard/customers" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> All customers
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">{customer.name}</h1>
          <ActiveBadge isActive={customer.isActive} />
        </div>
        <Card className="mt-3 max-w-md">
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-gray-500">Mobile</dt>
              <dd className="text-gray-900">{customer.mobile}</dd>
              <dt className="text-gray-500">Email</dt>
              <dd className="text-gray-900">{customer.email ?? "-"}</dd>
              <dt className="text-gray-500">Address</dt>
              <dd className="text-gray-900">{customer.address ?? "-"}</dd>
            </dl>
          </CardBody>
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Vehicles</h2>
          <Button size="sm" onClick={() => setShowVehicleForm((s) => !s)}>
            <Plus className="h-4 w-4" /> Add vehicle
          </Button>
        </div>

        {showVehicleForm && (
          <Card className="mb-4 max-w-md">
            <CardBody>
              <form onSubmit={handleAddVehicle} className="space-y-3">
                <div>
                  <Label>Registration number</Label>
                  <Input
                    placeholder="e.g. HR06AB1234"
                    required
                    value={regNumber}
                    onChange={(e) => setRegNumber(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Make</Label>
                  <Input placeholder="e.g. Maruti" required value={make} onChange={(e) => setMake(e.target.value)} />
                </div>
                <div>
                  <Label>Model</Label>
                  <Input placeholder="e.g. Swift" required value={model} onChange={(e) => setModel(e.target.value)} />
                </div>
                <div>
                  <Label>Current KM (optional)</Label>
                  <Input type="number" value={currentKm} onChange={(e) => setCurrentKm(e.target.value)} />
                </div>
                {formError && <p className="text-sm text-red-600">{formError}</p>}
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : "Save vehicle"}
                </Button>
              </form>
            </CardBody>
          </Card>
        )}

        {customer.vehicles.length === 0 ? (
          <EmptyState icon={Car} title="No vehicles on file" description="Add this customer's first vehicle above." />
        ) : (
          <Table minWidth={450}>
            <thead>
              <tr>
                <Th>Registration</Th>
                <Th>Make / Model</Th>
                <Th>KM</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {customer.vehicles.map((v) => (
                <Tr key={v.id}>
                  <Td className="font-medium text-gray-900">{v.registrationNumber}</Td>
                  <Td>
                    {v.make} {v.model}
                  </Td>
                  <Td>{v.currentKm ?? "-"}</Td>
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
    </div>
  );
}
