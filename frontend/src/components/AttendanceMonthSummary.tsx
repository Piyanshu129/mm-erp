"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { Table, Th, Td, Tr } from "@/components/ui/Table";

interface SummaryRow {
  employee: { id: number; name: string; role: string | null };
  presentDays: number;
  halfDays: number;
  absentDays: number;
  leaveDays: number;
  effectivePresent: number;
  notMarked: number;
}

interface Summary {
  month: number;
  year: number;
  daysInMonth: number;
  daysSoFar: number;
  rows: SummaryRow[];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Month totals for every employee: the month of the date picked on the
// sheet. `refreshKey` changes whenever a day is marked, so it stays current.
export function AttendanceMonthSummary({ month, refreshKey }: { month: string; refreshKey: number }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const [y, m] = month.split("-").map(Number);
    apiFetch(`/attendance/month-summary?month=${m}&year=${y}`)
      .then((body: Summary) => {
        setSummary(body);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the month summary"));
  }, [month, refreshKey]);

  if (error) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!summary) return null;

  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-base font-semibold text-gray-900">
          Month summary — {MONTHS[summary.month - 1]} {summary.year}
        </h2>
        <p className="text-xs text-gray-500">
          {summary.daysInMonth} days in the month
          {summary.daysSoFar < summary.daysInMonth && summary.daysSoFar > 0 && ` · ${summary.daysSoFar} so far`}. A half
          day counts as ½ in Total present.
        </p>
      </div>
      <Table minWidth={760}>
        <thead>
          <tr>
            <Th>Employee</Th>
            <Th className="text-right">Total days</Th>
            <Th className="text-right">Present</Th>
            <Th className="text-right">Half day</Th>
            <Th className="text-right">Absent</Th>
            <Th className="text-right">Leave</Th>
            <Th className="text-right">Not marked</Th>
            <Th className="text-right">Total present</Th>
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((r) => (
            <Tr key={r.employee.id}>
              <Td className="font-medium text-gray-900">{r.employee.name}</Td>
              <Td className="text-right">{summary.daysInMonth}</Td>
              <Td className="text-right text-green-700">{r.presentDays}</Td>
              <Td className="text-right text-sky-700">{r.halfDays}</Td>
              <Td className="text-right text-red-700">{r.absentDays}</Td>
              <Td className="text-right text-amber-700">{r.leaveDays}</Td>
              <Td className="text-right text-gray-500">{r.notMarked}</Td>
              <Td className="text-right font-semibold text-gray-900">{r.effectivePresent}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
