"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { apiFetch, assetUrl } from "@/lib/api";

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
}

interface LedgerEntry {
  id: number;
  direction: "IN" | "OUT";
  quantity: number;
  balanceAfter: number;
  referenceType: string;
  createdAt: string;
  createdBy: { name: string };
  purchase: {
    id: number;
    purchaseCost: string;
    supplier: { name: string };
  } | null;
  jobCardPart: {
    jobCard: { jobCardNumber: string; vehicle: { registrationNumber: string } };
  } | null;
}

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [itemBody, historyBody] = await Promise.all([
        apiFetch(`/items/${id}`),
        apiFetch(`/items/${id}/stock-history`),
      ]);
      setItem(itemBody.item);
      setHistory(historyBody.entries);
      setLoading(false);
    })();
  }, [id]);

  if (loading || !item) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  return (
    <div className="space-y-8">
      <Link href="/dashboard/items" className="text-sm text-gray-500 underline">
        ← All items
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row">
        {item.photoUrl ? (
          <Image
            src={assetUrl(item.photoUrl)}
            alt={item.name}
            width={120}
            height={120}
            unoptimized
            className="h-28 w-28 rounded object-cover"
          />
        ) : (
          <div className="h-28 w-28 rounded bg-gray-100" />
        )}
        <div>
          <h1 className="text-lg font-semibold">{item.name}</h1>
          <p className="font-mono text-sm text-gray-500">{item.itemCode}</p>
          <dl className="mt-2 grid max-w-md grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-600">
            <dt>Category</dt>
            <dd>{item.category}</dd>
            <dt>UOM</dt>
            <dd>{item.uom}</dd>
            <dt>Part Number</dt>
            <dd>{item.partNumber ?? "-"}</dd>
            <dt>Brand</dt>
            <dd>{item.brand ?? "-"}</dd>
            <dt>Purchase Cost</dt>
            <dd>₹{item.purchaseCost}</dd>
            <dt>Selling Price</dt>
            <dd>₹{item.sellingPrice}</dd>
            <dt>Current Stock</dt>
            <dd className="font-semibold">
              {item.currentStock} {item.uom}
            </dd>
            <dt>Minimum Stock</dt>
            <dd>{item.minStock}</dd>
          </dl>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold">Stock history</h2>
        {history.length === 0 ? (
          <p className="text-sm text-gray-500">No stock movements yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse overflow-hidden rounded-md border border-gray-200 text-sm">
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Balance After</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">By</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-gray-200">
                    <td className="px-3 py-2">{new Date(h.createdAt).toLocaleString()}</td>
                    <td className={`px-3 py-2 ${h.direction === "IN" ? "text-green-700" : "text-red-600"}`}>
                      {h.direction}
                    </td>
                    <td className="px-3 py-2">{h.quantity}</td>
                    <td className="px-3 py-2">{h.balanceAfter}</td>
                    <td className="px-3 py-2">
                      {h.purchase
                        ? `Purchase Serial #${h.purchase.id} · ${h.purchase.supplier.name}`
                        : h.jobCardPart
                          ? `${h.jobCardPart.jobCard.jobCardNumber} · ${h.jobCardPart.jobCard.vehicle.registrationNumber}`
                          : h.referenceType}
                    </td>
                    <td className="px-3 py-2">{h.createdBy.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
