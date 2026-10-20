"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ClipboardCheck, X, ZoomIn } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { fmtQty } from "@/lib/format";
import { AuthedImage } from "@/components/AuthedMedia";
import { Card, CardBody } from "@/components/ui/Card";

interface EstimateLine {
  id: number;
  lineType: "PART" | "LABOUR";
  itemId: number | null;
  description: string;
  quantity: number;
  item: { itemCode: string } | null;
}

interface JobCardLine {
  itemId: number | null;
  description: string;
  quantity: number;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// For re-checking a job card against what the customer approved: the
// signed estimate photo (click for full screen) and the estimate's lines,
// each ticked when the job card has it (inventory items by item, others by
// description) with the quantities side by side.
export function EstimateCheck({
  estimate,
  parts,
  labour,
}: {
  estimate: { id: number; estimateNumber: string; status: string; approvalPhotoUrl: string | null };
  parts: JobCardLine[];
  labour: JobCardLine[];
}) {
  const [lines, setLines] = useState<EstimateLine[] | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);

  useEffect(() => {
    apiFetch(`/estimates/${estimate.id}`)
      .then((body) => setLines(body.estimate.lines))
      .catch(() => setLines([]));
  }, [estimate.id]);

  useEffect(() => {
    if (!photoOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPhotoOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photoOpen]);

  // How much of an estimate line the job card has so far.
  function onJobCard(l: EstimateLine): number {
    const pool = l.lineType === "LABOUR" ? labour : parts;
    return pool
      .filter((p) => (l.itemId != null ? p.itemId === l.itemId : p.itemId == null && norm(p.description) === norm(l.description)))
      .reduce((sum, p) => sum + p.quantity, 0);
  }

  const missing = (lines ?? []).filter((l) => onJobCard(l) + 0.0005 < l.quantity).length;

  return (
    <Card className="border-indigo-200">
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <ClipboardCheck className="h-4 w-4 text-indigo-500" /> Check against the estimate
          </p>
          <Link href={`/dashboard/estimates/${estimate.id}`} className="text-sm font-medium text-blue-600 hover:underline">
            {estimate.estimateNumber}
            {estimate.status === "APPROVED" ? " (customer approved)" : " (not approved yet)"}
          </Link>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row">
          {estimate.approvalPhotoUrl ? (
            <button
              type="button"
              onClick={() => setPhotoOpen(true)}
              className="relative flex-shrink-0 self-start overflow-hidden rounded-md border border-gray-200 bg-gray-50"
              title="Click to enlarge"
            >
              <AuthedImage
                src={estimate.approvalPhotoUrl}
                alt="Customer-signed estimate"
                className="h-72 w-full object-contain lg:h-80 lg:w-64"
              />
              <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-xs text-white">
                <ZoomIn className="h-3.5 w-3.5" /> Enlarge
              </span>
            </button>
          ) : (
            <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-500 lg:w-64">
              No signed estimate photo yet — it&apos;s added on the estimate page once the customer signs.
            </p>
          )}

          <div className="min-w-0 flex-1">
            {lines == null ? (
              <p className="text-sm text-gray-500">Loading the estimate...</p>
            ) : lines.length === 0 ? (
              <p className="text-sm text-gray-500">The estimate has no lines.</p>
            ) : (
              <>
                <p className={`mb-2 text-sm font-medium ${missing ? "text-amber-700" : "text-green-700"}`}>
                  {missing
                    ? `${missing} of ${lines.length} estimate line${lines.length === 1 ? "" : "s"} not fully on the job card yet`
                    : "Everything on the estimate is on the job card"}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500">
                        <th className="py-1 pr-2"></th>
                        <th className="py-1 pr-2">Estimate line</th>
                        <th className="py-1 pr-2 text-right">Estimated</th>
                        <th className="py-1 text-right">On job card</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => {
                        const have = onJobCard(l);
                        const done = have + 0.0005 >= l.quantity;
                        return (
                          <tr key={l.id} className={`border-t border-gray-100 ${done ? "" : "bg-amber-50"}`}>
                            <td className="py-1.5 pr-2">
                              {done ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-amber-600" />}
                            </td>
                            <td className="py-1.5 pr-2">
                              <span className="text-xs text-gray-500">{l.lineType === "LABOUR" ? "Labour · " : l.item ? `${l.item.itemCode} · ` : "Non-inventory · "}</span>
                              {l.description}
                            </td>
                            <td className="py-1.5 pr-2 text-right">{fmtQty(l.quantity)}</td>
                            <td className={`py-1.5 text-right ${done ? "text-gray-900" : "font-medium text-amber-700"}`}>{fmtQty(have)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Inventory items are matched by item code; non-inventory items and labour by their description.
                </p>
              </>
            )}
          </div>
        </div>
      </CardBody>

      {photoOpen && estimate.approvalPhotoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setPhotoOpen(false)}
          role="dialog"
          aria-label="Customer-signed estimate"
        >
          <button
            type="button"
            onClick={() => setPhotoOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-gray-800 hover:bg-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <AuthedImage src={estimate.approvalPhotoUrl} alt="Customer-signed estimate" className="max-h-full max-w-full rounded-md object-contain" />
        </div>
      )}
    </Card>
  );
}
