-- Vehicle trial agreement (the customer takes the vehicle out on trial):
-- the fuel level when it leaves, the area the trial is allowed in, and
-- when it must be back. Printed on the trial agreement letter.
ALTER TABLE "job_cards" ADD COLUMN "trial_fuel_level" TEXT;
ALTER TABLE "job_cards" ADD COLUMN "trial_area" TEXT;
ALTER TABLE "job_cards" ADD COLUMN "trial_return_by" TIMESTAMP(3);
