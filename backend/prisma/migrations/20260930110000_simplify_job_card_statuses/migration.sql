-- Job card statuses simplified from eleven workflow steps to three:
-- OPEN, INVOICED, CANCELLED. Existing job cards are converted by what's
-- actually true of them rather than by their old label:
--   * has an invoice            -> INVOICED  (covers the old Invoiced /
--                                             Ready for Delivery / Delivered /
--                                             Closed)
--   * was cancelled, no invoice -> CANCELLED
--   * anything else             -> OPEN      (the old Draft through Completed)

UPDATE "job_cards" AS jc
SET "status" = CASE
    WHEN EXISTS (SELECT 1 FROM "invoices" i WHERE i."job_card_id" = jc."id") THEN 'INVOICED'
    WHEN jc."status" = 'CANCELLED' THEN 'CANCELLED'
    ELSE 'OPEN'
END;

-- AlterTable
ALTER TABLE "job_cards" ALTER COLUMN "status" SET DEFAULT 'OPEN';
