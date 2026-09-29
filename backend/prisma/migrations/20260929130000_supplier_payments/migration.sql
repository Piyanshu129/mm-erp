-- Supplier payments move from a per-purchase snapshot (purchases.payment_*)
-- to their own table, one row per payment, against the supplier's running
-- account. Existing purchase payments are copied across BEFORE the old
-- columns are dropped, so no paid amount is lost. Each purchase only ever
-- stored its accumulated total and last payment details, so it becomes a
-- single payment row dated at its last payment date.

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" SERIAL NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_mode" TEXT,
    "reference" TEXT,
    "paid_by" TEXT,
    "proof_url" TEXT,
    "notes" TEXT,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Carry existing purchase payments across
INSERT INTO "supplier_payments" ("supplier_id", "amount", "payment_date", "payment_mode", "reference", "paid_by", "notes", "created_by_id", "created_at")
SELECT
    "supplier_id",
    "payment_amount",
    COALESCE("payment_date", "purchase_date"),
    "payment_mode",
    "payment_reference",
    "payment_by",
    'Recorded against purchase #' || "id" || ' before supplier-level payments',
    "created_by_id",
    COALESCE("payment_date", "created_at")
FROM "purchases"
WHERE "payment_amount" > 0
ORDER BY COALESCE("payment_date", "purchase_date"), "id";

-- AlterTable
ALTER TABLE "purchases" DROP COLUMN "payment_amount",
DROP COLUMN "payment_by",
DROP COLUMN "payment_date",
DROP COLUMN "payment_mode",
DROP COLUMN "payment_reference";
