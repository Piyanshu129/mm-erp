// Mirrors backend/src/modules/purchases/purchases.service.ts.
export const INVENTORY_TYPES = ["SPARE_PART", "PAINT", "TOOL", "ELECTRICAL", "SETTINGS_ADJUSTMENTS"] as const;
export const EXPENSE_TYPES = ["TRAVEL", "PETROL", "FOOD", "RENT", "BILLS_UTILITIES", "OTHERS"] as const;

export type PurchaseCategory = "INVENTORY" | "EXPENSE";

export const TYPE_LABELS: Record<string, string> = {
  SPARE_PART: "Spare Part",
  PAINT: "Paint",
  TOOL: "Tool",
  ELECTRICAL: "Electrical",
  SETTINGS_ADJUSTMENTS: "Settings & Adjustments",
  TRAVEL: "Travel",
  PETROL: "Petrol",
  FOOD: "Food",
  RENT: "Rent",
  BILLS_UTILITIES: "Bills / Utilities",
  OTHERS: "Others",
};

export const CATEGORY_LABELS: Record<PurchaseCategory, string> = {
  INVENTORY: "Inventory",
  EXPENSE: "Miscellaneous",
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
