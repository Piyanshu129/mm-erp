"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AuthedImage } from "@/components/AuthedMedia";
import { apiFetch, ApiError } from "@/lib/api";

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

function stockStatus(item: ItemRow): { label: string; className: string } {
  if (item.currentStock <= 0) return { label: "Out of stock", className: "text-red-600" };
  if (item.currentStock <= item.minStock) return { label: "Low stock", className: "text-amber-600" };
  return { label: "In stock", className: "text-green-700" };
}

export default function ItemsPage() {
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
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Items</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          {showForm ? "Cancel" : "+ New item"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="grid max-w-2xl grid-cols-1 gap-3 rounded-md border border-gray-200 p-4 sm:grid-cols-2"
        >
          <input
            placeholder="Item name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
          />
          <select
            value={formCategory}
            onChange={(e) => setFormCategory(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            placeholder="UOM (e.g. PCS, LTR, SET)"
            required
            value={uom}
            onChange={(e) => setUom(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Purchase cost"
            value={purchaseCost}
            onChange={(e) => setPurchaseCost(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Selling price"
            value={sellingPrice}
            onChange={(e) => setSellingPrice(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Minimum stock"
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="text-sm sm:col-span-2"
          />
          {formError && <p className="text-sm text-red-600 sm:col-span-2">{formError}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:col-span-2"
          >
            {submitting ? "Saving..." : "Save item"}
          </button>
        </form>
      )}

      <form onSubmit={handleSearch} className="flex max-w-lg flex-wrap gap-2">
        <input
          placeholder="Search by item code, name or part number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-w-[200px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-gray-300 px-4 py-2 text-sm">
          Search
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">No items found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse overflow-hidden rounded-md border border-gray-200 text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-3 py-2">Photo</th>
                <th className="px-3 py-2">Item Code</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">UOM</th>
                <th className="px-3 py-2">Selling Price</th>
                <th className="px-3 py-2">Stock</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const status = stockStatus(item);
                return (
                  <tr key={item.id} className="border-t border-gray-200">
                    <td className="px-3 py-2">
                      {item.photoUrl ? (
                        <AuthedImage
                          src={item.photoUrl}
                          alt={item.name}
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-gray-100" />
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link
                        href={`/dashboard/items/${item.id}`}
                        className="text-gray-900 underline hover:no-underline"
                      >
                        {item.itemCode}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{item.name}</td>
                    <td className="px-3 py-2">{item.category}</td>
                    <td className="px-3 py-2">{item.uom}</td>
                    <td className="px-3 py-2">₹{item.sellingPrice}</td>
                    <td className={`px-3 py-2 ${status.className}`}>
                      {item.currentStock} · {status.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
