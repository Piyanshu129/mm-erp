"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useEffect, useState } from "react";
import { Plus, UserCog, Pencil, KeyRound, ExternalLink } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { ActiveBadge, Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface EmployeeRow {
  id: number;
  name: string;
  role: string | null;
  email: string | null;
  mobile: string | null;
  hasPortalAccess: boolean;
  joiningDate: string;
  monthlySalary: string;
  monthlyLeaveAllowance: number;
  isActive: boolean;
}

interface FormState {
  name: string;
  role: string;
  email: string;
  mobile: string;
  password: string;
  joiningDate: string;
  monthlySalary: string;
  monthlyLeaveAllowance: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  role: "",
  email: "",
  mobile: "",
  password: "",
  joiningDate: "",
  monthlySalary: "",
  monthlyLeaveAllowance: "0",
};

function EmployeesPageContent() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const body = await apiFetch("/employees?pageSize=100");
    setEmployees(body.employees);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreateForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(e: EmployeeRow) {
    setEditingId(e.id);
    setForm({
      name: e.name,
      role: e.role ?? "",
      email: e.email ?? "",
      mobile: e.mobile ?? "",
      password: "",
      joiningDate: e.joiningDate.slice(0, 10),
      monthlySalary: e.monthlySalary,
      monthlyLeaveAllowance: String(e.monthlyLeaveAllowance),
    });
    setFormError(null);
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        role: form.role || undefined,
        email: form.email || undefined,
        mobile: form.mobile || undefined,
        password: form.password || undefined,
        joiningDate: form.joiningDate,
        monthlySalary: Number(form.monthlySalary),
        monthlyLeaveAllowance: form.monthlyLeaveAllowance ? Number(form.monthlyLeaveAllowance) : undefined,
      };
      if (editingId) {
        await apiFetch(`/employees/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/employees", { method: "POST", body: JSON.stringify(payload) });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not save employee");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Staff whose daily attendance and monthly salary are tracked. Set an email and portal password to let an employee mark their own attendance from the Employee Portal."
        action={
          <Button onClick={showForm && !editingId ? () => setShowForm(false) : openCreateForm}>
            <Plus className="h-4 w-4" /> New employee
          </Button>
        }
      />

      <a
        href="/portal/login"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
      >
        <ExternalLink className="h-3.5 w-3.5" /> Open the Employee Portal (share this link with employees)
      </a>

      {showForm && (
        <Card className="max-w-md">
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-3">
              <p className="text-sm font-medium text-gray-900">{editingId ? "Edit employee" : "New employee"}</p>
              <div>
                <Label>Name</Label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Role (optional)</Label>
                <Input placeholder="e.g. Technician" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
              </div>
              <div>
                <Label>Joining date</Label>
                <Input
                  type="date"
                  required
                  value={form.joiningDate}
                  onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
                />
              </div>
              <div>
                <Label>Monthly salary</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={form.monthlySalary}
                  onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })}
                />
              </div>
              <div>
                <Label>Paid leave days per month</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.monthlyLeaveAllowance}
                  onChange={(e) => setForm({ ...form, monthlyLeaveAllowance: e.target.value })}
                />
              </div>

              <div className="rounded-md border border-gray-200 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <KeyRound className="h-3.5 w-3.5" /> Employee Portal access (optional)
                </p>
                <div className="space-y-3">
                  <div>
                    <Label>Email (used as their portal login id)</Label>
                    <Input
                      type="email"
                      placeholder="employee@example.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Mobile (optional)</Label>
                    <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
                  </div>
                  <div>
                    <Label>{editingId ? "New portal password (leave blank to keep current)" : "Portal password"}</Label>
                    <Input
                      type="text"
                      placeholder="At least 6 characters"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Tell the employee this email and password so they can sign in to the Employee Portal.
                    </p>
                  </div>
                </div>
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : editingId ? "Save changes" : "Save employee"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {loading ? (
        <TableSkeleton />
      ) : employees.length === 0 ? (
        <EmptyState icon={UserCog} title="No employees yet" description="Add your first employee above." />
      ) : (
        <Table minWidth={800}>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Email</Th>
              <Th>Mobile</Th>
              <Th>Portal</Th>
              <Th>Monthly Salary</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <Tr key={e.id}>
                <Td className="font-medium text-gray-900">{e.name}</Td>
                <Td>{e.role ?? "-"}</Td>
                <Td>{e.email ?? "-"}</Td>
                <Td>{e.mobile ?? "-"}</Td>
                <Td>{e.hasPortalAccess ? <Badge tone="green">Enabled</Badge> : <Badge tone="gray">Not set</Badge>}</Td>
                <Td>₹{e.monthlySalary}</Td>
                <Td>
                  <ActiveBadge isActive={e.isActive} />
                </Td>
                <Td>
                  <button onClick={() => openEditForm(e)} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

export default function EmployeesPage() {
  return (
    <RequireAuth permission="EMPLOYEES">
      <EmployeesPageContent />
    </RequireAuth>
  );
}
