"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError, assetUrl } from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  VEHICLE_RECEIVED: "Vehicle Received",
  WORK_STARTED: "Work Started",
  WAITING_FOR_PARTS: "Waiting for Parts",
  WORK_IN_PROGRESS: "Work in Progress",
  COMPLETED: "Completed",
  INVOICED: "Invoiced",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};
const LOCKED_STATUSES = ["INVOICED", "CLOSED", "CANCELLED"];

const MEDIA_ANGLES = [
  { value: "FRONT", label: "Front" },
  { value: "REAR", label: "Rear" },
  { value: "LEFT", label: "Left" },
  { value: "RIGHT", label: "Right" },
  { value: "INTERIOR", label: "Interior" },
  { value: "DASHBOARD", label: "Dashboard / KM" },
  { value: "ENGINE_BAY", label: "Engine Bay" },
  { value: "DAMAGE", label: "Damage" },
];

interface JobCardDetail {
  id: number;
  jobCardNumber: string;
  status: string;
  kmAtService: number | null;
  complaint: string | null;
  requiredWork: string | null;
  notes: string | null;
  createdAt: string;
  vehicle: {
    registrationNumber: string;
    make: string;
    model: string;
    customer: { id: number; name: string; mobile: string };
  };
  media: { id: number; mediaType: string; angle: string | null; url: string }[];
  parts: {
    id: number;
    quantity: number;
    unitPrice: string;
    amount: string;
    item: { itemCode: string; name: string; uom: string; currentStock: number };
  }[];
  labour: { id: number; description: string; technician: string | null; quantity: number; rate: string; amount: string }[];
  partsTotal: number;
  labourTotal: number;
  grandTotal: number;
  invoice: { id: number; invoiceNumber: string } | null;
}

interface ItemOption {
  id: number;
  itemCode: string;
  name: string;
  uom: string;
  currentStock: number;
}

