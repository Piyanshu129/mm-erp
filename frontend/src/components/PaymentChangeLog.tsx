"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";

interface Snapshot {
  amount: number;
  discount?: number;
  paymentDate: string;
  paymentMode: string | null;
  reference: string | null;
  receivedBy?: string | null;
  paidBy?: string | null;
  notes: string | null;
}

interface Audit {
  id: number;
  paymentId: number;
  action: "EDIT" | "DELETE";
  before: Snapshot;
  after: Snapshot | null;
  changedAt: string;
  changedBy: { name: string };
}

const LABELS: Record<keyof Snapshot, string> = {
  amount: "Amount",
  discount: "Discount",
  paymentDate: "Date",
  paymentMode: "Mode",
  reference: "Reference",
  receivedBy: "Received by",
  paidBy: "Paid by",
  notes: "Notes",
};

function show(field: keyof Snapshot, value: unknown): string {
  if (value == null || value === "") return "—";
  if (field === "amount" || field === "discount") return formatINR(value as number);
  if (field === "paymentDate") return new Date(value as string).toLocaleDateString();
  if (field === "paymentMode") return String(value).replace("_", " ");
  return String(value);
}

// The audit trail of admin edits and deletions of recorded payments: who
// changed what, from what to what, and when. Read-only.
export function PaymentChangeLog({ url, refreshKey }: { url: string; refreshKey?: unknown }) {
  const [audits, setAudits] = useState<Audit[] | null>(null);

  useEffect(() => {
    apiFetch(url)
      .then((body) => setAudits(body.audits))
      .catch(() => setAudits([]));
  }, [url, refreshKey]);

  if (!audits || audits.length === 0) return null;

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        <History className="h-4 w-4 text-gray-400" /> Payment change log
      </p>
      <ul className="space-y-2 text-sm">
        {audits.map((a) => {
          const fields = (Object.keys(LABELS) as (keyof Snapshot)[]).filter((f) => f in a.before);
          const changed = a.after ? fields.filter((f) => show(f, a.before[f]) !== show(f, a.after![f])) : [];
          return (
            <li key={a.id} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-500">
                {new Date(a.changedAt).toLocaleString()} · {a.changedBy.name} ·{" "}
                <span className={a.action === "DELETE" ? "font-semibold text-red-700" : "font-semibold text-blue-700"}>
                  {a.action === "DELETE" ? "Deleted" : "Edited"}
                </span>{" "}
                payment #{a.paymentId}
              </p>
              {a.action === "DELETE" ? (
                <p className="mt-0.5 text-gray-700">
                  Was {show("amount", a.before.amount)} on {show("paymentDate", a.before.paymentDate)} ({show("paymentMode", a.before.paymentMode)})
                </p>
              ) : changed.length === 0 ? (
                <p className="mt-0.5 text-gray-500">Saved with no changes.</p>
              ) : (
                <ul className="mt-0.5 text-gray-700">
                  {changed.map((f) => (
                    <li key={f}>
                      {LABELS[f]}: <span className="text-gray-500 line-through">{show(f, a.before[f])}</span> →{" "}
                      <span className="font-medium">{show(f, a.after![f])}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
