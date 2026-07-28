# Spec — Finanzas en Pareja

Documentos para construir la app con Claude Code. Copiar esta carpeta como `docs/` en el repo de GitHub.

1. `01-prd.md` — producto, casos de uso y reglas de negocio
2. `02-modelo-de-datos.md` — esquema Postgres/Prisma, cálculos y algoritmo de deduplicación
3. `03-api.md` — endpoints REST y brief de pantallas para Claude Design
4. `04-arquitectura-y-despliegue.md` — monolito Node+React, Docker, Railway (dev/prod)
5. `05-plan-de-construccion.md` — fases para Claude Code y CLAUDE.md sugerido

Trazabilidad casos de uso → spec:

| Caso de uso / objetivo | Dónde |
|---|---|
| 1. Anotar transferencias (ex-WhatsApp) | PRD: Registro rápido · API: quick-entries · Pantalla 1 |
| 2. Subir extracto por persona y clasificar per/con + detalles | PRD: Importación y Clasificación · Pantallas 3–5 |
| Tipo "Movimientos" (no suma ni resta) | PRD: Clasificación · Modelo: type='movement' |
| 3. Rubros % configurables, activar/desactivar, bolsas con semáforo | PRD: Rubros y Consolidado · buckets/month_buckets |
| 4. Match automático extracto ↔ registros manuales | PRD: pipeline paso 1 · services/matcher.ts |
| 5. Preguntar lo dudoso, automatizar lo posible | Cola de revisión + reglas auto/sugerir + aprendizaje |
| Obj. duplicados en archivos parciales | Modelo: Deduplicación por conteo · import_batches |
| Obj. consolidado, ahorro real, cuánto mover/dejar | PRD: Cierre · summary.ts · Pantalla 2 |
| Tarjetas Nu Bank per/con + conciliación (módulo independiente, no afecta bolsas) | PRD: Tarjetas · card_months/card_items · Pantalla 6 |
| Docker + Railway dev/prod + GitHub | 04-arquitectura |
