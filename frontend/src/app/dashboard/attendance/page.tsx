"use client";

import { useEffect, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface Row {
  employee: { id: number; name: string; role: string | null };
  attendance: { status: string; correctedBy: { name: string } | null } | null;
}

const STATUSES = [
  { value: "PRESENT", label: "Present", tone: "bg-green-600 text-white", idle: "bg-green-50 text-green-700" },
  { value: "ABSENT", label: "Absent", tone: "bg-red-600 text-white", idle: "bg-red-50 text-red-700" },
  { value: "LEAVE", label: "Leave", tone: "bg-amber-500 text-white", idle: "bg-amber-50 text-amber-700" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(d: string) {
    setLoading(true);
    const body = await apiFetch(`/attendance?date=${d}`);
    setRows(body.rows);
    setLoading(false);
  }

  useEffect(() => {
    load(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function mark(employeeId: number, status: string) {
    setError(null);
    setSavingId(employeeId);
    try {
      await apiFetch("/attendance", { method: "POST", body: JSON.stringify({ employeeId, date, status }) });
      await load(date);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save attendance");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" description="Mark each employee's status for the day." />

      <div className="max-w-xs">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No active employees" description="Add employees on the Employees page first." />
      ) : (
        <Table minWidth={550}>
          <thead>
            <tr>
              <Th>Employee</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Corrected by</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.employee.id}>
                <Td className="font-medium text-gray-900">{r.employee.name}</Td>
                <Td>{r.employee.role ?? "-"}</Td>
                <Td>
                  <div className="flex gap-1.5">
                    {STATUSES.map((s) => {
                      const active = r.attendance?.status === s.value;
                      return (
                        <button
                          key={s.value}
                          disabled={savingId === r.employee.id}
                          onClick={() => mark(r.employee.id, s.value)}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${active ? s.tone : s.idle} disabled:opacity-50`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </Td>
                <Td>{r.attendance?.correctedBy?.name ?? "-"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
