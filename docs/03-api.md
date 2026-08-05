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
GET  /api/months/comparison               → cifras congeladas de meses ya cerrados, mes a mes
GET  /api/months/:id                      → detalle: ingresos, buckets snapshot
GET  /api/months/:id/summary              → consolidado en vivo (presupuesto/gastado/disponible por
                                            bolsa con semáforo de 3 estados, aporte por persona ya
                                            reconciliado entre bolsas proportional/half, ahorro real
                                            y sharedExpensesDelta por persona, dejar en cuenta)
PUT  /api/months/:id/incomes              [ { userId, label, amount } ] (reemplaza el set)
GET  /api/months/:id/export               → descarga .xlsx del mes (resumen + transacciones)
POST /api/months/:id/sheet-export         { ownerUserIds: string[] } → botón "Actualizar Sheet":
                                            sube las transacciones ya verificadas de esas personas al
                                            Google Sheet real (tab Auto-[Mes]-[Año], copia de la
                                            plantilla); rechaza si quedan transacciones sin verificar
```

### Cuadre de Inicio (por persona, a inicio de mes)

```
GET  /api/months/:id/opening-reconciliation/preview?userId=&accountBalance=
     → cifras informativas antes de confirmar: total gastos/ahorros/personal presupuestados,
       gastado a la fecha, cuánto dejar en cuenta y cuánto mover a Nu
GET  /api/months/:id/opening-reconciliation/latest?userId=
     → { openingReconciliation } el último confirmado de esa persona, o null
POST /api/months/:id/opening-reconciliation
     { userId?, accountBalance, confirmedBalance } → guarda y devuelve si el saldo cuadró (matched)
```

### Cierre de mes (individual por persona, wizard refinado)

```
GET  /api/months/:id/close-check?userId=
     → { unclassifiedCount, nextMonthExists, nextMonthId, nextMonthOpeningDone } bloquea el wizard
       si hay transacciones sin clasificar o el Cuadre de Inicio del mes siguiente no se ha hecho
GET  /api/months/:id/close-preview?userId=
     → { monthlySavingsBudget, adjustment } cifras informativas del wizard, no persiste nada
POST /api/months/:id/close-mine
     { userId?, bigExpenseAmount?, bigExpenseDescription?, yieldAmount? }
     → registra el cierre de esa persona; si ambas ya cerraron, congela el month_summary
       (status=closed) y escribe en el ledger de Ahorros Familiares: "Ahorros de [mes siguiente]",
       "Ajuste de ahorros de [este mes] en cierre", y "Rendimientos..." si aplica
POST /api/months/:id/reopen-mine          { userId? } → mes vuelve a 'open' si estaba cerrado
GET  /api/months/:id/closures/latest?userId=  → { closure } el último cierre/reapertura de esa persona
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
GET  /api/imports             → historial de batches (con dueño y quién subió)
POST /api/imports             multipart: file + { monthId, ownerUserId }
                              → { batchId, imported, duplicatesSkipped: N, autoClassified,
                                  needsReview, matchedQuickEntries }
POST /api/imports/:batchId/undo
POST /api/imports/preview     multipart: file → preview de filas sin escribir nada

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
GET  /api/transactions/:id/match-candidates  → quick entries candidatos cuando hay varios posibles
POST /api/transactions/:id/match          { quickEntryId } → concilia manualmente transacción ↔ registro
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
GET    /api/categories        → solo lectura; fijas por seed (decisión confirmada del ticket #2,
                                 sin pantalla de administración todavía)
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

## Ahorros Familiares (ledger)

Registro de todo lo que entra/sale de las cajitas de ahorro de cada persona: aportes mensuales,
ajustes de cierre, rendimientos, y movimientos manuales (correcciones, saldo inicial, gastos grandes).

```
GET    /api/family-savings/summary        → { balances: [{ userId, name, balance }], total }
GET    /api/family-savings/entries?userId=&monthId=
POST   /api/family-savings/entries        { userId, type?, amount, description, monthId? }
                                          (type default 'manual'; los tipos 'initial'/'monthly_savings'/
                                           'adjustment'/'yield' los escribe el propio sistema en
                                           Cuadre de Inicio y cierre, pero también son editables)
PUT    /api/family-savings/entries/:id    (mismo body que POST; 404 si no existe)
DELETE /api/family-savings/entries/:id    (204; 404 si no existe)
```

## Configuración general

```
GET  /api/settings                        → { yieldAutoThreshold } (fila única, get-or-create)
PUT  /api/settings                        { yieldAutoThreshold } umbral para sugerir "Rendimientos"
                                            al cuadrar el saldo real en el wizard de cierre
```

## Tarjetas

