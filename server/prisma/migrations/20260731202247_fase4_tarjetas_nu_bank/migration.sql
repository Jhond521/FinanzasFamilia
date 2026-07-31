-- CreateTable
CREATE TABLE "credit_cards" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_months" (
    "id" TEXT NOT NULL,
    "credit_card_id" TEXT NOT NULL,
    "month_id" TEXT NOT NULL,
    "amount_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_months_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_items" (
    "id" TEXT NOT NULL,
    "card_month_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "date" DATE,
    "amount" DECIMAL(14,2) NOT NULL,
    "type" "QuickEntryType" NOT NULL,
    "is_adjustment" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "card_months_credit_card_id_month_id_key" ON "card_months"("credit_card_id", "month_id");

-- AddForeignKey
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_months" ADD CONSTRAINT "card_months_credit_card_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_months" ADD CONSTRAINT "card_months_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "months"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_items" ADD CONSTRAINT "card_items_card_month_id_fkey" FOREIGN KEY ("card_month_id") REFERENCES "card_months"("id") ON DELETE CASCADE ON UPDATE CASCADE;

