-- CreateEnum
CREATE TYPE "QuickEntryKind" AS ENUM ('personal', 'joint', 'movement');

-- CreateTable
CREATE TABLE "quick_entry_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "QuickEntryKind" NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_entry_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quick_entry_types_slug_key" ON "quick_entry_types"("slug");

-- Seed (##73): preserva el comportamiento actual -- solo Personal/Conjunto activos. El seed.ts
-- normal tambien los crea (upsert por slug) para bases de datos nuevas, pero produccion solo
-- corre `migrate deploy` (CLAUDE.md: el seed no corre solo en el deploy), asi que estas dos filas
-- tienen que existir ya al terminar esta migracion para poder backfillear quick_entries.
INSERT INTO "quick_entry_types" ("id", "name", "kind", "slug", "active", "sort_order", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'Personal', 'personal', 'personal', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Conjunto', 'joint', 'conjunto', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable: type_option_id nullable primero para poder backfillear antes de exigirlo; "type"
-- se relaja (DEPRECATED, no se dropea -- un DROP con datos existentes necesita autorizacion
-- explicita fuera de este ticket, ver docs/tickets del ##73).
ALTER TABLE "quick_entries" ADD COLUMN "type_option_id" TEXT;
ALTER TABLE "quick_entries" ALTER COLUMN "type" DROP NOT NULL;

-- Backfill: mapea el enum viejo (personal|joint) a las filas seed recien creadas.
UPDATE "quick_entries" SET "type_option_id" = (SELECT "id" FROM "quick_entry_types" WHERE "slug" = 'personal') WHERE "type" = 'personal';
UPDATE "quick_entries" SET "type_option_id" = (SELECT "id" FROM "quick_entry_types" WHERE "slug" = 'conjunto') WHERE "type" = 'joint';

ALTER TABLE "quick_entries" ALTER COLUMN "type_option_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "quick_entries" ADD CONSTRAINT "quick_entries_type_option_id_fkey" FOREIGN KEY ("type_option_id") REFERENCES "quick_entry_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
