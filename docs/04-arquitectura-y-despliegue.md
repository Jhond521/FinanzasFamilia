# Arquitectura y despliegue

## Stack

- **Backend**: Node.js 22 + TypeScript + Express. ORM: **Prisma** (migraciones versionadas). Validación: **zod**. Parse de xlsx: **SheetJS (xlsx)**. Auth: **Google OAuth 2.0** (passport-google-oauth20 o Auth.js) con whitelist `ALLOWED_EMAILS=jhond5@gmail.com,lina.tic.isc@gmail.com`; credenciales OAuth separadas por ambiente (redirect URIs de dev y prod). Sesiones: cookie firmada de larga duración (`express-session` + `connect-pg-simple`, la sesión vive en Postgres — sin Redis).
- **Frontend**: React 18 + TypeScript + **Vite**. Router: react-router. Data fetching: TanStack Query. Estilos: Tailwind. PWA básica (manifest + ícono en home screen del celular).
- **BD**: PostgreSQL (Railway managed, una por ambiente).
- **Monolito**: en producción Express sirve `frontend/dist` como estáticos + `/api/*`. Un solo proceso, un solo contenedor.

## Estructura del repo

```
/
├── CLAUDE.md
├── docs/                      # estos specs
├── package.json               # workspaces: server, web
├── server/
│   ├── prisma/schema.prisma
│   └── src/
│       ├── index.ts           # bootstrap: estáticos + api + migraciones
│       ├── routes/            # auth, months, quickEntries, imports, transactions, rules, buckets, cards
│       ├── services/          # importer.ts, dedupe.ts, matcher.ts, ruleEngine.ts, summary.ts
│       └── seed.ts            # usuarios John/Lina, buckets y reglas semilla
├── web/
│   └── src/ (pages/, components/, api/)
├── Dockerfile
├── docker-compose.yml         # dev local: app + postgres
└── .github/workflows/ci.yml   # lint + tests en PR
```

## Dockerfile (multi-stage)

1. Stage build web: `npm ci && vite build`.
2. Stage build server: `tsc` + `prisma generate`.
3. Stage final `node:22-slim`: server compilado + `web/dist` + prisma. `CMD`: `npx prisma migrate deploy && node dist/index.js`.

`docker-compose.yml` de desarrollo: servicio `db` (postgres:16, volumen local) + `app` con hot-reload (o correr `npm run dev` fuera de Docker y solo la BD en compose — más cómodo).

## Ambientes y flujo Git (GitHub + Railway)

- Repo GitHub con dos ramas: `develop` y `main`.
- Un proyecto Railway (`FinanzasFamilia`) con **dos environments**: `dev` (deploy automático desde `develop`, servicio `FinanzasFamilia-dev`) y `production` (desde `main`, servicio `FinanzasFamilia`). Cada environment con su propio servicio Postgres (`Postgres-Y1ww` en dev, `Postgres` en production) y su `DATABASE_URL` (referenciada como variable, ej. `${{Postgres.DATABASE_URL}}`).
- Variables por ambiente: `DATABASE_URL`, `SESSION_SECRET` (generado al azar, distinto por ambiente), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `ALLOWED_EMAILS`, `APP_URL`. `GOOGLE_CLIENT_ID`/`SECRET` son los mismos en dev y production (una sola app de Google Cloud Console con los dos callback URLs autorizados como redirect URIs).
- Flujo: feature → PR a `develop` (CI: lint + tests) → probar en dev → PR `develop` → `main` → producción. Migraciones corren solas en el deploy (`migrate deploy` en el CMD).
- Dominio: el generado por Railway es suficiente (`*.up.railway.app`); dominio propio opcional después.
- `railway.json` en la raíz fija el builder a `DOCKERFILE` explícitamente. Un servicio creado desde cero vía `railway add --repo ...` no detectó el Dockerfile del repo por su cuenta y uso Railpack por defecto (se salta migraciones y `NODE_ENV=production`) — sin este archivo, cualquier servicio nuevo que se cree en el proyecto corre ese riesgo.
- **El seed nunca corre solo**: el `CMD` del Dockerfile solo hace `prisma migrate deploy`, no siembra usuarios ni rubros. Tras el primer deploy de un ambiente (o si se recrea la base), hay que correr el seed manualmente una vez: `railway ssh --service <servicio> --environment <ambiente> -- node dist/seed.js`.
- **Cookie de sesión detrás del proxy de Railway**: Railway termina TLS en su edge y reenvía por HTTP interno al contenedor. `server/src/index.ts` necesita `app.set('trust proxy', 1)` en production — sin esto, Express no reconoce la conexión como segura y la cookie de sesión (`secure: true`, requerido en production) nunca se activa: el login completa del lado del servidor (sesión se guarda) pero el navegador nunca la recibe/envía de vuelta, y el usuario vuelve a la pantalla de login sin ningún error visible.

## Decisiones y notas

- **Sin Redis, sin colas, sin microservicios**: el volumen es ~200 transacciones/mes. Todo síncrono.
- El parser del extracto vive aislado en `services/importer.ts` con un contrato `ParsedRow[]` — si el banco cambia el formato o agregan otro banco, se agrega otro parser sin tocar el resto (objetivo #4: reducir dependencia del formato del banco).
- Los cálculos de distribución/cierre viven en `services/summary.ts`, funciones puras con tests unitarios contra los números reales de Junio 2026 del sheet (caso de regresión).
- Seed idempotente: crea John, Lina, buckets actuales (36/16/0/48) y reglas semilla si no existen.
- Backups: Railway hace backups de Postgres; agregar además un endpoint/job de export mensual a xlsx (fase 2) para dormir tranquilos.
- HTTPS lo da Railway. Rate limit básico en `/api/auth/login`.
