"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useEffect, useState } from "react";
import { Plus, Search, ShoppingCart, Paperclip, IndianRupee } from "lucide-react";
import { apiFetch, ApiError, assetUrl } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Select, Label, Textarea } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { PaymentStatusBadge } from "@/components/ui/Badge";

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
  itemType: string;
  quantity: number;
  purchaseCost: string;
  billUrl: string | null;
  paymentAmount: string;
  supplier: { name: string };
  item: { itemCode: string; name: string; uom: string } | null;
  description: string | null;
  createdBy: { name: string };
}

const CATEGORIES = ["OEM", "Local", "Imported", "Old/Used"];

const INVENTORY_TYPES = ["SPARE_PART", "PAINT", "TOOL"] as const;
const EXPENSE_TYPES = ["TRAVEL", "PETROL", "FOOD", "OTHERS"] as const;
const ALL_TYPES = [...INVENTORY_TYPES, ...EXPENSE_TYPES];

const TYPE_LABELS: Record<string, string> = {
  SPARE_PART: "Spare Part",
  PAINT: "Paint",
  TOOL: "Tool",
  TRAVEL: "Travel",
  PETROL: "Petrol",
  FOOD: "Food",
  OTHERS: "Others",
};

const PAYMENT_MODES = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"];

function isInventoryType(t: string) {
  return (INVENTORY_TYPES as readonly string[]).includes(t);
}

