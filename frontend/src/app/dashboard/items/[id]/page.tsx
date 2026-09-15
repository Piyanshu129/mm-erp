"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { AuthedImage } from "@/components/AuthedMedia";
import { apiFetch } from "@/lib/api";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { StockStatusBadge, Badge } from "@/components/ui/Badge";
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

interface UnitRow {
  id: number;
  status: "IN_STOCK" | "ISSUED";
  createdAt: string;
  purchase: {
    id: number;
    purchaseCost: string;
    supplier: { name: string };
  };
  jobCardPart: {
    jobCard: { jobCardNumber: string; vehicle: { registrationNumber: string } };
  } | null;
}

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [itemBody, historyBody] = await Promise.all([
        apiFetch(`/items/${id}`),
        apiFetch(`/items/${id}/stock-history`),
      ]);
      setItem(itemBody.item);
      setUnits(historyBody.units);
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
        <h2 className="mb-3 text-base font-semibold text-gray-900">Unit-by-unit stock history</h2>
        <p className="mb-3 text-sm text-gray-500">
          Every physical unit of this item has its own permanent serial number — the same number written on its
          sticker when it was received.
        </p>
        {units.length === 0 ? (
          <EmptyState icon={History} title="No units purchased yet" />
        ) : (
          <Table minWidth={750}>
            <thead>
              <tr>
                <Th>Serial No.</Th>
                <Th>Status</Th>
                <Th>Purchased From</Th>
                <Th>Purchased On</Th>
                <Th>Issued To</Th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <Tr key={u.id}>
                  <Td className="font-mono font-medium">#{u.id}</Td>
                  <Td>
                    {u.status === "IN_STOCK" ? (
                      <Badge tone="green">In stock</Badge>
                    ) : (
                      <Badge tone="gray">Issued</Badge>
                    )}
                  </Td>
                  <Td>
                    {u.purchase.supplier.name}{" "}
                    <span className="text-gray-400">(Purchase #{u.purchase.id})</span>
                  </Td>
                  <Td>{new Date(u.createdAt).toLocaleDateString()}</Td>
                  <Td>
                    {u.jobCardPart ? (
                      <>
                        {u.jobCardPart.jobCard.jobCardNumber} ·{" "}
                        {u.jobCardPart.jobCard.vehicle.registrationNumber}
                      </>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
