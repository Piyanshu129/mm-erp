-- No data is lost: whole-number quantities convert to the same decimal
-- values, and the new columns start empty.
--   * Quantities on job card parts, labour and estimate lines, and item
--     stock, can now be part of a unit (0.5 L of oil).
--   * A job card part can be one that isn't in inventory (no item, just a
--     description) — it touches no stock.
--   * Items get a specification; attendance gets optional in/out times.

-- AlterTable
ALTER TABLE "attendance" ADD COLUMN     "in_time" TEXT,
ADD COLUMN     "out_time" TEXT;

-- AlterTable
ALTER TABLE "estimate_lines" ALTER COLUMN "quantity" SET DEFAULT 1,
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "specification" TEXT,
ALTER COLUMN "current_stock" SET DEFAULT 0,
ALTER COLUMN "current_stock" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "job_card_labour" ALTER COLUMN "quantity" SET DEFAULT 1,
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "job_card_parts" ADD COLUMN     "description" TEXT,
ALTER COLUMN "item_id" DROP NOT NULL,
ALTER COLUMN "quantity" SET DEFAULT 1,
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;
