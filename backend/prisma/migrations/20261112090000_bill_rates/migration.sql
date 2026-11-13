-- The bill can differ from the estimate: a rate changed on the bill (an
-- accidental claim's approved rate) and lines added on the tax invoice only.
ALTER TABLE "estimate_lines" ADD COLUMN "bill_rate" DECIMAL(12,2);
ALTER TABLE "estimate_lines" ADD COLUMN "bill_only" BOOLEAN NOT NULL DEFAULT false;
