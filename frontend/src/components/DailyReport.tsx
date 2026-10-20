"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Printer } from "lucide-react";
import { apiFetch, ApiError, assetUrl } from "@/lib/api";
import { fmtQty, formatINR } from "@/lib/format";
import { downloadExcel } from "@/lib/excel";
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
interface Daily {
  date: string;
  summary: {
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

// One day in full: draft invoices with their lines and payments, money
// received that day, and purchases — with print and Excel export.
export function DailyReport() {
  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [data, setData] = useState<Daily | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch(`/reports/daily?date=${date}`)
      .then((body) => !cancelled && setData(body))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Could not load the daily report"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date]);

  async function exportExcel() {
    if (!data) return;
    setExporting(true);
    try {
      const s = data.summary;
      await downloadExcel(`daily-report-${data.date}`, [
        {
          name: "Summary",
          columns: ["Item", "Value"],
          rows: [
            { Item: "Date", Value: data.date },
            { Item: "Draft invoices (finalised)", Value: s.salesCount },
            { Item: "Sales total", Value: s.salesTotal },
            { Item: "Received against them", Value: s.salesReceived },
            { Item: "Outstanding on them", Value: s.salesOutstanding },
            { Item: "Invoices being revised (not in totals)", Value: s.beingRevisedCount },
            { Item: "Payments received this day", Value: s.collectionsTotal },
            ...s.collectionsByMode.map((m) => ({ Item: `  by ${mode(m.mode)}`, Value: m.amount })),
            { Item: "Purchase lines", Value: s.purchaseCount },
            { Item: "Purchases total", Value: s.purchaseTotal },
            { Item: "  Inventory", Value: s.inventoryPurchaseTotal },
            { Item: "  Expenses", Value: s.expenseTotal },
          ],
        },
        {
          name: "Sales",
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
      ]);
    } catch {
      setError("Could not create the Excel file — please try again");
    } finally {
      setExporting(false);
    }
  }

  const s = data?.summary;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button type="button" variant="secondary" size="sm" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-auto" />
        <Button type="button" variant="secondary" size="sm" onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => window.print()} disabled={!data}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button type="button" size="sm" onClick={exportExcel} disabled={!data || exporting}>
            <Download className="h-4 w-4" /> {exporting ? "Preparing..." : "Export Excel"}
          </Button>
        </div>
      </div>

      <h2 className="text-lg font-semibold text-gray-900">
        Daily report —{" "}
        {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
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
            <Tile label={`Sales (${s.salesCount} draft invoices)`} value={formatINR(s.salesTotal)} />
            <Tile label="Received against them" value={formatINR(s.salesReceived)} tone="green" />
            <Tile label="Outstanding on them" value={formatINR(s.salesOutstanding)} tone={s.salesOutstanding > 0 ? "red" : "gray"} />
            <Tile
              label="Payments received this day"
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
              <p className="text-base font-semibold text-gray-900">Sales — draft invoices</p>
              {data.sales.length === 0 ? (
                <p className="text-sm text-gray-500">No draft invoices on this day.</p>
              ) : (
                data.sales.map((sale) => <SaleCard key={sale.id} s={sale} />)
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-2">
              <p className="text-base font-semibold text-gray-900">Payments received this day</p>
              {data.collections.length === 0 ? (
                <p className="text-sm text-gray-500">No payments received on this day.</p>
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
                <p className="text-sm text-gray-500">No purchases on this day.</p>
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
