"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { useEffect, useState } from "react";
import { CalendarCheck, X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { TimeInput12 } from "@/components/TimeInput12";
import { formatINR, hoursWorked, todayISO } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface Row {
  employee: { id: number; name: string; role: string | null };
  attendance: {
    status: string;
    inTime: string | null;
    outTime: string | null;
    correctedBy: { name: string } | null;
  } | null;
}

interface Advance {
  id: number;
  employeeId: number;
  amount: string;
  date: string;
  notes: string | null;
  salaryMonth: number;
  salaryYear: number;
  createdBy: { name: string };
}

const STATUSES = [
  { value: "PRESENT", label: "Present", tone: "bg-green-600 text-white", idle: "bg-green-50 text-green-700" },
  { value: "HALF_DAY", label: "Half day", tone: "bg-sky-600 text-white", idle: "bg-sky-50 text-sky-700" },
  { value: "ABSENT", label: "Absent", tone: "bg-red-600 text-white", idle: "bg-red-50 text-red-700" },
  { value: "LEAVE", label: "Leave", tone: "bg-amber-500 text-white", idle: "bg-amber-50 text-amber-700" },
];

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Advance dates are calendar dates stored at midnight UTC — format them in
// UTC so they never shift a day in the user's timezone.
function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
}

function AdvanceInput({
  saving,
  onSave,
}: {
  saving: boolean;
  onSave: (amount: number, remark: string) => Promise<boolean>;
}) {
  const [amount, setAmount] = useState("");
  const [remark, setRemark] = useState("");

  async function save() {
    const value = Number(amount);
    if (!(value > 0)) return;
    if (await onSave(value, remark.trim())) {
      setAmount("");
      setRemark("");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Input
        type="number"
        min={0}
        step="0.01"
        placeholder="₹ amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
        className="w-28 py-1.5"
      />
      <Input
        placeholder="Remark (optional)"
        value={remark}
        onChange={(e) => setRemark(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
        className="w-36 py-1.5"
      />
      <Button type="button" size="sm" variant="secondary" onClick={save} disabled={saving || !(Number(amount) > 0)}>
        {saving ? "..." : "Add"}
      </Button>
    </div>
  );
}

function AttendancePageContent() {
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<Row[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savingAdvanceId, setSavingAdvanceId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const month = date.slice(0, 7);
  // Only an admin can add or change attendance for a past date (the server
  // enforces the same rule).
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const pastDate = date < todayISO();
  const canMark = isAdmin || !pastDate;

  async function loadAdvances(m: string) {
    const body = await apiFetch(`/advances?month=${m}`);
    setAdvances(body.advances);
  }

  async function load(d: string) {
    setLoading(true);
    const [body] = await Promise.all([apiFetch(`/attendance?date=${d}`), loadAdvances(d.slice(0, 7))]);
    setRows(body.rows);
    setLoading(false);
  }

  useEffect(() => {
    load(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function mark(employeeId: number, status: string, times?: { inTime?: string | null; outTime?: string | null }) {
    setError(null);
    setSavingId(employeeId);
    try {
      await apiFetch("/attendance", { method: "POST", body: JSON.stringify({ employeeId, date, status, ...times }) });
      await load(date);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save attendance");
    } finally {
      setSavingId(null);
    }
  }

  async function addAdvance(employee: Row["employee"], amount: number, remark: string): Promise<boolean> {
    setError(null);
    setNotice(null);
    setSavingAdvanceId(employee.id);
    try {
      const body = await apiFetch("/advances", {
        method: "POST",
        body: JSON.stringify({ employeeId: employee.id, date, amount, ...(remark ? { notes: remark } : {}) }),
      });
      const a: Advance = body.advance;
      const givenMonth = Number(date.slice(5, 7));
      if (a.salaryMonth !== givenMonth) {
        // The month it was given is already being paid, so it rolled over.
        setNotice(
          `${formatINR(amount)} advance to ${employee.name} recorded — it will be deducted from the ${SHORT_MONTHS[a.salaryMonth - 1]} ${a.salaryYear} salary, because this month's salary is already being paid.`
        );
      }
      // Saved, but more than the month's salary — tell them so.
      setWarning(body.warning ?? null);
      await loadAdvances(month);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save advance");
      return false;
    } finally {
      setSavingAdvanceId(null);
    }
  }

  async function removeAdvance(a: Advance, employeeName: string) {
    if (!window.confirm(`Remove the ${formatINR(a.amount)} advance given to ${employeeName} on ${shortDate(a.date)}?`)) return;
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/advances/${a.id}`, { method: "DELETE" });
      await loadAdvances(month);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove advance");
    }
  }

  // The employee whose full advance history (all months) is open.
  const [historyFor, setHistoryFor] = useState<Row["employee"] | null>(null);
  const [fullHistory, setFullHistory] = useState<{ advances: Advance[]; total: string | number } | null>(null);
  useEffect(() => {
    if (!historyFor) return;
    setFullHistory(null);
    apiFetch(`/advances/employee/${historyFor.id}`)
      .then(setFullHistory)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the advance history"));
  }, [historyFor]);

  const advancesByEmployee = new Map<number, Advance[]>();
  for (const a of advances) {
    advancesByEmployee.set(a.employeeId, [...(advancesByEmployee.get(a.employeeId) ?? []), a]);
  }
  const givenMonth = Number(month.slice(5, 7));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Mark each employee's status for the day. Advances paid are deducted from their salary."
      />

      <div className="max-w-xs">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {!canMark && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This is a previous date — only an admin can add or change its attendance.
        </p>
      )}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice &&<p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">{notice}</p>}
      {warning && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>
            <strong>Warning:</strong> {warning}
          </span>
          <button type="button" onClick={() => setWarning(null)} className="text-xs font-medium text-amber-800 hover:underline">
            OK
          </button>
        </div>
      )}

      {historyFor && (
        <div className="rounded-md border border-blue-200 bg-white p-4">
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">
              Advance history — {historyFor.name}
              {fullHistory && <span className="ml-2 font-normal text-gray-600">Total {formatINR(fullHistory.total)}</span>}
            </p>
            <button type="button" onClick={() => setHistoryFor(null)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          {!fullHistory ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : fullHistory.advances.length === 0 ? (
            <p className="text-sm text-gray-500">No advances given yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500">
                    <th className="py-1 pr-2">Date given</th>
                    <th className="py-1 pr-2 text-right">Amount</th>
                    <th className="py-1 pr-2">Deducted from</th>
                    <th className="py-1 pr-2">Remark</th>
                    <th className="py-1">Entered by</th>
                  </tr>
                </thead>
                <tbody>
                  {fullHistory.advances.map((a) => (
                    <tr key={a.id} className="border-t border-gray-100">
                      <td className="py-1.5 pr-2">{new Date(a.date).toLocaleDateString(undefined, { timeZone: "UTC" })}</td>
                      <td className="py-1.5 pr-2 text-right font-medium">{formatINR(a.amount)}</td>
                      <td className="py-1.5 pr-2">
                        {SHORT_MONTHS[a.salaryMonth - 1]} {a.salaryYear} salary
                      </td>
                      <td className="py-1.5 pr-2 text-gray-600">{a.notes ?? "—"}</td>
                      <td className="py-1.5 text-gray-500">{a.createdBy.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <TableSkeleton cols={7} />
      ) : rows.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No active employees" description="Add employees on the Employees page first." />
      ) : (
        <Table minWidth={1250}>
          <thead>
            <tr>
              <Th>Employee</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>In / Out (optional)</Th>
              <Th>Corrected by</Th>
              <Th>Advance paid</Th>
              <Th>Advance history ({SHORT_MONTHS[givenMonth - 1]})</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const history = advancesByEmployee.get(r.employee.id) ?? [];
              const historyTotal = history.reduce((sum, a) => sum + Number(a.amount), 0);
              return (
                <Tr key={r.employee.id}>
                  <Td className="font-medium text-gray-900">{r.employee.name}</Td>
                  <Td>{r.employee.role ?? "-"}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      {STATUSES.map((s) => {
                        const active = r.attendance?.status === s.value;
                        return (
                          <button
                            key={s.value}
                            disabled={savingId === r.employee.id || !canMark}
                            onClick={() => mark(r.employee.id, s.value)}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${active ? s.tone : s.idle} disabled:opacity-50`}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </Td>
                  <Td>
                    {/* Saved when a time is changed; needs the day's status first. */}
                    <div className="flex flex-col gap-1">
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <span className="w-6">In</span>
                        <TimeInput12
                          label="In time"
                          disabled={!r.attendance || !canMark || savingId === r.employee.id}
                          value={r.attendance?.inTime ?? null}
                          onChange={(value) => r.attendance && mark(r.employee.id, r.attendance.status, { inTime: value })}
                        />
                      </span>
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <span className="w-6">Out</span>
                        <TimeInput12
                          label="Out time"
                          disabled={!r.attendance || !canMark || savingId === r.employee.id}
                          value={r.attendance?.outTime ?? null}
                          onChange={(value) => r.attendance && mark(r.employee.id, r.attendance.status, { outTime: value })}
                        />
                      </span>
                    </div>
                    {hoursWorked(r.attendance?.inTime, r.attendance?.outTime) && (
                      <span className="mt-0.5 block text-xs text-gray-500">
                        Worked {hoursWorked(r.attendance?.inTime, r.attendance?.outTime)}
                      </span>
                    )}
                  </Td>
                  <Td>{r.attendance?.correctedBy?.name ?? "-"}</Td>
                  <Td>
                    <AdvanceInput
                      saving={savingAdvanceId === r.employee.id}
                      onSave={(amount, remark) => addAdvance(r.employee, amount, remark)}
                    />
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryFor(r.employee);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="mb-1 block text-xs font-medium text-blue-600 hover:underline"
                    >
                      Full history
                    </button>
                    {history.length === 0 ? (
                      <span className="text-gray-400">-</span>
                    ) : (
                      <div className="space-y-0.5 text-xs">
                        {history.map((a) => (
                          <div key={a.id} className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className="text-gray-500">{shortDate(a.date)}</span>
                            <span className="font-medium text-gray-900">{formatINR(a.amount)}</span>
                            {a.notes && <span className="text-gray-500" title={a.notes}>({a.notes})</span>}
                            {a.salaryMonth !== givenMonth && (
                              <span className="text-blue-700">→ {SHORT_MONTHS[a.salaryMonth - 1]} salary</span>
                            )}
                            <button
                              type="button"
                              onClick={() => removeAdvance(a, r.employee.name)}
                              className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                              aria-label="Remove advance"
                              title={`Entered by ${a.createdBy.name}. Click to remove.`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        {history.length > 1 && (
                          <div className="border-t border-gray-100 pt-0.5 font-semibold text-gray-900">
                            Total {formatINR(historyTotal)}
                          </div>
                        )}
                      </div>
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

export default function AttendancePage() {
  return (
    <RequireAuth permission="ATTENDANCE">
      <AttendancePageContent />
    </RequireAuth>
  );
}
