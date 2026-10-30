-- Additive only — no existing data changes.
--   * GST tax invoice from an estimate: HSN/SAC and GST % per line (and
--     defaults on items), invoice number/date, supply type, customer GSTIN.
--   * Job cards: insurance company and claim number (accidental repairs).
--   * Payments (customer and supplier): settlement discount.
--   * app_settings: business details printed on GST invoices.

-- AlterTable
ALTER TABLE "estimate_lines" ADD COLUMN     "gst_rate" DECIMAL(5,2),
ADD COLUMN     "hsn_code" TEXT;

-- AlterTable
ALTER TABLE "estimates" ADD COLUMN     "customer_gstin" TEXT,
ADD COLUMN     "gst_invoice_date" TIMESTAMP(3),
ADD COLUMN     "gst_invoice_number" TEXT,
ADD COLUMN     "prices_include_gst" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "supply_type" TEXT NOT NULL DEFAULT 'INTRA';

-- AlterTable
ALTER TABLE "invoice_payments" ADD COLUMN     "discount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "gst_rate" DECIMAL(5,2),
ADD COLUMN     "hsn_code" TEXT;

-- AlterTable
ALTER TABLE "job_cards" ADD COLUMN     "claim_number" TEXT,
ADD COLUMN     "insurance_company" TEXT;

-- AlterTable
ALTER TABLE "supplier_payments" ADD COLUMN     "discount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "estimates_gst_invoice_number_key" ON "estimates"("gst_invoice_number");

