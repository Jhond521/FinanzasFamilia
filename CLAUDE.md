# Finanzas en Pareja

App monolítica de finanzas para dos usuarios (John y Lina). Lee docs/ antes de tocar código.

## Comandos
- `docker compose up` — forma normal de desarrollar: levanta db + server (puerto 3000) + web (puerto 5173) como
  contenedores, con hot-reload vía bind mount (código local montado, `npm run dev` corre adentro). Requiere `.env`
  en la raíz (copiar de `.env.example`). Primera vez o tras cambiar dependencias: `docker compose up --build`.
- `docker compose exec server npx prisma migrate dev` — nueva migración (server corre dentro del contenedor)
- `docker compose exec server npm test` (o `npm run lint` / `npm run typecheck`) — corre contra todo el repo
  (server+web), da igual ejecutarlo desde el contenedor `server` o `web`, ambos montan el mismo código en `/app`
- `docker compose down` — apagar todo (los datos de Postgres persisten en el volumen `db_data`)
- Alternativa sin Docker (requiere Node 22 y Postgres locales): `docker compose up db` + `npm run dev` (server tsx watch + web vite en paralelo) + `npx prisma migrate dev` en `server/`

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
- El seed NO corre solo en el deploy (el CMD solo hace `migrate deploy`). Tras el primer deploy de un ambiente:
  `railway ssh --service <servicio> --environment <ambiente> -- node dist/seed.js`.
- `server/src/index.ts` necesita `app.set('trust proxy', 1)` en production para que la cookie de sesión funcione
  detrás del proxy de Railway (si no, el login "funciona" pero la sesión nunca queda activa). Detalle en docs/04.
