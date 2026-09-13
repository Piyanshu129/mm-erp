"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";

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
        <label className="block text-xs text-gray-500">From</label>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500">To</label>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <button onClick={onApply} className="rounded-md border border-gray-300 px-4 py-2 text-sm">
        Apply
      </button>
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
            <p className="text-sm">
              Grand total: <span className="font-semibold">₹{data.grandTotal.toFixed(2)}</span>
            </p>
            <button
              onClick={() => downloadCsv("sales-report.csv", data.byDay)}
              className="text-sm text-gray-600 underline"
            >
              Export CSV
            </button>
          </div>
          <ReportTable
            columns={["date", "count", "total"]}
            rows={data.byDay}
            empty="No sales in this range."
          />
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
          <p className="mb-3 text-sm">
            Grand total: <span className="font-semibold">₹{data.grandTotal.toFixed(2)}</span>
          </p>
          <div className="mb-6">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold">By day</h3>
              <button
                onClick={() => downloadCsv("purchases-by-day.csv", data.byDay)}
                className="text-sm text-gray-600 underline"
              >
                Export CSV
              </button>
            </div>
            <ReportTable columns={["date", "count", "total"]} rows={data.byDay} empty="No purchases in this range." />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold">By supplier</h3>
              <button
                onClick={() => downloadCsv("purchases-by-supplier.csv", data.bySupplier)}
                className="text-sm text-gray-600 underline"
              >
                Export CSV
              </button>
            </div>
            <ReportTable
              columns={["supplier", "count", "total"]}
              rows={data.bySupplier}
              empty="No purchases in this range."
            />
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
        <p className="text-sm">
          Total stock value: <span className="font-semibold">₹{data.totalStockValue.toFixed(2)}</span>{" "}
          · Low stock: <span className="font-semibold text-amber-600">{data.lowStockCount}</span> · Out
          of stock: <span className="font-semibold text-red-600">{data.outOfStockCount}</span>
        </p>
        <button
          onClick={() => downloadCsv("inventory-report.csv", data.rows)}
          className="text-sm text-gray-600 underline"
        >
          Export CSV
        </button>
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
            <h3 className="text-sm font-semibold">Job cards by status</h3>
            <button
              onClick={() => downloadCsv("workshop-report.csv", data.byStatus)}
              className="text-sm text-gray-600 underline"
            >
              Export CSV
            </button>
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
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-md border border-gray-200 p-3">
            <p className="text-xs text-gray-500">New customers (in range)</p>
            <p className="text-xl font-semibold">{data.newCustomers}</p>
          </div>
          <div className="rounded-md border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Repeat customers</p>
            <p className="text-xl font-semibold">{data.repeatCustomers}</p>
          </div>
          <div className="rounded-md border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Total customers</p>
            <p className="text-xl font-semibold">{data.totalCustomers}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportTable({
  columns,
  rows,
  empty,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-gray-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[500px] border-collapse overflow-hidden rounded-md border border-gray-200 text-sm">
        <thead className="bg-gray-100 text-left">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 capitalize">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-gray-200">
              {columns.map((c) => (
                <td key={c} className="px-3 py-2">
                  {String(row[c] ?? "-")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("sales");

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Reports</h1>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === t.key ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
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
