"use client";

import { FormEvent, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Label } from "@/components/ui/Input";
import { MobileInput } from "@/components/ui/MobileInput";
import { Card, CardBody } from "@/components/ui/Card";

export interface EditableCustomer {
  id: number;
  name: string;
  mobile: string;
  whatsapp?: string | null;
  email?: string | null;
  address: string | null;
  notes?: string | null;
}

// Admin-only (the server enforces it): correct a customer's details. A
// blank optional field clears it.
export function CustomerEditForm({
  customer,
  onCancel,
  onSaved,
}: {
  customer: EditableCustomer;
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
