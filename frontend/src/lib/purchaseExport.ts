import { apiFetch, assetUrl } from "@/lib/api";
import { downloadExcel } from "@/lib/excel";
import { TYPE_LABELS, categoryOf, CATEGORY_LABELS } from "@/lib/purchaseTypes";

interface Row {
  id: number;
  purchaseDate: string;
  itemType: string;
  quantity: number;
  purchaseCost: string;
  sellingPrice: string | null;
  description: string | null;
  remarks: string | null;
  billUrl: string | null;
  supplier: { name: string } | null;
  item: { itemCode: string; name: string; uom: string; brand?: string | null; specification?: string | null } | null;
  createdBy: { name: string };
}

// Every purchase matching the list's filters (all pages, not just the
// ones loaded on screen) as an Excel workbook.
export async function exportPurchasesToExcel(filters: Record<string, string>, fileName: string) {
  const rows: Row[] = [];
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({ ...filters, page: String(page), pageSize: "100" });
    const body = await apiFetch(`/purchases?${params}`);
    rows.push(...body.purchases);
    if (rows.length >= body.total || body.purchases.length === 0) break;
  }
  await downloadExcel(fileName, [
    {
      name: "Purchases",
      columns: ["Serial No.", "Date", "Category", "Type", "Supplier", "Item Code", "Item / Expense", "Brand", "Specification", "Qty", "UOM", "Rate", "Total", "MRP", "Remarks", "Bill", "Entered By"],
      rows: rows.map((p) => ({
        "Serial No.": p.id,
        Date: new Date(p.purchaseDate).toLocaleDateString(),
        Category: CATEGORY_LABELS[categoryOf(p.itemType)],
        Type: TYPE_LABELS[p.itemType] ?? p.itemType,
        Supplier: p.supplier?.name ?? "",
        "Item Code": p.item?.itemCode ?? "",
        "Item / Expense": p.item?.name ?? p.description ?? "",
        Brand: p.item?.brand ?? "",
        Specification: p.item?.specification ?? "",
        Qty: p.quantity,
        UOM: p.item?.uom ?? "",
        Rate: Number(p.purchaseCost),
        Total: Math.round(p.quantity * Number(p.purchaseCost) * 100) / 100,
        MRP: p.sellingPrice != null ? Number(p.sellingPrice) : "",
        Remarks: p.remarks ?? "",
        Bill: p.billUrl ? assetUrl(p.billUrl) : "",
        "Entered By": p.createdBy.name,
      })),
    },
  ]);
}
