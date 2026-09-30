-- RC photo (required for vehicles added from now on) and the next general
-- service km. Additive only: both are nullable, existing vehicles unchanged.

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "next_service_km" INTEGER,
ADD COLUMN     "rc_photo_url" TEXT;

