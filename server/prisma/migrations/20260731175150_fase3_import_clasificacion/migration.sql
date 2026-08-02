-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('personal', 'joint', 'movement', 'unclassified');

-- CreateEnum
CREATE TYPE "RuleSetType" AS ENUM ('personal', 'joint', 'movement');

-- CreateEnum
CREATE TYPE "ClassifiedBy" AS ENUM ('rule', 'match', 'user');

-- CreateEnum
CREATE TYPE "RuleMode" AS ENUM ('auto', 'suggest');

-- CreateEnum
CREATE TYPE "AmountSign" AS ENUM ('any', 'positive', 'negative');

-- CreateEnum
CREATE TYPE "RuleOrigin" AS ENUM ('seed', 'user', 'learned');

-- CreateEnum
CREATE TYPE "SkippedDuplicateResolution" AS ENUM ('pending', 'confirmed_duplicate', 'forced_twin');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('done', 'undone');

-- AlterTable
ALTER TABLE "quick_entries" ADD COLUMN     "matched_transaction_id" TEXT;

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rules" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "match_field" TEXT NOT NULL DEFAULT 'bank_description',
    "amount_sign" "AmountSign" NOT NULL DEFAULT 'any',
    "set_type" "RuleSetType" NOT NULL,
    "set_category_id" TEXT,
    "set_detail" TEXT,
    "mode" "RuleMode" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "hit_count" INTEGER NOT NULL DEFAULT 0,
    "created_from" "RuleOrigin" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "month_id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "row_count" INTEGER NOT NULL,
    "imported_count" INTEGER NOT NULL,
    "duplicate_count" INTEGER NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'done',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skipped_duplicates" (
    "id" TEXT NOT NULL,
    "import_batch_id" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "bank_description" TEXT NOT NULL,
    "bank_reference" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "resolution" "SkippedDuplicateResolution" NOT NULL DEFAULT 'pending',
    "forced_transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skipped_duplicates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "month_id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "import_batch_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "bank_description" TEXT NOT NULL,
    "bank_reference" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "type" "TransactionType" NOT NULL DEFAULT 'unclassified',
    "category_id" TEXT,
    "detail" TEXT,
    "classified_by" "ClassifiedBy",
    "rule_id" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "needs_review" BOOLEAN NOT NULL DEFAULT true,
    "suggested_type" "TransactionType",
    "suggested_category_id" TEXT,
    "suggested_detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "skipped_duplicates_forced_transaction_id_key" ON "skipped_duplicates"("forced_transaction_id");

-- CreateIndex
CREATE INDEX "transactions_month_id_dedupe_key_idx" ON "transactions"("month_id", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "quick_entries_matched_transaction_id_key" ON "quick_entries"("matched_transaction_id");

-- AddForeignKey
ALTER TABLE "quick_entries" ADD CONSTRAINT "quick_entries_matched_transaction_id_fkey" FOREIGN KEY ("matched_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_set_category_id_fkey" FOREIGN KEY ("set_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "months"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skipped_duplicates" ADD CONSTRAINT "skipped_duplicates_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skipped_duplicates" ADD CONSTRAINT "skipped_duplicates_forced_transaction_id_fkey" FOREIGN KEY ("forced_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "months"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_suggested_category_id_fkey" FOREIGN KEY ("suggested_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

