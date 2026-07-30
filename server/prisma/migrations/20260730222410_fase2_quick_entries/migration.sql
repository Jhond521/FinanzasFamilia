-- CreateEnum
CREATE TYPE "QuickEntryType" AS ENUM ('personal', 'joint');

-- CreateEnum
CREATE TYPE "QuickEntryStatus" AS ENUM ('pending', 'matched', 'no_match_expected');

-- CreateTable
CREATE TABLE "quick_entries" (
    "id" TEXT NOT NULL,
    "month_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "type" "QuickEntryType" NOT NULL,
    "date" DATE NOT NULL,
    "status" "QuickEntryStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quick_entries_month_id_status_idx" ON "quick_entries"("month_id", "status");

-- AddForeignKey
ALTER TABLE "quick_entries" ADD CONSTRAINT "quick_entries_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "months"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_entries" ADD CONSTRAINT "quick_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_entries" ADD CONSTRAINT "quick_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
