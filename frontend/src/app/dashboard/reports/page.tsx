"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Download, MessageCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { AssetLink } from "@/components/AuthedMedia";
import { TYPE_LABELS } from "@/lib/purchaseTypes";
import { useAuth } from "@/context/AuthContext";
import { downloadRowsAsExcel } from "@/lib/excel";
import { DailyReport } from "@/components/DailyReport";
import { shareReport } from "@/lib/shareReport";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";

type Tab = "daily" | "estimates" | "purchases" | "inventory" | "workshop" | "customers";

const TABS: { key: Tab; label: string }[] = [
  { key: "daily", label: "Detailed (From–To)" },
  { key: "estimates", label: "Estimates" },
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
      <Download className="h-3.5 w-3.5" /> Export Excel
    </Button>
  );
}

// One click: the report's Excel file (phone) or summary text (computer)
// into WhatsApp — see lib/shareReport.ts.
function ShareButton({ fileName, sheetName, rows, text }: { fileName: string; sheetName: string; rows: Record<string, unknown>[]; text: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await shareReport({ fileName, sheets: [{ name: sheetName, columns: rows.length ? Object.keys(rows[0]) : [], rows }], text });
        } finally {
          setBusy(false);
        }
      }}
    >
      <MessageCircle className="h-3.5 w-3.5" /> {busy ? "Preparing..." : "Share on WhatsApp"}
    </Button>
  );
}

const rangeText = (from: string, to: string) =>
  `${new Date(`${from}T12:00:00`).toLocaleDateString("en-IN")} – ${new Date(`${to}T12:00:00`).toLocaleDateString("en-IN")}`;

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

interface EstimateReportRow {
  id: number;
  day: string;
  estimateNumber: string;
  approved: boolean;
  jobCardId: number;
  jobCardNumber: string;
  registrationNumber: string;
  customerName: string;
  customerMobile: string;
  total: number;
}

function EstimatesTab() {
  const [from, setFrom] = useState(daysAgoStr(30));
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<{ byDay: DayRow[]; estimates: EstimateReportRow[]; grandTotal: number; approvedTotal: number } | null>(null);

  async function load() {
    setData(await apiFetch(`/reports/estimates?from=${from}&to=${to}`));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const excelRows = (data?.estimates ?? []).map((e) => ({
    Date: e.day,
    Estimate: e.estimateNumber,
    "Job Card": e.jobCardNumber,
    Customer: e.customerName,
    Mobile: e.customerMobile,
    Vehicle: e.registrationNumber,
    Status: e.approved ? "Customer approved" : "Awaiting approval",
    Total: e.total,
  }));

  return (
    <div>
      <DateRangeControls from={from} to={to} setFrom={setFrom} setTo={setTo} onApply={load} />
      {data && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600">
              {data.estimates.length} estimates · Total <span className="font-semibold text-gray-900">{inr(data.grandTotal)}</span> · Customer
              approved <span className="font-semibold text-gray-900">{inr(data.approvedTotal)}</span>
            </p>
            <div className="flex gap-1">
              <ExportButton onClick={() => downloadRowsAsExcel(`estimates-${from}-to-${to}.xlsx`, "estimates", excelRows)} />
              <ShareButton
                fileName={`estimates-${from}-to-${to}`}
                sheetName="estimates"
                rows={excelRows}
                text={`Motors Mitra — Estimates ${rangeText(from, to)}\n${data.estimates.length} estimates: ${inr(data.grandTotal)}\nCustomer approved: ${inr(data.approvedTotal)}`}
              />
            </div>
          </div>
          <DayWiseTable
            days={data.byDay}
            rows={data.estimates}
            empty="No estimates in this range."
            renderDetail={(rows) => (
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500">
                    <th className="py-1 pr-3">Estimate</th>
                    <th className="py-1 pr-3">Vehicle</th>
                    <th className="py-1 pr-3">Customer</th>
                    <th className="py-1 pr-3">Status</th>
                    <th className="py-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id} className="border-t border-gray-200">
                      <td className="py-1.5 pr-3">
                        <Link href={`/dashboard/estimates/${e.id}`} className="font-mono text-blue-600 hover:underline">
                          {e.estimateNumber}
                        </Link>
                        <span className="block text-xs text-gray-500">{e.jobCardNumber}</span>
                      </td>
                      <td className="py-1.5 pr-3 font-mono">{e.registrationNumber}</td>
                      <td className="py-1.5 pr-3">
                        {e.customerName}
                        <span className="block text-xs text-gray-500">{e.customerMobile}</span>
                      </td>
                      <td className="py-1.5 pr-3">{e.approved ? "Customer approved" : "Awaiting approval"}</td>
                      <td className="py-1.5 text-right">{inr(e.total)}</td>
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
              <div className="flex gap-1">
                <ExportButton onClick={() => downloadRowsAsExcel("purchases-by-day.xlsx", "purchases by day", data.byDay)} />
                <ShareButton
                  fileName={`purchases-${from}-to-${to}`}
                  sheetName="purchases by day"
                  rows={data.byDay}
                  text={`Motors Mitra — Purchases ${rangeText(from, to)}\nTotal: ${inr(data.grandTotal)}`}
                />
              </div>
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
                            <AssetLink
                              href={p.billUrl}
                              className="ml-2 text-xs text-blue-600 hover:underline"
                            >
                              Bill
                            </AssetLink>
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
              <ExportButton onClick={() => downloadRowsAsExcel("purchases-by-supplier.xlsx", "purchases by supplier", data.bySupplier)} />
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
        <div className="flex gap-1">
          <ExportButton onClick={() => downloadRowsAsExcel("inventory-report.xlsx", "inventory report", data.rows)} />
          <ShareButton
            fileName="inventory-report"
            sheetName="inventory"
            rows={data.rows}
            text={`Motors Mitra — Inventory\nStock value: ${inr(data.totalStockValue)}\nLow stock: ${data.lowStockCount} · Out of stock: ${data.outOfStockCount}`}
          />
        </div>
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
            <div className="flex gap-1">
              <ExportButton onClick={() => downloadRowsAsExcel("workshop-report.xlsx", "workshop report", data.byStatus)} />
              <ShareButton
                fileName={`workshop-${from}-to-${to}`}
                sheetName="job cards by status"
                rows={data.byStatus}
                text={`Motors Mitra — Job cards ${rangeText(from, to)}\n${data.byStatus.map((b) => `${b.status}: ${b.count}`).join("\n")}`}
              />
            </div>
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
        <div className="mb-2 flex justify-end">
          <ShareButton
            fileName={`customers-${from}-to-${to}`}
            sheetName="customers"
            rows={[{ "New customers": data.newCustomers, "Repeat customers": data.repeatCustomers, "Total customers": data.totalCustomers }]}
            text={`Motors Mitra — Customers ${rangeText(from, to)}\nNew: ${data.newCustomers} · Repeat: ${data.repeatCustomers} · Total: ${data.totalCustomers}`}
          />
        </div>
      )}
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
const ADMIN_ONLY_TABS: Tab[] = ["daily", "estimates", "purchases"];

function ReportsPageContent() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const tabs = TABS.filter((t) => isAdmin || !ADMIN_ONLY_TABS.includes(t.key));
  const [tab, setTab] = useState<Tab>(isAdmin ? "daily" : "inventory");

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader title="Reports" description="Daily detail, sales, purchases, inventory, workshop and customer insights." />
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-2 print:hidden">
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

      {isAdmin && tab === "daily" && <DailyReport />}
      {isAdmin && tab === "estimates" && <EstimatesTab />}
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
