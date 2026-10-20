import { Prisma } from "@prisma/client";

// Item stock is a decimal (part of a unit can be used, e.g. 0.5 L of oil).
// Every change goes through these, rounded to 3 decimals in SQL, so repeated
// additions and removals can't drift into values like 9.700000000000001.

// Quantities typed in the app: rounded to 3 decimals before they're used.
export function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export async function addStock(tx: Prisma.TransactionClient, itemId: number, qty: number) {
  await tx.$executeRaw`
    UPDATE items SET current_stock = ROUND((current_stock + ${qty})::numeric, 3)::float8 WHERE id = ${itemId}
  `;
}

// Takes qty out only if that much is there; returns false (and changes
// nothing) otherwise. One conditional UPDATE, so two job cards using the
// last few pieces at the same moment can't take more than there is.
export async function takeStock(tx: Prisma.TransactionClient, itemId: number, qty: number): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: number }[]>`
    UPDATE items SET current_stock = ROUND((current_stock - ${qty})::numeric, 3)::float8
    WHERE id = ${itemId} AND current_stock >= ${qty} - 0.0005
    RETURNING id
  `;
  return rows.length > 0;
}
