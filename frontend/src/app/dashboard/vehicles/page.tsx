"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Search, Car, ClipboardPlus, Plus } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Select, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
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

interface CustomerOption {
  id: number;
  name: string;
  mobile: string;
}

const FUEL_TYPES = ["Petrol", "Diesel", "CNG", "Electric", "Hybrid"];
const TRANSMISSIONS = ["Manual", "Automatic"];

function VehiclesPageContent() {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerMobile, setNewCustomerMobile] = useState("");

  const [registrationNumber, setRegistrationNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [variant, setVariant] = useState("");
  const [year, setYear] = useState("");
  const [fuelType, setFuelType] = useState("");
  const [transmission, setTransmission] = useState("");
  const [currentKm, setCurrentKm] = useState("");
  const [chassisNumber, setChassisNumber] = useState("");
  const [engineNumber, setEngineNumber] = useState("");
  const [nextServiceDue, setNextServiceDue] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  async function searchCustomers() {
    if (!customerQuery.trim()) return;
    const body = await apiFetch(`/customers?q=${encodeURIComponent(customerQuery)}`);
    setCustomerResults(body.customers);
  }

  function resetForm() {
    setCustomerMode("existing");
    setCustomerQuery("");
    setCustomerResults([]);
    setSelectedCustomer(null);
    setNewCustomerName("");
    setNewCustomerMobile("");
    setRegistrationNumber("");
    setMake("");
    setModel("");
    setVariant("");
    setYear("");
    setFuelType("");
    setTransmission("");
    setCurrentKm("");
    setChassisNumber("");
    setEngineNumber("");
    setNextServiceDue("");
    setFormError(null);
  }

  async function handleAddVehicle(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    let customerId: number;
    if (customerMode === "existing") {
      if (!selectedCustomer) {
        setFormError("Search and select the owner, or switch to \"New customer\"");
        return;
      }
      customerId = selectedCustomer.id;
    } else {
      if (!newCustomerName.trim() || !newCustomerMobile.trim()) {
        setFormError("Enter the new owner's name and mobile number");
        return;
      }
      customerId = -1; // resolved below once we create the customer
    }

    setSubmitting(true);
    try {
      if (customerMode === "new") {
        const customerBody = await apiFetch("/customers", {
          method: "POST",
          body: JSON.stringify({ name: newCustomerName, mobile: newCustomerMobile }),
        });
        customerId = customerBody.customer.id;
      }

      await apiFetch("/vehicles", {
        method: "POST",
        body: JSON.stringify({
          registrationNumber,
          make,
          model,
          variant: variant || undefined,
          year: year || undefined,
          fuelType: fuelType || undefined,
          transmission: transmission || undefined,
          currentKm: currentKm || undefined,
          chassisNumber: chassisNumber || undefined,
          engineNumber: engineNumber || undefined,
          nextServiceDue: nextServiceDue || undefined,
          customerId,
        }),
      });

      resetForm();
      setShowForm(false);
      await load(q);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not save vehicle");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vehicles"
        description="Search by registration number, make or model. If a vehicle isn't found, add it below."
        action={
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4" /> New vehicle
          </Button>
        }
      />

      <form onSubmit={handleSearch} className="flex max-w-md gap-2">
        <Input placeholder="e.g. HR06AB1234 or Swift" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="secondary">
          <Search className="h-4 w-4" /> Search
        </Button>
      </form>

      {showForm && (
        <Card className="max-w-lg">
          <CardBody>
            <form onSubmit={handleAddVehicle} className="space-y-4">
              <div>
                <Label>Owner</Label>
                <div className="mb-2 flex gap-4 text-sm text-gray-700">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={customerMode === "existing"} onChange={() => setCustomerMode("existing")} />
                    Existing customer
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={customerMode === "new"} onChange={() => setCustomerMode("new")} />
                    New customer
                  </label>
                </div>

                {customerMode === "existing" ? (
                  <div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Search by name or mobile"
                        value={customerQuery}
                        onChange={(e) => setCustomerQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            searchCustomers();
                          }
                        }}
                        className="flex-1"
                      />
                      <Button type="button" variant="secondary" onClick={searchCustomers}>
                        <Search className="h-4 w-4" /> Search
                      </Button>
                    </div>
                    {selectedCustomer ? (
                      <p className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
                        Selected: <strong>{selectedCustomer.name}</strong> — {selectedCustomer.mobile}
                      </p>
                    ) : (
                      customerResults.length > 0 && (
                        <ul className="mt-2 max-h-40 overflow-y-auto rounded-md border border-gray-200 text-sm">
                          {customerResults.map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCustomer(c);
                                  setCustomerResults([]);
                                }}
                                className="block w-full px-3 py-2 text-left hover:bg-gray-50"
                              >
                                {c.name} — {c.mobile}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Input
                      placeholder="Owner name"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                    />
                    <Input
                      placeholder="Owner mobile"
                      value={newCustomerMobile}
                      onChange={(e) => setNewCustomerMobile(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-3">
                <Label>Vehicle details</Label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="Registration number"
                    required
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value)}
                  />
                  <Input placeholder="Make (e.g. Maruti)" required value={make} onChange={(e) => setMake(e.target.value)} />
                  <Input placeholder="Model (e.g. Swift)" required value={model} onChange={(e) => setModel(e.target.value)} />
                  <Input placeholder="Variant (optional)" value={variant} onChange={(e) => setVariant(e.target.value)} />
                  <Input
                    type="number"
                    placeholder="Year (optional)"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  />
                  <Select value={fuelType} onChange={(e) => setFuelType(e.target.value)}>
                    <option value="">Fuel type (optional)...</option>
                    {FUEL_TYPES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </Select>
                  <Select value={transmission} onChange={(e) => setTransmission(e.target.value)}>
                    <option value="">Transmission (optional)...</option>
                    {TRANSMISSIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    placeholder="Current KM (optional)"
                    value={currentKm}
                    onChange={(e) => setCurrentKm(e.target.value)}
                  />
                  <Input
                    placeholder="Chassis number (optional)"
                    value={chassisNumber}
                    onChange={(e) => setChassisNumber(e.target.value)}
                  />
                  <Input
                    placeholder="Engine number (optional)"
                    value={engineNumber}
                    onChange={(e) => setEngineNumber(e.target.value)}
                  />
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs text-gray-500">Next service due (optional)</label>
                    <Input type="date" value={nextServiceDue} onChange={(e) => setNextServiceDue(e.target.value)} />
                  </div>
                </div>
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save vehicle"}
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      {loading ? (
        <TableSkeleton cols={5} />
      ) : vehicles.length === 0 ? (
        <EmptyState icon={Car} title="No vehicles found" description="Try a different search term, or add it as a new vehicle above." />
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

export default function VehiclesPage() {
  return (
    <RequireAuth permission="VEHICLES">
      <VehiclesPageContent />
    </RequireAuth>
  );
}
