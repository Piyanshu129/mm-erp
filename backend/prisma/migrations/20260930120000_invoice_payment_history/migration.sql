-- Customer payments on invoices move from a single "last payment" snapshot
-- on the invoice to their own table, one row per payment, so the history is
-- kept. invoices.payment_amount stays as the running total. Existing
-- payments are copied across BEFORE the old columns are dropped; each
-- invoice only ever stored its accumulated total and last payment's
-- details, so it becomes a single payment row dated at that last payment.

-- CreateTable
CREATE TABLE "invoice_payments" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_mode" TEXT,
    "reference" TEXT,
    "received_by" TEXT,
    "notes" TEXT,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_payments_invoice_id_idx" ON "invoice_payments"("invoice_id");

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Carry existing invoice payments across
INSERT INTO "invoice_payments" ("invoice_id", "amount", "payment_date", "payment_mode", "reference", "received_by", "notes", "created_by_id", "created_at")
SELECT
    "id",
    "payment_amount",
    COALESCE("payment_date", "invoice_date"),
    "payment_mode",
    "payment_reference",
    "payment_received_by",
    'Recorded before payment history was kept',
    "created_by_id",
    COALESCE("payment_date", "created_at")
FROM "invoices"
WHERE "payment_amount" > 0
ORDER BY COALESCE("payment_date", "invoice_date"), "id";

-- AlterTable
ALTER TABLE "invoices" DROP COLUMN "payment_date",
DROP COLUMN "payment_mode",
DROP COLUMN "payment_received_by",
DROP COLUMN "payment_reference";
