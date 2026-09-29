"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatINR } from "@/lib/format";
import { categoryOf, CATEGORY_LABELS } from "@/lib/purchaseTypes";

// YYYY-MM for the current month, in the user's own timezone.
export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

// ◀ September 2026 ▶ — steps a month at a time; can't go past this month.
export function MonthNav({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const thisMonth = currentMonth();
  const isCurrent = month >= thisMonth;
  const buttonClass =
    "rounded-md border border-gray-300 bg-white p-1.5 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onChange(shiftMonth(month, -1))} className={buttonClass} aria-label="Previous month">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[9.5rem] text-center text-sm font-semibold text-gray-900">{monthLabel(month)}</span>
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={isCurrent}
        className={buttonClass}
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      {!isCurrent && (
        <button type="button" onClick={() => onChange(thisMonth)} className="text-xs font-medium text-blue-600 hover:underline">
          This month
        </button>
      )}
    </div>
  );
}

export function TotalTile({
  label,
  value,
  sub,
  tone = "gray",
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "gray" | "blue" | "amber";
}) {
  const tones = {
    gray: "bg-white border-gray-200",
    blue: "bg-blue-50 border-blue-100",
    amber: "bg-amber-50 border-amber-100",
  };
  return (
    <div className={`rounded-lg border px-4 py-3 ${tones[tone]}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{formatINR(value)}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

export function CategoryBadge({ itemType }: { itemType: string }) {
  const category = categoryOf(itemType);
  return <Badge tone={category === "INVENTORY" ? "blue" : "amber"}>{CATEGORY_LABELS[category]}</Badge>;
}

// A column header that doubles as that column's filter.
export function FilterHeaderSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={`Filter by ${label.toLowerCase()}`}
      className={`-ml-1 rounded border bg-transparent px-1 py-0.5 text-xs font-semibold uppercase tracking-wide focus:outline-none focus:ring-1 focus:ring-blue-500 ${
        value ? "border-blue-300 bg-blue-50 text-blue-700" : "border-transparent text-gray-500 hover:border-gray-300"
      }`}
    >
      <option value="">{label}: All</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
