-- AlterTable
ALTER TABLE "attendance" ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6),
ADD COLUMN     "marked_by" TEXT NOT NULL DEFAULT 'ADMIN',
ADD COLUMN     "punched_at" TIMESTAMP(3),
ADD COLUMN     "selfie_url" TEXT;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "email" TEXT,
ADD COLUMN     "mobile" TEXT,
ADD COLUMN     "password_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

