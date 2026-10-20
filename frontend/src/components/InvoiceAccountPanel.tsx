"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X, IndianRupee, History } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatINR, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Input, Select, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { PaymentStatusBadge } from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/Skeleton";

export interface InvoiceAccount {
  invoiceCount: number;
  totalInvoiced: number;
  totalPaid: number;
  balanceDue: number;
}

interface AccountInvoice {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: string;
  paymentAmount: string;
  due: number;
  jobCard: { jobCardNumber: string; vehicle: { registrationNumber: string } };
}

export interface InvoicePaymentRow {
  id: number;
  invoiceId: number;
  amount: string;
  paymentDate: string;
  paymentMode: string | null;
  reference: string | null;
  receivedBy: string | null;
  notes: string | null;
  createdBy: { name: string };
  invoice?: { id: number; invoiceNumber: string; jobCard: { vehicle: { registrationNumber: string } } };
}

export const PAYMENT_MODES = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"];

export function modeLabel(mode: string | null): string {
  return mode ? mode.replace("_", " ") : "-";
}

// Invoiced / Paid / Balance due tiles.
export function InvoiceAccountSummary({ account }: { account: InvoiceAccount }) {
  const due = account.balanceDue > 0;
  return (
    <div className="grid grid-cols-3 gap-3 text-center">
      <div className="rounded-md bg-gray-50 px-2 py-2">
        <p className="text-xs text-gray-500">Invoiced ({account.invoiceCount})</p>
        <p className="text-sm font-semibold text-gray-900">{formatINR(account.totalInvoiced)}</p>
      </div>
      <div className="rounded-md bg-green-50 px-2 py-2">
        <p className="text-xs text-green-700">Paid</p>
        <p className="text-sm font-semibold text-green-800">{formatINR(account.totalPaid)}</p>
      </div>
      <div className={`rounded-md px-2 py-2 ${due ? "bg-red-50" : "bg-gray-50"}`}>
        <p className={`text-xs ${due ? "text-red-700" : "text-gray-500"}`}>Balance due</p>
        <p className={`text-sm font-semibold ${due ? "text-red-800" : "text-gray-900"}`}>{formatINR(account.balanceDue)}</p>
      </div>
    </div>
  );
}

// The Invoiced / Paid / Due cells of a Customers or Vehicles list row.
export function InvoiceAccountCells({ account }: { account: InvoiceAccount }) {
  return (
    <>
      <Td className="text-right">{formatINR(account.totalInvoiced)}</Td>
      <Td className="text-right text-green-700">{formatINR(account.totalPaid)}</Td>
      <Td className={`text-right font-medium ${account.balanceDue > 0 ? "text-red-700" : "text-gray-900"}`}>
        {formatINR(account.balanceDue)}
      </Td>
    </>
  );
}

// The Pay / Payment history buttons of a Customers or Vehicles list row.
export function InvoiceAccountActions({
  account,
  onPay,
  onHistory,
}: {
  account: InvoiceAccount;
  onPay: () => void;
  onHistory: () => void;
}) {
  return (
    <div className="flex justify-end gap-3 whitespace-nowrap">
      <button
        type="button"
        onClick={onPay}
        disabled={account.balanceDue <= 0}
        title={account.balanceDue <= 0 ? "Nothing due" : undefined}
        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
      >
        <IndianRupee className="h-3 w-3" /> Pay
      </button>
      <button
        type="button"
        onClick={onHistory}
        disabled={account.invoiceCount === 0}
        title={account.invoiceCount === 0 ? "No invoices yet" : undefined}
        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
      >
        <History className="h-3 w-3" /> Payment history
      </button>
    </div>
  );
}

