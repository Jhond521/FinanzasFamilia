-- CreateTable
CREATE TABLE "month_summaries" (
    "id" TEXT NOT NULL,
    "month_id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "month_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "month_summaries_month_id_key" ON "month_summaries"("month_id");

-- AddForeignKey
ALTER TABLE "month_summaries" ADD CONSTRAINT "month_summaries_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "months"("id") ON DELETE CASCADE ON UPDATE CASCADE;
