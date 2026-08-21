-- ##75: "Conjunto" pasa a ser el tipo de registro rapido por defecto (sort_order=0) en vez de
-- "Personal". `/r` sin deep link preselecciona el primer tipo activo por sort_order -- este UPDATE
-- es puramente de datos, no cambia schema. Idempotente por slug: si el ambiente todavia no corrio
-- la migracion de ##73 que crea/siembra `quick_entry_types`, este UPDATE simplemente no afecta
-- ninguna fila (no falla) y el orden correcto queda igual sembrado por el seed de ##75 en adelante.
UPDATE "quick_entry_types" SET "sort_order" = 0, "updated_at" = CURRENT_TIMESTAMP WHERE "slug" = 'conjunto';
UPDATE "quick_entry_types" SET "sort_order" = 1, "updated_at" = CURRENT_TIMESTAMP WHERE "slug" = 'personal';
