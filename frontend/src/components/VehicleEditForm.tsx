"use client";

import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { compressImage } from "@/lib/compressImage";
import { AssetLink, AuthedImage } from "@/components/AuthedMedia";
import { Button } from "@/components/ui/Button";
import { Input, Select, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";

export interface EditableVehicle {
  id: number;
  registrationNumber: string;
  make: string;
  model: string;
  variant?: string | null;
  year?: number | null;
  fuelType?: string | null;
  transmission?: string | null;
  currentKm: number | null;
  chassisNumber?: string | null;
  engineNumber?: string | null;
  nextServiceDue?: string | null;
  nextServiceKm?: number | null;
  rcPhotoUrl?: string | null;
}

export const FUEL_TYPES = ["Petrol", "Diesel", "CNG", "Electric", "Hybrid"];
export const TRANSMISSIONS = ["Manual", "Automatic"];

const text = (v: string | number | null | undefined) => (v == null ? "" : String(v));

// Edit a vehicle's details (and replace its RC photo). Blank optional fields
// are cleared.
export function VehicleEditForm({
  vehicle,
  onSaved,
  onClose,
}: {
  vehicle: EditableVehicle;
  onSaved: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    registrationNumber: vehicle.registrationNumber,
    make: vehicle.make,
    model: vehicle.model,
    variant: text(vehicle.variant),
    year: text(vehicle.year),
    fuelType: text(vehicle.fuelType),
    transmission: text(vehicle.transmission),
    currentKm: text(vehicle.currentKm),
    chassisNumber: text(vehicle.chassisNumber),
    engineNumber: text(vehicle.engineNumber),
    nextServiceDue: vehicle.nextServiceDue ? vehicle.nextServiceDue.slice(0, 10) : "",
    nextServiceKm: text(vehicle.nextServiceKm),
  });
  const [rcPhoto, setRcPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF((prev) => ({ ...prev, [key]: e.target.value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const registrationNumber = f.registrationNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (registrationNumber.length < 4) return setError("Enter the vehicle number");
    if (!f.make.trim() || !f.model.trim()) return setError("Make and model are required");
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    setSaving(true);
    try {
      await apiFetch(`/vehicles/${vehicle.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          registrationNumber,
          make: f.make.trim(),
          model: f.model.trim(),
          variant: f.variant.trim() || null,
          year: num(f.year),
          fuelType: f.fuelType || null,
          transmission: f.transmission || null,
          currentKm: num(f.currentKm),
          chassisNumber: f.chassisNumber.trim() || null,
          engineNumber: f.engineNumber.trim() || null,
          nextServiceDue: f.nextServiceDue || null,
          nextServiceKm: num(f.nextServiceKm),
        }),
      });
      if (rcPhoto) {
        const form = new FormData();
        form.set("rcPhoto", await compressImage(rcPhoto));
        await apiFetch(`/vehicles/${vehicle.id}/rc-photo`, { method: "POST", body: form });
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the vehicle");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-lg">
      <CardBody>
        <form onSubmit={save} className="space-y-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-base font-semibold text-gray-900">Edit vehicle {vehicle.registrationNumber}</p>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Vehicle number</Label>
              <Input value={f.registrationNumber} onChange={set("registrationNumber")} className="uppercase" />
            </div>
            <div>
              <Label>Make</Label>
              <Input value={f.make} onChange={set("make")} required />
            </div>
            <div>
              <Label>Model</Label>
              <Input value={f.model} onChange={set("model")} required />
            </div>
            <div>
              <Label>Variant</Label>
              <Input value={f.variant} onChange={set("variant")} />
            </div>
            <div>
              <Label>Year</Label>
              <Input type="number" min={1980} max={2100} step={1} value={f.year} onChange={set("year")} />
            </div>
            <div>
              <Label>Fuel type</Label>
              <Select value={f.fuelType} onChange={set("fuelType")}>
                <option value="">Not set</option>
                {FUEL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Transmission</Label>
              <Select value={f.transmission} onChange={set("transmission")}>
                <option value="">Not set</option>
                {TRANSMISSIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Current KM</Label>
              <Input type="number" min={0} step={1} value={f.currentKm} onChange={set("currentKm")} />
            </div>
            <div>
              <Label>Chassis number</Label>
              <Input value={f.chassisNumber} onChange={set("chassisNumber")} />
            </div>
            <div>
              <Label>Engine number</Label>
              <Input value={f.engineNumber} onChange={set("engineNumber")} />
            </div>
            <div>
              <Label>Next service due</Label>
              <Input type="date" value={f.nextServiceDue} onChange={set("nextServiceDue")} />
            </div>
            <div>
              <Label>Next service at KM</Label>
              <Input type="number" min={0} step={1} value={f.nextServiceKm} onChange={set("nextServiceKm")} />
            </div>
            <div className="sm:col-span-2">
              <Label>RC photo</Label>
              {vehicle.rcPhotoUrl && (
                <AssetLink href={vehicle.rcPhotoUrl} className="mb-2 inline-block">
                  <AuthedImage src={vehicle.rcPhotoUrl} alt="RC" className="h-20 rounded-md border border-gray-200 object-cover" />
                </AssetLink>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setRcPhoto(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
              />
              <p className="mt-1 text-xs text-gray-500">{vehicle.rcPhotoUrl ? "Choose a photo only to replace it." : "No RC photo on file yet."}</p>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
