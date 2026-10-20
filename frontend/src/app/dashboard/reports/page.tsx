"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Download } from "lucide-react";
import { apiFetch, assetUrl } from "@/lib/api";
import { TYPE_LABELS } from "@/lib/purchaseTypes";
import { useAuth } from "@/context/AuthContext";
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

// Local calendar dates (the workshop's own day), as the server reads them.
function todayStr() {
  return new Date().toLocaleDateString("en-CA");
}
function daysAgoStr(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA");
}

function inr(n: number | string): string {
  return `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type DayRow = {
  date: string;
  count: number;
  total: number;
};

// Day-wise totals, newest first; click a day to see everything behind it.
function DayWiseTable<T extends { day: string }>({
  days,
  rows,
  empty,
  renderDetail,
}: {
  days: DayRow[];
  rows: T[];
  empty: string;
  renderDetail: (rows: T[]) => React.ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (days.length === 0) return <p className="text-sm text-gray-500">{empty}</p>;
  return (
    <Table minWidth={500}>
      <thead>
        <tr>
          <Th>Date</Th>
          <Th className="text-right">Count</Th>
          <Th className="text-right">Total</Th>
          <Th></Th>
        </tr>
      </thead>
      <tbody>
        {[...days].reverse().map((d) => (
          <Fragment key={d.date}>
            <Tr>
              <Td className="whitespace-nowrap font-medium text-gray-900">
                {new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </Td>
              <Td className="text-right">{d.count}</Td>
              <Td className="text-right font-medium text-gray-900">{inr(d.total)}</Td>
              <Td className="text-right">
                <button
                  type="button"
                  onClick={() => setOpen(open === d.date ? null : d.date)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                >
                  {open === d.date ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {open === d.date ? "Hide details" : "Details"}
                </button>
              </Td>
            </Tr>
            {open === d.date && (
              <tr>
                <td colSpan={4} className="overflow-x-auto border-t border-gray-100 bg-gray-50 px-4 py-3">
                  {renderDetail(rows.filter((r) => r.day === d.date))}
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </Table>
  );
}

interface SaleRow {
  id: number;
  day: string;
  invoiceNumber: string;
  totalAmount: string;
  paymentAmount: string;
  jobCard: { jobCardNumber: string; vehicle: { registrationNumber: string; customer: { name: string; mobile: string } } };
}

interface PurchaseDetailRow {
  id: number;
  day: string;
  itemType: string;
  description: string | null;
  quantity: number;
  purchaseCost: string;
  billUrl: string | null;
  supplier: { name: string } | null;
  item: { itemCode: string; name: string; uom: string } | null;
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
  const [data, setData] = useState<{ byDay: DayRow[]; invoices: SaleRow[]; grandTotal: number } | null>(null);

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
          <DayWiseTable
            days={data.byDay}
            rows={data.invoices}
            empty="No sales in this range."
            renderDetail={(rows) => (
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500">
                    <th className="py-1 pr-3">Draft Invoice</th>
                    <th className="py-1 pr-3">Vehicle</th>
                    <th className="py-1 pr-3">Customer</th>
                    <th className="py-1 pr-3 text-right">Total</th>
                    <th className="py-1 pr-3 text-right">Paid</th>
                    <th className="py-1 text-right">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((inv) => (
                    <tr key={inv.id} className="border-t border-gray-200">
                      <td className="py-1.5 pr-3">
                        <Link href={`/dashboard/invoices/${inv.id}`} className="font-mono text-blue-600 hover:underline">
                          {inv.invoiceNumber}
                        </Link>
                        <span className="block text-xs text-gray-500">{inv.jobCard.jobCardNumber}</span>
                      </td>
                      <td className="py-1.5 pr-3 font-mono">{inv.jobCard.vehicle.registrationNumber}</td>
                      <td className="py-1.5 pr-3">
                        {inv.jobCard.vehicle.customer.name}
                        <span className="block text-xs text-gray-500">{inv.jobCard.vehicle.customer.mobile}</span>
                      </td>
                      <td className="py-1.5 pr-3 text-right">{inr(inv.totalAmount)}</td>
                      <td className="py-1.5 pr-3 text-right">{inr(inv.paymentAmount)}</td>
                      <td className="py-1.5 text-right">{inr(Number(inv.totalAmount) - Number(inv.paymentAmount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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
    byDay: DayRow[];
    bySupplier: { supplier: string; count: number; total: number }[];
    purchases: PurchaseDetailRow[];
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
            <DayWiseTable
              days={data.byDay}
              rows={data.purchases}
              empty="No purchases in this range."
              renderDetail={(rows) => (
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500">
                      <th className="py-1 pr-3">Type</th>
                      <th className="py-1 pr-3">Item / Expense</th>
                      <th className="py-1 pr-3">Supplier</th>
                      <th className="py-1 pr-3 text-right">Qty</th>
                      <th className="py-1 pr-3 text-right">Rate</th>
                      <th className="py-1 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id} className="border-t border-gray-200">
                        <td className="py-1.5 pr-3">{TYPE_LABELS[p.itemType] ?? p.itemType}</td>
                        <td className="py-1.5 pr-3">
                          {p.item ? `${p.item.itemCode} — ${p.item.name}` : p.description}
                          {p.billUrl && (
                            <a
                              href={assetUrl(p.billUrl)}
                              target="_blank"
                              rel="noreferrer"
                              className="ml-2 text-xs text-blue-600 hover:underline"
                            >
                              Bill
                            </a>
                          )}
                        </td>
                        <td className="py-1.5 pr-3">{p.supplier?.name ?? "-"}</td>
                        <td className="py-1.5 pr-3 text-right">
                          {p.quantity} {p.item?.uom ?? ""}
                        </td>
                        <td className="py-1.5 pr-3 text-right">{inr(p.purchaseCost)}</td>
                        <td className="py-1.5 text-right">{inr(p.quantity * Number(p.purchaseCost))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            />
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

// Sales and purchase figures are admin-only (the server refuses them for
// anyone else), so other users don't get those tabs.
const ADMIN_ONLY_TABS: Tab[] = ["sales", "purchases"];

function ReportsPageContent() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const tabs = TABS.filter((t) => isAdmin || !ADMIN_ONLY_TABS.includes(t.key));
  const [tab, setTab] = useState<Tab>(isAdmin ? "sales" : "inventory");

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Sales, purchases, inventory, workshop and customer insights." />

      <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-2">
        {tabs.map((t) => (
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

      {isAdmin && tab === "sales" && <SalesTab />}
      {isAdmin && tab === "purchases" && <PurchasesTab />}
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
