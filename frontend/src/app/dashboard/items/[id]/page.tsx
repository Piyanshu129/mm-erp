"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, History, Pencil, X, ZoomIn } from "lucide-react";
import { AuthedImage } from "@/components/AuthedMedia";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input, Select, Label } from "@/components/ui/Input";
import { GST_RATES } from "@/lib/gst";
import { UOM_OPTIONS } from "@/lib/uom";
import { compressImage } from "@/lib/compressImage";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { StockStatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { stickerRange } from "@/lib/stickers";
import { fmtQty } from "@/lib/format";

interface ItemDetail {
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
  partNumber: string | null;
  brand: string | null;
  specification: string | null;
  hsnCode?: string | null;
  gstRate?: string | null;
  subCategory?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  variant?: string | null;
  remarks?: string | null;
}

const CATEGORIES = ["OEM", "Local", "Imported", "Old/Used"];

// Admin-only (the server enforces it): correct an item's details. A blank
// optional field clears it. Stock isn't changed here — it follows purchases
// and job cards.
function ItemEditForm({ item, onCancel, onSaved }: { item: ItemDetail; onCancel: () => void; onSaved: (item: ItemDetail) => void }) {
  const text = (v: string | null | undefined) => v ?? "";
  const [f, setF] = useState({
    name: item.name,
    category: item.category,
    uom: item.uom,
    partNumber: text(item.partNumber),
    brand: text(item.brand),
    specification: text(item.specification),
    vehicleMake: text(item.vehicleMake),
    vehicleModel: text(item.vehicleModel),
    variant: text(item.variant),
    hsnCode: text(item.hsnCode),
    gstRate: item.gstRate != null ? String(Number(item.gstRate)) : "",
    purchaseCost: String(Number(item.purchaseCost)),
    sellingPrice: String(Number(item.sellingPrice)),
    minStock: String(item.minStock),
    remarks: text(item.remarks),
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((prev) => ({ ...prev, [k]: e.target.value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.name.trim()) return setError("Enter the item name");
    if (f.hsnCode && !/^\d{4,8}$/.test(f.hsnCode)) return setError("HSN code is 4 to 8 digits");
    setSaving(true);
    try {
      const form = new FormData();
      for (const [k, v] of Object.entries(f)) {
        // Numbers left blank stay as they are; text left blank is cleared.
        if (["purchaseCost", "sellingPrice", "minStock"].includes(k) && v.trim() === "") continue;
        form.set(k, v.trim());
      }
      if (photo) form.set("photo", await compressImage(photo));
      const body = await apiFetch(`/items/${item.id}`, { method: "PATCH", body: form });
      onSaved(body.item);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save — check the connection and try again");
    } finally {
      setSaving(false);
    }
  }

  const field = (label: string, k: keyof typeof f, props: Record<string, unknown> = {}) => (
    <div>
      <Label>{label}</Label>
      <Input value={f[k]} onChange={set(k)} {...props} />
    </div>
  );

  return (
    <Card className="border-blue-200">
      <CardBody>
        <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3">{field("Item name", "name")}</div>
          <div>
            <Label>Category</Label>
            <Select value={f.category} onChange={set("category")}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Unit of measure</Label>
            <Select value={f.uom} onChange={set("uom")}>
              {!UOM_OPTIONS.some((u) => u.value === f.uom) && <option value={f.uom}>{f.uom}</option>}
              {UOM_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </Select>
          </div>
          {field("Part number", "partNumber")}
          {field("Brand", "brand")}
          {field("Specification", "specification")}
          {field("Minimum stock", "minStock", { type: "number", min: 0, step: 1 })}
          {field("For car make", "vehicleMake")}
          {field("Model", "vehicleModel")}
          {field("Variant", "variant")}
          {field("Purchase cost", "purchaseCost", { type: "number", min: 0, step: "0.01" })}
          {field("MRP", "sellingPrice", { type: "number", min: 0, step: "0.01" })}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>HSN code</Label>
              <Input
                inputMode="numeric"
                maxLength={8}
                value={f.hsnCode}
                onChange={(e) => setF((prev) => ({ ...prev, hsnCode: e.target.value.replace(/\D/g, "") }))}
              />
            </div>
            <div>
              <Label>GST %</Label>
              <Select value={f.gstRate} onChange={set("gstRate")}>
                <option value="">Not set</option>
                {GST_RATES.map((r) => (
                  <option key={r} value={String(r)}>
                    {r}%
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="sm:col-span-2">{field("Remarks", "remarks")}</div>
          <div>
            <Label>Replace photo (optional)</Label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
            />
          </div>
          {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
          <div className="flex gap-2 sm:col-span-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save item"}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

interface PurchaseRow {
  id: number;
  purchaseDate: string;
  quantity: number;
  purchaseCost: string;
  stickerFrom: number | null;
  stickerTo: number | null;
  supplier: { name: string } | null;
}

interface IssueRow {
  id: number;
  quantity: number;
  createdAt: string;
  jobCard: { id: number; jobCardNumber: string; vehicle: { registrationNumber: string } };
}

function ItemDetailPageContent() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [photoOpen, setPhotoOpen] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [editing, setEditing] = useState(false);

  // The items list's Edit link opens the form straight away.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("edit") === "1") setEditing(true);
  }, []);

  // Esc closes the full-screen photo.
  useEffect(() => {
    if (!photoOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPhotoOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photoOpen]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [itemBody, historyBody] = await Promise.all([
        apiFetch(`/items/${id}`),
        apiFetch(`/items/${id}/stock-history`),
      ]);
      setItem(itemBody.item);
      setPurchases(historyBody.purchases);
      setIssues(historyBody.issues);
      setLoading(false);
    })();
  }, [id]);

  if (loading || !item) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-28 w-full max-w-md" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {photoOpen && item.photoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setPhotoOpen(false)}
          role="dialog"
          aria-label={`Photo of ${item.name}`}
        >
          <button
            type="button"
            onClick={() => setPhotoOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-gray-800 hover:bg-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <AuthedImage src={item.photoUrl} alt={item.name} className="max-h-full max-w-full rounded-md object-contain" />
          <p className="absolute bottom-4 left-0 right-0 text-center text-sm text-white">
            {item.itemCode} — {item.name}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/dashboard/items" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> All items
        </Link>
        {isAdmin && !editing && (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit item
          </Button>
        )}
      </div>

      {editing && isAdmin && (
        <ItemEditForm
          item={item}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setItem(saved);
            setEditing(false);
          }}
        />
      )}

      <Card>
        <CardBody className="flex flex-col gap-4 sm:flex-row">
          {item.photoUrl ? (
            <button
              type="button"
              onClick={() => setPhotoOpen(true)}
              className="group relative flex-shrink-0 self-start overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
              title="Click to enlarge"
            >
              <AuthedImage
                src={item.photoUrl}
                alt={item.name}
                className="h-64 w-full object-contain sm:h-60 sm:w-60"
              />
              <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs text-white">
                <ZoomIn className="h-3.5 w-3.5" /> Enlarge
              </span>
            </button>
          ) : (
            <div className="flex h-40 w-full flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-400 sm:h-60 sm:w-60">
              No photo
            </div>
          )}
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900">{item.name}</h1>
              <StockStatusBadge currentStock={item.currentStock} minStock={item.minStock} />
            </div>
            <p className="font-mono text-sm text-gray-500">{item.itemCode}</p>
            <dl className="mt-3 grid max-w-md grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-gray-500">Category</dt>
              <dd className="text-gray-900">{item.category}</dd>
              <dt className="text-gray-500">UOM</dt>
              <dd className="text-gray-900">{item.uom}</dd>
              <dt className="text-gray-500">Part Number</dt>
              <dd className="text-gray-900">{item.partNumber ?? "-"}</dd>
              <dt className="text-gray-500">Brand</dt>
              <dd className="text-gray-900">{item.brand ?? "-"}</dd>
              <dt className="text-gray-500">Specification</dt>
              <dd className="text-gray-900">{item.specification ?? "-"}</dd>
              <dt className="text-gray-500">HSN / GST</dt>
              <dd className="text-gray-900">
                {item.hsnCode ?? "-"} · {item.gstRate != null ? `${Number(item.gstRate)}%` : "-"}
              </dd>
              <dt className="text-gray-500">Purchase Cost</dt>
              <dd className="text-gray-900">₹{item.purchaseCost}</dd>
              <dt className="text-gray-500">MRP</dt>
              <dd className="text-gray-900">₹{item.sellingPrice}</dd>
              <dt className="text-gray-500">Purchased Qty</dt>
              <dd className="text-gray-900">
                {fmtQty(purchases.reduce((sum, p) => sum + p.quantity, 0))} {item.uom}
              </dd>
              <dt className="text-gray-500">Available Qty</dt>
              <dd className="font-semibold text-gray-900">
                {fmtQty(item.currentStock)} {item.uom}
              </dd>
              <dt className="text-gray-500">Minimum Stock</dt>
              <dd className="text-gray-900">{item.minStock}</dd>
            </dl>
          </div>
        </CardBody>
      </Card>

      <div>
        <h2 className="mb-3 text-base font-semibold text-gray-900">Purchased</h2>
        {purchases.length === 0 ? (
          <EmptyState icon={History} title="Not purchased yet" />
        ) : (
          <Table minWidth={650}>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Supplier</Th>
                <Th>Qty</Th>
                <Th>Rate</Th>
                <Th>Stickers</Th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <Tr key={p.id}>
                  <Td>{new Date(p.purchaseDate).toLocaleDateString()}</Td>
                  <Td>
                    {p.supplier?.name ?? "-"} <span className="text-gray-400">(Purchase #{p.id})</span>
                  </Td>
                  <Td>{fmtQty(p.quantity)}</Td>
                  <Td>₹{p.purchaseCost}</Td>
                  <Td className="font-mono">{stickerRange(item.itemCode, p.stickerFrom, p.stickerTo) || "-"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold text-gray-900">Used on job cards</h2>
        {issues.length === 0 ? (
          <EmptyState icon={History} title="Not used on any job card yet" />
        ) : (
          <Table minWidth={550}>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Job Card</Th>
                <Th>Vehicle</Th>
                <Th>Qty Used</Th>
              </tr>
            </thead>
            <tbody>
              {issues.map((u) => (
                <Tr key={u.id}>
                  <Td>{new Date(u.createdAt).toLocaleDateString()}</Td>
                  <Td>
                    <Link href={`/dashboard/jobcards/${u.jobCard.id}`} className="text-blue-600 hover:underline">
                      {u.jobCard.jobCardNumber}
                    </Link>
                  </Td>
                  <Td>{u.jobCard.vehicle.registrationNumber}</Td>
                  <Td>{fmtQty(u.quantity)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}

export default function ItemDetailPage() {
  return (
    <RequireAuth permission="ITEMS">
      <ItemDetailPageContent />
    </RequireAuth>
  );
}