// Payment history table — shared by the invoice page and the account panel.
// showInvoice adds which invoice each payment was against (for a customer
// or vehicle with several invoices).
// Admin-only (the server enforces it): correct or remove a recorded payment.
function EditPaymentRow({
  payment,
  colSpan,
  onDone,
}: {
  payment: InvoicePaymentRow;
  colSpan: number;
  onDone: (changed: boolean) => void;
}) {
  const [amount, setAmount] = useState(String(Number(payment.amount)));
  const [date, setDate] = useState(payment.paymentDate.slice(0, 10));
  const [mode, setMode] = useState(payment.paymentMode ?? "CASH");
  const [reference, setReference] = useState(payment.reference ?? "");
  const [receivedBy, setReceivedBy] = useState(payment.receivedBy ?? "");
  const [notes, setNotes] = useState(payment.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!(Number(amount) > 0)) return setError("Amount must be more than 0");
    setSaving(true);
    try {
      await apiFetch(`/invoices/${payment.invoiceId}/payments/${payment.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          amount: Number(amount),
          paymentDate: date,
          paymentMode: mode,
          reference: reference.trim() || undefined,
          receivedBy: receivedBy.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      onDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the payment");
      setSaving(false);
    }
  }

  return (
    <tr>
      <td colSpan={colSpan} className="border-t border-gray-100 bg-blue-50 px-4 py-3">
        <form onSubmit={save} className="grid grid-cols-2 gap-2 sm:grid-cols-6 sm:items-end">
          <div>
            <Label>Amount</Label>
            <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Mode</Label>
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {modeLabel(m)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div>
            <Label>Received by</Label>
            <Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="col-span-2 text-sm text-red-600 sm:col-span-6">{error}</p>}
          <div className="col-span-2 flex gap-2 sm:col-span-6">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving..." : "Save payment"}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => onDone(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </td>
    </tr>
  );
}

export function InvoicePaymentHistory({
  payments,
  showInvoice,
  onChanged,
}: {
  payments: InvoicePaymentRow[];
  showInvoice?: boolean;
  // Given → admins get Edit / Delete on each payment; called after a change.
  onChanged?: () => void | Promise<void>;
}) {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN" && !!onChanged;
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(p: InvoicePaymentRow) {
    if (!window.confirm(`Delete the ${formatINR(p.amount)} payment of ${new Date(p.paymentDate).toLocaleDateString()}? The amount due goes back up.`)) return;
    setError(null);
    try {
      await apiFetch(`/invoices/${p.invoiceId}/payments/${p.id}`, { method: "DELETE" });
      await onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the payment");
    }
  }

  if (payments.length === 0) {
    return <p className="text-sm text-gray-500">No payments recorded yet.</p>;
  }
  const colSpan = (showInvoice ? 7 : 6) + (canEdit ? 1 : 0);
  return (
    <>
      {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <Table minWidth={showInvoice ? 820 : 680}>
        <thead>
          <tr>
            <Th>Date</Th>
            {showInvoice && <Th>Draft Invoice</Th>}
            <Th className="text-right">Amount</Th>
            <Th>Mode</Th>
            <Th>Reference</Th>
            <Th>Received by</Th>
            <Th>Notes</Th>
            {canEdit && <Th></Th>}
          </tr>
        </thead>
        <tbody>
          {payments.map((p) =>
            editingId === p.id ? (
              <EditPaymentRow
                key={p.id}
                payment={p}
                colSpan={colSpan}
                onDone={async (changed) => {
                  setEditingId(null);
                  if (changed) await onChanged?.();
                }}
              />
            ) : (
              <Tr key={p.id}>
                <Td className="whitespace-nowrap">{new Date(p.paymentDate).toLocaleDateString()}</Td>
                {showInvoice && (
                  <Td className="whitespace-nowrap">
                    {p.invoice ? (
                      <Link href={`/dashboard/invoices/${p.invoice.id}`} className="font-mono text-blue-600 hover:underline">
                        {p.invoice.invoiceNumber}
                      </Link>
                    ) : (
                      "-"
                    )}
                    {p.invoice && <span className="block text-xs text-gray-500">{p.invoice.jobCard.vehicle.registrationNumber}</span>}
                  </Td>
                )}
                <Td className="text-right font-medium text-gray-900">{formatINR(p.amount)}</Td>
                <Td>{modeLabel(p.paymentMode)}</Td>
                <Td>{p.reference ?? "-"}</Td>
                <Td>{p.receivedBy ?? "-"}</Td>
                <Td className="text-xs text-gray-500">
                  {p.notes ?? ""}
                  <span className="block text-gray-400">Entered by {p.createdBy.name}</span>
                </Td>
                {canEdit && (
                  <Td className="whitespace-nowrap">
                    <button type="button" onClick={() => setEditingId(p.id)} className="mr-3 text-xs font-medium text-blue-600 hover:underline">
                      Edit
                    </button>
                    <button type="button" onClick={() => remove(p)} className="text-xs font-medium text-red-600 hover:underline">
                      Delete
                    </button>
                  </Td>
                )}
              </Tr>
            )
          )}
        </tbody>
      </Table>
    </>
  );
}

// Record one payment against a chosen invoice. Used on the invoice page
// (one invoice) and in the account panel (a choice of unpaid invoices).
export function RecordInvoicePaymentForm({
  invoices,
  onSaved,
  autoFocus,
}: {
  invoices: { id: number; invoiceNumber: string; due: number; label?: string }[];
  onSaved: () => void | Promise<void>;
  autoFocus?: boolean;
}) {
  const unpaid = invoices.filter((i) => i.due > 0);
  const [invoiceId, setInvoiceId] = useState<number | null>(unpaid[0]?.id ?? null);
  const selected = unpaid.find((i) => i.id === invoiceId) ?? null;
  const [amount, setAmount] = useState(selected ? String(selected.due) : "");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentMode, setPaymentMode] = useState("");
  const [reference, setReference] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) amountRef.current?.focus();
  }, [autoFocus]);

  if (unpaid.length === 0) {
    return <p className="text-sm text-green-700">Everything is paid — nothing due.</p>;
  }

  function choose(id: number) {
    setInvoiceId(id);
    const inv = unpaid.find((i) => i.id === id);
    setAmount(inv ? String(inv.due) : "");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selected) {
      setError("Choose the draft invoice this payment is for");
      return;
    }
    const value = Number(amount);
    if (!(value > 0)) {
      setError("Enter the amount being paid");
      return;
    }
    if (value > selected.due) {
      setError(`That's more than is due on ${selected.invoiceNumber} (${formatINR(selected.due)})`);
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/invoices/${selected.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: value,
          paymentDate,
          paymentMode: paymentMode || undefined,
          reference: reference.trim() || undefined,
          receivedBy: receivedBy.trim() || undefined,
        }),
      });
      setReference("");
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record payment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {unpaid.length > 1 || invoices.length > 1 ? (
        <div className="sm:col-span-2">
          <Label>Draft invoice</Label>
          <Select value={invoiceId ?? ""} onChange={(e) => choose(Number(e.target.value))}>
            {unpaid.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label ?? i.invoiceNumber} — {formatINR(i.due)} due
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <div>
        <Label>Amount received now (₹)</Label>
        <Input ref={amountRef} type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        {selected && <p className="mt-1 text-xs text-gray-500">Due on {selected.invoiceNumber}: {formatINR(selected.due)}</p>}
      </div>
      <div>
        <Label>Payment date</Label>
        <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
      </div>
      <div>
        <Label>Payment mode</Label>
        <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
          <option value="">Select...</option>
          {PAYMENT_MODES.map((m) => (
            <option key={m} value={m}>
              {modeLabel(m)}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Reference / transaction ID</Label>
        <Input value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
      <div>
        <Label>Received by</Label>
        <Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : "Save payment"}
        </Button>
      </div>
    </form>
  );
}

// Everything about one customer's or one vehicle's invoices in one card:
// the totals, taking a payment, every invoice, and the payment history.
export function InvoiceAccountPanel({
  accountUrl,
  title,
  focusPay,
  onClose,
  onChanged,
}: {
  accountUrl: string;
  title: string;
  focusPay?: boolean;
  onClose?: () => void;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<{
    account: InvoiceAccount;
    invoices: AccountInvoice[];
    payments: InvoicePaymentRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Remounts the payment form after a save so it resets to the next unpaid invoice.
  const [formKey, setFormKey] = useState(0);

  async function load() {
    try {
      setData(await apiFetch(accountUrl));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the account");
    }
  }

  useEffect(() => {
    setData(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountUrl]);

  return (
    <Card>
      <CardBody className="space-y-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-semibold text-gray-900">{title}</p>
          {onClose && (
            <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !data ? (
          <TableSkeleton cols={5} />
        ) : (
          <>
            <InvoiceAccountSummary account={data.account} />

            {data.invoices.length === 0 ? (
              <p className="text-sm text-gray-500">No draft invoices yet.</p>
            ) : (
              <>
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-900">Record a payment</p>
                  <RecordInvoicePaymentForm
                    key={formKey}
                    autoFocus={focusPay}
                    invoices={data.invoices.map((i) => ({
                      id: i.id,
                      invoiceNumber: i.invoiceNumber,
                      due: i.due,
                      label: `${i.invoiceNumber} · ${i.jobCard.vehicle.registrationNumber} · ${new Date(i.invoiceDate).toLocaleDateString()}`,
                    }))}
                    onSaved={async () => {
                      await load();
                      setFormKey((k) => k + 1);
                      onChanged?.();
                    }}
                  />
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-900">Draft invoices</p>
                  <Table minWidth={620}>
                    <thead>
                      <tr>
                        <Th>Draft Invoice</Th>
                        <Th>Date</Th>
                        <Th>Vehicle</Th>
                        <Th className="text-right">Total</Th>
                        <Th className="text-right">Paid</Th>
                        <Th className="text-right">Due</Th>
                        <Th>Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.invoices.map((i) => (
                        <Tr key={i.id}>
                          <Td>
                            <Link href={`/dashboard/invoices/${i.id}`} className="font-mono text-blue-600 hover:underline">
                              {i.invoiceNumber}
                            </Link>
                          </Td>
                          <Td className="whitespace-nowrap">{new Date(i.invoiceDate).toLocaleDateString()}</Td>
                          <Td>{i.jobCard.vehicle.registrationNumber}</Td>
                          <Td className="text-right">{formatINR(i.totalAmount)}</Td>
                          <Td className="text-right text-green-700">{formatINR(i.paymentAmount)}</Td>
                          <Td className={`text-right font-medium ${i.due > 0 ? "text-red-700" : "text-gray-900"}`}>{formatINR(i.due)}</Td>
                          <Td>
                            <PaymentStatusBadge total={Number(i.totalAmount)} paid={Number(i.paymentAmount)} />
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-900">Payment history</p>
                  <InvoicePaymentHistory payments={data.payments} showInvoice onChanged={load} />
                </div>
              </>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
