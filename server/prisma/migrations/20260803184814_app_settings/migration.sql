-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL,
    "yield_auto_threshold" DECIMAL(14,2) NOT NULL DEFAULT 200000,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);
