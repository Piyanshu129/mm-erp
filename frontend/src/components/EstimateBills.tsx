"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { hasPermission } from "@/lib/permissions";
import { paymentReminder } from "@/lib/whatsappMessages";
import { formatINR } from "@/lib/format";
import { Card, CardBody } from "@/components/ui/Card";
import { PaymentStatusBadge } from "@/components/ui/Badge";
import { WhatsAppMessage } from "@/components/WhatsAppMessage";
import { PaymentChangeLog } from "@/components/PaymentChangeLog";
import {
  InvoiceAccountSummary,
  InvoicePaymentHistory,
  InvoicePaymentRow,
  RecordInvoicePaymentForm,
} from "@/components/InvoiceAccountPanel";

export interface Bill {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  payer: "CUSTOMER" | "INSURANCE";
  partsTotal: string;
  labourTotal: string;
  discount: string;
  totalAmount: string;
  paymentAmount: string;
  payments: InvoicePaymentRow[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// The money side of a closed job card's estimate: the customer's bill and,
// on an accidental claim, the insurance company's — each with its total,
// payments taken against it, and what's still due.
export function EstimateBills({
  bills,
  estimateNumber,
  insuranceCompany,
  customer,
  vehicle,
  onChanged,
}: {
  bills: Bill[];
  estimateNumber: string;
  insuranceCompany: string | null | undefined;
  customer: { name: string; mobile: string };
  vehicle: { registrationNumber: string; make: string; model: string };
  onChanged: () => Promise<void>;
}) {
  const { user } = useAuth();
  // Recording a payment needs one of these (as on the server).
  const canPay = (["INVOICES", "CUSTOMERS", "VEHICLES"] as const).some((p) => hasPermission(user, p));
  const canSeeLog = hasPermission(user, "INVOICES");
  // Remounts a bill's payment form after a save so it starts from the new due.
  const [formKeys, setFormKeys] = useState<Record<number, number>>({});

  return (
    <>
      {bills.map((bill) => {
        const total = Number(bill.totalAmount);
        const paid = Number(bill.paymentAmount);
        const due = r2(total - paid);
        const insurer = bill.payer === "INSURANCE";
        const label = insurer ? `${estimateNumber} (Insurance)` : estimateNumber;
        return (
          <Card key={bill.id} className="print:hidden">
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">
                  {insurer ? `Insurance company's bill${insuranceCompany ? ` — ${insuranceCompany}` : ""}` : "Customer's bill & payments"}
                </p>
                <PaymentStatusBadge total={total} paid={paid} />
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:max-w-md">
                <span className="text-gray-500">Parts</span>
                <span className="text-right">{formatINR(bill.partsTotal)}</span>
                <span className="text-gray-500">Labour / service</span>
                <span className="text-right">{formatINR(bill.labourTotal)}</span>
                {Number(bill.discount) > 0 && (
                  <>
                    <span className="text-gray-500">Discount</span>
                    <span className="text-right">− {formatINR(bill.discount)}</span>
                  </>
                )}
              </div>
              <InvoiceAccountSummary account={{ invoiceCount: 1, totalInvoiced: total, totalPaid: paid, balanceDue: due }} />
              {canPay && (
                <RecordInvoicePaymentForm
                  key={formKeys[bill.id] ?? 0}
                  invoices={[{ id: bill.id, invoiceNumber: label, due }]}
                  onSaved={async () => {
                    await onChanged();
                    setFormKeys((k) => ({ ...k, [bill.id]: (k[bill.id] ?? 0) + 1 }));
                  }}
                />
              )}
              <div>
                <p className="mb-2 text-sm font-semibold text-gray-900">Payment history</p>
                <InvoicePaymentHistory payments={bill.payments} onChanged={onChanged} />
              </div>
              {canSeeLog && (
                <PaymentChangeLog
                  url={`/invoices/${bill.id}/payment-audits`}
                  refreshKey={`${bill.paymentAmount}:${bill.totalAmount}:${bill.payments.length}`}
                />
              )}
              {!insurer && due > 0.005 && (
                <WhatsAppMessage
                  title="Payment reminder (WhatsApp)"
                  mobile={customer.mobile}
                  message={paymentReminder({
                    customerName: customer.name,
                    registrationNumber: vehicle.registrationNumber,
                    vehicle: `${vehicle.make} ${vehicle.model}`.trim(),
                    invoiceNumber: label,
                    invoiceDate: bill.invoiceDate,
                    total,
                    paid,
                    due,
                  })}
                />
              )}
            </CardBody>
          </Card>
        );
      })}
    </>
  );
}
