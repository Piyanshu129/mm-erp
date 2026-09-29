"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Users } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { MobileInput } from "@/components/ui/MobileInput";
import { Input, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { ActiveBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import {
  InvoiceAccount,
  InvoiceAccountPanel,
  InvoiceAccountCells,
  InvoiceAccountActions,
} from "@/components/InvoiceAccountPanel";

interface CustomerRow {
  id: number;
  name: string;
  mobile: string;
  address: string | null;
  isActive: boolean;
  account: InvoiceAccount;
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
  // The account panel (Pay / Payment history) for one customer.
  const [accountFor, setAccountFor] = useState<{ customer: CustomerRow; focusPay: boolean } | null>(null);

  // quiet: refresh the amounts after a payment without blanking the table.
  async function loadCustomers(query: string, quiet = false) {
    if (!quiet) setLoading(true);
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
                <MobileInput required value={mobile} onChange={setMobile} />
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

      {accountFor && (
        <InvoiceAccountPanel
          key={`${accountFor.customer.id}-${accountFor.focusPay}`}
          accountUrl={`/customers/${accountFor.customer.id}/account`}
          title={`${accountFor.customer.name} — invoices & payments`}
          focusPay={accountFor.focusPay}
          onClose={() => setAccountFor(null)}
          onChanged={() => loadCustomers(q, true)}
        />
      )}

      {loading ? (
        <TableSkeleton cols={8} />
      ) : customers.length === 0 ? (
        <EmptyState icon={Users} title="No customers found" description="Try a different search, or add a new customer." />
      ) : (
        <Table minWidth={950}>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Mobile</Th>
              <Th>Address</Th>
              <Th className="text-right">Invoiced</Th>
              <Th className="text-right">Paid</Th>
              <Th className="text-right">Due</Th>
              <Th>Status</Th>
              <Th />
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
                <InvoiceAccountCells account={c.account} />
                <Td>
                  <ActiveBadge isActive={c.isActive} />
                </Td>
                <Td>
                  <InvoiceAccountActions
                    account={c.account}
                    onPay={() => setAccountFor({ customer: c, focusPay: true })}
                    onHistory={() => setAccountFor({ customer: c, focusPay: false })}
                  />
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
