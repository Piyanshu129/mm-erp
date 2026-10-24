"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, MessageCircle, Printer } from "lucide-react";
import { apiFetch, ApiError, assetUrl } from "@/lib/api";
import { fmtQty, formatINR } from "@/lib/format";
import { downloadExcel, ExcelSheet } from "@/lib/excel";
import { shareReport } from "@/lib/shareReport";
import { TYPE_LABELS } from "@/lib/purchaseTypes";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";

interface SaleLine {
  kind: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}
interface SalePayment {
  id: number;
  amount: number;
  paymentDate: string;
  paymentMode: string | null;
  reference: string | null;
  receivedBy: string | null;
}
interface Sale {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  finalised: boolean;
  jobCardId: number;
  jobCardNumber: string;
  customerName: string;
  customerMobile: string;
  registrationNumber: string;
  lines: SaleLine[];
  partsTotal: number;
  labourTotal: number;
  discount: number;
  taxAmount: number;
  total: number;
  received: number;
  outstanding: number;
  payments: SalePayment[];
}
interface Collection {
  id: number;
  amount: number;
  paymentDate: string;
  paymentMode: string | null;
  reference: string | null;
  receivedBy: string | null;
  notes: string | null;
  invoiceId: number;
  invoiceNumber: string;
  registrationNumber: string;
  customerName: string;
}
interface PurchaseLine {
  id: number;
  itemType: string;
  category: string;
  supplierName: string | null;
  itemCode: string | null;
  itemName: string;
  brand: string | null;
  specification: string | null;
  uom: string | null;
  quantity: number;
  rate: number;
  amount: number;
  billUrl: string | null;
  remarks: string | null;
  paymentStatus: string | null;
}
interface EstimateRow {
  id: number;
  estimateNumber: string;
  estimateDate: string;
  approved: boolean;
  jobCardId: number;
  jobCardNumber: string;
  customerName: string;
  customerMobile: string;
  registrationNumber: string;
  lines: SaleLine[];
  subtotal: number;
  taxRate: number | null;
  taxAmount: number;
  total: number;
}
interface Daily {
  date: string;
  from: string;
  to: string;
  summary: {
    estimatesCount: number;
    estimatesApproved: number;
    estimatesTotal: number;
    salesCount: number;
    salesTotal: number;
    salesReceived: number;
    salesOutstanding: number;
    beingRevisedCount: number;
    collectionsTotal: number;
    collectionsByMode: { mode: string; amount: number }[];
    purchaseCount: number;
    purchaseTotal: number;
    inventoryPurchaseTotal: number;
    expenseTotal: number;
  };
  estimates: EstimateRow[];
  sales: Sale[];
  collections: Collection[];
  purchases: PurchaseLine[];
}

const mode = (m: string | null) => (m ? m.replace("_", " ") : "—");

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
}

