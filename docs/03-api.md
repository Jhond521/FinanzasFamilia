# Diseño de API (REST, JSON)

Prefijo `/api`. Autenticación por cookie de sesión (`httpOnly`, `secure` en prod). Errores: `{ "error": { "code", "message" } }`. Fechas ISO `YYYY-MM-DD`. Montos como string decimal.

## Auth (Google SSO)

```
GET  /api/auth/google           → redirect a Google OAuth
GET  /api/auth/google/callback  → valida email contra whitelist (ALLOWED_EMAILS),
                                  crea sesión (cookie httpOnly ~90 días) y redirige a la app;
                                  email no permitido → pantalla "cuenta no autorizada"
POST /api/auth/logout
GET  /api/auth/me               → { user }
```

## Meses

```
GET  /api/months                          → lista (año, mes, status, totales resumidos)
POST /api/months                          { year, month } → crea con snapshot de buckets activos
GET  /api/months/:id                      → detalle: ingresos, buckets snapshot, totales por bolsa
POST /api/months/:id/close                → congela month_summary, status=closed
POST /api/months/:id/reopen
GET  /api/months/:id/summary              → consolidado (presupuesto/gastado/disponible por bolsa,
                                            ahorro real por persona, dejar en cuenta, semáforos)
PUT  /api/months/:id/incomes              [ { userId, label, amount } ] (reemplaza el set)
```

## Registro rápido

```
POST /api/quick-entries       { amount, description, type, date?, userId? }  (defaults: hoy, yo)
GET  /api/quick-entries?monthId=&status=
PUT  /api/quick-entries/:id
DELETE /api/quick-entries/:id
```

## Importación y transacciones

```
POST /api/imports             multipart: file + { monthId, ownerUserId }
                              → { batchId, imported, duplicatesSkipped: N, autoClassified,
                                  needsReview, matchedQuickEntries }
POST /api/imports/:batchId/undo
POST /api/imports/preview     (opcional) valida el archivo sin escribir

GET  /api/imports/:batchId/duplicates
     → grupos por dedupe_key: { dedupeKey, existing: [transactions...],
                                 skipped: [skipped_duplicates...] }
POST /api/skipped-duplicates/:id/confirm    → resolution='confirmed_duplicate' (se descarta)
POST /api/skipped-duplicates/:id/force      → resolution='forced_twin', crea la transacción
                                              gemela (misma fecha/lugar/valor, compra distinta)
POST /api/skipped-duplicates/bulk-confirm   { batchId }  (confirmar todo lo pendiente del batch)

GET  /api/transactions?monthId=&type=&categoryId=&needsReview=&ownerUserId=&q=
PUT  /api/transactions/:id                { type?, categoryId?, detail? }   → classified_by='user'
PUT  /api/transactions/bulk               [ { id, type, categoryId?, detail? } ]  (cola de revisión)
```

## Reglas de clasificación

```
GET    /api/rules
POST   /api/rules             { pattern, setType, setDetail?, mode, amountSign? }
PUT    /api/rules/:id
DELETE /api/rules/:id
GET    /api/rules/suggestions?monthId=    → propuestas aprendidas (descripción repetida ≥3 veces)
POST   /api/rules/suggestions/accept      { pattern, ... } → crea la regla y opcionalmente
                                            reclasifica lo pendiente del mes
POST   /api/rules/:id/apply?monthId=      → aplica a sin_clasificar del mes
```

## Categorías

```
GET    /api/categories
POST   /api/categories        { name }
PUT    /api/categories/:id    (renombrar / activar / desactivar / reordenar)
```

## Buckets (rubros)

```
# Config general (plantilla — aplica a meses futuros)
GET  /api/buckets
POST /api/buckets             { name, percentage, splitMode, kind }
PUT  /api/buckets/:id         (editar % / activar / desactivar)
     → validación: activos deben sumar 100%

# Config del mes (snapshot editable mientras el mes esté abierto)
GET  /api/months/:id/buckets
PUT  /api/months/:id/buckets  [ { id?, name, percentage, splitMode, kind, active } ]
     → reemplaza el set del mes; validación 100%; recalcula bolsas del mes al momento;
       rechazado si el mes está cerrado
```

