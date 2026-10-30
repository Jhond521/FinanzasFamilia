-- AlterTable
ALTER TABLE "rules" ADD COLUMN     "amount" DECIMAL(14,2),
ADD COLUMN     "owner_user_id" TEXT,
ADD COLUMN     "reference_pattern" TEXT;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
