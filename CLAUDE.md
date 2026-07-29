# Finanzas en Pareja

App monolítica de finanzas para dos usuarios (John y Lina). Lee docs/ antes de tocar código.

## Comandos
- `npm run dev` — server (tsx watch) + web (vite) en paralelo; BD: `docker compose up db`
- `docker compose up` — alternativa: todo (db + server + web) como contenedores, con hot-reload vía bind mount
- `npm test` — vitest (server y web)
- `npm run lint` / `npm run typecheck`
- `npx prisma migrate dev` — nueva migración (correr en server/, o `docker compose exec server npx prisma migrate dev` si usas Docker)

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
