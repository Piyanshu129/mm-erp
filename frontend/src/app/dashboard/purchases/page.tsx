"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, ShoppingCart, Paperclip, Trash2, Printer, Download } from "lucide-react";
import { apiFetch, ApiError, assetUrl } from "@/lib/api";
import { fmtQty, formatINR, todayISO } from "@/lib/format";
import {
  INVENTORY_TYPES,
  EXPENSE_TYPES,
  TYPE_LABELS,
  CATEGORY_LABELS,
  PurchaseCategory,
  PurchaseTotals,
  isInventoryType,
  categoryOf,
  typesIn,
} from "@/lib/purchaseTypes";
import { MonthNav, TotalTile, CategoryBadge, FilterHeaderSelect, currentMonth, monthLabel } from "@/components/PurchaseListControls";
import { compressImage } from "@/lib/compressImage";
import { UOM_OPTIONS } from "@/lib/uom";
import { stickerLabel, stickerRange } from "@/lib/stickers";
import { exportPurchasesToExcel } from "@/lib/purchaseExport";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { MobileInput } from "@/components/ui/MobileInput";
import { Input, Select, Label, Textarea } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface Supplier {
  id: number;
  name: string;
  mobile: string | null;
  isActive: boolean;
}

interface ItemOption {
  id: number;
  itemCode: string;
  name: string;
  uom: string;
  currentStock: number;
  purchaseCost: string;
  sellingPrice: string;
  vehicleMake: string | null;
  vehicleModel: string | null;
  variant: string | null;
  isActive: boolean;
}

// "Maruti Swift VXI" — whichever of the three are filled in.
function carLabel(item: { vehicleMake: string | null; vehicleModel: string | null; variant: string | null }): string {
  return [item.vehicleMake, item.vehicleModel, item.variant].filter(Boolean).join(" ");
}

interface PurchaseRow {
  id: number;
  purchaseDate: string;
  itemType: string;
  quantity: number;
  purchaseCost: string;
  sellingPrice: string | null;
  billUrl: string | null;
  supplier: { name: string } | null;
  item: {
    itemCode: string;
    name: string;
    uom: string;
    vehicleMake: string | null;
    vehicleModel: string | null;
    variant: string | null;
  } | null;
  description: string | null;
  remarks: string | null;
  stickerFrom: number | null;
  stickerTo: number | null;
  createdBy: { name: string };
}

const PAGE_SIZE = 100;

interface SavedPurchase {
  item: { itemCode: string; name: string } | null;
  stickerFrom: number | null;
  stickerTo: number | null;
}

