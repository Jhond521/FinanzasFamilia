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
- Un proyecto Railway con **dos environments**: `development` (deploy automático desde `develop`) y `production` (desde `main`). Cada environment con su servicio Postgres y su `DATABASE_URL`.
- Variables por ambiente: `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV`, `APP_URL`.
- Flujo: feature → PR a `develop` (CI: lint + tests) → probar en dev → PR `develop` → `main` → producción. Migraciones corren solas en el deploy (`migrate deploy` en el CMD).
- Dominio: el generado por Railway es suficiente (`*.up.railway.app`); dominio propio opcional después.

## Decisiones y notas

- **Sin Redis, sin colas, sin microservicios**: el volumen es ~200 transacciones/mes. Todo síncrono.
- El parser del extracto vive aislado en `services/importer.ts` con un contrato `ParsedRow[]` — si el banco cambia el formato o agregan otro banco, se agrega otro parser sin tocar el resto (objetivo #4: reducir dependencia del formato del banco).
- Los cálculos de distribución/cierre viven en `services/summary.ts`, funciones puras con tests unitarios contra los números reales de Junio 2026 del sheet (caso de regresión).
- Seed idempotente: crea John, Lina, buckets actuales (36/16/0/48) y reglas semilla si no existen.
- Backups: Railway hace backups de Postgres; agregar además un endpoint/job de export mensual a xlsx (fase 2) para dormir tranquilos.
- HTTPS lo da Railway. Rate limit básico en `/api/auth/login`.
