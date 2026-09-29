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