// One purchased item's stickers: <item number>.<from> to .<to>.
interface StickerLine {
  itemCode: string;
  itemName: string;
  labels: string[];
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// One label per physical piece — its sticker number large, with the item under it —
// laid out to print on A4 and cut, or just to copy onto the stickers.
function printStickers(lines: StickerLine[]) {
  const labels = lines
    .flatMap((l) =>
      l.labels.map(
        (s) =>
          `<div class="label"><div class="serial">${s}</div><div class="item">${escapeHtml(l.itemName)}</div><div class="code">${escapeHtml(l.itemCode)}</div></div>`
      )
    )
    .join("");
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>Stickers</title><style>
    body { font-family: system-ui, sans-serif; margin: 12px; }
    .sheet { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .label { border: 1px dashed #999; border-radius: 6px; padding: 10px 6px; text-align: center; break-inside: avoid; }
    .serial { font-size: 28px; font-weight: 700; }
    .item { font-size: 12px; margin-top: 2px; }
    .code { font-size: 10px; color: #666; }
  </style></head><body><div class="sheet">${labels}</div>
  <script>window.onload = () => window.print();<\/script></body></html>`);
  w.document.close();
}

// One item row of the purchase form, before it's sent.
interface LineDraft {
  key: number;
  itemType: string;
  itemMode: "new" | "existing";
  selectedItem: ItemOption | null;
  newItemName: string;
  newItemBrand: string;
  newItemSpec: string;
  newItemCategory: string;
  newItemUom: string;
  newItemMinStock: string;
  newItemMake: string;
  newItemModel: string;
  newItemVariant: string;
  newItemPhoto: File | null;
  description: string;
  quantity: string;
  purchaseCost: string;
  sellingPrice: string;
}

const ITEM_CATEGORIES = ["OEM", "Local", "Imported", "Old/Used"];

const FILE_INPUT_CLASS =
  "block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200";

let nextLineKey = 1;

// What the server accepts for bill and item photos (middleware/upload.ts).
const UPLOADABLE_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

// New item is the default — most purchases bring in parts not yet on file.
function emptyLine(itemType: string): LineDraft {
  return {
    key: nextLineKey++,
    itemType,
    itemMode: "new",
    selectedItem: null,
    newItemName: "",
    newItemBrand: "",
    newItemSpec: "",
    newItemCategory: ITEM_CATEGORIES[0],
    newItemUom: "PCS",
    newItemMinStock: "",
    newItemMake: "",
    newItemModel: "",
    newItemVariant: "",
    newItemPhoto: null,
    description: "",
    quantity: "1",
    purchaseCost: "",
    sellingPrice: "",
  };
}

function lineTotal(line: LineDraft): number {
  const cost = Number(line.purchaseCost) || 0;
  return isInventoryType(line.itemType) ? cost * (Number(line.quantity) || 0) : cost;
}

// Best match first: exact name, then name starts with the query, then a word
// in the name starts with it, then anything else the server matched.
function rankByName<T extends { name: string }>(rows: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  const score = (r: T) => {
    const name = r.name.toLowerCase();
    if (name === q) return 0;
    if (name.startsWith(q)) return 1;
    if (name.split(/\s+/).some((word) => word.startsWith(q))) return 2;
    return 3;
  };
  return [...rows].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
}

// Labelled form field — the label sits above the box as its heading.
function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

// Type-to-search for an existing item on one line — searches the server as
// the user types, same as the supplier box.
function ExistingItemPicker({ line, onSelect, onClear }: { line: LineDraft; onSelect: (item: ItemOption) => void; onClear: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ItemOption[]>([]);
  const [searchedFor, setSearchedFor] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (line.selectedItem || !q) {
      setResults([]);
      setSearchedFor(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const body = await apiFetch(`/items?q=${encodeURIComponent(q)}&pageSize=20`);
        if (cancelled) return;
        const active = (body.items as ItemOption[]).filter((i) => i.isActive);
        setResults(rankByName(active, q).slice(0, 8));
        setSearchedFor(q);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, line.selectedItem]);

  if (line.selectedItem) {
    const it = line.selectedItem;
    return (
      <div className="flex items-center justify-between gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
        <span className="min-w-0 truncate">
          <strong>{it.itemCode}</strong> — {it.name} (stock: {it.currentStock} {it.uom})
        </span>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            onClear();
          }}
          className="flex-shrink-0 text-xs font-medium text-blue-700 hover:underline"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        placeholder="Type item code, name or part number"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (results.length > 0) onSelect(results[0]);
          }
        }}
        autoComplete="off"
      />
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-gray-200 bg-white text-sm shadow-lg">
          {results.map((it) => (
            <li key={it.id}>
              <button type="button" onClick={() => onSelect(it)} className="block w-full px-3 py-2 text-left hover:bg-gray-50">
                <span className="font-medium text-gray-900">{it.itemCode}</span> — {it.name}
                {carLabel(it) && <span className="text-gray-500"> · {carLabel(it)}</span>}
                <span className="text-gray-500"> (stock: {it.currentStock})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searchedFor !== null && searchedFor === query.trim() && results.length === 0 && (
        <p className="mt-1 text-xs text-gray-500">No item matches &ldquo;{searchedFor}&rdquo; — switch to New item to add it.</p>
      )}
    </div>
  );
}

function LineEditor({
  index,
  line,
  category,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  line: LineDraft;
  category: PurchaseCategory;
  canRemove: boolean;
  onChange: (patch: Partial<LineDraft>) => void;
  onRemove: () => void;
}) {
  const inventory = isInventoryType(line.itemType);

  return (
    <div className="space-y-3 rounded-md border border-gray-200 p-3 sm:p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">
          {inventory ? "Item" : "Expense"} {index + 1}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">Line total: {formatINR(lineTotal(line))}</span>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
              aria-label={`Remove item ${index + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          )}
        </div>
      </div>

      <Field label={inventory ? "Item type" : "Expense type"}>
        <Select value={line.itemType} onChange={(e) => onChange({ itemType: e.target.value })}>
          {typesIn(category).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </Field>

      {inventory ? (
        <>
          <div className="flex gap-4 text-sm text-gray-700">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={line.itemMode === "new"} onChange={() => onChange({ itemMode: "new" })} />
              New item
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={line.itemMode === "existing"} onChange={() => onChange({ itemMode: "existing" })} />
              Existing item
            </label>
          </div>

          {line.itemMode === "existing" ? (
            <Field label="Item">
              <ExistingItemPicker
                line={line}
                onSelect={(item) =>
                  onChange({
                    selectedItem: item,
                    // Start from the item's last known prices; still editable.
                    purchaseCost: line.purchaseCost || (Number(item.purchaseCost) > 0 ? String(Number(item.purchaseCost)) : ""),
                    sellingPrice: line.sellingPrice || (Number(item.sellingPrice) > 0 ? String(Number(item.sellingPrice)) : ""),
                  })
                }
                onClear={() => onChange({ selectedItem: null })}
              />
            </Field>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Item name" className="sm:col-span-2">
                <Input value={line.newItemName} onChange={(e) => onChange({ newItemName: e.target.value })} />
              </Field>
              <Field label="Brand name (optional)" hint="e.g. Bosch, Castrol">
                <Input value={line.newItemBrand} onChange={(e) => onChange({ newItemBrand: e.target.value })} />
              </Field>
              <Field label="Specification (optional)" hint="e.g. 5W-30, 12V 35Ah, 1 L">
                <Input value={line.newItemSpec} onChange={(e) => onChange({ newItemSpec: e.target.value })} />
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-3">
                <Field label="Car maker (optional)" hint="e.g. Maruti">
                  <Input value={line.newItemMake} onChange={(e) => onChange({ newItemMake: e.target.value })} />
                </Field>
                <Field label="Car model (optional)" hint="e.g. Swift">
                  <Input value={line.newItemModel} onChange={(e) => onChange({ newItemModel: e.target.value })} />
                </Field>
                <Field label="Variant (optional)" hint="e.g. VXI">
                  <Input value={line.newItemVariant} onChange={(e) => onChange({ newItemVariant: e.target.value })} />
                </Field>
              </div>
              <Field label="Category">
                <Select value={line.newItemCategory} onChange={(e) => onChange({ newItemCategory: e.target.value })}>
                  {ITEM_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Unit of measure">
                <Select value={line.newItemUom} onChange={(e) => onChange({ newItemUom: e.target.value })}>
                  {UOM_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Minimum stock (optional)">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={line.newItemMinStock}
                  onChange={(e) => onChange({ newItemMinStock: e.target.value })}
                />
              </Field>
              <Field label="Item photo" hint="Required — take a photo of the part">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onChange({ newItemPhoto: e.target.files?.[0] ?? null })}
                  className={FILE_INPUT_CLASS}
                />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Quantity">
              <Input type="number" min={0.01} step="0.01" value={line.quantity} onChange={(e) => onChange({ quantity: e.target.value })} />
            </Field>
            <Field label="Purchase cost (per unit)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={line.purchaseCost}
                onChange={(e) => onChange({ purchaseCost: e.target.value })}
              />
            </Field>
            <Field label="MRP (optional)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={line.sellingPrice}
                onChange={(e) => onChange({ sellingPrice: e.target.value })}
              />
            </Field>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Description" hint="e.g. Fuel for pickup van, tollway pass" className="sm:col-span-2">
            <Textarea rows={2} value={line.description} onChange={(e) => onChange({ description: e.target.value })} />
          </Field>
          <Field label="Total cost">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={line.purchaseCost}
              onChange={(e) => onChange({ purchaseCost: e.target.value })}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

// Returns the first problem with a line, or null — checked before anything
// is sent so the user sees exactly which item to fix.
function lineProblem(line: LineDraft): string | null {
  if (line.purchaseCost === "" || Number(line.purchaseCost) < 0) return "enter the purchase cost";
  if (isInventoryType(line.itemType)) {
    if (line.itemMode === "existing" && !line.selectedItem) return "search and select an existing item";
    if (line.itemMode === "new") {
      if (!line.newItemName.trim()) return "enter the item name";
      if (!line.newItemUom.trim()) return "choose the unit of measure";
      if (!line.newItemPhoto) return "take a photo of the new item";
    }
    if (!(Number(line.quantity) > 0)) return "quantity must be more than 0 (e.g. 1, 2.5)";
    if (line.sellingPrice !== "" && Number(line.sellingPrice) < Number(line.purchaseCost)) {
      return "MRP cannot be lower than purchase cost";
    }
  } else if (!line.description.trim()) {
    return "enter a description";
  }
  return null;
}

function PurchasesPageContent() {
  const searchParams = useSearchParams();
  // ?new=<type> opens the form ready for that type — the Expenses page's
  // "New expense" button links here with an expense type.
  const prefillType = searchParams.get("new");
  const initialType = prefillType && TYPE_LABELS[prefillType] ? prefillType : "SPARE_PART";

  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [listPage, setListPage] = useState(1);
  const [summary, setSummary] = useState<PurchaseTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showForm, setShowForm] = useState(prefillType != null);

  const [month, setMonth] = useState(currentMonth());
  const [categoryFilter, setCategoryFilter] = useState<"" | PurchaseCategory>("");
  const [typeFilter, setTypeFilter] = useState("");

  // Asked first — it decides whether a supplier is needed at all.
  const [purchaseType, setPurchaseType] = useState(initialType);
  const category = categoryOf(purchaseType);

  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierResults, setSupplierResults] = useState<Supplier[]>([]);
  const [supplierSearchedFor, setSupplierSearchedFor] = useState<string | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [newSupplierMobile, setNewSupplierMobile] = useState("");
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);

  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [lines, setLines] = useState<LineDraft[]>(() => [emptyLine(initialType)]);
  const [remarks, setRemarks] = useState("");
  const [bill, setBill] = useState<File | null>(null);
  // Bumped after a save to clear the file inputs, which can't be reset by value.
  const [fileInputsKey, setFileInputsKey] = useState(0);

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<false | "photos" | "saving">(false);
  // After an inventory purchase is saved: the sticker numbers to write on
  // each piece's sticker.
  const [stickerList, setStickerList] = useState<StickerLine[] | null>(null);

  // The month's purchases as filtered (all of them, not just the loaded
  // page) as an Excel file.
  const [exporting, setExporting] = useState(false);
  async function exportExcel() {
    setExporting(true);
    try {
      const filters: Record<string, string> = { month };
      if (typeFilter) filters.itemType = typeFilter;
      else if (categoryFilter) filters.category = categoryFilter;
      await exportPurchasesToExcel(filters, `purchases-${month}`);
    } catch {
      setFormError("Could not create the Excel file — please try again");
    } finally {
      setExporting(false);
    }
  }

  function listQuery(page: number): string {
    const params = new URLSearchParams({ month, page: String(page), pageSize: String(PAGE_SIZE) });
    if (typeFilter) params.set("itemType", typeFilter);
    else if (categoryFilter) params.set("category", categoryFilter);
    return `/purchases?${params}`;
  }

  async function loadPurchases() {
    setLoading(true);
    const body = await apiFetch(listQuery(1));
    setPurchases(body.purchases);
    setListTotal(body.total);
    setListPage(1);
    setSummary(body.summary);
    setLoading(false);
  }

  async function loadMore() {
    setLoadingMore(true);
    const body = await apiFetch(listQuery(listPage + 1));
    setPurchases((prev) => [...prev, ...body.purchases]);
    setListPage((p) => p + 1);
    setLoadingMore(false);
  }

  useEffect(() => {
    loadPurchases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, categoryFilter, typeFilter]);

  // Changing the purchase type within the same group (e.g. Spare Part →
  // Paint) keeps the items entered so far and retypes them; switching
  // between inventory and expense starts the items over, since the fields
  // are completely different.
  function changePurchaseType(next: string) {
    if (categoryOf(next) === category) {
      setLines((prev) => prev.map((l) => ({ ...l, itemType: next })));
    } else {
      setLines([emptyLine(next)]);
      setFormError(null);
    }
    setPurchaseType(next);
  }

  // Search as the user types (debounced), server-side so every supplier is
  // searchable — not just the first page of the list.
  useEffect(() => {
    const q = supplierQuery.trim();
    if (selectedSupplier || !q) {
      setSupplierResults([]);
      setSupplierSearchedFor(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const body = await apiFetch(`/suppliers?q=${encodeURIComponent(q)}&pageSize=20`);
        if (cancelled) return;
        const active = (body.suppliers as Supplier[]).filter((s) => s.isActive);
        setSupplierResults(rankByName(active, q).slice(0, 8));
        setSupplierSearchedFor(q);
      } catch (err) {
        if (!cancelled) setSupplierError(err instanceof ApiError ? err.message : "Could not search suppliers");
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [supplierQuery, selectedSupplier]);

  function selectSupplier(s: Supplier) {
    setSelectedSupplier(s);
    setSupplierQuery(s.name);
    setSupplierError(null);
  }

  function clearSupplier() {
    setSelectedSupplier(null);
    setSupplierQuery("");
    setNewSupplierMobile("");
  }

  async function addSupplier() {
    const name = supplierQuery.trim();
    if (!name) return;
    if (newSupplierMobile && newSupplierMobile.length !== 10) {
      setSupplierError("Mobile number must be 10 digits");
      return;
    }
    setSupplierError(null);
    setAddingSupplier(true);
    try {
      const body = await apiFetch("/suppliers", {
        method: "POST",
        body: JSON.stringify({ name, mobile: newSupplierMobile.trim() || undefined }),
      });
      selectSupplier(body.supplier);
      setNewSupplierMobile("");
    } catch (err) {
      setSupplierError(err instanceof ApiError ? err.message : "Could not add supplier");
    } finally {
      setAddingSupplier(false);
    }
  }

  function updateLine(key: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: number) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  // The type, supplier and date are kept after a save, so several bills from
  // the same supplier can be entered one after another.
  function resetEntry() {
    setLines([emptyLine(purchaseType)]);
    setRemarks("");
    setBill(null);
    setFileInputsKey((k) => k + 1);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const inventory = category === "INVENTORY";
    if (inventory && !selectedSupplier) {
      setFormError("Search and select a supplier, or add a new one");
      return;
    }
    for (const [i, line] of lines.entries()) {
      const problem = lineProblem(line);
      if (problem) {
        setFormError(`${inventory ? "Item" : "Expense"} ${i + 1}: ${problem}`);
        return;
      }
    }

    // The bill photo is required for parts/paint/tools; for a miscellaneous
    // expense there's often no slip, so it's optional.
    if (inventory && !bill) {
      setFormError("Take a photo of the bill / receipt");
      return;
    }

    // Shrink the photos first — full-size phone photos made saving crawl.
    setSubmitting("photos");
    let compressedBill: File | null = null;
    const compressedItemPhotos = new Map<number, File>();
    try {
      if (bill) compressedBill = await compressImage(bill);
      for (const [i, line] of lines.entries()) {
        if (isInventoryType(line.itemType) && line.itemMode === "new" && line.newItemPhoto) {
          compressedItemPhotos.set(i, await compressImage(line.newItemPhoto));
        }
      }
    } catch {
      setSubmitting(false);
      setFormError("Could not prepare the photos — please try again");
      return;
    }

    // The server takes JPEG/PNG/WEBP photos of up to 5 MB. Check here so the
    // message names the photo to retake, rather than failing the whole save.
    const photoProblem = (file: File, what: string): string | null => {
      if (!UPLOADABLE_PHOTO_TYPES.includes(file.type)) {
        return `${what}: this photo format can't be uploaded — use a JPEG, PNG or WEBP photo (e.g. take it again with the camera)`;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        return `${what}: the photo is too large (${(file.size / 1024 / 1024).toFixed(1)} MB, limit 5 MB) — take it again at a lower resolution`;
      }
      return null;
    };
    const problems = [
      compressedBill ? photoProblem(compressedBill, "Bill photo") : null,
      ...[...compressedItemPhotos].map(([i, photo]) => photoProblem(photo, `Item ${i + 1}`)),
    ].filter((p): p is string => p != null);
    if (problems.length > 0) {
      setSubmitting(false);
      setFormError(problems[0]);
      return;
    }

    const formData = new FormData();
    // Expenses aren't bought on a supplier's account, so none is sent.
    if (inventory && selectedSupplier) formData.set("supplierId", String(selectedSupplier.id));
    formData.set("purchaseDate", purchaseDate);
    if (remarks.trim()) formData.set("remarks", remarks.trim());
    if (compressedBill) formData.set("bill", compressedBill);

    const payload = lines.map((line, i) => {
      const cost = Number(line.purchaseCost);
      if (!isInventoryType(line.itemType)) {
        return { itemType: line.itemType, description: line.description.trim(), quantity: 1, purchaseCost: cost };
      }
      const photo = compressedItemPhotos.get(i);
      if (photo) formData.set(`itemPhoto_${i}`, photo);
      return {
        itemType: line.itemType,
        ...(line.itemMode === "existing"
          ? { itemId: line.selectedItem!.id }
          : {
              newItem: {
                name: line.newItemName.trim(),
                ...(line.newItemBrand.trim() ? { brand: line.newItemBrand.trim() } : {}),
                ...(line.newItemSpec.trim() ? { specification: line.newItemSpec.trim() } : {}),
                category: line.newItemCategory,
                uom: line.newItemUom.trim(),
                ...(line.newItemMinStock ? { minStock: Number(line.newItemMinStock) } : {}),
                ...(line.newItemMake.trim() ? { vehicleMake: line.newItemMake.trim() } : {}),
                ...(line.newItemModel.trim() ? { vehicleModel: line.newItemModel.trim() } : {}),
                ...(line.newItemVariant.trim() ? { variant: line.newItemVariant.trim() } : {}),
              },
            }),
        quantity: Number(line.quantity),
        purchaseCost: cost,
        ...(line.sellingPrice !== "" ? { sellingPrice: Number(line.sellingPrice) } : {}),
      };
    });
    formData.set("lines", JSON.stringify(payload));

    setSubmitting("saving");
    try {
      const body = await apiFetch("/purchases", { method: "POST", body: formData });
      const saved = body.purchases as SavedPurchase[];
      const stickers = saved
        .filter((p) => p.item && p.stickerFrom != null && p.stickerTo != null)
        .map((p) => {
          const labels: string[] = [];
          for (let n = p.stickerFrom!; n <= p.stickerTo!; n++) labels.push(stickerLabel(p.item!.itemCode, n));
          return { itemCode: p.item!.itemCode, itemName: p.item!.name, labels };
        });
      setStickerList(stickers.length > 0 ? stickers : null);
      resetEntry();
      setShowForm(false);
      await loadPurchases();
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? `Not saved — ${err.message}`
          : "Not saved — couldn't reach the server. Check the internet connection and that the servers are running, then try again. Nothing was saved, so you can simply retry."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const grandTotal = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const noun = category === "INVENTORY" ? "item" : "expense";
  const nounPlural = category === "INVENTORY" ? "items" : "expenses";

  // Total of the rows the filters currently select, for the whole month —
  // from the server's per-type totals, so it covers rows not loaded yet.
  const filteredTotal = summary
    ? Object.entries(summary.byType)
        .filter(([t]) => (typeFilter ? t === typeFilter : categoryFilter ? categoryOf(t) === categoryFilter : true))
        .reduce((sum, [, v]) => sum + v.total, 0)
    : 0;
  const typeFilterOptions = (categoryFilter ? typesIn(categoryFilter) : [...INVENTORY_TYPES, ...EXPENSE_TYPES]).map((t) => ({
    value: t,
    label: TYPE_LABELS[t],
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchases"
        description="Spare parts, paint and tools add to the item's stock, with a sticker for each piece. Travel, petrol, food and other costs are recorded as plain expenses. Payments to suppliers are recorded on the Suppliers page."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportExcel} disabled={exporting}>
              <Download className="h-4 w-4" /> {exporting ? "Preparing..." : "Export Excel"}
            </Button>
            <Button onClick={() => setShowForm((s) => !s)}>
              <Plus className="h-4 w-4" /> New purchase
            </Button>
          </div>
        }
      />

      {stickerList && (
        <Card className="max-w-3xl border-green-200">
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-base font-semibold text-gray-900">Purchase saved — write these numbers on the stickers</p>
                <p className="text-sm text-gray-600">
                  One sticker per piece: item number, then the piece number. On a job card, enter the item code and the quantity used.
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => printStickers(stickerList)}>
                  <Printer className="h-4 w-4" /> Print stickers
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setStickerList(null)}>
                  Done
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              {stickerList.map((l) => (
                <div key={l.itemCode + l.labels[0]} className="rounded-md bg-green-50 px-3 py-2">
                  <p className="text-sm font-medium text-gray-900">
                    {l.itemName} <span className="font-normal text-gray-500">({l.itemCode})</span>
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {l.labels.map((s) => (
                      <span key={s} className="rounded border border-green-300 bg-white px-2 py-0.5 font-mono text-base font-semibold text-gray-900">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {showForm && (
        <Card className="max-w-3xl">
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label="Purchase type"
                  hint={
                    category === "INVENTORY"
                      ? "Spare parts, paint and tools from a supplier — each piece gets a sticker."
                      : "Travel, petrol, food and other costs — no supplier and no stock."
                  }
                >
                  <Select
                    value={category}
                    onChange={(e) =>
                      changePurchaseType(e.target.value === "INVENTORY" ? INVENTORY_TYPES[0] : EXPENSE_TYPES[0])
                    }
                  >
                    <option value="INVENTORY">{CATEGORY_LABELS.INVENTORY}</option>
                    <option value="EXPENSE">{CATEGORY_LABELS.EXPENSE}</option>
                  </Select>
                </Field>
                <Field label={category === "INVENTORY" ? "Purchase date" : "Expense date"}>
                  <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
                </Field>
              </div>

              {category === "INVENTORY" && (
                <div className="relative sm:w-1/2 sm:pr-1.5">
                  <Label>Supplier</Label>
                  {selectedSupplier ? (
                    <div className="flex items-center justify-between gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
                      <span className="min-w-0 truncate">
                        <strong>{selectedSupplier.name}</strong>
                        {selectedSupplier.mobile && ` — ${selectedSupplier.mobile}`}
                      </span>
                      <button
                        type="button"
                        onClick={clearSupplier}
                        className="flex-shrink-0 text-xs font-medium text-blue-700 hover:underline"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <>
                      <Input
                        placeholder="Type supplier name or mobile"
                        value={supplierQuery}
                        onChange={(e) => {
                          setSupplierQuery(e.target.value);
                          setSupplierError(null);
                        }}
                        onKeyDown={(e) => {
                          // Don't let Enter submit the whole purchase form —
                          // pick the best match instead.
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (supplierResults.length > 0) selectSupplier(supplierResults[0]);
                          }
                        }}
                        autoComplete="off"
                      />

                      {supplierResults.length > 0 && (
                        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-gray-200 bg-white text-sm shadow-lg">
                          {supplierResults.map((s) => (
                            <li key={s.id}>
                              <button
                                type="button"
                                onClick={() => selectSupplier(s)}
                                className="block w-full px-3 py-2 text-left hover:bg-gray-50"
                              >
                                <span className="font-medium text-gray-900">{s.name}</span>
                                {s.mobile && <span className="text-gray-500"> — {s.mobile}</span>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      {supplierSearchedFor !== null &&
                        supplierSearchedFor === supplierQuery.trim() &&
                        supplierResults.length === 0 && (
                          <div className="mt-2 space-y-2 rounded-md border border-dashed border-gray-300 p-3">
                            <p className="text-xs text-gray-600">
                              No supplier matches &ldquo;{supplierSearchedFor}&rdquo;.
                            </p>
                            <Field label="Mobile (optional)">
                              <MobileInput
                                value={newSupplierMobile}
                                onChange={setNewSupplierMobile}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addSupplier();
                                  }
                                }}
                              />
                            </Field>
                            <Button type="button" size="sm" onClick={addSupplier} disabled={addingSupplier}>
                              <Plus className="h-4 w-4" />
                              {addingSupplier ? "Adding..." : `Add "${supplierSearchedFor}" as supplier`}
                            </Button>
                          </div>
                        )}
                    </>
                  )}
                  {supplierError && <p className="mt-1 text-xs text-red-600">{supplierError}</p>}
                </div>
              )}

              <div className="space-y-3" key={fileInputsKey}>
                {lines.map((line, i) => (
                  <LineEditor
                    key={line.key}
                    index={i}
                    line={line}
                    category={category}
                    canRemove={lines.length > 1}
                    onChange={(patch) => updateLine(line.key, patch)}
                    onRemove={() => removeLine(line.key)}
                  />
                ))}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setLines((prev) => [...prev, emptyLine(purchaseType)])}
                  >
                    <Plus className="h-4 w-4" /> Add another {noun}
                  </Button>
                  <p className="text-sm font-semibold text-gray-900">
                    {lines.length} {lines.length === 1 ? noun : nounPlural} · Total {formatINR(grandTotal)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={category === "INVENTORY" ? "Bill / receipt photo" : "Slip / receipt photo"} hint={category === "INVENTORY" ? "Required" : "Optional"}>
                  <input
                    key={fileInputsKey}
                    type="file"
                    accept="image/*"
                    onChange={(e) => setBill(e.target.files?.[0] ?? null)}
                    className={FILE_INPUT_CLASS}
                  />
                </Field>
                <Field label="Remarks (optional)">
                  <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                </Field>
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <Button type="submit" disabled={submitting !== false}>
                {submitting === "photos"
                  ? "Preparing photos..."
                  : submitting === "saving"
                    ? "Uploading and saving..."
                    : `Save ${category === "INVENTORY" ? "purchase" : "expense"} (${lines.length} ${lines.length === 1 ? noun : nounPlural})`}
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={month} onChange={setMonth} />
        {(categoryFilter || typeFilter) && (
          <button
            type="button"
            onClick={() => {
              setCategoryFilter("");
              setTypeFilter("");
            }}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {summary && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TotalTile label={`Total purchases — ${monthLabel(month)}`} value={summary.total} />
          <TotalTile
            label="Inventory (parts, paint, tools)"
            value={summary.inventoryTotal}
            tone="blue"
            sub={INVENTORY_TYPES.filter((t) => summary.byType[t])
              .map((t) => `${TYPE_LABELS[t]} ${formatINR(summary.byType[t].total)}`)
              .join(" · ")}
          />
          <TotalTile
            label="Miscellaneous (travel, petrol, food...)"
            value={summary.expenseTotal}
            tone="amber"
            sub={EXPENSE_TYPES.filter((t) => summary.byType[t])
              .map((t) => `${TYPE_LABELS[t]} ${formatINR(summary.byType[t].total)}`)
              .join(" · ")}
          />
        </div>
      )}

      {loading ? (
        <TableSkeleton cols={11} />
      ) : (
        <Table minWidth={1000}>
          <thead>
            <tr>
              <Th>Purchase #</Th>
              <Th>Date</Th>
              <Th>
                <FilterHeaderSelect
                  label="Category"
                  value={categoryFilter}
                  onChange={(v) => {
                    setCategoryFilter(v as "" | PurchaseCategory);
                    // A type from the other category would match nothing.
                    if (v && typeFilter && categoryOf(typeFilter) !== v) setTypeFilter("");
                  }}
                  options={[
                    { value: "INVENTORY", label: CATEGORY_LABELS.INVENTORY },
                    { value: "EXPENSE", label: CATEGORY_LABELS.EXPENSE },
                  ]}
                />
              </Th>
              <Th>
                <FilterHeaderSelect label="Type" value={typeFilter} onChange={setTypeFilter} options={typeFilterOptions} />
              </Th>
              <Th>Item / Expense</Th>
              <Th>Supplier</Th>
              <Th className="text-right">Qty</Th>
              <Th>Stickers</Th>
              <Th className="text-right">Rate</Th>
              <Th className="text-right">MRP</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-10">
                  <EmptyState
                    icon={ShoppingCart}
                    title={categoryFilter || typeFilter ? "No purchases match these filters" : "No purchases this month"}
                  />
                </td>
              </tr>
            )}
            {purchases.map((p) => (
              <Tr key={p.id}>
                <Td className="font-mono">#{p.id}</Td>
                <Td className="whitespace-nowrap">{new Date(p.purchaseDate).toLocaleDateString()}</Td>
                <Td>
                  <CategoryBadge itemType={p.itemType} />
                </Td>
                <Td>{TYPE_LABELS[p.itemType] ?? p.itemType}</Td>
                <Td>
                  {p.item ? (
                    <>
                      {p.item.itemCode} — {p.item.name}
                      {carLabel(p.item) && <span className="block text-xs text-gray-500">For: {carLabel(p.item)}</span>}
                    </>
                  ) : (
                    p.description
                  )}
                  {p.billUrl && (
                    <a
                      href={assetUrl(p.billUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 inline-flex items-center gap-0.5 text-xs text-blue-600 hover:underline"
                    >
                      <Paperclip className="h-3 w-3" /> Bill
                    </a>
                  )}
                </Td>
                <Td>{p.supplier?.name ?? "-"}</Td>
                <Td className="text-right">
                  {fmtQty(p.quantity)} {p.item?.uom ?? ""}
                </Td>
                <Td className="font-mono text-xs text-gray-700">{p.item ? stickerRange(p.item.itemCode, p.stickerFrom, p.stickerTo) || "-" : "-"}</Td>
                <Td className="text-right">{formatINR(p.purchaseCost)}</Td>
                <Td className="text-right">{p.sellingPrice != null ? formatINR(p.sellingPrice) : "-"}</Td>
                <Td className="text-right font-medium text-gray-900">{formatINR(p.quantity * Number(p.purchaseCost))}</Td>
              </Tr>
            ))}
          </tbody>
          {purchases.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50">
                <td colSpan={10} className="border-t border-gray-200 px-4 py-2.5 text-right text-sm font-medium text-gray-700">
                  {typeFilter
                    ? `${TYPE_LABELS[typeFilter]} total`
                    : categoryFilter
                      ? `${CATEGORY_LABELS[categoryFilter]} total`
                      : "Month total"}{" "}
                  ({listTotal} {listTotal === 1 ? "entry" : "entries"})
                </td>
                <td className="border-t border-gray-200 px-4 py-2.5 text-right text-sm font-semibold text-gray-900">
                  {formatINR(filteredTotal)}
                </td>
              </tr>
            </tfoot>
          )}
        </Table>
      )}

      {!loading && purchases.length < listTotal && (
        <div className="flex justify-center">
          <Button type="button" variant="secondary" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading..." : `Show more (${purchases.length} of ${listTotal})`}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function PurchasesPage() {
  return (
    <RequireAuth permission="PURCHASES">
      <Suspense fallback={<p className="text-sm text-gray-500">Loading...</p>}>
        <PurchasesPageContent />
      </Suspense>
    </RequireAuth>
  );
}
