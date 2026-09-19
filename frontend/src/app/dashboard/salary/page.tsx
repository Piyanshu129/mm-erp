"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useEffect, useState } from "react";
import { Banknote } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { PaymentStatusBadge } from "@/components/ui/Badge";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const PAYMENT_MODES = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"];

interface Employee {
  id: number;
  name: string;
  role: string | null;
  isActive: boolean;
}

interface SalaryPayment {
  id: number;
  employeeId: number;
  periodMonth: number;
  periodYear: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  grossSalary: string;
  netSalary: string;
  paymentAmount: string;
  paymentDate: string | null;
  paymentMode: string | null;
  employee: { id: number; name: string };
}

function SalaryPageContent() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculatingId, setCalculatingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [payingId, setPayingId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("");
  const [payBy, setPayBy] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [paySubmitting, setPaySubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const [empBody, payBody] = await Promise.all([
      apiFetch("/employees?pageSize=100"),
      apiFetch(`/salary?month=${month}&year=${year}`),
    ]);
    setEmployees(empBody.employees.filter((e: Employee) => e.isActive));
    setPayments(payBody.payments);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  async function calculate(employeeId: number) {
    setError(null);
    setCalculatingId(employeeId);
    try {
      await apiFetch("/salary/calculate", { method: "POST", body: JSON.stringify({ employeeId, month, year }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not calculate salary");
    } finally {
      setCalculatingId(null);
    }
  }

  function openPayment(p: SalaryPayment) {
    setPayingId(p.id);
    setPayAmount("");
    setPayMode("");
    setPayBy("");
    setPayError(null);
  }

  async function submitPayment(e: FormEvent) {
    e.preventDefault();
    if (!payingId) return;
    setPayError(null);
    setPaySubmitting(true);
    try {
      await apiFetch(`/salary/${payingId}/payment`, {
        method: "PATCH",
        body: JSON.stringify({ paymentAmount: Number(payAmount), paymentMode: payMode || undefined, paymentBy: payBy || undefined }),
      });
      setPayingId(null);
      setPayAmount("");
      await load();
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : "Could not record payment");
    } finally {
      setPaySubmitting(false);
    }
  }

  const byEmployee = new Map(payments.map((p) => [p.employeeId, p]));
  const payingPayment = payments.find((p) => p.id === payingId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title="Salary" description="Calculate monthly salary from attendance, then record payment." />

      <div className="flex gap-3">
        <Select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-auto">
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </Select>
        <Input
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="w-28"
        />
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {payingPayment && (
        <Card className="max-w-md">
          <CardBody>
            <form onSubmit={submitPayment} className="space-y-3">
              <p className="text-sm font-medium text-gray-700">
                Record payment — {payingPayment.employee.name} ({MONTHS[payingPayment.periodMonth - 1]} {payingPayment.periodYear})
              </p>
              <p className="text-xs text-gray-500">
                Net salary: ₹{payingPayment.netSalary} · Paid so far: ₹{payingPayment.paymentAmount} · Due: ₹
                {(Number(payingPayment.netSalary) - Number(payingPayment.paymentAmount)).toFixed(2)}
              </p>
              <Input
                type="number"
                step="0.01"
                placeholder="Amount being paid now"
                required
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
              <Select value={payMode} onChange={(e) => setPayMode(e.target.value)}>
                <option value="">Payment mode...</option>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m.replace("_", " ")}
                  </option>
                ))}
              </Select>
              <Input placeholder="Paid by" value={payBy} onChange={(e) => setPayBy(e.target.value)} />
              {payError && <p className="text-sm text-red-600">{payError}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={paySubmitting}>
                  {paySubmitting ? "Saving..." : "Save payment"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setPayingId(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {loading ? (
        <TableSkeleton cols={7} />
      ) : employees.length === 0 ? (
        <EmptyState icon={Banknote} title="No active employees" description="Add employees on the Employees page first." />
      ) : (
        <Table minWidth={850}>
          <thead>
            <tr>
              <Th>Employee</Th>
              <Th>Present</Th>
              <Th>Absent</Th>
              <Th>Leave</Th>
              <Th>Gross</Th>
              <Th>Net</Th>
              <Th>Payment</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const p = byEmployee.get(emp.id);
              return (
                <Tr key={emp.id}>
                  <Td className="font-medium text-gray-900">{emp.name}</Td>
                  <Td>{p?.presentDays ?? "-"}</Td>
                  <Td>{p?.absentDays ?? "-"}</Td>
                  <Td>{p?.leaveDays ?? "-"}</Td>
                  <Td>{p ? `₹${p.grossSalary}` : "-"}</Td>
                  <Td>{p ? `₹${p.netSalary}` : "-"}</Td>
                  <Td>
                    {p ? (
                      <>
                        <PaymentStatusBadge total={Number(p.netSalary)} paid={Number(p.paymentAmount)} />
                        {Number(p.paymentAmount) > 0 && Number(p.paymentAmount) < Number(p.netSalary) && (
                          <p className="mt-0.5 text-xs text-gray-500">
                            ₹{Number(p.paymentAmount).toFixed(2)} paid — ₹
                            {(Number(p.netSalary) - Number(p.paymentAmount)).toFixed(2)} due
                          </p>
                        )}
                      </>
                    ) : (
                      "-"
                    )}
                  </Td>
                  <Td>
                    {p ? (
                      <button onClick={() => openPayment(p)} className="text-xs text-blue-600 hover:underline">
                        Payment
                      </button>
                    ) : (
                      <Button size="sm" variant="secondary" disabled={calculatingId === emp.id} onClick={() => calculate(emp.id)}>
                        {calculatingId === emp.id ? "Calculating..." : "Calculate"}
                      </Button>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}

export default function SalaryPage() {
  return (
    <RequireAuth permission="SALARY">
      <SalaryPageContent />
    </RequireAuth>
  );
}
