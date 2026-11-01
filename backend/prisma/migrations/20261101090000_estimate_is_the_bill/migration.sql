-- Closing a job card makes its estimate the bill (no separate draft invoice):
--   * invoices: one per payer (CUSTOMER, and INSURANCE on an accidental claim)
--     instead of one per job card.
--   * estimate_lines: who pays for the line, and which job card part /
--     labour line it was copied from.
--   * estimates: the insurance company's GST invoice and GSTIN.
--   * job_cards: vehicle trial sign-off and gate pass.
-- Data: every job card that already has a draft invoice gets an estimate
-- matching it (its parts and labour), unless a GST invoice was already made
-- from the estimate. Existing invoices are the customer's. Amounts, numbers
-- and payments don't change.

-- AlterTable
ALTER TABLE "estimate_lines" ADD COLUMN     "job_card_labour_id" INTEGER,
ADD COLUMN     "job_card_part_id" INTEGER,
ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'CUSTOMER';

-- AlterTable
ALTER TABLE "estimates" ADD COLUMN     "insurance_gst_invoice_date" TIMESTAMP(3),
ADD COLUMN     "insurance_gst_invoice_number" TEXT,
ADD COLUMN     "insurance_gstin" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "payer" TEXT NOT NULL DEFAULT 'CUSTOMER';

-- AlterTable
ALTER TABLE "job_cards" ADD COLUMN     "gate_pass_at" TIMESTAMP(3),
ADD COLUMN     "gate_pass_photo_url" TEXT,
ADD COLUMN     "trial_at" TIMESTAMP(3),
ADD COLUMN     "trial_by" TEXT,
ADD COLUMN     "trial_photo_url" TEXT,
ADD COLUMN     "trial_remarks" TEXT;

-- DropIndex
DROP INDEX "invoices_job_card_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "invoices_job_card_id_payer_key" ON "invoices"("job_card_id", "payer");

-- CreateIndex
CREATE UNIQUE INDEX "estimates_insurance_gst_invoice_number_key" ON "estimates"("insurance_gst_invoice_number");

-- Data: an estimate for every invoiced job card that doesn't have one.
INSERT INTO "estimates" ("estimate_number", "job_card_id", "estimate_date", "status", "created_by_id", "created_at", "updated_at")
SELECT 'PENDING-' || i."job_card_id", i."job_card_id", i."invoice_date", 'DRAFT', i."created_by_id", i."invoice_date", NOW()
FROM "invoices" i
WHERE NOT EXISTS (SELECT 1 FROM "estimates" e WHERE e."job_card_id" = i."job_card_id");

UPDATE "estimates" SET "estimate_number" = 'EST-' || LPAD("id"::text, 6, '0') WHERE "estimate_number" LIKE 'PENDING-%';

-- Data: those estimates' lines are the job card's parts and labour, linked
-- to them (skipped where a GST invoice was already made from the estimate).
DELETE FROM "estimate_lines" el
USING "estimates" e
WHERE el."estimate_id" = e."id"
  AND e."gst_invoice_number" IS NULL
  AND EXISTS (SELECT 1 FROM "invoices" i WHERE i."job_card_id" = e."job_card_id");

INSERT INTO "estimate_lines" ("estimate_id", "line_type", "item_id", "description", "quantity", "rate", "amount", "hsn_code", "gst_rate", "job_card_part_id", "created_at")
SELECT e."id", 'PART', p."item_id", COALESCE(it."name", p."description", 'Part'), p."quantity", p."rate", p."amount", it."hsn_code", it."gst_rate", p."id", NOW()
FROM "estimates" e
JOIN "job_card_parts" p ON p."job_card_id" = e."job_card_id"
LEFT JOIN "items" it ON it."id" = p."item_id"
WHERE e."gst_invoice_number" IS NULL
  AND EXISTS (SELECT 1 FROM "invoices" i WHERE i."job_card_id" = e."job_card_id")
ORDER BY e."id", p."id";

INSERT INTO "estimate_lines" ("estimate_id", "line_type", "description", "quantity", "rate", "amount", "gst_rate", "job_card_labour_id", "created_at")
SELECT e."id", 'LABOUR', l."description", l."quantity", l."rate", l."amount", 18, l."id", NOW()
FROM "estimates" e
JOIN "job_card_labour" l ON l."job_card_id" = e."job_card_id"
WHERE e."gst_invoice_number" IS NULL
  AND EXISTS (SELECT 1 FROM "invoices" i WHERE i."job_card_id" = e."job_card_id")
ORDER BY e."id", l."id";

-- Keep the job cards' own copy of the estimate total in step.
UPDATE "job_cards" jc
SET "estimate_amount" = t."total"
FROM (
  SELECT e."job_card_id", ROUND(COALESCE(SUM(el."amount"), 0) * (1 + COALESCE(e."tax_rate", 0) / 100), 2) AS "total"
  FROM "estimates" e
  LEFT JOIN "estimate_lines" el ON el."estimate_id" = e."id"
  WHERE EXISTS (SELECT 1 FROM "invoices" i WHERE i."job_card_id" = e."job_card_id")
  GROUP BY e."job_card_id", e."tax_rate"
) t
WHERE jc."id" = t."job_card_id";
