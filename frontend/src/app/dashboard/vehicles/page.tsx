"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { compressImage } from "@/lib/compressImage";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Car, ClipboardPlus, Plus } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { MobileInput } from "@/components/ui/MobileInput";
import { Input, Select, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import {
  InvoiceAccount,
  InvoiceAccountPanel,
  InvoiceAccountCells,
  InvoiceAccountActions,
} from "@/components/InvoiceAccountPanel";

interface VehicleRow {
  id: number;
  registrationNumber: string;
  make: string;
  model: string;
  currentKm: number | null;
  isActive: boolean;
  customer: { id: number; name: string; mobile: string };
  account: InvoiceAccount;
}

interface CustomerOption {
  id: number;
  name: string;
  mobile: string;
}

const FUEL_TYPES = ["Petrol", "Diesel", "CNG", "Electric", "Hybrid"];
const TRANSMISSIONS = ["Manual", "Automatic"];

// Vehicle numbers are always capitals with no spaces — the same form the
// backend stores, so "hr 26 ab 1234" and "HR26AB1234" are one vehicle.
function normalizeRegistration(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function VehiclesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?for=jobcard — arrived from the dashboard's "New Job Card": search the
  // vehicle first; a new vehicle, once saved, carries on to the job card form.
  const forJobCard = searchParams.get("for") === "jobcard";

  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  // The vehicle number last searched for (normalised) — New Vehicle is only
  // offered once a search has come back without that exact vehicle.
  const [searchedFor, setSearchedFor] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [showForm, setShowForm] = useState(false);
  const [rcPhoto, setRcPhoto] = useState<File | null>(null);
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
  // The account panel (Pay / Payment history) for one vehicle.
  const [accountFor, setAccountFor] = useState<{ vehicle: VehicleRow; focusPay: boolean } | null>(null);

  // quiet: refresh the amounts after a payment without blanking the table.
  async function load(query: string, quiet = false) {
    if (!quiet) setLoading(true);
    const body = await apiFetch(`/vehicles?${query ? `q=${encodeURIComponent(query)}` : ""}`);
    setVehicles(body.vehicles);
    setLoading(false);
  }

  useEffect(() => {
    load("");
    if (forJobCard) searchInputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setShowForm(false);
    await load(q.trim());
    setSearchedFor(normalizeRegistration(q));
  }

  const exactMatch = searchedFor !== "" && vehicles.some((v) => v.registrationNumber === searchedFor);
  const offerNewVehicle = searchedFor.length >= 4 && !exactMatch && !loading;

  function openNewVehicle() {
    resetForm();
    setRegistrationNumber(searchedFor);
    // A vehicle that isn't registered yet usually means a new customer too —
    // "Existing customer" is one click away if not.
    setCustomerMode("new");
    setShowForm(true);
  }

  function changeVehicleNumber() {
    setShowForm(false);
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
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
    setRcPhoto(null);
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
      if (newCustomerMobile.length !== 10) {
        setFormError("The owner's mobile number must be 10 digits");
        return;
      }
      customerId = -1; // resolved below once we create the customer
    }
    if (!rcPhoto) {
      setFormError("Take a photo of the RC (registration certificate)");
      return;
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

      // Multipart — carries the RC photo, shrunk first for a quick upload.
      const form = new FormData();
      const fields: Record<string, string> = {
        registrationNumber,
        make,
        model,
        variant,
        year,
        fuelType,
        transmission,
        currentKm,
        chassisNumber,
        engineNumber,
        nextServiceDue,
        customerId: String(customerId),
      };
      for (const [key, value] of Object.entries(fields)) {
        if (value.trim()) form.set(key, value.trim());
      }
      form.set("rcPhoto", await compressImage(rcPhoto));
      const vehicleBody = await apiFetch("/vehicles", { method: "POST", body: form });

      if (forJobCard) {
        router.push(`/dashboard/jobcards?vehicleId=${vehicleBody.vehicle.id}`);
        return;
      }

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
        description="Search the vehicle number first. If it isn't on file, you can add it as a new vehicle."
      />

      {forJobCard && !showForm && (
        <p className="max-w-2xl rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <strong>New job card:</strong> search the vehicle number. If it&apos;s on file, use its &ldquo;New job card&rdquo;
          link; if not, add it as a new vehicle and you&apos;ll go straight on to the job card.
        </p>
      )}

      <form onSubmit={handleSearch} className="flex max-w-md gap-2">
        <Input
          ref={searchInputRef}
          placeholder="Vehicle number, e.g. HR26AB1234"
          value={q}
          onChange={(e) => setQ(e.target.value.toUpperCase())}
          className="uppercase"
          autoComplete="off"
        />
        <Button type="submit" variant="secondary">
          <Search className="h-4 w-4" /> Search
        </Button>
      </form>

      {offerNewVehicle && !showForm && (
        <div className="flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-gray-300 bg-white px-4 py-3">
          <p className="text-sm text-gray-700">
            No vehicle <span className="font-mono font-semibold text-gray-900">{searchedFor}</span> on file.
          </p>
          <Button type="button" onClick={openNewVehicle}>
            <Plus className="h-4 w-4" /> New vehicle {searchedFor}
          </Button>
        </div>
      )}

      {showForm && (
        <Card className="max-w-lg">
          <CardBody>
            <form onSubmit={handleAddVehicle} className="space-y-4">
              <div className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-3 py-2">
                <div>
                  <p className="text-xs text-gray-500">New vehicle</p>
                  <p className="font-mono text-lg font-semibold text-gray-900">{registrationNumber}</p>
                </div>
                <button type="button" onClick={changeVehicleNumber} className="text-xs font-medium text-blue-600 hover:underline">
                  Change number
                </button>
              </div>
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
                    <MobileInput
                      placeholder="Owner mobile (10 digits)"
                      value={newCustomerMobile}
                      onChange={setNewCustomerMobile}
                    />
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-3">
                <Label>Vehicle details</Label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input placeholder="Make (e.g. Maruti)" required value={make} onChange={(e) => setMake(e.target.value)} />
                  <Input placeholder="Model (e.g. Swift)" required value={model} onChange={(e) => setModel(e.target.value)} />
                  <Input placeholder="Variant (optional)" value={variant} onChange={(e) => setVariant(e.target.value)} />
                  <Input
                    type="number"
                    placeholder="Year (optional)"
                    min={1980}
                    max={2100}
                    step={1}
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
                    min={0}
                    step={1}
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
                  <div className="sm:col-span-2">
                    <Label>RC photo (required)</Label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setRcPhoto(e.target.files?.[0] ?? null)}
                      className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
                    />
                    <p className="mt-1 text-xs text-gray-500">A photo of the registration certificate.</p>
                  </div>
                </div>
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : forJobCard ? "Save vehicle & continue to job card" : "Save vehicle"}
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      {accountFor && (
        <InvoiceAccountPanel
          key={`${accountFor.vehicle.id}-${accountFor.focusPay}`}
          accountUrl={`/vehicles/${accountFor.vehicle.id}/account`}
          title={`${accountFor.vehicle.registrationNumber} (${accountFor.vehicle.customer.name}) — draft invoices & payments`}
          focusPay={accountFor.focusPay}
          onClose={() => setAccountFor(null)}
          onChanged={() => load(q, true)}
        />
      )}

      {loading ? (
        <TableSkeleton cols={8} />
      ) : vehicles.length === 0 ? (
        <EmptyState icon={Car} title="No vehicles found" description="Try a different search term, or add it as a new vehicle above." />
      ) : (
        <Table minWidth={1050}>
          <thead>
            <tr>
              <Th>Registration</Th>
              <Th>Make / Model</Th>
              <Th>KM</Th>
              <Th>Owner</Th>
              <Th className="text-right">Invoiced</Th>
              <Th className="text-right">Paid</Th>
              <Th className="text-right">Due</Th>
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
                <InvoiceAccountCells account={v.account} />
                <Td>
                  <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                    <Link
                      href={`/dashboard/jobcards?vehicleId=${v.id}`}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    >
                      <ClipboardPlus className="h-3 w-3" /> New job card
                    </Link>
                    <InvoiceAccountActions
                      account={v.account}
                      onPay={() => setAccountFor({ vehicle: v, focusPay: true })}
                      onHistory={() => setAccountFor({ vehicle: v, focusPay: false })}
                    />
                  </div>
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
      <Suspense fallback={<p className="text-sm text-gray-500">Loading...</p>}>
        <VehiclesPageContent />
      </Suspense>
    </RequireAuth>
  );
}
