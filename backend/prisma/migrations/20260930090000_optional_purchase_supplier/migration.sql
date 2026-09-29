-- Expenses (travel, petrol, food, others) no longer need a supplier; only
-- spare parts, paint and tools do (enforced in purchases.service.ts).
-- Non-destructive: existing rows keep their supplier.

-- AlterTable
ALTER TABLE "purchases" ALTER COLUMN "supplier_id" DROP NOT NULL;
