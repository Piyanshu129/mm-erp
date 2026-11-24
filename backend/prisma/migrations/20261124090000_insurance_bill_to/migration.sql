-- The insurance company's address and state code, printed on its GST invoice.
ALTER TABLE "estimates" ADD COLUMN "insurance_address" TEXT;
ALTER TABLE "estimates" ADD COLUMN "insurance_state_code" TEXT;
