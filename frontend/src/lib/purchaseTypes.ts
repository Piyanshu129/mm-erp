// Mirrors backend/src/modules/purchases/purchases.service.ts.
export const INVENTORY_TYPES = ["SPARE_PART", "PAINT", "TOOL"] as const;
export const EXPENSE_TYPES = ["TRAVEL", "PETROL", "FOOD", "OTHERS"] as const;

export type PurchaseCategory = "INVENTORY" | "EXPENSE";

export const TYPE_LABELS: Record<string, string> = {
  SPARE_PART: "Spare Part",
  PAINT: "Paint",
  TOOL: "Tool",
  TRAVEL: "Travel",
  PETROL: "Petrol",
  FOOD: "Food",
  OTHERS: "Others",
};

export const CATEGORY_LABELS: Record<PurchaseCategory, string> = {
  INVENTORY: "Inventory",
  EXPENSE: "Expense",
};

export function isInventoryType(t: string): boolean {
  return (INVENTORY_TYPES as readonly string[]).includes(t);
}

export function categoryOf(t: string): PurchaseCategory {
  return isInventoryType(t) ? "INVENTORY" : "EXPENSE";
}

export function typesIn(category: PurchaseCategory): readonly string[] {
  return category === "INVENTORY" ? INVENTORY_TYPES : EXPENSE_TYPES;
}

export interface PurchaseTotals {
  byType: Record<string, { count: number; total: number }>;
  inventoryTotal: number;
  expenseTotal: number;
  total: number;
}
