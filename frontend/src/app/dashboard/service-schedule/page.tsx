"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Gauge, X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { todayISO } from "@/lib/format";
import { kmRequest } from "@/lib/whatsappMessages";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { WhatsAppMessage } from "@/components/WhatsAppMessage";

type ServiceStatus = "OVERDUE" | "DUE_SOON" | "OK" | "NOT_SCHEDULED";

interface ScheduleRow {
  vehicleId: number;
  registrationNumber: string;
  make: string;
  model: string;
  customer: { id: number; name: string; mobile: string };
  lastServiceDate: string | null;
  lastServiceKm: number | null;
  lastServiceJobCard: { id: number; jobCardNumber: string } | null;
  updatedKm: number | null;
  lastReadingDate: string | null;
  avgKmPerMonth: number | null;
  estimatedKmNow: number | null;
  nextServiceDue: string | null;
  dueBasis: "TIME" | "KM" | null;
  nextServiceKm: number | null;
  status: ServiceStatus;
}

const STATUS: Record<ServiceStatus, { label: string; tone: BadgeTone }> = {
  OVERDUE: { label: "Passed", tone: "red" },
  DUE_SOON: { label: "Due within 30 days", tone: "red" },
  OK: { label: "On track", tone: "green" },
  NOT_SCHEDULED: { label: "Not scheduled", tone: "gray" },
};

function km(value: number | null): string {
  return value == null ? "-" : `${value.toLocaleString("en-IN")} km`;
}

function date(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "-";
}

