# Finanzas en Pareja

App monolítica de finanzas para dos usuarios (John y Lina). Ver `CLAUDE.md` y `docs/` para el contexto completo (PRD, modelo de datos, API, arquitectura, plan de construcción).

## Desarrollo local

1. Base de datos: `docker compose up -d db` (Postgres 16 en `localhost:5432`).
2. Copiar `.env.example` a `server/.env` y ajustar si hace falta (por defecto apunta al Postgres de compose).
3. Instalar dependencias: `npm install` (instala server y web vía workspaces).
4. Migrar y poblar: dentro de `server/`, `npx prisma migrate dev` y luego `npm run seed` (crea a John y Lina, idempotente).
5. Levantar todo: `npm run dev` desde la raíz (server con `tsx watch` + web con Vite en paralelo).

La web queda en `http://localhost:5173` (proxyea `/api` hacia el server en `:3000`).

## Google OAuth

El login usa Google SSO con whitelist (`ALLOWED_EMAILS`). Sin `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` configurados en `server/.env`, el servidor arranca igual pero `/api/auth/google` responde 503. Para probar el login real, crear credenciales OAuth en Google Cloud Console (una por ambiente, con su propio redirect URI) y completar esas variables.

## Comandos

- `npm run dev` — server + web en paralelo
- `npm test` — vitest (server y web)
- `npm run lint` / `npm run typecheck`
- `npx prisma migrate dev` — nueva migración (correr en `server/`)

## Deploy

Push a `develop` → Railway dev; merge a `main` → producción. Migraciones (`prisma migrate deploy`) corren en el `CMD` del contenedor (ver `Dockerfile`).
