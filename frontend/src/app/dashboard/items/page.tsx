"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Package } from "lucide-react";
import { AuthedImage } from "@/components/AuthedMedia";
import { apiFetch, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Select, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { StockStatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";

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
  isActive: boolean;
}

const CATEGORIES = ["OEM", "Local", "Imported", "Old/Used"];

function ItemsPageContent() {
  const [items, setItems] = useState<ItemRow[]>([]);
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
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load(query: string, cat: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (cat) params.set("category", cat);
    const body = await apiFetch(`/items?${params.toString()}`);
    setItems(body.items);
    setLoading(false);
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
      if (photo) formData.set("photo", photo);

      await apiFetch("/items", { method: "POST", body: formData });

      setName("");
      setUom("PCS");
      setPurchaseCost("");
      setSellingPrice("");
      setMinStock("");
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
                <Label>UOM</Label>
                <Input placeholder="e.g. PCS, LTR, SET" required value={uom} onChange={(e) => setUom(e.target.value)} />
              </div>
              <div>
                <Label>Purchase cost</Label>
                <Input type="number" step="0.01" value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} />
              </div>
              <div>
                <Label>Selling price</Label>
                <Input type="number" step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} />
              </div>
              <div>
                <Label>Minimum stock</Label>
                <Input type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
              </div>
              <div>
                <Label>Photo (optional)</Label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
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

      {loading ? (
        <TableSkeleton cols={6} />
      ) : items.length === 0 ? (
        <EmptyState icon={Package} title="No items found" description="Try a different search, or add a new item." />
      ) : (
        <Table minWidth={750}>
          <thead>
            <tr>
              <Th></Th>
              <Th>Item Code</Th>
              <Th>Name</Th>
              <Th>Category</Th>
              <Th>UOM</Th>
              <Th>Selling Price</Th>
              <Th>Stock</Th>
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
                <Td className="font-medium text-gray-900">{item.name}</Td>
                <Td>{item.category}</Td>
                <Td>{item.uom}</Td>
                <Td>₹{item.sellingPrice}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span>{item.currentStock}</span>
                    <StockStatusBadge currentStock={item.currentStock} minStock={item.minStock} />
                  </div>
                </Td>
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
