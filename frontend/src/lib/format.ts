// ₹1,23,456.00 — Indian digit grouping, always two decimals.
export function formatINR(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Today's date as YYYY-MM-DD in the user's own timezone — the format an
// <input type="date"> expects for its value.
export function todayISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

// A quantity, which can be part of a unit: 2 → "2", 0.5 → "0.5",
// 1.25 → "1.25" (never float noise like 0.30000000000000004).
export function fmtQty(n: number | string): string {
  return String(Math.round(Number(n) * 1000) / 1000);
}

// "HH:MM" in/out → "8h 45m" worked, or "" unless both are set and out is after in.
export function hoursWorked(inTime: string | null | undefined, outTime: string | null | undefined): string {
  if (!inTime || !outTime) return "";
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const diff = toMin(outTime) - toMin(inTime);
  if (diff <= 0) return "";
  return `${Math.floor(diff / 60)}h ${String(diff % 60).padStart(2, "0")}m`;
}
