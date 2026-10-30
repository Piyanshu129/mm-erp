"use client";

import { FormEvent, useEffect, useState } from "react";
import { Building2, CheckCircle2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Label, Textarea } from "@/components/ui/Input";

const EMPTY = { businessName: "", address: "", phone: "", email: "", gstin: "", state: "", stateCode: "" };

// The workshop's own details, printed at the top of every GST invoice.
export function BusinessDetailsCard() {
  const [form, setForm] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/settings/business")
      .then((body) => {
        setForm({ ...EMPTY, ...body.business });
        setLoaded(true);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the business details"));
  }, []);

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: key === "gstin" ? e.target.value.toUpperCase() : e.target.value }));
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body = await apiFetch("/settings/business", { method: "PUT", body: JSON.stringify(form) });
      setForm({ ...EMPTY, ...body.business });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-xl">
      <CardBody>
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-gray-900">
          <Building2 className="h-4 w-4 text-gray-400" /> Business details
        </h2>
        <p className="mb-4 text-sm text-gray-500">Printed at the top of GST invoices.</p>
        <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Business name</Label>
            <Input value={form.businessName} onChange={set("businessName")} required disabled={!loaded} />
          </div>
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <Textarea rows={2} value={form.address} onChange={set("address")} disabled={!loaded} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={set("phone")} disabled={!loaded} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={set("email")} disabled={!loaded} />
          </div>
          <div>
            <Label>GSTIN</Label>
            <Input
              value={form.gstin}
              onChange={set("gstin")}
              maxLength={15}
              placeholder="e.g. 06ABCDE1234F1Z5"
              className="uppercase"
              disabled={!loaded}
            />
          </div>
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <div>
              <Label>State</Label>
              <Input value={form.state} onChange={set("state")} placeholder="e.g. Haryana" disabled={!loaded} />
            </div>
            <div>
              <Label>Code</Label>
              <Input value={form.stateCode} onChange={set("stateCode")} maxLength={2} placeholder="06" disabled={!loaded} />
            </div>
          </div>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={saving || !loaded}>
              {saving ? "Saving..." : "Save business details"}
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
