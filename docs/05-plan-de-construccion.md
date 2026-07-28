# Plan de construcción con Claude Code

Fases pensadas para sesiones de Claude Code; cada una termina con algo desplegable y probado. Pídanle a Claude Code que lea `docs/` completo antes de empezar cada fase.

## Fase 0 — Esqueleto (1 sesión)
Repo, workspaces, Express + React + Prisma conectados, Dockerfile, docker-compose, CI, seed de usuarios, login funcionando. Deploy a Railway dev y prod con "hola mundo" autenticado.

## Fase 1 — Meses, rubros e ingresos (1 sesión)
CRUD de buckets con validación 100%, crear mes con snapshot, ingresos por persona, dashboard con presupuestos por bolsa (sin gastos aún). Tests de los cálculos de distribución contra los números de Junio 2026: ingresos 11,439,100 + 7,745,749 → bolsas 36/16/0/48.

## Fase 2 — Registro rápido (1 sesión)
Pantalla móvil de registro en <10 s, lista/edición, PWA manifest. El dashboard empieza a restar gastos de registros rápidos tipo conjunto/personal (mientras llega el extracto, son la mejor foto del mes).

## Fase 3 — Importación + clasificación (2 sesiones, el corazón)
Parser xlsx Bancolombia, dedupe por conteo, batches con undo, motor de reglas + seeds, match con registros rápidos, cola de revisión, aprendizaje de reglas. Probar con los archivos reales de junio (John y Lina) y verificar contra el sheet: mismas cifras de conjunto/personal por persona.
Cuando hay match con un registro rápido, el gasto deja de contarse por el registro y se cuenta por la transacción (no doble conteo).

## Fase 4 — Tarjetas Nu Bank (1 sesión)
Módulo independiente: card_months, items per/con, Dif de conciliación. No toca las bolsas ni el dashboard del mes (el pago sale de la cuenta de ahorros). Regla semilla por si el pago aparece en el extracto: marcarlo como movimiento.

## Fase 5 — Cierre de mes (1 sesión)
Summary congelado, ahorro real con ajuste por sobregasto, "dejar en cuenta", pantalla de cierre, comparativo mes a mes.

## Fase 6 — Pulido (1 sesión)
Diseño final (Claude Design), estados vacíos, exportar mes a xlsx, revisar accesibilidad móvil.

## Roadmap post-MVP
Integración WhatsApp (bot que crea quick_entries), notificaciones ("llevas 80% de la bolsa conjunta"), estadísticas de cobertura del registro rápido, import automático del correo del banco, más bancos.

---

# CLAUDE.md sugerido para el repo

```markdown
# Finanzas en Pareja

App monolítica de finanzas para dos usuarios (John y Lina). Lee docs/ antes de tocar código.

## Comandos
- `npm run dev` — server (tsx watch) + web (vite) en paralelo; BD: `docker compose up db`
- `npm test` — vitest (server y web)
- `npm run lint` / `npm run typecheck`
- `npx prisma migrate dev` — nueva migración (correr en server/)

## Reglas
- TypeScript estricto en todo. Validar entradas de API con zod.
- Montos: NUMERIC en BD, strings decimales en la API, Prisma.Decimal en código. NUNCA float.
- Gastos son negativos (como el extracto del banco). type='movement' no entra en ningún total.
- Lógica de negocio en server/src/services/ como funciones puras con tests. Los cálculos
  de summary.ts tienen tests de regresión contra números reales — no cambiarlos sin entender por qué.
- Migraciones Prisma versionadas; nunca editar una migración ya aplicada.
- UI mobile-first, en español.

## Deploy
- push a develop → Railway dev; merge a main → producción. Migraciones corren en el CMD del contenedor.
```
