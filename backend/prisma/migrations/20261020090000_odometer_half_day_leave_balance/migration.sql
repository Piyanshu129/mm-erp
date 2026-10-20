-- Additive only — no existing data changes.
--   * salary_payments: half days, and the leave balance carried in / out
--     (left empty on salaries calculated before this; the carry-forward
--     works those out from attendance).
--   * odometer_readings: KM readings entered between visits, used with job
--     card visits to estimate when the next service falls due.

-- AlterTable
ALTER TABLE "salary_payments" ADD COLUMN     "closing_leave_balance" DECIMAL(6,1),
ADD COLUMN     "half_days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "opening_leave_balance" DECIMAL(6,1);

-- CreateTable
CREATE TABLE "odometer_readings" (
    "id" SERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "km" INTEGER NOT NULL,
    "reading_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "odometer_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "odometer_readings_vehicle_id_reading_date_idx" ON "odometer_readings"("vehicle_id", "reading_date");

-- AddForeignKey
ALTER TABLE "odometer_readings" ADD CONSTRAINT "odometer_readings_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "odometer_readings" ADD CONSTRAINT "odometer_readings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
