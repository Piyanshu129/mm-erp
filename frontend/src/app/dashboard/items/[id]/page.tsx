"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, History } from "lucide-react";
import { AuthedImage } from "@/components/AuthedMedia";
import { apiFetch } from "@/lib/api";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { StockStatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

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
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-28 w-full max-w-md" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Link href="/dashboard/items" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> All items
      </Link>

      <Card>
        <CardBody className="flex flex-col gap-4 sm:flex-row">
          {item.photoUrl ? (
            <AuthedImage src={item.photoUrl} alt={item.name} className="h-28 w-28 flex-shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="h-28 w-28 flex-shrink-0 rounded-lg bg-gray-100" />
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
              <dt className="text-gray-500">Purchase Cost</dt>
              <dd className="text-gray-900">₹{item.purchaseCost}</dd>
              <dt className="text-gray-500">Selling Price</dt>
              <dd className="text-gray-900">₹{item.sellingPrice}</dd>
              <dt className="text-gray-500">Current Stock</dt>
              <dd className="font-semibold text-gray-900">
                {item.currentStock} {item.uom}
              </dd>
              <dt className="text-gray-500">Minimum Stock</dt>
              <dd className="text-gray-900">{item.minStock}</dd>
            </dl>
          </div>
        </CardBody>
      </Card>

      <div>
        <h2 className="mb-3 text-base font-semibold text-gray-900">Stock history</h2>
        {history.length === 0 ? (
          <EmptyState icon={History} title="No stock movements yet" />
        ) : (
          <Table minWidth={650}>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Qty</Th>
                <Th>Balance After</Th>
                <Th>Reference</Th>
                <Th>By</Th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <Tr key={h.id}>
                  <Td>{new Date(h.createdAt).toLocaleString()}</Td>
                  <Td>
                    <span
                      className={`inline-flex items-center gap-1 font-medium ${h.direction === "IN" ? "text-green-700" : "text-red-600"}`}
                    >
                      {h.direction === "IN" ? (
                        <ArrowDownCircle className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpCircle className="h-3.5 w-3.5" />
                      )}
                      {h.direction}
                    </span>
                  </Td>
                  <Td>{h.quantity}</Td>
                  <Td>{h.balanceAfter}</Td>
                  <Td>
                    {h.purchase
                      ? `Purchase Serial #${h.purchase.id} · ${h.purchase.supplier.name}`
                      : h.jobCardPart
                        ? `${h.jobCardPart.jobCard.jobCardNumber} · ${h.jobCardPart.jobCard.vehicle.registrationNumber}`
                        : h.referenceType}
                  </Td>
                  <Td>{h.createdBy.name}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
