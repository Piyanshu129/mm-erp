"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Search, Package } from "lucide-react";
import { AuthedImage } from "@/components/AuthedMedia";
import { apiFetch, apiFetchAll, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { GST_RATES } from "@/lib/gst";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Select, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { StockStatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { UOM_OPTIONS } from "@/lib/uom";
import { compressImage } from "@/lib/compressImage";
import { fmtQty } from "@/lib/format";
import { AdminDeleteButton } from "@/components/AdminDeleteButton";

interface ItemRow {
  id: number;
  itemCode: string;
  name: string;
  category: string;
  uom: string;
  purchaseCost: string;
  sellingPrice: string;
  minStock: number;
  currentStock: number;
  photoUrl: string | null;
  brand: string | null;
  specification: string | null;
  isActive: boolean;
  purchasedQty: number;
}

const CATEGORIES = ["OEM", "Local", "Imported", "Old/Used"];

function ItemsPageContent() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [items, setItems] = useState<ItemRow[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [formCategory, setFormCategory] = useState(CATEGORIES[0]);
  const [uom, setUom] = useState("PCS");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [minStock, setMinStock] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [hsnCode, setHsnCode] = useState("");
  const [gstRate, setGstRate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load(query: string, cat: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (cat) params.set("category", cat);
    try {
      setItems(await apiFetchAll<ItemRow>(`/items?${params.toString()}`, "items"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load("", "");
  }, []);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    await load(q, category);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("name", name);
      formData.set("category", formCategory);
      formData.set("uom", uom);
      if (purchaseCost) formData.set("purchaseCost", purchaseCost);
      if (sellingPrice) formData.set("sellingPrice", sellingPrice);
      if (minStock) formData.set("minStock", minStock);
      if (hsnCode.trim()) formData.set("hsnCode", hsnCode.trim());
      if (gstRate) formData.set("gstRate", gstRate);
      if (photo) formData.set("photo", await compressImage(photo));

      await apiFetch("/items", { method: "POST", body: formData });

      setName("");
      setUom("PCS");
      setPurchaseCost("");
      setSellingPrice("");
      setMinStock("");
      setHsnCode("");
      setGstRate("");
      setPhoto(null);
      setShowForm(false);
      await load(q, category);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create item");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Items"
        description="Spare parts and consumables tracked in inventory."
        action={
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4" /> New item
          </Button>
        }
      />

      {showForm && (
        <Card className="max-w-2xl">
          <CardBody>
            <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Item name</Label>
                <Input required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Unit of measure</Label>
                <Select value={uom} onChange={(e) => setUom(e.target.value)}>
                  {UOM_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Purchase cost</Label>
                <Input type="number" step="0.01" value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} />
              </div>
              <div>
                <Label>MRP</Label>
                <Input type="number" step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} />
              </div>
              <div>
                <Label>Minimum stock</Label>
                <Input type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>HSN code (optional)</Label>
                  <Input
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="e.g. 8708"
                    value={hsnCode}
                    onChange={(e) => setHsnCode(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <div>
                  <Label>GST % (optional)</Label>
                  <Select value={gstRate} onChange={(e) => setGstRate(e.target.value)}>
                  <option value="">Not set</option>
                  {GST_RATES.map((r) => (
                    <option key={r} value={String(r)}>
                      {r}%
                    </option>
                  ))}
                </Select>
                </div>
              </div>
              <div>
                <Label>Photo (optional)</Label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
                />
              </div>
              {formError && <p className="text-sm text-red-600 sm:col-span-2">{formError}</p>}
              <div className="sm:col-span-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : "Save item"}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      <form onSubmit={handleSearch} className="flex max-w-lg flex-wrap gap-2">
        <Input
          placeholder="Search by item code, name or part number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-w-[200px] flex-1"
        />
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          <Search className="h-4 w-4" /> Search
        </Button>
      </form>

      {!loading && items.length > 0 && (
        <p className="text-sm text-gray-500">
          {items.length} {items.length === 1 ? "item" : "items"}
        </p>
      )}

{deleteError && (
        <p className="flex items-start justify-between gap-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{deleteError}</span>
          <button type="button" onClick={() => setDeleteError(null)} className="text-xs underline">
            Close
          </button>
        </p>
      )}

      {loading ? (
        <TableSkeleton cols={6} />
      ) : items.length === 0 ? (
        <EmptyState icon={Package} title="No items found" description="Try a different search, or add a new item." />
      ) : (
        <Table minWidth={950}>
          <thead>
            <tr>
              <Th></Th>
              <Th>Item Code</Th>
              <Th>Name</Th>
              <Th>Category</Th>
              <Th>UOM</Th>
              <Th>MRP</Th>
              <Th>Purchased Qty</Th>
              <Th>Available Qty</Th>
              {isAdmin && <Th />}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <Tr key={item.id}>
                <Td className="w-14">
                  {item.photoUrl ? (
                    <AuthedImage src={item.photoUrl} alt={item.name} className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-gray-100" />
                  )}
                </Td>
                <Td className="font-mono text-xs">
                  <Link href={`/dashboard/items/${item.id}`} className="text-gray-900 hover:text-blue-600 hover:underline">
                    {item.itemCode}
                  </Link>
                </Td>
                <Td className="font-medium text-gray-900">
                  {item.name}
                  {(item.brand || item.specification) && (
                    <span className="block text-xs font-normal text-gray-500">
                      {[item.brand, item.specification].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </Td>
                <Td>{item.category}</Td>
                <Td>{item.uom}</Td>
                <Td>₹{item.sellingPrice}</Td>
                <Td>{fmtQty(item.purchasedQty)}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span>{fmtQty(item.currentStock)}</span>
                    <StockStatusBadge currentStock={item.currentStock} minStock={item.minStock} />
                  </div>
                </Td>
                {isAdmin && (
                  <Td>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Link
                        href={`/dashboard/items/${item.id}?edit=1`}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </Link>
                      <AdminDeleteButton
                        url={`/items/${item.id}`}
                        confirmText={`Delete item ${item.itemCode} — ${item.name}? This can't be undone.\n\nAn item that was purchased, used on a job card or put on an estimate can't be deleted.`}
                        onError={setDeleteError}
                        onDeleted={() => load(q, category)}
                      />
                    </div>
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

export default function ItemsPage() {
  return (
    <RequireAuth permission="ITEMS">
      <ItemsPageContent />
    </RequireAuth>
  );
}
