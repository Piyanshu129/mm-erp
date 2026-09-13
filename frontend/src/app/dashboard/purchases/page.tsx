"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, Search, ShoppingCart } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Select, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";

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
      <PageHeader
        title="Purchases"
        description="Every purchase gets an automatic, permanent serial number."
        action={
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4" /> New purchase
          </Button>
        }
      />

      {showForm && (
        <Card className="max-w-2xl">
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Supplier</Label>
                <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Select supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                {suppliers.length === 0 && (
                  <p className="mt-1 text-xs text-gray-500">No suppliers yet — add one on the Suppliers page first.</p>
                )}
              </div>

              <div className="flex gap-4 text-sm text-gray-700">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={itemMode === "existing"} onChange={() => setItemMode("existing")} />
                  Existing item
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={itemMode === "new"} onChange={() => setItemMode("new")} />
                  New item
                </label>
              </div>

              {itemMode === "existing" ? (
                <div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search item code, name or part number"
                      value={itemQuery}
                      onChange={(e) => setItemQuery(e.target.value)}
                      className="flex-1"
                    />
                    <Button type="button" variant="secondary" onClick={searchItems}>
                      <Search className="h-4 w-4" /> Search
                    </Button>
                  </div>
                  {selectedItem ? (
                    <p className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
                      Selected: <strong>{selectedItem.itemCode}</strong> — {selectedItem.name} (stock:{" "}
                      {selectedItem.currentStock} {selectedItem.uom})
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
                  <Input
                    placeholder="Item name"
                    required
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="sm:col-span-2"
                  />
                  <Select value={newItemCategory} onChange={(e) => setNewItemCategory(e.target.value)}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                  <Input placeholder="UOM (e.g. PCS)" required value={newItemUom} onChange={(e) => setNewItemUom(e.target.value)} />
                  <Input
                    type="number"
                    placeholder="Minimum stock (optional)"
                    value={newItemMinStock}
                    onChange={(e) => setNewItemMinStock(e.target.value)}
                  />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setNewItemPhoto(e.target.files?.[0] ?? null)}
                    className="text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input type="number" placeholder="Quantity" required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Purchase cost (per unit)"
                  required
                  value={purchaseCost}
                  onChange={(e) => setPurchaseCost(e.target.value)}
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Selling price (optional)"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                />
              </div>
              <Input placeholder="Remarks (optional)" value={remarks} onChange={(e) => setRemarks(e.target.value)} />

              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save purchase"}
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      {loading ? (
        <TableSkeleton cols={6} />
      ) : purchases.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="No purchases recorded yet" />
      ) : (
        <Table minWidth={650}>
          <thead>
            <tr>
              <Th>Serial No.</Th>
              <Th>Date</Th>
              <Th>Item</Th>
              <Th>Supplier</Th>
              <Th>Qty</Th>
              <Th>Cost</Th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <Tr key={p.id}>
                <Td className="font-mono">#{p.id}</Td>
                <Td>{new Date(p.purchaseDate).toLocaleDateString()}</Td>
                <Td>
                  {p.item.itemCode} — {p.item.name}
                </Td>
                <Td>{p.supplier.name}</Td>
                <Td>
                  {p.quantity} {p.item.uom}
                </Td>
                <Td>₹{p.purchaseCost}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
