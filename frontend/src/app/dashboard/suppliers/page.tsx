"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, Truck } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { ActiveBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface SupplierRow {
  id: number;
  name: string;
  mobile: string | null;
  address: string | null;
  isActive: boolean;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const body = await apiFetch("/suppliers");
    setSuppliers(body.suppliers);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiFetch("/suppliers", {
        method: "POST",
        body: JSON.stringify({ name, mobile: mobile || undefined, address: address || undefined }),
      });
      setName("");
      setMobile("");
      setAddress("");
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create supplier");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Vendors you buy parts from."
        action={
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4" /> New supplier
          </Button>
        }
      />

      {showForm && (
        <Card className="max-w-md">
          <CardBody>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <Label>Supplier name</Label>
                <Input required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>Mobile (optional)</Label>
                <Input value={mobile} onChange={(e) => setMobile(e.target.value)} />
              </div>
              <div>
                <Label>Address (optional)</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save supplier"}
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      {loading ? (
        <TableSkeleton />
      ) : suppliers.length === 0 ? (
        <EmptyState icon={Truck} title="No suppliers yet" description="Add your first supplier above." />
      ) : (
        <Table minWidth={450}>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Mobile</Th>
              <Th>Address</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <Tr key={s.id}>
                <Td className="font-medium text-gray-900">{s.name}</Td>
                <Td>{s.mobile ?? "-"}</Td>
                <Td>{s.address ?? "-"}</Td>
                <Td>
                  <ActiveBadge isActive={s.isActive} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
