-- CreateTable
CREATE TABLE "opening_reconciliations" (
    "id" TEXT NOT NULL,
    "month_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_balance" DECIMAL(14,2) NOT NULL,
    "expenses_to_date" DECIMAL(14,2) NOT NULL,
    "leave_in_account" DECIMAL(14,2) NOT NULL,
    "move_to_savings" DECIMAL(14,2) NOT NULL,
    "matched" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opening_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opening_reconciliations_month_id_user_id_created_at_idx" ON "opening_reconciliations"("month_id", "user_id", "created_at");

-- AddForeignKey
ALTER TABLE "opening_reconciliations" ADD CONSTRAINT "opening_reconciliations_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "months"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_reconciliations" ADD CONSTRAINT "opening_reconciliations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

