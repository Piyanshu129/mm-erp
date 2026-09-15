"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, UserCog } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { ActiveBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface EmployeeRow {
  id: number;
  name: string;
  role: string | null;
  joiningDate: string;
  monthlySalary: string;
  monthlyLeaveAllowance: number;
  isActive: boolean;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [monthlySalary, setMonthlySalary] = useState("");
  const [monthlyLeaveAllowance, setMonthlyLeaveAllowance] = useState("0");
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

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiFetch("/employees", {
        method: "POST",
        body: JSON.stringify({
          name,
          role: role || undefined,
          joiningDate,
          monthlySalary: Number(monthlySalary),
          monthlyLeaveAllowance: monthlyLeaveAllowance ? Number(monthlyLeaveAllowance) : undefined,
        }),
      });
      setName("");
      setRole("");
      setJoiningDate("");
      setMonthlySalary("");
      setMonthlyLeaveAllowance("0");
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create employee");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Staff whose daily attendance and monthly salary are tracked."
        action={
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4" /> New employee
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
                <Label>Role (optional)</Label>
                <Input placeholder="e.g. Technician" value={role} onChange={(e) => setRole(e.target.value)} />
              </div>
              <div>
                <Label>Joining date</Label>
                <Input type="date" required value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
              </div>
              <div>
                <Label>Monthly salary</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={monthlySalary}
                  onChange={(e) => setMonthlySalary(e.target.value)}
                />
              </div>
              <div>
                <Label>Paid leave days per month</Label>
                <Input
                  type="number"
                  min={0}
                  value={monthlyLeaveAllowance}
                  onChange={(e) => setMonthlyLeaveAllowance(e.target.value)}
                />
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save employee"}
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      {loading ? (
        <TableSkeleton />
      ) : employees.length === 0 ? (
        <EmptyState icon={UserCog} title="No employees yet" description="Add your first employee above." />
      ) : (
        <Table minWidth={600}>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Joined</Th>
              <Th>Monthly Salary</Th>
              <Th>Paid Leave / Month</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <Tr key={e.id}>
                <Td className="font-medium text-gray-900">{e.name}</Td>
                <Td>{e.role ?? "-"}</Td>
                <Td>{new Date(e.joiningDate).toLocaleDateString()}</Td>
                <Td>₹{e.monthlySalary}</Td>
                <Td>{e.monthlyLeaveAllowance}</Td>
                <Td>
                  <ActiveBadge isActive={e.isActive} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
