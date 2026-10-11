// Item codes are the item's number, zero-padded to 4 digits: 0001, 0002 …
// (more digits once past 9999).
export function formatItemCode(id: number): string {
  return String(id).padStart(4, "0");
}

// What staff type in: "1", "01" or "0001" all mean item 0001.
export function normalizeItemCode(input: string): string | null {
  const digits = input.trim();
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return n > 0 ? formatItemCode(n) : null;
}

// A sticker label: "<item no>.<piece no>" — e.g. the 3rd piece of item 0001
// is "1.3".
export function stickerLabel(itemCode: string, n: number): string {
  return `${Number(itemCode)}.${n}`;
}
