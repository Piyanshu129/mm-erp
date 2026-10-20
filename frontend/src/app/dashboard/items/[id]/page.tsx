"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, History, X, ZoomIn } from "lucide-react";
import { AuthedImage } from "@/components/AuthedMedia";
import { apiFetch } from "@/lib/api";
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

      <Link href="/dashboard/items" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> All items
      </Link>

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
