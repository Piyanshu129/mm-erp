// [4,5,6,7,10,12,13] → "#4–#7, #10, #12–#13" — the sticker serial numbers
// of a set of pieces, compact enough for a table cell.
export function formatSerialRanges(serials: number[]): string {
  if (serials.length === 0) return "";
  const sorted = [...serials].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const n of sorted.slice(1).concat(Number.NaN)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? `#${start}` : `#${start}–#${prev}`);
    start = n;
    prev = n;
  }
  return parts.join(", ");
}
