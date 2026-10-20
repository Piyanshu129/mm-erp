-- No data is lost: whole-number purchase quantities convert to the same
-- decimal values.
--   * Purchase quantities can be part of a unit (2.5 L).
--   * payment_audits: every admin edit/deletion of a recorded payment, with
--     the values before and after, who and when.

-- AlterTable
ALTER TABLE "purchases" ALTER COLUMN "quantity" SET DEFAULT 1,
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "payment_audits" (
    "id" SERIAL NOT NULL,
    "payment_kind" TEXT NOT NULL,
    "payment_id" INTEGER NOT NULL,
    "invoice_id" INTEGER,
    "supplier_id" INTEGER,
    "action" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB,
    "changed_by_id" INTEGER NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_audits_payment_kind_invoice_id_idx" ON "payment_audits"("payment_kind", "invoice_id");

-- CreateIndex
CREATE INDEX "payment_audits_payment_kind_supplier_id_idx" ON "payment_audits"("payment_kind", "supplier_id");

-- AddForeignKey
ALTER TABLE "payment_audits" ADD CONSTRAINT "payment_audits_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
