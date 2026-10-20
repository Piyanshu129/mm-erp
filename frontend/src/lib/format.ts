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
