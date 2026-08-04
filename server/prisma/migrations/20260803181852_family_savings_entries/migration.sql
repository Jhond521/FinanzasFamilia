-- CreateEnum
CREATE TYPE "FamilySavingsEntryType" AS ENUM ('initial', 'monthly_savings', 'adjustment', 'yield', 'manual');

-- CreateTable
CREATE TABLE "family_savings_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "month_id" TEXT,
    "type" "FamilySavingsEntryType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_savings_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "family_savings_entries_user_id_created_at_idx" ON "family_savings_entries"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "family_savings_entries" ADD CONSTRAINT "family_savings_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_savings_entries" ADD CONSTRAINT "family_savings_entries_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "months"("id") ON DELETE SET NULL ON UPDATE CASCADE;