## Tarjetas

```
GET  /api/cards
POST /api/cards               { name, ownerUserId }
GET  /api/cards/:id/months/:monthId       → items + amountPaid + dif
PUT  /api/card-months/:id                 { amountPaid }
POST /api/card-months/:id/items           { description, date?, amount, type, isAdjustment? }
                                          → respuesta incluye running total: Σ items, dif restante
POST /api/card-months/:id/import          multipart: extracto Nu (csv/xlsx) → precarga items
PUT  /api/card-items/:id
DELETE /api/card-items/:id
```

---

# Pantallas (brief para Claude Design)

Mobile-first; el registro rápido y la cola de revisión se usan desde el celular, el resto también debe funcionar bien en desktop. Dos usuarios de confianza: cero fricción, nada de confirmaciones innecesarias.

1. **Registro rápido** (pantalla principal en móvil). Teclado numérico grande, campo descripción, toggle Personal/Conjunto, chips de fecha [Hoy] [Ayer] [Otro día...], quién (default yo). Botón único "Guardar" → toast y lista de los últimos registros del mes debajo.
2. **Dashboard del mes**. Selector de mes. Tarjetas por bolsa: presupuesto, gastado, disponible, barra de progreso con semáforo. Bloque "Cierre": cuánto mueve cada uno a ahorros y cuánto deja en cuenta. Contadores: transacciones sin clasificar (link a revisión), registros rápidos sin match.
3. **Importar extracto**. Dropzone del .xlsx, selector John/Lina (pre-sugerido por nombre de archivo), preview de filas, resultado del batch: importadas / duplicados omitidos (link a la pantalla de revisión de duplicados si hay) / auto-clasificadas / a revisar. Historial de batches con deshacer.
3b. **Revisión de duplicados** (aparece cuando el import detecta omitidos). Por cada grupo (misma fecha+descripción+valor): dos columnas — "Ya registrada(s)" (lo que ya está en BD) vs. "Detectada(s) en este archivo" (las filas omitidas), una al lado de la otra para comparar. Cada fila del lado derecho tiene dos botones: [Es duplicado] (se descarta, default) y [Es una transacción gemela, agregar] (para el caso de dos compras iguales el mismo día en el mismo lugar — la importa de todos modos). Botón "confirmar todo lo demás como duplicado" para cerrar rápido.
4. **Cola de revisión**. En móvil: tarjetas una por una con gestos de swipe (izquierda = Personal, derecha = Conjunto, arriba = Movimiento); la tarjeta muestra fecha, descripción del banco, monto, y chips de categoría + campo detalle opcional con autocompletado. Si hay sugerencia (tipo/categoría/detalle), viene precargada: un swipe la confirma. En PC: tabla con filtros (tipo, categoría, texto) y edición inline. Banner ocasional de aprendizaje: "Has marcado 'PAGO SMARTFIT' como Personal 3 veces, ¿creo la regla?".
5. **Transacciones del mes**. Tabla filtrable (tipo, dueño, texto), edición inline de tipo/detalle, indicador de cómo se clasificó (regla/match/manual) y de match con registro rápido.
6. **Tarjetas**. Sección independiente (no afecta las bolsas del mes). Flujo: digitar primero el monto pagado, luego agregar items uno a uno con un formulario rápido (descripción, monto, per/con) mientras una barra de progreso muestra en vivo Σ items vs. monto pagado y la Dif restante (verde al cuadrar). Botón "agregar ajuste" para diferencias pequeñas y opción de subir extracto Nu (csv/xlsx) para precargar items. Resumen final: porción personal vs. conjunta del pago.
7. **Configuración**. Rubros (tabla editable, validación 100%, activar/desactivar), reglas de clasificación (CRUD + hit count), ingresos del mes.
