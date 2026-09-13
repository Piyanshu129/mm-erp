"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";

interface Supplier {
  id: number;
  name: string;
}

interface ItemOption {
  id: number;
  itemCode: string;
  name: string;
  uom: string;
  currentStock: number;
}

interface PurchaseRow {
  id: number;
  purchaseDate: string;
  quantity: number;
  purchaseCost: string;
  supplier: { name: string };
  item: { itemCode: string; name: string; uom: string };
  createdBy: { name: string };
}

const CATEGORIES = ["OEM", "Local", "Imported", "Old/Used"];

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<string>("");

  const [itemMode, setItemMode] = useState<"existing" | "new">("existing");
  const [itemQuery, setItemQuery] = useState("");
  const [itemResults, setItemResults] = useState<ItemOption[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemOption | null>(null);

  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState(CATEGORIES[0]);
  const [newItemUom, setNewItemUom] = useState("PCS");
  const [newItemMinStock, setNewItemMinStock] = useState("");
  const [newItemPhoto, setNewItemPhoto] = useState<File | null>(null);

  const [quantity, setQuantity] = useState("");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [remarks, setRemarks] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadPurchases() {
    setLoading(true);
    const body = await apiFetch("/purchases");
    setPurchases(body.purchases);
    setLoading(false);
  }

  useEffect(() => {
    loadPurchases();
    apiFetch("/suppliers").then((body) => setSuppliers(body.suppliers));
  }, []);

  async function searchItems() {
    if (!itemQuery.trim()) return;
    const body = await apiFetch(`/items?q=${encodeURIComponent(itemQuery)}`);
    setItemResults(body.items);
  }

  function resetForm() {
    setSelectedItem(null);
    setItemQuery("");
    setItemResults([]);
    setNewItemName("");
    setNewItemMinStock("");
    setNewItemPhoto(null);
    setQuantity("");
    setPurchaseCost("");
    setSellingPrice("");
    setRemarks("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!supplierId) {
      setFormError("Select a supplier");
      return;
    }

    setSubmitting(true);
    try {
      let itemId: number;

      if (itemMode === "existing") {
        if (!selectedItem) {
          setFormError("Search and select an existing item");
          setSubmitting(false);
          return;
        }
        itemId = selectedItem.id;
      } else {
        const formData = new FormData();
        formData.set("name", newItemName);
        formData.set("category", newItemCategory);
        formData.set("uom", newItemUom);
        if (purchaseCost) formData.set("purchaseCost", purchaseCost);
        if (sellingPrice) formData.set("sellingPrice", sellingPrice);
        if (newItemMinStock) formData.set("minStock", newItemMinStock);
        if (newItemPhoto) formData.set("photo", newItemPhoto);

        const itemBody = await apiFetch("/items", { method: "POST", body: formData });
        itemId = itemBody.item.id;
      }

      await apiFetch("/purchases", {
        method: "POST",
        body: JSON.stringify({
          supplierId: Number(supplierId),
          itemId,
          quantity: Number(quantity),
          purchaseCost: Number(purchaseCost),
          sellingPrice: sellingPrice ? Number(sellingPrice) : undefined,
          remarks: remarks || undefined,
        }),
      });

      resetForm();
      setShowForm(false);
      await loadPurchases();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not save purchase");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Purchases</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          {showForm ? "Cancel" : "+ New purchase"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="max-w-2xl space-y-4 rounded-md border border-gray-200 p-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Supplier</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Select supplier...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {suppliers.length === 0 && (
              <p className="mt-1 text-xs text-gray-500">
                No suppliers yet — add one on the Suppliers page first.
              </p>
            )}
          </div>

          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={itemMode === "existing"}
                onChange={() => setItemMode("existing")}
              />
              Existing item
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={itemMode === "new"} onChange={() => setItemMode("new")} />
              New item
            </label>
          </div>

          {itemMode === "existing" ? (
            <div>
              <div className="flex gap-2">
                <input
                  placeholder="Search item code, name or part number"
                  value={itemQuery}
                  onChange={(e) => setItemQuery(e.target.value)}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={searchItems}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm"
                >
                  Search
                </button>
              </div>
              {selectedItem ? (
                <p className="mt-2 text-sm">
                  Selected: <strong>{selectedItem.itemCode}</strong> — {selectedItem.name} (current
                  stock: {selectedItem.currentStock} {selectedItem.uom})
                </p>
              ) : (
                itemResults.length > 0 && (
                  <ul className="mt-2 max-h-40 overflow-y-auto rounded-md border border-gray-200 text-sm">
                    {itemResults.map((it) => (
                      <li key={it.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedItem(it);
                            setItemResults([]);
                          }}
                          className="block w-full px-3 py-2 text-left hover:bg-gray-50"
                        >
                          {it.itemCode} — {it.name} (stock: {it.currentStock})
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                placeholder="Item name"
                required
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
              />
              <select
                value={newItemCategory}
                onChange={(e) => setNewItemCategory(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                placeholder="UOM (e.g. PCS)"
                required
                value={newItemUom}
                onChange={(e) => setNewItemUom(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Minimum stock (optional)"
                value={newItemMinStock}
                onChange={(e) => setNewItemMinStock(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setNewItemPhoto(e.target.files?.[0] ?? null)}
                className="text-sm"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              type="number"
              placeholder="Quantity"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Purchase cost (per unit)"
              required
              value={purchaseCost}
              onChange={(e) => setPurchaseCost(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Selling price (optional)"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <input
            placeholder="Remarks (optional)"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />

          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save purchase"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : purchases.length === 0 ? (
        <p className="text-sm text-gray-500">No purchases recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] border-collapse overflow-hidden rounded-md border border-gray-200 text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-3 py-2">Serial No.</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Cost</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} className="border-t border-gray-200">
                  <td className="px-3 py-2 font-mono">#{p.id}</td>
                  <td className="px-3 py-2">{new Date(p.purchaseDate).toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    {p.item.itemCode} — {p.item.name}
                  </td>
                  <td className="px-3 py-2">{p.supplier.name}</td>
                  <td className="px-3 py-2">
                    {p.quantity} {p.item.uom}
                  </td>
                  <td className="px-3 py-2">₹{p.purchaseCost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
