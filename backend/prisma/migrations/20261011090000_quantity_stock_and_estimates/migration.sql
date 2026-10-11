-- Inventory moves from one record per physical piece (item_units) to a
-- quantity per item: a purchase adds to the item's stock, a job card part
-- takes a quantity out. Existing data is converted, not lost:
--   * every job card part becomes quantity 1 at the price it was issued at;
--   * every past inventory purchase gets its sticker range, numbered per
--     item in purchase order (10 of item 1 then 5 more → 1.1–1.10, 1.11–1.15);
--   * item codes become 4-digit numbers (ITM-000001 → 0001).
-- Also adds customer estimates (estimates + estimate_lines).

-- Job card parts: quantity and rate, filled from the existing per-piece rows
ALTER TABLE "job_card_parts" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "rate" DECIMAL(12,2);
UPDATE "job_card_parts" SET "rate" = "amount";
ALTER TABLE "job_card_parts" ALTER COLUMN "rate" SET NOT NULL;

-- Purchases: sticker ranges, numbered per item in purchase order
ALTER TABLE "purchases" ADD COLUMN "sticker_from" INTEGER,
ADD COLUMN "sticker_to" INTEGER;
UPDATE "purchases" AS p
SET "sticker_to" = s.running_total,
    "sticker_from" = s.running_total - p."quantity" + 1
FROM (
    SELECT "id", SUM("quantity") OVER (PARTITION BY "item_id" ORDER BY "id") AS running_total
    FROM "purchases"
    WHERE "item_id" IS NOT NULL
) AS s
WHERE p."id" = s."id";

-- Item codes: 0001, 0002, ...
UPDATE "items" SET "item_code" = LPAD("id"::text, 4, '0');

-- The per-piece table is no longer used
ALTER TABLE "job_card_parts" DROP CONSTRAINT "job_card_parts_item_unit_id_fkey";
DROP INDEX "job_card_parts_item_unit_id_key";
ALTER TABLE "job_card_parts" DROP COLUMN "item_unit_id";
ALTER TABLE "item_units" DROP CONSTRAINT "item_units_item_id_fkey";
ALTER TABLE "item_units" DROP CONSTRAINT "item_units_purchase_id_fkey";
DROP TABLE "item_units";

-- CreateTable
CREATE TABLE "estimates" (
    "id" SERIAL NOT NULL,
    "estimate_number" TEXT NOT NULL,
    "job_card_id" INTEGER NOT NULL,
    "estimate_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tax_rate" DECIMAL(5,2),
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approval_photo_url" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_lines" (
    "id" SERIAL NOT NULL,
    "estimate_id" INTEGER NOT NULL,
    "line_type" TEXT NOT NULL,
    "item_id" INTEGER,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "rate" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "estimates_estimate_number_key" ON "estimates"("estimate_number");

-- CreateIndex
CREATE UNIQUE INDEX "estimates_job_card_id_key" ON "estimates"("job_card_id");

-- CreateIndex
CREATE INDEX "estimate_lines_estimate_id_idx" ON "estimate_lines"("estimate_id");

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_job_card_id_fkey" FOREIGN KEY ("job_card_id") REFERENCES "job_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
