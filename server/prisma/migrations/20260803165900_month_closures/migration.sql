-- CreateEnum
CREATE TYPE "MonthClosureActionType" AS ENUM ('closed', 'reopened');

-- CreateTable
CREATE TABLE "month_closures" (
    "id" TEXT NOT NULL,
    "month_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" "MonthClosureActionType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "month_closures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "month_closures_month_id_user_id_created_at_idx" ON "month_closures"("month_id", "user_id", "created_at");

-- AddForeignKey
ALTER TABLE "month_closures" ADD CONSTRAINT "month_closures_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "months"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "month_closures" ADD CONSTRAINT "month_closures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