export default function JobCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [jobCard, setJobCard] = useState<JobCardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const [discount, setDiscount] = useState("0");
  const [generatingInvoice, setGeneratingInvoice] = useState(false);

  const [editingDetails, setEditingDetails] = useState(false);
  const [km, setKm] = useState("");
  const [complaint, setComplaint] = useState("");
  const [requiredWork, setRequiredWork] = useState("");
  const [notes, setNotes] = useState("");

  const [itemQuery, setItemQuery] = useState("");
  const [itemResults, setItemResults] = useState<ItemOption[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemOption | null>(null);
  const [partQty, setPartQty] = useState("1");

  const [labourDesc, setLabourDesc] = useState("");
  const [labourTech, setLabourTech] = useState("");
  const [labourQty, setLabourQty] = useState("1");
  const [labourRate, setLabourRate] = useState("");

  const [uploadingAngle, setUploadingAngle] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const body = await apiFetch(`/job-cards/${id}`);
    setJobCard(body.jobCard);
    setKm(body.jobCard.kmAtService?.toString() ?? "");
    setComplaint(body.jobCard.complaint ?? "");
    setRequiredWork(body.jobCard.requiredWork ?? "");
    setNotes(body.jobCard.notes ?? "");
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const locked = jobCard ? LOCKED_STATUSES.includes(jobCard.status) || !!jobCard.invoice : false;

  async function handleStatusChange(status: string) {
    await apiFetch(`/job-cards/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await load();
  }

  async function handleSaveDetails(e: FormEvent) {
    e.preventDefault();
    await apiFetch(`/job-cards/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        kmAtService: km || undefined,
        complaint: complaint || undefined,
        requiredWork: requiredWork || undefined,
        notes: notes || undefined,
      }),
    });
    setEditingDetails(false);
    await load();
  }

  async function searchItems() {
    if (!itemQuery.trim()) return;
    const body = await apiFetch(`/items?q=${encodeURIComponent(itemQuery)}`);
    setItemResults(body.items);
  }

  async function handleAddPart(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    if (!selectedItem) {
      setActionError("Search and select an item first");
      return;
    }
    try {
      await apiFetch(`/job-cards/${id}/parts`, {
        method: "POST",
        body: JSON.stringify({ itemId: selectedItem.id, quantity: Number(partQty) }),
      });
      setSelectedItem(null);
      setItemQuery("");
      setPartQty("1");
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not add part");
    }
  }

  async function handleRemovePart(partId: number) {
    setActionError(null);
    try {
      await apiFetch(`/job-cards/${id}/parts/${partId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not remove part");
    }
  }

  async function handleAddLabour(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    try {
      await apiFetch(`/job-cards/${id}/labour`, {
        method: "POST",
        body: JSON.stringify({
          description: labourDesc,
          technician: labourTech || undefined,
          quantity: Number(labourQty) || 1,
          rate: Number(labourRate),
        }),
      });
      setLabourDesc("");
      setLabourTech("");
      setLabourQty("1");
      setLabourRate("");
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not add labour");
    }
  }

  async function handleRemoveLabour(labourId: number) {
    setActionError(null);
    try {
      await apiFetch(`/job-cards/${id}/labour/${labourId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not remove labour");
    }
  }

  async function handleUploadMedia(angle: string, mediaType: "PHOTO" | "VIDEO", file: File) {
    setActionError(null);
    setUploadingAngle(angle);
    try {
      const formData = new FormData();
      formData.set("mediaType", mediaType);
      formData.set("angle", angle);
      formData.set("file", file);
      await apiFetch(`/job-cards/${id}/media`, { method: "POST", body: formData });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not upload media");
    } finally {
      setUploadingAngle(null);
    }
  }

  async function handleRemoveMedia(mediaId: number) {
    await apiFetch(`/job-cards/${id}/media/${mediaId}`, { method: "DELETE" });
    await load();
  }

  async function handleGenerateInvoice(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setGeneratingInvoice(true);
    try {
      const body = await apiFetch(`/job-cards/${id}/invoice`, {
        method: "POST",
        body: JSON.stringify({ discount: Number(discount) || 0 }),
      });
      router.push(`/dashboard/invoices/${body.invoice.id}`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not generate invoice");
      setGeneratingInvoice(false);
    }
  }

  if (loading || !jobCard) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard/jobcards" className="text-sm text-gray-500 underline">
          ← All job cards
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-mono text-lg font-semibold">{jobCard.jobCardNumber}</h1>
            <p className="text-sm text-gray-600">
              {jobCard.vehicle.registrationNumber} — {jobCard.vehicle.make} {jobCard.vehicle.model} ·{" "}
              <Link
                href={`/dashboard/customers/${jobCard.vehicle.customer.id}`}
                className="underline"
              >
                {jobCard.vehicle.customer.name}
              </Link>
            </p>
          </div>
          <select
            value={jobCard.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {Object.entries(STATUS_LABELS)
              // Once invoiced, the backend refuses anything but Invoiced/Closed —
              // matching that here so the dropdown doesn't offer a choice that
              // would just come back as an error.
              .filter(([value]) => !jobCard.invoice || ["INVOICED", "CLOSED"].includes(value))
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </select>
        </div>
        {locked && (
          <p className="mt-2 text-sm text-amber-700">
            This job card is {STATUS_LABELS[jobCard.status].toLowerCase()} — parts and labour can no
            longer be changed.
          </p>
        )}
      </div>

      {actionError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      )}

      {/* Details */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">Details</h2>
          <button
            onClick={() => setEditingDetails((v) => !v)}
            className="text-sm text-gray-600 underline"
          >
            {editingDetails ? "Cancel" : "Edit"}
          </button>
        </div>
        {editingDetails ? (
          <form onSubmit={handleSaveDetails} className="max-w-lg space-y-3">
            <input
              type="number"
              placeholder="Current KM"
              value={km}
              onChange={(e) => setKm(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <textarea
              placeholder="Customer complaint"
              value={complaint}
              onChange={(e) => setComplaint(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <textarea
              placeholder="Required work"
              value={requiredWork}
              onChange={(e) => setRequiredWork(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <textarea
              placeholder="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            >
              Save
            </button>
          </form>
        ) : (
          <dl className="grid max-w-lg grid-cols-3 gap-x-4 gap-y-1 text-sm text-gray-600">
            <dt>KM</dt>
            <dd className="col-span-2">{jobCard.kmAtService ?? "-"}</dd>
            <dt>Complaint</dt>
            <dd className="col-span-2">{jobCard.complaint ?? "-"}</dd>
            <dt>Required work</dt>
            <dd className="col-span-2">{jobCard.requiredWork ?? "-"}</dd>
            <dt>Notes</dt>
            <dd className="col-span-2">{jobCard.notes ?? "-"}</dd>
          </dl>
        )}
      </div>

      {/* Inspection media */}
      <div>
        <h2 className="mb-2 text-base font-semibold">Vehicle inspection</h2>
        <div className="flex flex-wrap gap-2">
          {MEDIA_ANGLES.map((a) => (
            <label
              key={a.value}
              className="cursor-pointer rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
            >
              {uploadingAngle === a.value ? "Uploading..." : `📷 ${a.label}`}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadMedia(a.value, "PHOTO", file);
                  e.target.value = "";
                }}
              />
            </label>
          ))}
          <label className="cursor-pointer rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50">
            {uploadingAngle === "WALKAROUND" ? "Uploading..." : "🎥 360° Walk-around video"}
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUploadMedia("WALKAROUND", "VIDEO", file);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        {jobCard.media.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {jobCard.media.map((m) => (
              <div key={m.id} className="relative">
                {m.mediaType === "PHOTO" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={assetUrl(m.url)}
                    alt={m.angle ?? "photo"}
                    className="h-20 w-20 rounded object-cover"
                  />
                ) : (
                  <video src={assetUrl(m.url)} className="h-20 w-32 rounded" controls />
                )}
                <button
                  onClick={() => handleRemoveMedia(m.id)}
                  className="absolute -right-1 -top-1 rounded-full bg-white px-1 text-xs text-red-600 shadow"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Parts */}
      <div>
        <h2 className="mb-2 text-base font-semibold">Parts</h2>
        {!locked && (
          <form onSubmit={handleAddPart} className="mb-3 max-w-lg space-y-2">
            <div className="flex gap-2">
              <input
                placeholder="Search item code, name or part number"
                value={itemQuery}
                onChange={(e) => setItemQuery(e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={searchItems}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm"
              >
                Search
              </button>
            </div>
            {selectedItem ? (
              <p className="text-sm">
                Selected: <strong>{selectedItem.itemCode}</strong> — {selectedItem.name} (stock:{" "}
                {selectedItem.currentStock} {selectedItem.uom})
              </p>
            ) : (
              itemResults.length > 0 && (
                <ul className="max-h-40 overflow-y-auto rounded-md border border-gray-200 text-sm">
                  {itemResults.map((it) => (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedItem(it);
                          setItemResults([]);
                        }}
                        className="block w-full px-3 py-2 text-left hover:bg-gray-50"
                      >
                        {it.itemCode} — {it.name} (stock: {it.currentStock})
                      </button>
                    </li>
                  ))}
                </ul>
              )
            )}
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                placeholder="Qty"
                value={partQty}
                onChange={(e) => setPartQty(e.target.value)}
                className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
              >
                Add part
              </button>
            </div>
          </form>
        )}

        {jobCard.parts.length === 0 ? (
          <p className="text-sm text-gray-500">No parts added yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] border-collapse overflow-hidden rounded-md border border-gray-200 text-sm">
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Unit Price</th>
                  <th className="px-3 py-2">Amount</th>
                  {!locked && <th className="px-3 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {jobCard.parts.map((p) => (
                  <tr key={p.id} className="border-t border-gray-200">
                    <td className="px-3 py-2">
                      {p.item.itemCode} — {p.item.name}
                    </td>
                    <td className="px-3 py-2">
                      {p.quantity} {p.item.uom}
                    </td>
                    <td className="px-3 py-2">₹{p.unitPrice}</td>
                    <td className="px-3 py-2">₹{p.amount}</td>
                    {!locked && (
                      <td className="px-3 py-2">
                        <button
                          onClick={() => handleRemovePart(p.id)}
                          className="text-red-600 underline"
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Labour */}
      <div>
        <h2 className="mb-2 text-base font-semibold">Labour / Services</h2>
        {!locked && (
          <form onSubmit={handleAddLabour} className="mb-3 grid max-w-2xl grid-cols-1 gap-2 sm:grid-cols-5">
            <input
              placeholder="Description"
              required
              value={labourDesc}
              onChange={(e) => setLabourDesc(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
            />
            <input
              placeholder="Technician (optional)"
              value={labourTech}
              onChange={(e) => setLabourTech(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="number"
              min={1}
              placeholder="Qty"
              value={labourQty}
              onChange={(e) => setLabourQty(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Rate"
              required
              value={labourRate}
              onChange={(e) => setLabourRate(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white sm:col-span-5"
            >
              Add labour
            </button>
          </form>
        )}

        {jobCard.labour.length === 0 ? (
          <p className="text-sm text-gray-500">No labour entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] border-collapse overflow-hidden rounded-md border border-gray-200 text-sm">
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Technician</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Rate</th>
                  <th className="px-3 py-2">Amount</th>
                  {!locked && <th className="px-3 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {jobCard.labour.map((l) => (
                  <tr key={l.id} className="border-t border-gray-200">
                    <td className="px-3 py-2">{l.description}</td>
                    <td className="px-3 py-2">{l.technician ?? "-"}</td>
                    <td className="px-3 py-2">{l.quantity}</td>
                    <td className="px-3 py-2">₹{l.rate}</td>
                    <td className="px-3 py-2">₹{l.amount}</td>
                    {!locked && (
                      <td className="px-3 py-2">
                        <button
                          onClick={() => handleRemoveLabour(l.id)}
                          className="text-red-600 underline"
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="max-w-sm rounded-md border border-gray-200 p-4 text-sm">
        <div className="flex justify-between py-1">
          <span>Parts total</span>
          <span>₹{jobCard.partsTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between py-1">
          <span>Labour total</span>
          <span>₹{jobCard.labourTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between border-t border-gray-200 py-2 font-semibold">
          <span>Grand total</span>
          <span>₹{jobCard.grandTotal.toFixed(2)}</span>
        </div>

        <div className="mt-3 border-t border-gray-200 pt-3">
          {jobCard.invoice ? (
            <Link
              href={`/dashboard/invoices/${jobCard.invoice.id}`}
              className="text-gray-900 underline"
            >
              View invoice {jobCard.invoice.invoiceNumber}
            </Link>
          ) : jobCard.status === "COMPLETED" ? (
            <form onSubmit={handleGenerateInvoice} className="space-y-2">
              <label className="block text-xs text-gray-500">Discount (optional)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={generatingInvoice}
                className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {generatingInvoice ? "Generating..." : "Generate invoice"}
              </button>
            </form>
          ) : (
            <p className="text-xs text-gray-500">
              Mark this job card as Completed to generate an invoice.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
