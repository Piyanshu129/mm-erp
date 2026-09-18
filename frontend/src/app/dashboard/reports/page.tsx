"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";

type Tab = "sales" | "purchases" | "inventory" | "workshop" | "customers";

const TABS: { key: Tab; label: string }[] = [
  { key: "sales", label: "Sales" },
  { key: "purchases", label: "Purchases" },
  { key: "inventory", label: "Inventory" },
  { key: "workshop", label: "Workshop" },
  { key: "customers", label: "Customers" },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoStr(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick}>
      <Download className="h-3.5 w-3.5" /> Export CSV
    </Button>
  );
}

function DateRangeControls({
  from,
  to,
  setFrom,
  setTo,
  onApply,
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  onApply: () => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-2">
      <div>
        <Label>From</Label>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div>
        <Label>To</Label>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <Button variant="secondary" onClick={onApply}>
        Apply
      </Button>
    </div>
  );
}

function SalesTab() {
  const [from, setFrom] = useState(daysAgoStr(30));
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<{ byDay: { date: string; count: number; total: number }[]; grandTotal: number } | null>(null);

  async function load() {
    const body = await apiFetch(`/reports/sales?from=${from}&to=${to}`);
    setData(body);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <DateRangeControls from={from} to={to} setFrom={setFrom} setTo={setTo} onApply={load} />
      {data && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Grand total: <span className="font-semibold text-gray-900">₹{data.grandTotal.toFixed(2)}</span>
            </p>
            <ExportButton onClick={() => downloadCsv("sales-report.csv", data.byDay)} />
          </div>
          <ReportTable columns={["date", "count", "total"]} rows={data.byDay} empty="No sales in this range." />
        </>
      )}
    </div>
  );
}

function PurchasesTab() {
  const [from, setFrom] = useState(daysAgoStr(30));
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<{
    byDay: { date: string; count: number; total: number }[];
    bySupplier: { supplier: string; count: number; total: number }[];
    grandTotal: number;
  } | null>(null);

  async function load() {
    const body = await apiFetch(`/reports/purchases?from=${from}&to=${to}`);
    setData(body);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <DateRangeControls from={from} to={to} setFrom={setFrom} setTo={setTo} onApply={load} />
      {data && (
        <>
          <p className="mb-3 text-sm text-gray-600">
            Grand total: <span className="font-semibold text-gray-900">₹{data.grandTotal.toFixed(2)}</span>
          </p>
          <div className="mb-6">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">By day</h3>
              <ExportButton onClick={() => downloadCsv("purchases-by-day.csv", data.byDay)} />
            </div>
            <ReportTable columns={["date", "count", "total"]} rows={data.byDay} empty="No purchases in this range." />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">By supplier</h3>
              <ExportButton onClick={() => downloadCsv("purchases-by-supplier.csv", data.bySupplier)} />
            </div>
            <ReportTable columns={["supplier", "count", "total"]} rows={data.bySupplier} empty="No purchases in this range." />
          </div>
        </>
      )}
    </div>
  );
}

function InventoryTab() {
  const [data, setData] = useState<{
    rows: { itemCode: string; name: string; category: string; uom: string; currentStock: number; minStock: number; stockValue: number; status: string }[];
    totalStockValue: number;
    lowStockCount: number;
    outOfStockCount: number;
  } | null>(null);

  useEffect(() => {
    apiFetch("/reports/inventory").then(setData);
  }, []);

  if (!data) return null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          Total stock value: <span className="font-semibold text-gray-900">₹{data.totalStockValue.toFixed(2)}</span> · Low
          stock: <span className="font-semibold text-amber-600">{data.lowStockCount}</span> · Out of stock:{" "}
          <span className="font-semibold text-red-600">{data.outOfStockCount}</span>
        </p>
        <ExportButton onClick={() => downloadCsv("inventory-report.csv", data.rows)} />
      </div>
      <ReportTable
        columns={["itemCode", "name", "category", "uom", "currentStock", "minStock", "stockValue", "status"]}
        rows={data.rows}
        empty="No active items."
      />
    </div>
  );
}

function WorkshopTab() {
  const [from, setFrom] = useState(daysAgoStr(30));
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<{ byStatus: { status: string; count: number }[] } | null>(null);

  async function load() {
    const body = await apiFetch(`/reports/workshop?from=${from}&to=${to}`);
    setData(body);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <DateRangeControls from={from} to={to} setFrom={setFrom} setTo={setTo} onApply={load} />
      {data && (
        <>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Job cards by status</h3>
            <ExportButton onClick={() => downloadCsv("workshop-report.csv", data.byStatus)} />
          </div>
          <ReportTable columns={["status", "count"]} rows={data.byStatus} empty="No job cards in this range." />
        </>
      )}
    </div>
  );
}

function CustomersTab() {
  const [from, setFrom] = useState(daysAgoStr(30));
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<{ newCustomers: number; repeatCustomers: number; totalCustomers: number } | null>(null);

  async function load() {
    const body = await apiFetch(`/reports/customers?from=${from}&to=${to}`);
    setData(body);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <DateRangeControls from={from} to={to} setFrom={setFrom} setTo={setTo} onApply={load} />
      {data && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardBody>
              <p className="text-xs text-gray-500">New customers (in range)</p>
              <p className="text-xl font-semibold text-gray-900">{data.newCustomers}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-xs text-gray-500">Repeat customers</p>
              <p className="text-xl font-semibold text-gray-900">{data.repeatCustomers}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-xs text-gray-500">Total customers</p>
              <p className="text-xl font-semibold text-gray-900">{data.totalCustomers}</p>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

function ReportTable({ columns, rows, empty }: { columns: string[]; rows: Record<string, unknown>[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-gray-500">{empty}</p>;
  return (
    <Table minWidth={500}>
      <thead>
        <tr>
          {columns.map((c) => (
            <Th key={c} className="capitalize">
              {c}
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <Tr key={i}>
            {columns.map((c) => (
              <Td key={c}>{String(row[c] ?? "-")}</Td>
            ))}
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

function ReportsPageContent() {
  const [tab, setTab] = useState<Tab>("sales");

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Sales, purchases, inventory, workshop and customer insights." />

      <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "sales" && <SalesTab />}
      {tab === "purchases" && <PurchasesTab />}
      {tab === "inventory" && <InventoryTab />}
      {tab === "workshop" && <WorkshopTab />}
      {tab === "customers" && <CustomersTab />}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <RequireAuth permission="REPORTS">
      <ReportsPageContent />
    </RequireAuth>
  );
}
