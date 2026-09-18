"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Users } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { ActiveBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface CustomerRow {
  id: number;
  name: string;
  mobile: string;
  address: string | null;
  isActive: boolean;
}

function CustomersPageContent() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadCustomers(query: string) {
    setLoading(true);
    const body = await apiFetch(`/customers?${query ? `q=${encodeURIComponent(query)}` : ""}`);
    setCustomers(body.customers);
    setLoading(false);
  }

  useEffect(() => {
    loadCustomers("");
  }, []);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    await loadCustomers(q);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiFetch("/customers", {
        method: "POST",
        body: JSON.stringify({ name, mobile, address: address || undefined }),
      });
      setName("");
      setMobile("");
      setAddress("");
      setShowForm(false);
      await loadCustomers(q);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create customer");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Everyone who has brought a vehicle in for service."
        action={
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4" /> New customer
          </Button>
        }
      />

      {showForm && (
        <Card className="max-w-md">
          <CardBody>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>Mobile number</Label>
                <Input required value={mobile} onChange={(e) => setMobile(e.target.value)} />
              </div>
              <div>
                <Label>Address (optional)</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save customer"}
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      <form onSubmit={handleSearch} className="flex max-w-md gap-2">
        <Input placeholder="Search by name or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="secondary">
          <Search className="h-4 w-4" /> Search
        </Button>
      </form>

      {loading ? (
        <TableSkeleton />
      ) : customers.length === 0 ? (
        <EmptyState icon={Users} title="No customers found" description="Try a different search, or add a new customer." />
      ) : (
        <Table minWidth={500}>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Mobile</Th>
              <Th>Address</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <Tr key={c.id}>
                <Td className="font-medium text-gray-900">
                  <Link href={`/dashboard/customers/${c.id}`} className="hover:text-blue-600 hover:underline">
                    {c.name}
                  </Link>
                </Td>
                <Td>{c.mobile}</Td>
                <Td>{c.address ?? "-"}</Td>
                <Td>
                  <ActiveBadge isActive={c.isActive} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

export default function CustomersPage() {
  return (
    <RequireAuth permission="CUSTOMERS">
      <CustomersPageContent />
    </RequireAuth>
  );
}
