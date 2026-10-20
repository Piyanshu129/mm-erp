"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Car, ClipboardPlus, Pencil } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, Label } from "@/components/ui/Input";
import { MobileInput } from "@/components/ui/MobileInput";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { ActiveBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { InvoiceAccountPanel } from "@/components/InvoiceAccountPanel";
import { compressImage } from "@/lib/compressImage";

interface Vehicle {
  id: number;
  registrationNumber: string;
  make: string;
  model: string;
  currentKm: number | null;
}

const FUEL_TYPES = ["Petrol", "Diesel", "CNG", "Electric", "Hybrid"];
const TRANSMISSIONS = ["Manual", "Automatic"];

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

// Admin-only (the server enforces it): correct a customer's details. A
// blank optional field clears it.
function CustomerEditForm({
  customer,
  onCancel,
  onSaved,
}: {
  customer: CustomerDetail;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(customer.name);
  const [mobile, setMobile] = useState(customer.mobile);
  const [whatsapp, setWhatsapp] = useState(customer.whatsapp ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [address, setAddress] = useState(customer.address ?? "");
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Enter the customer's name");
    if (mobile.length !== 10) return setError("Mobile number must be 10 digits");
    if (whatsapp && whatsapp.length !== 10) return setError("WhatsApp number must be 10 digits");
    setSaving(true);
    try {
      await apiFetch(`/customers/${customer.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim(), mobile, whatsapp, email: email.trim(), address: address.trim(), notes: notes.trim() }),
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save — check the connection and try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-3 max-w-lg border-blue-200">
      <CardBody>
        <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Mobile</Label>
            <MobileInput value={mobile} onChange={setMobile} />
          </div>
          <div>
            <Label>WhatsApp (optional)</Label>
            <MobileInput value={whatsapp} onChange={setWhatsapp} />
          </div>
          <div className="sm:col-span-2">
            <Label>Email (optional)</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Address (optional)</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save details"}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function CustomerDetailPageContent() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [editing, setEditing] = useState(false);
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [regNumber, setRegNumber] = useState("");
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
  const [rcPhoto, setRcPhoto] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function resetVehicleForm() {
    setRegNumber("");
    setRcPhoto(null);
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
  }

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
    if (!rcPhoto) {
      setFormError("Take a photo of the RC (registration certificate)");
      return;
    }
    setSubmitting(true);
    try {
      // Multipart — carries the RC photo, shrunk first for a quick upload.
      const form = new FormData();
      const fields: Record<string, string> = {
        registrationNumber: regNumber,
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
        customerId: String(id),
      };
      for (const [key, value] of Object.entries(fields)) {
        if (value.trim()) form.set(key, value.trim());
      }
      form.set("rcPhoto", await compressImage(rcPhoto));
      await apiFetch("/vehicles", { method: "POST", body: form });
      resetVehicleForm();
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
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">{customer.name}</h1>
          <ActiveBadge isActive={customer.isActive} />
          {isAdmin && !editing && (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit details
            </Button>
          )}
        </div>
        {editing ? (
          <CustomerEditForm
            customer={customer}
            onCancel={() => setEditing(false)}
            onSaved={async () => {
              setEditing(false);
              await load();
            }}
          />
        ) : (
          <Card className="mt-3 max-w-md">
            <CardBody>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-gray-500">Mobile</dt>
                <dd className="text-gray-900">{customer.mobile}</dd>
                <dt className="text-gray-500">WhatsApp</dt>
                <dd className="text-gray-900">{customer.whatsapp ?? "-"}</dd>
                <dt className="text-gray-500">Email</dt>
                <dd className="text-gray-900">{customer.email ?? "-"}</dd>
                <dt className="text-gray-500">Address</dt>
                <dd className="text-gray-900">{customer.address ?? "-"}</dd>
                <dt className="text-gray-500">Notes</dt>
                <dd className="text-gray-900">{customer.notes ?? "-"}</dd>
              </dl>
            </CardBody>
          </Card>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Vehicles</h2>
          <Button size="sm" onClick={() => setShowVehicleForm((s) => !s)}>
            <Plus className="h-4 w-4" /> Add vehicle
          </Button>
        </div>

        {showVehicleForm && (
          <Card className="mb-4 max-w-lg">
            <CardBody>
              <form onSubmit={handleAddVehicle} className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="Vehicle number, e.g. HR26AB1234"
                    required
                    value={regNumber}
                    onChange={(e) => setRegNumber(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                    className="font-mono uppercase"
                  />
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
                    <label className="mb-1 block text-sm font-medium text-gray-700">RC photo (required)</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setRcPhoto(e.target.files?.[0] ?? null)}
                      className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
                    />
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

      <InvoiceAccountPanel accountUrl={`/customers/${customer.id}/account`} title="Draft invoices & payments" />
    </div>
  );
}

export default function CustomerDetailPage() {
  return (
    <RequireAuth permission="CUSTOMERS">
      <CustomerDetailPageContent />
    </RequireAuth>
  );
}
