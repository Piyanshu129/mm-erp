"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { useEffect, useState } from "react";
import { Plus, Wallet, Paperclip, Download } from "lucide-react";
import { exportPurchasesToExcel } from "@/lib/purchaseExport";
import { apiFetch } from "@/lib/api";
import { AssetLink } from "@/components/AuthedMedia";
import { formatINR } from "@/lib/format";
import { EXPENSE_TYPES, TYPE_LABELS, PurchaseTotals } from "@/lib/purchaseTypes";
import { MonthNav, TotalTile, FilterHeaderSelect, currentMonth, monthLabel } from "@/components/PurchaseListControls";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, LinkButton } from "@/components/ui/Button";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface ExpenseRow {
  id: number;
  purchaseDate: string;
  itemType: string;
  description: string | null;
  purchaseCost: string;
  quantity: number;
  billUrl: string | null;
  remarks: string | null;
  supplier: { name: string } | null;
  createdBy: { name: string };
}

const PAGE_SIZE = 100;

// Expenses are purchases of the expense types (Travel, Petrol, Food,
// Others) — recorded from the Purchases page, listed here on their own.
function ExpensesPageContent() {
  const [month, setMonth] = useState(currentMonth());
  const [typeFilter, setTypeFilter] = useState("");
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<PurchaseTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // The month's expenses (as filtered) as an Excel file.
  const [exporting, setExporting] = useState(false);
  async function exportExcel() {
    setExporting(true);
    try {
      const filters: Record<string, string> = { month };
      if (typeFilter) filters.itemType = typeFilter;
      else filters.category = "EXPENSE";
      await exportPurchasesToExcel(filters, `expenses-${month}`);
    } finally {
      setExporting(false);
    }
  }

  function query(p: number): string {
    const params = new URLSearchParams({ month, page: String(p), pageSize: String(PAGE_SIZE) });
    if (typeFilter) params.set("itemType", typeFilter);
    else params.set("category", "EXPENSE");
    return `/purchases?${params}`;
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(query(1)).then((body) => {
      if (cancelled) return;
      setExpenses(body.purchases);
      setTotal(body.total);
      setPage(1);
      setSummary(body.summary);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, typeFilter]);

  async function loadMore() {
    setLoadingMore(true);
    const body = await apiFetch(query(page + 1));
    setExpenses((prev) => [...prev, ...body.purchases]);
    setPage((p) => p + 1);
    setLoadingMore(false);
  }

  const filteredTotal = summary
    ? typeFilter
      ? summary.byType[typeFilter]?.total ?? 0
      : summary.expenseTotal
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Miscellaneous purchases — travel, petrol, food and other business costs. No supplier, no stock."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportExcel} disabled={exporting}>
              <Download className="h-4 w-4" /> {exporting ? "Preparing..." : "Export Excel"}
            </Button>
            <LinkButton href={`/dashboard/purchases?new=${typeFilter || EXPENSE_TYPES[0]}`}>
              <Plus className="h-4 w-4" /> New expense
            </LinkButton>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={month} onChange={setMonth} />
        {typeFilter && (
          <button type="button" onClick={() => setTypeFilter("")} className="text-xs font-medium text-blue-600 hover:underline">
            Clear filter
          </button>
        )}
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="col-span-2 sm:col-span-1">
            <TotalTile label={`Total expenses — ${monthLabel(month)}`} value={summary.expenseTotal} tone="amber" />
          </div>
          {EXPENSE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(typeFilter === t ? "" : t)}
              className={`rounded-lg text-left transition-shadow hover:shadow-sm ${typeFilter === t ? "ring-2 ring-blue-500" : ""}`}
              aria-pressed={typeFilter === t}
            >
              <TotalTile
                label={TYPE_LABELS[t]}
                value={summary.byType[t]?.total ?? 0}
                sub={`${summary.byType[t]?.count ?? 0} ${summary.byType[t]?.count === 1 ? "entry" : "entries"}`}
              />
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <TableSkeleton cols={6} />
      ) : (
        <Table minWidth={800}>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>
                <FilterHeaderSelect
                  label="Type"
                  value={typeFilter}
                  onChange={setTypeFilter}
                  options={EXPENSE_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
                />
              </Th>
              <Th>Description</Th>
              <Th>Remarks</Th>
              <Th>Entered by</Th>
              <Th className="text-right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10">
                  <EmptyState
                    icon={Wallet}
                    title={typeFilter ? `No ${TYPE_LABELS[typeFilter].toLowerCase()} expenses this month` : "No expenses this month"}
                  />
                </td>
              </tr>
            )}
            {expenses.map((x) => (
              <Tr key={x.id}>
                <Td className="whitespace-nowrap">{new Date(x.purchaseDate).toLocaleDateString()}</Td>
                <Td>{TYPE_LABELS[x.itemType] ?? x.itemType}</Td>
                <Td>
                  {x.description}
                  {x.supplier && <span className="block text-xs text-gray-500">Supplier: {x.supplier.name}</span>}
                  {x.billUrl && (
                    <AssetLink
                      href={x.billUrl}
                      className="mt-0.5 inline-flex items-center gap-0.5 text-xs text-blue-600 hover:underline"
                    >
                      <Paperclip className="h-3 w-3" /> Bill
                    </AssetLink>
                  )}
                </Td>
                <Td className="text-gray-500">{x.remarks ?? "-"}</Td>
                <Td className="text-gray-500">{x.createdBy.name}</Td>
                <Td className="text-right font-medium text-gray-900">{formatINR(x.quantity * Number(x.purchaseCost))}</Td>
              </Tr>
            ))}
          </tbody>
          {expenses.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50">
                <td colSpan={5} className="border-t border-gray-200 px-4 py-2.5 text-right text-sm font-medium text-gray-700">
                  {typeFilter ? `${TYPE_LABELS[typeFilter]} total` : "Month total"} ({total} {total === 1 ? "entry" : "entries"})
                </td>
                <td className="border-t border-gray-200 px-4 py-2.5 text-right text-sm font-semibold text-gray-900">
                  {formatINR(filteredTotal)}
                </td>
              </tr>
            </tfoot>
          )}
        </Table>
      )}

      {!loading && expenses.length < total && (
        <div className="flex justify-center">
          <Button type="button" variant="secondary" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading..." : `Show more (${expenses.length} of ${total})`}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ExpensesPage() {
  return (
    <RequireAuth permission="PURCHASES">
      <ExpensesPageContent />
    </RequireAuth>
  );
}
