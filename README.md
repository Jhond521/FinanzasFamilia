# Finanzas en Pareja

App monolítica de finanzas para dos usuarios (John y Lina): registro rápido de gastos, importación y
clasificación del extracto bancario, presupuesto por bolsas, tarjeta de crédito y cierre de mes.

Stack: Node.js 22 + TypeScript + Express (API) · React 18 + Vite + Tailwind (PWA) · PostgreSQL + Prisma ·
Docker + Railway (dev/prod). Ver `CLAUDE.md` y `docs/` para el contexto completo (PRD, modelo de datos,
API, arquitectura, plan de construcción).

## Instalación y desarrollo local

### Opción A — Docker (recomendada)

Es la forma normal de desarrollar: levanta base de datos + servidor + web como contenedores, con
hot-reload vía bind mount (el código local se monta dentro del contenedor y `npm run dev` corre
adentro). Solo hace falta tener **Docker Desktop** instalado y corriendo.

1. Clonar el repo y copiar el archivo de entorno:
   ```
   cp .env.example .env
   ```
   Los valores por defecto ya apuntan al Postgres del propio `docker compose` — anda sin tocar nada
   para lo básico. Detalle de cada variable en [Variables de entorno](#variables-de-entorno).
2. Levantar todo:
   ```
   docker compose up
   ```
   La primera vez (o después de cambiar dependencias en `package.json`), usar
   `docker compose up --build` — el build también instala `poppler-utils` + `tesseract-ocr` para el
   pipeline de OCR del extracto de Nu, así que puede tardar un par de minutos la primera vez.
3. Migrar y poblar la base (en otra terminal, con los contenedores ya corriendo):
   ```
   docker compose exec server npx prisma migrate dev
   docker compose exec server npm run seed
   ```
   El seed es idempotente: crea a John y Lina, los rubros (buckets) actuales y las reglas de
   clasificación semilla. Se puede correr las veces que haga falta.
4. Listo:
   - Web: http://localhost:5173 (proxyea `/api` hacia el server en `:3000`)
   - API: http://localhost:3000
   - Postgres: `localhost:5432` (usuario/clave `postgres`/`postgres`, base `finanzas_pareja`)

Para apagar todo: `docker compose down` (los datos de Postgres persisten en el volumen `db_data`; para
borrarlos también, `docker compose down -v`).

### Opción B — Sin Docker (Node y Postgres locales)

Requiere Node 22 y una instancia de Postgres accesible.

1. Base de datos: `docker compose up -d db` (solo el contenedor de Postgres) o un Postgres 16 propio.
2. Copiar `.env.example` a `server/.env` y ajustar `DATABASE_URL` si no es la de compose.
3. Instalar dependencias: `npm install` en la raíz (instala `server/` y `web/` vía workspaces).
4. Migrar y poblar, dentro de `server/`: `npx prisma migrate dev` y luego `npm run seed`.
5. Levantar todo: `npm run dev` desde la raíz (server con `tsx watch` + web con Vite, en paralelo).

## Variables de entorno

Ver `.env.example` para la lista completa con comentarios. Las más relevantes:

- `DATABASE_URL` — conexión a Postgres. Con Docker ya viene resuelta al servicio `db` del compose.
- `SESSION_SECRET` — secreto de la cookie de sesión (aleatorio y distinto por ambiente en Railway; en
  local cualquier valor sirve).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` / `ALLOWED_EMAILS` — login con
  Google OAuth y whitelist de acceso. **Sin estas variables el servidor arranca igual**, pero
  `/api/auth/google` responde 503. Para probar el login real hace falta crear credenciales OAuth en
  Google Cloud Console (una app, con un redirect URI autorizado por ambiente).
- `GOOGLE_SHEETS_*` — integración opcional del botón "Actualizar Sheet" (service account propio,
  separado de las credenciales de login). No hace falta para el resto de la app.
- `APP_URL` — a dónde redirige tras el login.

## Comandos

Los mismos scripts corren tanto dentro de Docker (`docker compose exec server ...` / `... web ...`)
como en local si se instaló con la Opción B — el código montado es el mismo.

- `npm run dev` — server (`tsx watch`) + web (Vite) en paralelo.
- `npm test` — vitest (server y web); lógica de negocio con tests unitarios en `server/src/services/`.
- `npm run lint` / `npm run typecheck`
- `npx prisma migrate dev` (correr en `server/`, o `docker compose exec server npx prisma migrate dev`)
  — nueva migración versionada. Nunca editar una migración ya aplicada.
- `npm run seed` (o `docker compose exec server npm run seed`) — usuarios, rubros y reglas semilla,
  idempotente.

## Cómo hacer incrementos (flujo de trabajo)

El desarrollo se organiza en un tablero de GitHub Projects (`ToDo → Ready → In Progress → In QA →
QA Done → Done`) y dos ramas de Git: **`develop`** (deploy automático a Railway *dev*) y **`main`**
(deploy automático a Railway *producción*, solo vía Pull Request desde `develop`).

### Con Claude Code (recomendado)

El repo trae comandos (`.claude/commands/`) que automatizan cada paso del ciclo sobre el tablero y los
ambientes de Railway:

| Comando | Qué hace | Mueve la tarjeta |
|---|---|---|
| `/enriquecer-todo` | Enriquece los tickets en **ToDo** con contexto del PRD, `docs/` y `design_specs/` (alcance, criterios de aceptación, notas técnicas). | ToDo → **Ready** |
| `/desarrollar <#>` | Desarrolla un ticket sobre `develop` con checklist (migración si aplica, servicio con tests, validación zod, UI mobile-first) y lo deja corriendo en local para prueba manual. | Ready → **In Progress** |
| `/publicar-dev <#>` | Push a `develop` → dispara CI y el deploy a Railway **dev** para probar. | In Progress → **In QA** |
| *(manual)* | Prueba manual en el ambiente dev (celular o browser). | In QA → **QA Done** |
| `/desplegar-prod` | Junta todo lo aprobado en **QA Done**, PR `develop → main`, espera CI en verde, hace merge → deploy **producción**. | QA Done → **Done** |
| `/quick-fix <#>` | Encadena los pasos de arriba sin pausas manuales (enriquecer → desarrollar → publicar dev → QA automático vía tests/smoke-check → producción). Solo para cambios chicos y de bajo riesgo; se detiene solo ante migraciones destructivas, tests en rojo o ambigüedad real. | ToDo/Ready → **Done** |

Reglas duras que estos comandos respetan siempre: nunca se saltea CI con un merge forzado, nunca se
corren migraciones destructivas o el seed en producción sin autorización explícita, y ante cualquier
ambigüedad real de alcance el pipeline se detiene a preguntar en vez de inventar.

`.claude/kanban.md` tiene los snippets de `gh`/GraphQL para descubrir el Project de GitHub y mover
tarjetas — lo usan todos los comandos de arriba, no hace falta tocarlo a mano salvo la primera vez
(pegar ahí los IDs descubiertos para no re-descubrirlos cada vez).

Requisitos para estos comandos: `gh` CLI autenticado con scope `project` (`gh auth login`, y si hace
falta `gh auth refresh -s project,read:project`), y Docker corriendo para el desarrollo local.

### A mano (sin Claude Code)

El mismo flujo, hecho manualmente:

1. Tomar un ticket del tablero, moverlo a **In Progress**.
2. Trabajar directo sobre `develop` (sin ramas feature): `git checkout develop && git pull`.
3. Implementar, con tests para la lógica de negocio nueva/tocada en `server/src/services/`. Correr
   `npm run lint && npm run typecheck && npm test` en verde antes de seguir.
4. Commit referenciando el número de ticket (`##NN`) y `git push origin develop` — dispara CI y el
   deploy a Railway dev. Mover la tarjeta a **In QA**.
5. Probar manualmente en el ambiente dev (URL `*.up.railway.app` del servicio `-dev`). Si pasa, mover
   a **QA Done**.
6. Cuando haya un lote listo en QA Done: `git checkout develop && git pull`, abrir un PR
   `develop → main` (`gh pr create --base main --head develop`), esperar CI, hacer merge — dispara el
   deploy a producción. Mover las tarjetas del lote a **Done**.

## Deploy

Push a `develop` → Railway dev; merge a `main` (vía PR, nunca push directo) → Railway producción. Las
migraciones (`prisma migrate deploy`) corren solas en el `CMD` del contenedor (ver `Dockerfile`) — el
seed **no** corre solo; tras el primer deploy de un ambiente nuevo hay que correrlo a mano:
```
railway ssh --service <servicio> --environment <ambiente> -- node dist/seed.js
```
Detalle de arquitectura, variables por ambiente y notas de despliegue (proxy de Railway, cookie de
sesión, etc.) en `docs/04-arquitectura-y-despliegue.md`.
