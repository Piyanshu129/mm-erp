"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useEffect, useState } from "react";
import { Plus, Truck, IndianRupee, History, X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatINR, todayISO } from "@/lib/format";
import { AuthedImage } from "@/components/AuthedMedia";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Select, Label, Textarea } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { ActiveBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface SupplierAccount {
  totalPurchased: number;
  totalPaid: number;
  balanceDue: number;
}

interface SupplierRow {
  id: number;
  name: string;
  mobile: string | null;
  address: string | null;
  isActive: boolean;
  account: SupplierAccount;
}

interface SupplierPayment {
  id: number;
  amount: string;
  paymentDate: string;
  paymentMode: string | null;
  reference: string | null;
  paidBy: string | null;
  proofUrl: string | null;
  notes: string | null;
  createdBy: { name: string };
}

const PAYMENT_MODES = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"];

const FILE_INPUT_CLASS =
  "block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200";

function modeLabel(mode: string | null): string {
  return mode ? mode.replace("_", " ") : "-";
}

// Labelled form field — the label sits above the box as its heading.
function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function AccountSummary({ account }: { account: SupplierAccount }) {
  return (
    <div className="grid grid-cols-3 gap-3 text-center">
      <div className="rounded-md bg-gray-50 px-2 py-2">
        <p className="text-xs text-gray-500">Purchased</p>
        <p className="text-sm font-semibold text-gray-900">{formatINR(account.totalPurchased)}</p>
      </div>
      <div className="rounded-md bg-green-50 px-2 py-2">
        <p className="text-xs text-green-700">Paid</p>
        <p className="text-sm font-semibold text-green-800">{formatINR(account.totalPaid)}</p>
      </div>
      <div className={`rounded-md px-2 py-2 ${account.balanceDue > 0 ? "bg-red-50" : "bg-gray-50"}`}>
        <p className={`text-xs ${account.balanceDue > 0 ? "text-red-700" : "text-gray-500"}`}>Balance due</p>
        <p className={`text-sm font-semibold ${account.balanceDue > 0 ? "text-red-800" : "text-gray-900"}`}>
          {formatINR(account.balanceDue)}
        </p>
      </div>
    </div>
  );
}

function RecordPaymentCard({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: SupplierRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentMode, setPaymentMode] = useState("");
  const [reference, setReference] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [notes, setNotes] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!proof) {
      setProofPreview(null);
      return;
    }
    const url = URL.createObjectURL(proof);
    setProofPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [proof]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!(value > 0)) {
      setError("Enter the amount being paid");
      return;
    }
    if (value > supplier.account.balanceDue) {
      setError(`That's more than the balance due (${formatINR(supplier.account.balanceDue)})`);
      return;
    }

    const formData = new FormData();
    formData.set("amount", String(value));
    formData.set("paymentDate", paymentDate);
    if (paymentMode) formData.set("paymentMode", paymentMode);
    if (reference.trim()) formData.set("reference", reference.trim());
    if (paidBy.trim()) formData.set("paidBy", paidBy.trim());
    if (notes.trim()) formData.set("notes", notes.trim());
    if (proof) formData.set("proof", proof);

    setSubmitting(true);
    try {
      await apiFetch(`/suppliers/${supplier.id}/payments`, { method: "POST", body: formData });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record payment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-base font-semibold text-gray-900">Record payment — {supplier.name}</p>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <AccountSummary account={supplier.account} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Amount paid now (₹)" hint={`Balance due: ${formatINR(supplier.account.balanceDue)}`}>
              <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Payment date">
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </Field>
            <Field label="Payment mode">
              <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                <option value="">Select...</option>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {modeLabel(m)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reference / transaction ID">
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
            <Field label="Paid by">
              <Input value={paidBy} onChange={(e) => setPaidBy(e.target.value)} />
            </Field>
            <Field label="Photo of transaction (optional)" hint="Screenshot or photo of the receipt — JPEG, PNG or WEBP, up to 5MB">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setProof(e.target.files?.[0] ?? null)}
                className={FILE_INPUT_CLASS}
              />
            </Field>
            {proofPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={proofPreview} alt="Transaction photo preview" className="h-32 w-auto rounded-md border border-gray-200 object-contain sm:col-start-2" />
            )}
            <Field label="Notes (optional)" className="sm:col-span-2">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save payment"}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function PaymentHistoryCard({ supplierId, onClose }: { supplierId: number; onClose: () => void }) {
  const [supplier, setSupplier] = useState<SupplierRow | null>(null);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomedProof, setZoomedProof] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch(`/suppliers/${supplierId}/payments`)
      .then((body) => {
        setSupplier(body.supplier);
        setPayments(body.payments);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load payment history"))
      .finally(() => setLoading(false));
  }, [supplierId]);

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-semibold text-gray-900">Payment history{supplier ? ` — ${supplier.name}` : ""}</p>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <TableSkeleton cols={7} />
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <>
            {supplier && <AccountSummary account={supplier.account} />}
            {payments.length === 0 ? (
              <p className="text-sm text-gray-500">No payments recorded for this supplier yet.</p>
            ) : (
              <Table minWidth={760}>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Mode</Th>
                    <Th>Reference</Th>
                    <Th>Paid by</Th>
                    <Th>Photo</Th>
                    <Th>Notes</Th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <Tr key={p.id}>
                      <Td className="whitespace-nowrap">{new Date(p.paymentDate).toLocaleDateString()}</Td>
                      <Td className="text-right font-medium text-gray-900">{formatINR(p.amount)}</Td>
                      <Td>{modeLabel(p.paymentMode)}</Td>
                      <Td>{p.reference ?? "-"}</Td>
                      <Td>{p.paidBy ?? "-"}</Td>
                      <Td>
                        {p.proofUrl ? (
                          <button type="button" onClick={() => setZoomedProof(p.proofUrl)} aria-label="View transaction photo">
                            <AuthedImage src={p.proofUrl} alt="Transaction photo" className="h-10 w-10 rounded border border-gray-200 object-cover" />
                          </button>
                        ) : (
                          "-"
                        )}
                      </Td>
                      <Td className="text-xs text-gray-500">
                        {p.notes ?? ""}
                        <span className="block text-gray-400">Entered by {p.createdBy.name}</span>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </>
        )}
      </CardBody>

      {zoomedProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setZoomedProof(null)}>
          <AuthedImage src={zoomedProof} alt="Transaction photo" className="max-h-[85vh] max-w-full rounded-md bg-white object-contain" />
        </div>
      )}
    </Card>
  );
}