function Tile({ label, value, sub, tone = "gray" }: { label: string; value: string; sub?: string; tone?: "gray" | "red" | "green" }) {
  const colour = tone === "red" ? "text-red-700" : tone === "green" ? "text-green-700" : "text-gray-900";
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-semibold ${colour}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function SaleCard({ s }: { s: Sale }) {
  return (
    <div className={`break-inside-avoid rounded-md border p-3 ${s.finalised ? "border-gray-200" : "border-amber-300 bg-amber-50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/dashboard/invoices/${s.id}`} className="font-mono font-semibold text-blue-700 hover:underline">
            {s.invoiceNumber}
          </Link>{" "}
          <span className="text-xs text-gray-500">
            {new Date(s.invoiceDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
            <Link href={`/dashboard/jobcards/${s.jobCardId}`} className="hover:underline">
              {s.jobCardNumber}
            </Link>
          </span>
          {!s.finalised && (
            <Badge tone="amber">Job card reopened for changes — not in today&apos;s totals</Badge>
          )}
          <p className="text-sm text-gray-700">
            {s.customerName} · {s.customerMobile} · <span className="font-mono">{s.registrationNumber}</span>
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold text-gray-900">{formatINR(s.total)}</p>
          <p className="text-xs text-green-700">Received {formatINR(s.received)}</p>
          {s.outstanding > 0.005 && <p className="text-xs font-medium text-red-700">Due {formatINR(s.outstanding)}</p>}
        </div>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-1 pr-2">Type</th>
              <th className="py-1 pr-2">Item / service</th>
              <th className="py-1 pr-2 text-right">Qty</th>
              <th className="py-1 pr-2 text-right">Rate</th>
              <th className="py-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-1 pr-2 text-gray-500">{l.kind}</td>
                <td className="py-1 pr-2">{l.description}</td>
                <td className="py-1 pr-2 text-right">{fmtQty(l.quantity)}</td>
                <td className="py-1 pr-2 text-right">{formatINR(l.rate)}</td>
                <td className="py-1 text-right">{formatINR(l.amount)}</td>
              </tr>
            ))}
            <tr className="border-t border-gray-200 text-gray-600">
              <td colSpan={4} className="py-1 pr-2 text-right">
                Parts {formatINR(s.partsTotal)} · Labour {formatINR(s.labourTotal)}
                {s.discount > 0 && ` · Discount −${formatINR(s.discount)}`}
                {s.taxAmount > 0 && ` · Tax ${formatINR(s.taxAmount)}`}
              </td>
              <td className="py-1 text-right font-semibold text-gray-900">{formatINR(s.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {s.payments.length > 0 && (
        <p className="mt-1 text-xs text-gray-600">
          Payments:{" "}
          {s.payments
            .map(
              (p) =>
                `${formatINR(p.amount)} ${mode(p.paymentMode)} on ${new Date(p.paymentDate).toLocaleDateString()}${p.reference ? ` (ref ${p.reference})` : ""}`
            )
            .join("; ")}
        </p>
      )}
    </div>
  );
}

function EstimateCard({ e }: { e: EstimateRow }) {
  return (
    <div className="break-inside-avoid rounded-md border border-gray-200 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/dashboard/estimates/${e.id}`} className="font-mono font-semibold text-blue-700 hover:underline">
            {e.estimateNumber}
          </Link>{" "}
          <span className="text-xs text-gray-500">
            {new Date(e.estimateDate).toLocaleDateString()} ·{" "}
            <Link href={`/dashboard/jobcards/${e.jobCardId}`} className="hover:underline">
              {e.jobCardNumber}
            </Link>
          </span>{" "}
          <Badge tone={e.approved ? "green" : "amber"}>{e.approved ? "Customer approved" : "Awaiting approval"}</Badge>
          <p className="text-sm text-gray-700">
            {e.customerName} · {e.customerMobile} · <span className="font-mono">{e.registrationNumber}</span>
          </p>
        </div>
        <p className="text-right text-sm font-semibold text-gray-900">{formatINR(e.total)}</p>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-1 pr-2">Type</th>
              <th className="py-1 pr-2">Item / service</th>
              <th className="py-1 pr-2 text-right">Qty</th>
              <th className="py-1 pr-2 text-right">Rate</th>
              <th className="py-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {e.lines.map((l, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-1 pr-2 text-gray-500">{l.kind}</td>
                <td className="py-1 pr-2">{l.description}</td>
                <td className="py-1 pr-2 text-right">{fmtQty(l.quantity)}</td>
                <td className="py-1 pr-2 text-right">{formatINR(l.rate)}</td>
                <td className="py-1 text-right">{formatINR(l.amount)}</td>
              </tr>
            ))}
            <tr className="border-t border-gray-200 text-gray-600">
              <td colSpan={4} className="py-1 pr-2 text-right">
                Subtotal {formatINR(e.subtotal)}
                {e.taxAmount > 0 && ` · Tax ${e.taxRate}% ${formatINR(e.taxAmount)}`}
              </td>
              <td className="py-1 text-right font-semibold text-gray-900">{formatINR(e.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function rangeLabel(from: string, to: string): string {
  const f = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return from === to ? f(from) : `${f(from)} – ${f(to)}`;
}

// A date range (one day by default) in full: estimates with their lines,
// draft invoices with their lines and payments, money received, and
// purchases — with print, Excel export and WhatsApp share.
export function DailyReport() {
  const today = new Date().toLocaleDateString("en-CA");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [sharing, setSharing] = useState(false);
  const [data, setData] = useState<Daily | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch(`/reports/daily?from=${from}&to=${to}`)
      .then((body) => !cancelled && setData(body))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Could not load the daily report"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  function sheets(data: Daily): ExcelSheet[] {
      const s = data.summary;
      return [
        {
          name: "Summary",
          columns: ["Item", "Value"],
          rows: [
            { Item: "From", Value: data.from },
            { Item: "To", Value: data.to },
            { Item: "Estimates", Value: s.estimatesCount },
            { Item: "  Customer approved", Value: s.estimatesApproved },
            { Item: "Estimates value", Value: s.estimatesTotal },
            { Item: "Draft invoices (finalised)", Value: s.salesCount },
            { Item: "Sales total", Value: s.salesTotal },
            { Item: "Received against them", Value: s.salesReceived },
            { Item: "Outstanding on them", Value: s.salesOutstanding },
            { Item: "Invoices being revised (not in totals)", Value: s.beingRevisedCount },
            { Item: "Payments received", Value: s.collectionsTotal },
            ...s.collectionsByMode.map((m) => ({ Item: `  by ${mode(m.mode)}`, Value: m.amount })),
            { Item: "Purchase lines", Value: s.purchaseCount },
            { Item: "Purchases total", Value: s.purchaseTotal },
            { Item: "  Inventory", Value: s.inventoryPurchaseTotal },
            { Item: "  Expenses", Value: s.expenseTotal },
          ],
        },
        {
          name: "Estimates",
          columns: ["Estimate", "Date", "Status", "Job Card", "Customer", "Mobile", "Vehicle", "Subtotal", "Tax", "Total"],
          rows: data.estimates.map((e) => ({
            Estimate: e.estimateNumber,
            Date: new Date(e.estimateDate).toLocaleDateString(),
            Status: e.approved ? "Customer approved" : "Awaiting approval",
            "Job Card": e.jobCardNumber,
            Customer: e.customerName,
            Mobile: e.customerMobile,
            Vehicle: e.registrationNumber,
            Subtotal: e.subtotal,
            Tax: e.taxAmount,
            Total: e.total,
          })),
        },
        {
          name: "Estimate Lines",
          columns: ["Estimate", "Customer", "Vehicle", "Type", "Item / Service", "Qty", "Rate", "Amount"],
          rows: data.estimates.flatMap((e) =>
            e.lines.map((l) => ({
              Estimate: e.estimateNumber,
              Customer: e.customerName,
              Vehicle: e.registrationNumber,
              Type: l.kind,
              "Item / Service": l.description,
              Qty: l.quantity,
              Rate: l.rate,
              Amount: l.amount,
            }))
          ),
        },
        {
          name: "Draft Invoices",
          columns: ["Draft Invoice", "Time", "Status", "Job Card", "Customer", "Mobile", "Vehicle", "Parts", "Labour", "Discount", "Tax", "Total", "Received", "Outstanding", "Payments"],
          rows: data.sales.map((x) => ({
            "Draft Invoice": x.invoiceNumber,
            Time: new Date(x.invoiceDate).toLocaleTimeString(),
            Status: x.finalised ? "Finalised" : "Being revised (not in totals)",
            "Job Card": x.jobCardNumber,
            Customer: x.customerName,
            Mobile: x.customerMobile,
            Vehicle: x.registrationNumber,
            Parts: x.partsTotal,
            Labour: x.labourTotal,
            Discount: x.discount,
            Tax: x.taxAmount,
            Total: x.total,
            Received: x.received,
            Outstanding: x.outstanding,
            Payments: x.payments.map((p) => `${p.amount} ${mode(p.paymentMode)}${p.reference ? ` ref ${p.reference}` : ""}`).join("; "),
          })),
        },
        {
          name: "Sale Lines",
          columns: ["Draft Invoice", "Customer", "Vehicle", "Type", "Item / Service", "Qty", "Rate", "Amount"],
          rows: data.sales.flatMap((x) =>
            x.lines.map((l) => ({
              "Draft Invoice": x.invoiceNumber,
              Customer: x.customerName,
              Vehicle: x.registrationNumber,
              Type: l.kind,
              "Item / Service": l.description,
              Qty: l.quantity,
              Rate: l.rate,
              Amount: l.amount,
            }))
          ),
        },
        {
          name: "Payments Received",
          columns: ["Draft Invoice", "Customer", "Vehicle", "Amount", "Mode", "Reference", "Received By", "Notes"],
          rows: data.collections.map((c) => ({
            "Draft Invoice": c.invoiceNumber,
            Customer: c.customerName,
            Vehicle: c.registrationNumber,
            Amount: c.amount,
            Mode: mode(c.paymentMode),
            Reference: c.reference,
            "Received By": c.receivedBy,
            Notes: c.notes,
          })),
        },
        {
          name: "Purchases",
          columns: ["Entry No.", "Category", "Type", "Supplier", "Item Code", "Item / Expense", "Brand", "Specification", "Qty", "UOM", "Rate", "Amount", "Payment Status", "Remarks"],
          rows: data.purchases.map((p) => ({
            "Entry No.": p.id,
            Category: p.category,
            Type: TYPE_LABELS[p.itemType] ?? p.itemType,
            Supplier: p.supplierName,
            "Item Code": p.itemCode,
            "Item / Expense": p.itemName,
            Brand: p.brand,
            Specification: p.specification,
            Qty: p.quantity,
            UOM: p.uom,
            Rate: p.rate,
            Amount: p.amount,
            "Payment Status": p.paymentStatus,
            Remarks: p.remarks,
          })),
        },
      ];
  }

  const fileName = data ? `report-${data.from}${data.to !== data.from ? `-to-${data.to}` : ""}` : "report";

  async function exportExcel() {
    if (!data) return;
    setExporting(true);
    try {
      await downloadExcel(fileName, sheets(data));
    } catch {
      setError("Could not create the Excel file — please try again");
    } finally {
      setExporting(false);
    }
  }

  async function share() {
    if (!data) return;
    const s = data.summary;
    const text = [
      `Motors Mitra — Report ${rangeLabel(data.from, data.to)}`,
      `Estimates: ${s.estimatesCount} (${s.estimatesApproved} approved) — ${formatINR(s.estimatesTotal)}`,
      `Draft invoices: ${s.salesCount} — ${formatINR(s.salesTotal)} (received ${formatINR(s.salesReceived)}, outstanding ${formatINR(s.salesOutstanding)})`,
      `Payments received: ${formatINR(s.collectionsTotal)}`,
      `Purchases: ${formatINR(s.purchaseTotal)} (stock ${formatINR(s.inventoryPurchaseTotal)}, expenses ${formatINR(s.expenseTotal)})`,
    ].join("\n");
    setSharing(true);
    try {
      await shareReport({ fileName, sheets: sheets(data), text });
    } finally {
      setSharing(false);
    }
  }

  const s = data?.summary;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setFrom(shiftDate(from, -1));
            setTo(shiftDate(from, -1));
          }}
          aria-label="Previous day"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <label className="flex items-center gap-1 text-sm text-gray-600">
          From
          <Input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="w-auto" />
        </label>
        <label className="flex items-center gap-1 text-sm text-gray-600">
          To
          <Input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="w-auto" />
        </label>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setFrom(shiftDate(to, 1));
            setTo(shiftDate(to, 1));
          }}
          aria-label="Next day"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => (setFrom(today), setTo(today))}>
          Today
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setFrom(`${today.slice(0, 8)}01`);
            setTo(today);
          }}
        >
          This month
        </Button>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={share} disabled={!data || sharing}>
            <MessageCircle className="h-4 w-4" /> {sharing ? "Preparing..." : "Share on WhatsApp"}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => window.print()} disabled={!data}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button type="button" size="sm" onClick={exportExcel} disabled={!data || exporting}>
            <Download className="h-4 w-4" /> {exporting ? "Preparing..." : "Export Excel"}
          </Button>
        </div>
      </div>

      <h2 className="text-lg font-semibold text-gray-900">
        Report — {rangeLabel(from, to)}
      </h2>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading || !data || !s ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label={`Estimates (${s.estimatesCount}, ${s.estimatesApproved} approved)`} value={formatINR(s.estimatesTotal)} />
            <Tile label={`Draft invoices (${s.salesCount})`} value={formatINR(s.salesTotal)} />
            <Tile label="Received against them" value={formatINR(s.salesReceived)} tone="green" />
            <Tile label="Outstanding on them" value={formatINR(s.salesOutstanding)} tone={s.salesOutstanding > 0 ? "red" : "gray"} />
            <Tile
              label="Payments received"
              value={formatINR(s.collectionsTotal)}
              sub={s.collectionsByMode.map((m) => `${mode(m.mode)} ${formatINR(m.amount)}`).join(" · ") || undefined}
            />
            <Tile label={`Purchases (${s.purchaseCount} lines)`} value={formatINR(s.purchaseTotal)} />
            <Tile label="Inventory" value={formatINR(s.inventoryPurchaseTotal)} />
            <Tile label="Expenses" value={formatINR(s.expenseTotal)} />
            {s.beingRevisedCount > 0 && (
              <Tile label="Invoices being revised" value={String(s.beingRevisedCount)} sub="Not in the sales totals" />
            )}
          </div>

          <Card>
            <CardBody className="space-y-3">
              <p className="text-base font-semibold text-gray-900">Estimates</p>
              {data.estimates.length === 0 ? (
                <p className="text-sm text-gray-500">No estimates in this period.</p>
              ) : (
                data.estimates.map((e) => <EstimateCard key={e.id} e={e} />)
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3">
              <p className="text-base font-semibold text-gray-900">Draft invoices</p>
              {data.sales.length === 0 ? (
                <p className="text-sm text-gray-500">No draft invoices in this period.</p>
              ) : (
                data.sales.map((sale) => <SaleCard key={sale.id} s={sale} />)
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-2">
              <p className="text-base font-semibold text-gray-900">Payments received</p>
              {data.collections.length === 0 ? (
                <p className="text-sm text-gray-500">No payments received in this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500">
                        <th className="py-1 pr-2">Draft Invoice</th>
                        <th className="py-1 pr-2">Customer</th>
                        <th className="py-1 pr-2">Mode</th>
                        <th className="py-1 pr-2">Reference</th>
                        <th className="py-1 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.collections.map((c) => (
                        <tr key={c.id} className="border-t border-gray-100">
                          <td className="py-1.5 pr-2">
                            <Link href={`/dashboard/invoices/${c.invoiceId}`} className="font-mono text-blue-600 hover:underline">
                              {c.invoiceNumber}
                            </Link>
                          </td>
                          <td className="py-1.5 pr-2">
                            {c.customerName} <span className="font-mono text-xs text-gray-500">{c.registrationNumber}</span>
                          </td>
                          <td className="py-1.5 pr-2">{mode(c.paymentMode)}</td>
                          <td className="py-1.5 pr-2">{c.reference ?? "—"}</td>
                          <td className="py-1.5 text-right font-medium">{formatINR(c.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-2">
              <p className="text-base font-semibold text-gray-900">Purchases</p>
              {data.purchases.length === 0 ? (
                <p className="text-sm text-gray-500">No purchases in this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500">
                        <th className="py-1 pr-2">Entry No.</th>
                        <th className="py-1 pr-2">Supplier</th>
                        <th className="py-1 pr-2">Item / Expense</th>
                        <th className="py-1 pr-2 text-right">Qty</th>
                        <th className="py-1 pr-2 text-right">Rate</th>
                        <th className="py-1 pr-2 text-right">Amount</th>
                        <th className="py-1">Payment status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.purchases.map((p) => (
                        <tr key={p.id} className="border-t border-gray-100 align-top">
                          <td className="py-1.5 pr-2 font-mono">#{p.id}</td>
                          <td className="py-1.5 pr-2">{p.supplierName ?? "—"}</td>
                          <td className="py-1.5 pr-2">
                            <span className="text-xs text-gray-500">{TYPE_LABELS[p.itemType] ?? p.itemType} · </span>
                            {p.itemCode ? `${p.itemCode} — ` : ""}
                            {p.itemName}
                            {(p.brand || p.specification) && (
                              <span className="block text-xs text-gray-500">{[p.brand, p.specification].filter(Boolean).join(" · ")}</span>
                            )}
                            {p.billUrl && (
                              <a href={assetUrl(p.billUrl)} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline print:hidden">
                                View bill
                              </a>
                            )}
                          </td>
                          <td className="py-1.5 pr-2 text-right">
                            {fmtQty(p.quantity)} {p.uom ?? ""}
                          </td>
                          <td className="py-1.5 pr-2 text-right">{formatINR(p.rate)}</td>
                          <td className="py-1.5 pr-2 text-right font-medium">{formatINR(p.amount)}</td>
                          <td className="py-1.5 text-xs text-gray-600">{p.paymentStatus ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-gray-500">
                Supplier payments are made against the supplier&apos;s account, so the status shows each supplier&apos;s balance as of now. Purchases have no separate discount or tax fields.
              </p>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
