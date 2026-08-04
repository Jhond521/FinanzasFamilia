# Modelo de datos (PostgreSQL + Prisma)

Convenciones: ids `uuid`, timestamps `created_at`/`updated_at` en todas las tablas, montos `NUMERIC(14,2)` en COP. Los gastos se guardan como valor **negativo** (igual que el extracto); los totales usan `ABS` donde aplique.

```
users
  id, name ('John'|'Lina'), email UNIQUE, password_hash

months
  id, year INT, month INT, status ('open'|'closed'), closed_at NULL
  UNIQUE (year, month)

incomes                      -- ingresos del mes por persona (salario, prima, etc.)
  id, month_id FK, user_id FK, label TEXT ('Salario','Prima'...), amount NUMERIC

buckets                      -- rubros configurables (config vigente)
  id, name, percentage NUMERIC(5,2), split_mode ('proportional'|'half'),
  kind ('savings'|'personal'|'shared_expenses'|'other'),  -- semántica para los cálculos
  active BOOL, sort_order INT

month_buckets                -- instancia del rubro en el mes (snapshot editable)
  id, month_id FK, bucket_id FK NULL, name, percentage, split_mode, kind, active BOOL
  UNIQUE (month_id, bucket_id)
  -- Se crea copiando buckets activos al crear el mes. Editable mientras el mes esté
  -- abierto (validación: activos suman 100%); se congela al cerrar. bucket_id NULL
  -- permite rubros agregados solo para ese mes.

quick_entries                -- registro rápido (ex-WhatsApp)
  id, month_id FK, user_id FK (quién es el gasto), created_by FK users,
  amount NUMERIC, description TEXT, type ('personal'|'joint'),
  date DATE, status ('pending'|'matched'|'no_match_expected'),
  matched_transaction_id FK NULL

import_batches
  id, month_id FK, owner_user_id FK, filename, uploaded_by FK users,
  row_count INT, imported_count INT, duplicate_count INT, status ('done'|'undone')

skipped_duplicates           -- filas del archivo detectadas como duplicado (para revisión)
  id, import_batch_id FK, dedupe_key TEXT,
  date DATE, bank_description TEXT, bank_reference TEXT, amount NUMERIC,
  resolution ('pending'|'confirmed_duplicate'|'forced_twin'),
  forced_transaction_id FK NULL     -- si se forzó, la transacción creada

categories                   -- categorías de gasto (configurables)
  id, name ('Hogar','Transporte','Restaurante','Mercado','Servicios',
  'Entretenimiento','Salud','Suscripciones','Otros'...), active BOOL, sort_order INT

transactions                 -- filas del extracto bancario
  id, month_id FK, owner_user_id FK, import_batch_id FK,
  date DATE, bank_description TEXT, bank_reference TEXT, amount NUMERIC,
  type ('personal'|'joint'|'movement'|'unclassified'),
  category_id FK NULL,                    -- sugerida por reglas, editable por el usuario
  detail TEXT NULL,                       -- la "Referencia" que hoy escriben a mano
  classified_by ('rule'|'match'|'user'|NULL), rule_id FK NULL,
  dedupe_key TEXT,                        -- hash(owner, date, bank_description, amount)
  needs_review BOOL DEFAULT false,
  suggested_type / suggested_category_id / suggested_detail NULL  -- pendientes de confirmar
  INDEX (month_id, dedupe_key)

rules                        -- motor de clasificación (determinístico)
  id, pattern TEXT (substring, case/acentos-insensitive), match_field ('bank_description'),
  amount_sign ('any'|'positive'|'negative') DEFAULT 'any',
  set_type ('personal'|'joint'|'movement'), set_category_id FK NULL, set_detail TEXT NULL,
  mode ('auto'|'suggest'), active BOOL, hit_count INT,
  created_from ('seed'|'user'|'learned')

credit_cards
  id, name ('Nu Bank'), owner_user_id FK, active BOOL

card_months                  -- ciclo mensual de una tarjeta
  id, credit_card_id FK, month_id FK, amount_paid NUMERIC
  UNIQUE (credit_card_id, month_id)

card_items                   -- compras itemizadas de la tarjeta
  id, card_month_id FK, description TEXT, date DATE NULL,
  amount NUMERIC (positivo), type ('personal'|'joint'), is_adjustment BOOL

month_summaries              -- congelado al cerrar el mes (JSON con todas las cifras)
  id, month_id FK UNIQUE, data JSONB
```

## Cálculos clave (implementar como servicio, con tests)

Sea `I_j`, `I_l` los ingresos totales del mes de John y Lina, `T = I_j + I_l`.

- Bolsa de un rubro `b`: `P_b = T * pct_b`.
- Aporte por persona: si `split_mode='proportional'` → `P_b * I_p / T`; si `'half'` → `P_b / 2`.
- Gastado conjunto = `Σ |amount| de transactions(type='joint')`.
- Gastado personal de p = `Σ |amount| de transactions(type='personal', owner=p)`. Nota: los abonos/ingresos positivos tipo `personal` (intereses, reembolsos) restan del gastado.
- Las tarjetas (card_items / card_months) NO entran en estos cálculos: son un control independiente; el pago sale de la cuenta de ahorros.
- `movement` no entra en ningún total.
- Disponible por bolsa = presupuesto − gastado.
- Ahorro real de p = aporte de p a Ahorros Conjuntos + (presupuesto de Gastos del Mes de p − lo que p gastó). Cada quien responde por su propia bolsa: **no** se reparte por ingreso (ticket #47) — si p se pasó de su propio presupuesto es un retiro de sus ahorros, si le sobró es un bono. El total del hogar es solo informativo.
- Dejar en cuenta de p = aporte a Gastos del Mes + Dinero Personal de p (cifra informativa del día 1).

## Deduplicación (algoritmo)

Al importar un archivo para (mes, dueño):

1. Normalizar filas → calcular `dedupe_key` por fila (hash de dueño+fecha+descripción original+valor).
2. Agrupar archivo por key con conteo `N_key`; contar en BD `M_key` (mismo mes+dueño, excluyendo batches deshechos).
3. Importar `max(0, N_key − M_key)` filas por key directo a `transactions`; las `min(N_key, M_key)` restantes se guardan en `skipped_duplicates` con `resolution='pending'` (no se descartan del todo, quedan para revisión).
4. Reporte del batch: importadas, omitidas (van a revisión), auto-clasificadas, a revisar.

### Revisión de duplicados

Pantalla que agrupa `skipped_duplicates` por `dedupe_key` y por cada grupo muestra dos columnas:

- **Ya registradas**: las transacciones existentes en BD que comparten esa key (fecha, descripción, valor).
- **Detectadas en este archivo**: las filas omitidas de ese mismo key en el batch actual.

Acciones por fila omitida: **Confirmar duplicado** (`resolution='confirmed_duplicate'`, se queda fuera) o **Es una transacción gemela** (`resolution='forced_twin'`) — crea la transacción igual que si no hubiera sido duplicado (mismo día, lugar y valor, pero compra distinta; p.ej. dos cafés idénticos el mismo día) y guarda `forced_transaction_id`. El deshacer del batch revierte también las gemelas forzadas.