function SuppliersPageContent() {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Only one panel open at a time: a payment form or a payment history.
  const [panel, setPanel] = useState<{ kind: "pay" | "history"; supplierId: number } | null>(null);

  async function load() {
    setLoading(true);
    const body = await apiFetch("/suppliers?pageSize=100");
    setSuppliers(body.suppliers);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiFetch("/suppliers", {
        method: "POST",
        body: JSON.stringify({ name, mobile: mobile || undefined, address: address || undefined }),
      });
      setName("");
      setMobile("");
      setAddress("");
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create supplier");
    } finally {
      setSubmitting(false);
    }
  }

  const panelSupplier = panel ? suppliers.find((s) => s.id === panel.supplierId) : undefined;
  const totals = suppliers.reduce(
    (acc, s) => ({
      totalPurchased: acc.totalPurchased + s.account.totalPurchased,
      totalPaid: acc.totalPaid + s.account.totalPaid,
      balanceDue: acc.balanceDue + s.account.balanceDue,
    }),
    { totalPurchased: 0, totalPaid: 0, balanceDue: 0 }
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Vendors you buy parts from, what you've bought from each, and what you've paid them."
        action={
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4" /> New supplier
          </Button>
        }
      />

      {showForm && (
        <Card className="max-w-md">
          <CardBody>
            <form onSubmit={handleCreate} className="space-y-3">
              <Field label="Supplier name">
                <Input required value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Mobile (optional)">
                <Input value={mobile} onChange={(e) => setMobile(e.target.value)} />
              </Field>
              <Field label="Address (optional)">
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              </Field>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save supplier"}
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      {panel?.kind === "pay" && panelSupplier && (
        <RecordPaymentCard
          key={panelSupplier.id}
          supplier={panelSupplier}
          onClose={() => setPanel(null)}
          onSaved={async () => {
            // Show the history straight away so the new payment is visible.
            setPanel({ kind: "history", supplierId: panelSupplier.id });
            await load();
          }}
        />
      )}
      {panel?.kind === "history" && (
        <PaymentHistoryCard key={panel.supplierId} supplierId={panel.supplierId} onClose={() => setPanel(null)} />
      )}

      {loading ? (
        <TableSkeleton cols={7} />
      ) : suppliers.length === 0 ? (
        <EmptyState icon={Truck} title="No suppliers yet" description="Add your first supplier above." />
      ) : (
        <>
          <AccountSummary account={totals} />
          <Table minWidth={900}>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Mobile</Th>
                <Th className="text-right">Purchased</Th>
                <Th className="text-right">Paid</Th>
                <Th className="text-right">Balance due</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <Tr key={s.id}>
                  <Td className="font-medium text-gray-900">
                    {s.name}
                    {s.address && <span className="block text-xs font-normal text-gray-500">{s.address}</span>}
                  </Td>
                  <Td>{s.mobile ?? "-"}</Td>
                  <Td className="text-right">{formatINR(s.account.totalPurchased)}</Td>
                  <Td className="text-right text-green-700">{formatINR(s.account.totalPaid)}</Td>
                  <Td className={`text-right font-medium ${s.account.balanceDue > 0 ? "text-red-700" : "text-gray-900"}`}>
                    {formatINR(s.account.balanceDue)}
                  </Td>
                  <Td>
                    <ActiveBadge isActive={s.isActive} />
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-3 whitespace-nowrap">
                      <button
                        onClick={() => setPanel({ kind: "pay", supplierId: s.id })}
                        disabled={s.account.balanceDue <= 0}
                        title={s.account.balanceDue <= 0 ? "Nothing due to this supplier" : undefined}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
                      >
                        <IndianRupee className="h-3 w-3" /> Pay
                      </button>
                      <button
                        onClick={() => setPanel({ kind: "history", supplierId: s.id })}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <History className="h-3 w-3" /> Payment history
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}

export default function SuppliersPage() {
  return (
    <RequireAuth permission="SUPPLIERS">
      <SuppliersPageContent />
    </RequireAuth>
  );
}