// The KM-update panel for one vehicle: type the reading the customer gave,
// or send them the pre-written message asking for it.
function KmPanel({ row, onSaved, onClose }: { row: ScheduleRow; onSaved: (row: ScheduleRow) => void; onClose: () => void }) {
  const [reading, setReading] = useState("");
  const [readingDate, setReadingDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const value = Number(reading);
    if (!Number.isInteger(value) || value < 0) {
      setError("Enter the odometer reading as a whole number of km");
      return;
    }
    setSaving(true);
    try {
      const body = await apiFetch(`/service-schedule/${row.vehicleId}/odometer`, {
        method: "POST",
        body: JSON.stringify({ km: value, readingDate }),
      });
      setReading("");
      setSaved(true);
      onSaved(body.row);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the reading — check the connection and try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-blue-200">
      <CardBody className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-base font-semibold text-gray-900">
              <span className="font-mono">{row.registrationNumber}</span> — {row.make} {row.model}
            </p>
            <p className="text-sm text-gray-600">
              {row.customer.name} · {row.customer.mobile} · last reading {km(row.updatedKm)}
              {row.lastReadingDate ? ` on ${date(row.lastReadingDate)}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={save} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
          <div>
            <Label>Current odometer reading (KM)</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder={row.updatedKm != null ? `more than ${row.updatedKm}` : "e.g. 45200"}
              value={reading}
              onChange={(e) => setReading(e.target.value)}
            />
          </div>
          <div>
            <Label>Reading date</Label>
            <Input type="date" max={todayISO()} value={readingDate} onChange={(e) => setReadingDate(e.target.value)} />
          </div>
          <Button type="submit" disabled={saving || reading === ""}>
            {saving ? "Saving..." : "Save reading"}
          </Button>
        </form>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {saved && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            Saved — next service now estimated for {date(row.nextServiceDue)}.
          </p>
        )}

        <div className="border-t border-gray-100 pt-4">
          <WhatsAppMessage
            title="Ask the customer for the current KM (WhatsApp)"
            mobile={row.customer.mobile}
            message={kmRequest({
              customerName: row.customer.name,
              registrationNumber: row.registrationNumber,
              vehicle: `${row.make} ${row.model}`.trim(),
              lastKm: row.updatedKm,
            })}
          />
        </div>
      </CardBody>
    </Card>
  );
}

function ServiceSchedulePageContent() {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"" | ServiceStatus>("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    apiFetch("/service-schedule")
      .then((body) => setRows(body.rows))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load the service schedule"))
      .finally(() => setLoading(false));
  }, []);

  const counts = rows.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
    {} as Partial<Record<ServiceStatus, number>>
  );
  const shown = filter ? rows.filter((r) => r.status === filter) : rows;
  const selected = rows.find((r) => r.vehicleId === selectedId) ?? null;
  const dueCount = (counts.OVERDUE ?? 0) + (counts.DUE_SOON ?? 0);

  function replaceRow(updated: ScheduleRow) {
    setRows((prev) => prev.map((r) => (r.vehicleId === updated.vehicleId ? updated : r)));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Schedule"
        description="When each vehicle's next general service is due — 6 months or 10,000 km after the last one, whichever comes first. The date is estimated from each vehicle's average running (from its visits and the KM readings entered here), and updates whenever a job card or a new reading is saved."
      />

      {dueCount > 0 && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          {dueCount} vehicle{dueCount === 1 ? "" : "s"} due for service within 30 days (including overdue) — highlighted in red.
        </p>
      )}

      {selected && <KmPanel key={selected.vehicleId} row={selected} onSaved={replaceRow} onClose={() => setSelectedId(null)} />}

      <div className="flex flex-wrap gap-2">
        {(["", "OVERDUE", "DUE_SOON", "OK", "NOT_SCHEDULED"] as const).map((f) => (
          <button
            key={f || "all"}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-sm ${
              filter === f ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {f === "" ? `All (${rows.length})` : `${STATUS[f].label} (${counts[f] ?? 0})`}
          </button>
        ))}
      </div>

      {loadError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>}

      {loading ? (
        <TableSkeleton cols={10} />
      ) : shown.length === 0 ? (
        <EmptyState icon={CalendarClock} title={filter ? "No vehicles in this group" : "No vehicles yet"} />
      ) : (
        <Table minWidth={1250}>
          <thead>
            <tr>
              <Th>Vehicle No.</Th>
              <Th>Customer</Th>
              <Th>Last Service</Th>
              <Th className="text-right">Last KM</Th>
              <Th className="text-right">Current KM</Th>
              <Th className="text-right">Avg Running</Th>
              <Th>Next Service Due (est.)</Th>
              <Th className="text-right">Next Service KM</Th>
              <Th>Status</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const due = r.status === "OVERDUE" || r.status === "DUE_SOON";
              return (
                <Tr key={r.vehicleId} className={due ? "bg-red-50" : ""}>
                  <Td className={`font-mono font-medium ${due ? "text-red-800" : "text-gray-900"}`}>
                    {r.registrationNumber}
                    <span className="block font-sans text-xs font-normal text-gray-500">
                      {r.make} {r.model}
                    </span>
                  </Td>
                  <Td>
                    <Link href={`/dashboard/customers/${r.customer.id}`} className="text-gray-900 hover:text-blue-600 hover:underline">
                      {r.customer.name}
                    </Link>
                    <span className="block text-xs text-gray-500">{r.customer.mobile}</span>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {date(r.lastServiceDate)}
                    {r.lastServiceJobCard && (
                      <Link
                        href={`/dashboard/jobcards/${r.lastServiceJobCard.id}`}
                        className="block font-mono text-xs text-blue-600 hover:underline"
                      >
                        {r.lastServiceJobCard.jobCardNumber}
                      </Link>
                    )}
                  </Td>
                  <Td className="text-right">{km(r.lastServiceKm)}</Td>
                  <Td className="whitespace-nowrap text-right">
                    {km(r.updatedKm)}
                    {r.lastReadingDate && <span className="block text-xs text-gray-500">{date(r.lastReadingDate)}</span>}
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    {r.avgKmPerMonth != null ? `${r.avgKmPerMonth.toLocaleString("en-IN")} km/mo` : "-"}
                  </Td>
                  <Td className={`whitespace-nowrap ${due ? "font-semibold text-red-700" : ""}`}>
                    {date(r.nextServiceDue)}
                    {r.dueBasis && (
                      <span className="block text-xs font-normal text-gray-500">
                        {r.dueBasis === "KM" ? "by KM (avg running)" : "6 months since last"}
                      </span>
                    )}
                  </Td>
                  <Td className="text-right">{km(r.nextServiceKm)}</Td>
                  <Td>
                    <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                  </Td>
                  <Td>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setSelectedId(r.vehicleId);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      <Gauge className="h-4 w-4" /> Update KM / Ask customer
                    </Button>
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

export default function ServiceSchedulePage() {
  return (
    <RequireAuth permission="JOB_CARDS">
      <ServiceSchedulePageContent />
    </RequireAuth>
  );
}
