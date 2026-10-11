// Stickers are labelled <item number>.<n>: 10 of item 0001 are 1.1 – 1.10,
// and the next purchase of it carries on at 1.11 (backend lib/itemCode.ts).
export function stickerLabel(itemCode: string, n: number): string {
  return `${Number(itemCode)}.${n}`;
}

// "1.1 – 1.10" (or "1.11" for a single piece) — one purchase's stickers.
export function stickerRange(itemCode: string, from: number | null, to: number | null): string {
  if (from == null || to == null) return "";
  return from === to ? stickerLabel(itemCode, from) : `${stickerLabel(itemCode, from)} – ${stickerLabel(itemCode, to)}`;
}