```
GET  /api/cards
POST /api/cards               { name, ownerUserId }
GET  /api/cards/:id/months/:monthId       → items + amountPaid + dif
PUT  /api/card-months/:id                 { amountPaid }
POST /api/card-months/:id/items           { description, date?, amount, type, isAdjustment? }
                                          → respuesta incluye running total: Σ items, dif restante
POST /api/card-months/:id/import          multipart: extracto Nu (csv/xlsx, o PDF vía OCR — ##61) → precarga items
PUT  /api/card-items/:id
DELETE /api/card-items/:id
```

---

# Pantallas (brief para Claude Design)

Mobile-first; el registro rápido y la cola de revisión se usan desde el celular, el resto también debe funcionar bien en desktop. Dos usuarios de confianza: cero fricción, nada de confirmaciones innecesarias.

1. **Registro rápido** (pantalla principal en móvil). Teclado numérico grande, campo descripción, toggle Personal/Conjunto, chips de fecha [Hoy] [Ayer] [Otro día...], quién (default yo). Botón único "Guardar" → toast y lista de los últimos registros del mes debajo.
2. **Dashboard del mes**. Selector de mes. Card "Resumen del mes" (ingresos vs. gastado total). Tarjetas por bolsa: presupuesto, gastado, disponible, barra de progreso con semáforo de 3 estados (verde <80%, amarillo 80–100%, rojo >100%) también por persona. Sección "Cuadre de Inicio" (una vez al empezar el mes, por persona: saldo en cuenta → cuánto dejar y cuánto mover a Nu). Bloque "Cierre" con wizard paso a paso por persona (gasto grande opcional, breakdown de movimientos en Nu, saldo final, sugerencia de "Rendimientos" si sobra dentro del umbral configurado). Contadores: transacciones sin clasificar (link a revisión), registros rápidos sin match. Tabla comparativo mes a mes.
3. **Importar extracto**. Dropzone del .xlsx, selector John/Lina (pre-sugerido por nombre de archivo), preview de filas, resultado del batch: importadas / duplicados omitidos (link a la pantalla de revisión de duplicados si hay) / auto-clasificadas / a revisar. Historial de batches con deshacer.
3b. **Revisión de duplicados** (aparece cuando el import detecta omitidos). Por cada grupo (misma fecha+descripción+valor): dos columnas — "Ya registrada(s)" (lo que ya está en BD) vs. "Detectada(s) en este archivo" (las filas omitidas), una al lado de la otra para comparar. Cada fila del lado derecho tiene dos botones: [Es duplicado] (se descarta, default) y [Es una transacción gemela, agregar] (para el caso de dos compras iguales el mismo día en el mismo lugar — la importa de todos modos). Botón "confirmar todo lo demás como duplicado" para cerrar rápido.
4. **Cola de revisión**. En móvil: tarjetas una por una con gestos de swipe (izquierda = Personal, derecha = Conjunto, arriba = Movimiento); la tarjeta muestra fecha, descripción del banco, monto, y chips de categoría + campo detalle opcional con autocompletado. Si hay sugerencia (tipo/categoría/detalle), viene precargada: un swipe la confirma. En PC: tabla con filtros (tipo, categoría, texto) y edición inline. Banner ocasional de aprendizaje: "Has marcado 'PAGO SMARTFIT' como Personal 3 veces, ¿creo la regla?".
5. **Transacciones del mes**. Tabla filtrable (tipo, dueño, texto), edición inline de tipo/detalle, indicador de cómo se clasificó (regla/match/manual) y de match con registro rápido. Filtro Yo/[otra persona]/Ambos + botón "Actualizar Sheet" (sube al Google Sheet real las transacciones ya verificadas de las personas seleccionadas; deshabilitado si queda algo sin clasificar).
6. **Tarjetas**. Sección independiente (no afecta las bolsas del mes). Flujo: digitar primero el monto pagado, luego agregar items uno a uno con un formulario rápido (descripción, monto, per/con) mientras una barra de progreso muestra en vivo Σ items vs. monto pagado y la Dif restante (verde al cuadrar). Botón "agregar ajuste" para diferencias pequeñas y opción de subir extracto Nu (csv/xlsx) para precargar items. Resumen final: porción personal vs. conjunta del pago.
7. **Ahorros Familiares**. Saldo de cada persona + total familia. Filtro Yo/[otra persona]/Ambos. Tabla de movimientos (fecha, persona, tipo, descripción, monto) con editar/borrar por fila (confirmación en dos pasos para borrar) y formulario para agregar movimientos manuales.
8. **Configuración**. Rubros (tabla editable, validación 100%, activar/desactivar), reglas de clasificación (CRUD + hit count), ingresos del mes, umbral de "Rendimientos" automático.