function PurchasesPageContent() {
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<string>("");
  const [itemType, setItemType] = useState<string>("SPARE_PART");

  const [itemMode, setItemMode] = useState<"existing" | "new">("existing");
  const [itemQuery, setItemQuery] = useState("");
  const [itemResults, setItemResults] = useState<ItemOption[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemOption | null>(null);

  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState(CATEGORIES[0]);
  const [newItemUom, setNewItemUom] = useState("PCS");
  const [newItemMinStock, setNewItemMinStock] = useState("");
  const [newItemPhoto, setNewItemPhoto] = useState<File | null>(null);

  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [remarks, setRemarks] = useState("");
  const [bill, setBill] = useState<File | null>(null);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentBy, setPaymentBy] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [payingPurchase, setPayingPurchase] = useState<PurchaseRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("");
  const [payRef, setPayRef] = useState("");
  const [payBy, setPayBy] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [paySubmitting, setPaySubmitting] = useState(false);

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
    setDescription("");
    setQuantity("1");
    setPurchaseCost("");
    setSellingPrice("");
    setRemarks("");
    setBill(null);
    setPaymentAmount("");
    setPaymentMode("");
    setPaymentReference("");
    setPaymentBy("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!supplierId) {
      setFormError("Select a supplier");
      return;
    }

    const inventory = isInventoryType(itemType);

    setSubmitting(true);
    try {
      let itemId: number | undefined;

      if (inventory) {
        if (itemMode === "existing") {
          if (!selectedItem) {
            setFormError("Search and select an existing item");
            setSubmitting(false);
            return;
          }
          itemId = selectedItem.id;
        } else {
          const itemFormData = new FormData();
          itemFormData.set("name", newItemName);
          itemFormData.set("category", newItemCategory);
          itemFormData.set("uom", newItemUom);
          if (purchaseCost) itemFormData.set("purchaseCost", purchaseCost);
          if (sellingPrice) itemFormData.set("sellingPrice", sellingPrice);
          if (newItemMinStock) itemFormData.set("minStock", newItemMinStock);
          if (newItemPhoto) itemFormData.set("photo", newItemPhoto);

          const itemBody = await apiFetch("/items", { method: "POST", body: itemFormData });
          itemId = itemBody.item.id;
        }
      } else if (!description.trim()) {
        setFormError("Enter a description for this expense");
        setSubmitting(false);
        return;
      }

      const formData = new FormData();
      formData.set("supplierId", supplierId);
      formData.set("itemType", itemType);
      if (itemId != null) formData.set("itemId", String(itemId));
      if (!inventory) formData.set("description", description);
      formData.set("quantity", inventory ? quantity : "1");
      formData.set("purchaseCost", purchaseCost);
      if (inventory && sellingPrice) formData.set("sellingPrice", sellingPrice);
      if (bill) formData.set("bill", bill);
      if (paymentAmount) formData.set("paymentAmount", paymentAmount);
      if (paymentMode) formData.set("paymentMode", paymentMode);
      if (paymentReference) formData.set("paymentReference", paymentReference);
      if (paymentBy) formData.set("paymentBy", paymentBy);
      if (remarks) formData.set("remarks", remarks);

      await apiFetch("/purchases", { method: "POST", body: formData });

      resetForm();
      setShowForm(false);
      await loadPurchases();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not save purchase");
    } finally {
      setSubmitting(false);
    }
  }

  function openPaymentDialog(p: PurchaseRow) {
    setPayingPurchase(p);
    setPayAmount("");
    setPayMode("");
    setPayRef("");
    setPayBy("");
    setPayError(null);
  }

  async function submitPayment(e: FormEvent) {
    e.preventDefault();
    if (!payingPurchase) return;
    setPayError(null);
    setPaySubmitting(true);
    try {
      await apiFetch(`/purchases/${payingPurchase.id}/payment`, {
        method: "PATCH",
        body: JSON.stringify({
          paymentAmount: Number(payAmount),
          paymentMode: payMode || undefined,
          paymentReference: payRef || undefined,
          paymentBy: payBy || undefined,
        }),
      });
      setPayingPurchase(null);
      await loadPurchases();
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : "Could not record payment");
    } finally {
      setPaySubmitting(false);
    }
  }

  const inventory = isInventoryType(itemType);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchases"
        description="Spare parts, paint and tools generate a permanent serial per unit. Travel, petrol, food and other costs are recorded as plain expenses."
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                <div>
                  <Label>Purchase type</Label>
                  <Select value={itemType} onChange={(e) => setItemType(e.target.value)}>
                    <optgroup label="Inventory (gets serial numbers)">
                      {INVENTORY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABELS[t]}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Expense (no stock)">
                      {EXPENSE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABELS[t]}
                        </option>
                      ))}
                    </optgroup>
                  </Select>
                </div>
              </div>

              {inventory ? (
                <>
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
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              searchItems();
                            }
                          }}
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
                </>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Textarea
                    placeholder="Description (e.g. Fuel for pickup van, tollway pass)"
                    required
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="sm:col-span-2"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Total cost"
                    required
                    value={purchaseCost}
                    onChange={(e) => setPurchaseCost(e.target.value)}
                  />
                </div>
              )}

              <div>
                <Label>Bill / receipt (optional)</Label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => setBill(e.target.files?.[0] ?? null)}
                  className="text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
                />
              </div>

              <Input placeholder="Remarks (optional)" value={remarks} onChange={(e) => setRemarks(e.target.value)} />

              <div className="rounded-md border border-gray-200 p-3">
                <p className="mb-2 text-sm font-medium text-gray-700">Supplier payment (optional — can be added later)</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Amount paid now"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                  />
                  <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                    <option value="">Payment mode...</option>
                    {PAYMENT_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m.replace("_", " ")}
                      </option>
                    ))}
                  </Select>
                  <Input
                    placeholder="Reference / transaction ID"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                  />
                  <Input placeholder="Paid by" value={paymentBy} onChange={(e) => setPaymentBy(e.target.value)} />
                </div>
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save purchase"}
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      {payingPurchase && (
        <Card className="max-w-md">
          <CardBody>
            <form onSubmit={submitPayment} className="space-y-3">
              <p className="text-sm font-medium text-gray-700">
                Record payment — Purchase #{payingPurchase.id}
              </p>
              <p className="text-xs text-gray-500">
                Total cost: ₹{(payingPurchase.quantity * Number(payingPurchase.purchaseCost)).toFixed(2)} · Paid so far: ₹
                {Number(payingPurchase.paymentAmount).toFixed(2)} · Due: ₹
                {(payingPurchase.quantity * Number(payingPurchase.purchaseCost) - Number(payingPurchase.paymentAmount)).toFixed(2)}
              </p>
              <Input
                type="number"
                step="0.01"
                placeholder="Amount being paid now"
                required
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
              <Select value={payMode} onChange={(e) => setPayMode(e.target.value)}>
                <option value="">Payment mode...</option>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m.replace("_", " ")}
                  </option>
                ))}
              </Select>
              <Input placeholder="Reference / transaction ID" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
              <Input placeholder="Paid by" value={payBy} onChange={(e) => setPayBy(e.target.value)} />
              {payError && <p className="text-sm text-red-600">{payError}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={paySubmitting}>
                  {paySubmitting ? "Saving..." : "Save payment"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setPayingPurchase(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {loading ? (
        <TableSkeleton cols={8} />
      ) : purchases.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="No purchases recorded yet" />
      ) : (
        <Table minWidth={850}>
          <thead>
            <tr>
              <Th>Serial No.</Th>
              <Th>Date</Th>
              <Th>Type</Th>
              <Th>Item / Expense</Th>
              <Th>Supplier</Th>
              <Th>Qty</Th>
              <Th>Cost</Th>
              <Th>Payment</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => {
              const total = p.quantity * Number(p.purchaseCost);
              return (
                <Tr key={p.id}>
                  <Td className="font-mono">#{p.id}</Td>
                  <Td>{new Date(p.purchaseDate).toLocaleDateString()}</Td>
                  <Td>{TYPE_LABELS[p.itemType] ?? p.itemType}</Td>
                  <Td>
                    {p.item ? (
                      <>
                        {p.item.itemCode} — {p.item.name}
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
                  <Td>{p.supplier.name}</Td>
                  <Td>
                    {p.quantity} {p.item?.uom ?? ""}
                  </Td>
                  <Td>₹{total.toFixed(2)}</Td>
                  <Td>
                    <PaymentStatusBadge total={total} paid={Number(p.paymentAmount)} />
                    {Number(p.paymentAmount) > 0 && Number(p.paymentAmount) < total && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        ₹{Number(p.paymentAmount).toFixed(2)} paid — ₹{(total - Number(p.paymentAmount)).toFixed(2)} due
                      </p>
                    )}
                  </Td>
                  <Td>
                    <button
                      onClick={() => openPaymentDialog(p)}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    >
                      <IndianRupee className="h-3 w-3" /> Payment
                    </button>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}

export default function PurchasesPage() {
  return (
    <RequireAuth permission="PURCHASES">
      <PurchasesPageContent />
    </RequireAuth>
  );
}
