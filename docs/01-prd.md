# PRD — Finanzas en Pareja

Webapp monolítica para que John y Lina controlen sus finanzas mensuales, reemplazando el flujo actual de WhatsApp + Google Sheets ("Cuentas Familiares Mensuales"). Se construye con Claude Code, diseño con Claude Design, repo en GitHub y despliegue en Railway con dos ambientes (desarrollo y producción).

---

## 1. Contexto actual

1. Durante el mes anotan en WhatsApp cada transferencia: monto, descripción corta, quién la hizo (John o Lina) y fecha de registro.
2. A fin de mes descargan de la interfaz bancaria (Bancolombia) un `.xlsx` por persona con columnas: `Fecha`, `Descripción`, `Referencia`, `Valor` (negativo = gasto, positivo = ingreso).
3. En el Google Sheet clasifican cada transacción como **Personal**, **Conjunto** o **Movimientos** (traslados entre cuentas propias que no afectan el balance del mes), y agregan un detalle en texto libre porque la descripción bancaria suele ser ambigua.
4. Fórmulas del sheet distribuyen los ingresos del mes en rubros porcentuales y calculan cuánto lleva gastado cada bolsa.
5. Aparte, cada uno tiene tarjeta de crédito **Nu Bank**, que se maneja como control independiente (no afecta el mes).

## 2. Usuarios y acceso

- Exactamente dos usuarios: **John** y **Lina**. Sin registro público ni roles: ambos ven y editan todo. Todo registro guarda quién lo creó.
- **Login con Google (SSO/OAuth 2.0)**: botón "Continuar con Google", sin contraseñas propias. Solo se aceptan los dos emails de la whitelist: `jhond5@gmail.com` (John) y `lina.tic.isc@gmail.com` (Lina), configurados en la variable de entorno `ALLOWED_EMAILS`; cualquier otra cuenta de Google es rechazada con pantalla "cuenta no autorizada". Tras el OAuth se crea sesión propia con cookie `httpOnly` de larga duración (~90 días) para no re-loguearse en el celular.
- **Acceso ultra rápido al registro de gastos**: la ruta de registro rápido es la pantalla inicial en móvil, instalable como PWA (ícono en el home screen que abre directo en el formulario). Deep links por acción (p.ej. `/r?tipo=conjunto`) para crear atajos de "Gasto conjunto" / "Gasto personal" de un solo tap. Si la sesión expira, el flujo Google es un tap y regresa al formulario.

## 3. Requerimientos funcionales

### RF1 — Mes (período)

- La unidad de trabajo es el mes calendario. Un mes tiene: ingresos de cada persona (después de deducciones, digitados manualmente, admite líneas extra como primas), un snapshot de la configuración de rubros, transacciones y estado `abierto` | `cerrado`.
- Moneda: COP, `NUMERIC(14,2)` (existen valores con centavos, p.ej. intereses de $0.55). Nunca usar float.

### RF2 — Rubros de distribución configurables

Los ingresos totales de la pareja se reparten por porcentajes. Configuración actual:

| Rubro | % | Regla de reparto |
|---|---|---|
| Ahorros Conjuntos | 36% | Proporcional al ingreso de cada uno |
| Dinero Personal | 16% | Mitad y mitad (8% del total para cada uno) |
| Ayuda Familia | 0% | Desactivado actualmente |
| Gastos del Mes | 48% | Proporcional al ingreso de cada uno |

- Agregar/desactivar rubros sin borrar historia; editar porcentajes (los activos deben sumar 100%).
- Modo de reparto por rubro: `proporcional_al_ingreso` o `mitad_y_mitad`.
- **Config general vs. config del mes**: existe una configuración general (plantilla). Al crear un mes se instancia como snapshot propio del mes. Ese snapshot es **editable de forma independiente, incluso con el mes corriendo** (los cálculos del mes se recalculan al momento); solo se congela al cerrar el mes. Cambiar la config general NO toca meses ya creados: aplica a los meses que se instancien de ahí en adelante.
- Derivados por persona: `dejar_en_cuenta` = aporte a Gastos del Mes + Dinero Personal; `mover_a_ahorros` = aporte a Ahorros Conjuntos (se transfiere el día 1).

### RF3 — Registro rápido de gastos (reemplaza WhatsApp)

- Pantalla optimizada para móvil: monto, descripción corta, tipo (`personal` | `conjunto`), quién (default: el usuario logueado) y fecha (default hoy; accesos rápidos "ayer" y selector de día del mes).
- Acceso de un tap: pantalla inicial en móvil, ícono PWA en el home screen y deep links con el tipo preseleccionado (`/r?tipo=conjunto`, `/r?tipo=personal`).
- Criterio: registrar un gasto en la calle en menos de 10 segundos.
- Los registros quedan `pendiente_de_match` hasta cruzarse con el extracto bancario.

### RF4 — Importación del extracto bancario

- Subida de `.xlsx` (formato Bancolombia: `Fecha`, `Descripción`, `Referencia`, `Valor`). Parser tolerante a fechas `2026/06/01` y `2026/6/1` y a valores con `$` y comas.
- **Dueño del archivo**: siempre seleccionable al subir para evitar errores. El sistema lo pre-sugiere por el nombre del archivo (p.ej. `TrxJohnJun26.xlsx`) o, en su defecto, por el usuario que sube. Sin restricciones: John puede subir archivos de Lina y viceversa.
- **Anti-duplicados con archivos parciales solapados**: caso típico — se carga el extracto del 1 al 15, pero faltaron transacciones del día 15, y el siguiente batch es del 15 al 20 con filas ya subidas (además las filas no vienen ordenadas). Filtro por `(dueño, fecha, descripción original, valor)` con conteo: si el archivo trae N ocurrencias de una tupla y la BD ya tiene M para ese mes, se importan max(0, N−M); el resto se marca como duplicado omitido, no se descarta.
- **Pantalla de revisión de duplicados**: tras cada import con omitidos, vista comparativa por tupla — a la izquierda la(s) transacción(es) ya registrada(s) en BD, a la derecha la(s) fila(s) del archivo marcadas como duplicado. El usuario puede marcar cualquier fila como "no es duplicado, es una transacción gemela" (mismo día, lugar y valor, pero compra distinta — p.ej. dos cafés idénticos el mismo día en el mismo sitio) y forzar su importación individual. Lo no marcado queda descartado del batch.
- Cada import queda como lote (batch) con opción de deshacer completo (incluye lo importado directo y lo forzado desde la revisión de duplicados).

### RF5 — Clasificación de transacciones

Cada transacción tiene `tipo` (`personal` | `conjunto` | `movimiento` | `sin_clasificar`), **`categoría`** (Hogar, Transporte, Restaurante, Mercado, Servicios, Entretenimiento, Salud, Suscripciones, Otros... — lista configurable), `detalle` (texto libre), `dueño` y trazabilidad (`regla` | `match` | `usuario`). Los `movimiento` (traslados entre cuentas propias, nóminas) no suman ni restan en ningún total.

La **categoría se sugiere automáticamente** con un set de reglas determinísticas que leen la descripción bancaria (las mismas reglas del motor asignan tipo + categoría + detalle), y el usuario puede cambiarla manualmente después de subir el archivo, igual que el tipo.

La **descripción original del archivo del banco se conserva textual e inmutable** en cada transacción (`bank_description`, junto con la referencia original) y siempre se muestra en la UI al lado del detalle que escriba el usuario — nunca se sobreescribe.

Pipeline al importar, en orden:

1. **Match con registros rápidos** (RF3): mismo dueño, monto exacto (|valor|), fecha ±3 días, registro sin match → copia tipo y descripción y concilia ambos. Varios candidatos → cola de revisión. Un gasto conciliado se cuenta una sola vez.
2. **Motor de reglas** determinístico y configurable: `si Descripción contiene X → tipo + categoría + detalle`, con modo `auto` o `sugerir`. Reglas semilla:
   - `CARULLA`, `TIENDA D1`, `LA COLECTA`, `EL PALACIO`, `CERVALLE` → conjunto / Mercado
   - `AGUAS Y AGUAS`, `EMPRESA DE ACUEDUCT`, `EMPRESA DE ENERGIA`, `EFIGAS` → conjunto / Servicios
   - `PEXTO`, `MOVISTAR` → conjunto / Servicios / Celulares e internet
   - `EDS`, `BIOMAX` → conjunto / Transporte / Gasolina
   - `DROGUERIA`, `FARMACIA`, `MULTIDROGA` → conjunto / Salud / Farmacia
   - `DLO*Netfli`, `PRIME` → conjunto / Suscripciones
   - `FRISBY`, `RESTAURANT`, `BOLD SA*` (datáfonos), `RELLENITAS` → Restaurante (sugerir)
   - `PAGO CARTERA HIP` → conjunto / Hogar / Hipoteca
   - `ABONO INTERESES AHORROS` → personal / Otros / Intereses (auto)
   - `PAGO DE NOMI`, `PAGO INTERBANC SISTEMAS` → movimiento (nómina; el ingreso se digita aparte)
   - `PAGO SMARTFIT` → personal / Salud / Gimnasio
   - Pago tarjeta Nu → movimiento (por si aparece en el extracto)
3. **Aprendizaje**: si el usuario clasifica ≥3 veces la misma descripción con el mismo tipo/categoría, la app propone crear la regla.
4. Lo restante queda en la **cola de revisión**, diseñada para ser rápida: en móvil, tarjetas una por una con gestos de swipe (izquierda = personal, derecha = conjunto, arriba = movimiento) y categoría/detalle opcionales en la misma tarjeta; en PC, tabla con filtros y edición inline. Las sugerencias vienen precargadas (un tap/swipe = confirmar). La app pregunta lo que no sabe y automatiza lo que puede.

### RF6 — Tarjetas Nu Bank (módulo independiente)

- Control **separado del flujo mensual**: sus cifras NO afectan las bolsas — ni los items ni el pago (el pago se hace desde la cuenta de ahorros).
- **Flujo**: primero se escribe el `monto pagado` de la tarjeta ese mes; luego se registran las compras una a una (`descripción`, `fecha`, `monto`, `tipo` per/con) hasta que la suma cuadre con el pago. La UI muestra en vivo el progreso: `Σ items` vs. `monto pagado` y la `Dif` restante, con item de "Ajuste" permitido para cerrar diferencias pequeñas.
- **Finalidad**: saber qué porción del pago total fue personal y qué porción conjunta (totales informativos).
- **Import opcional del extracto Nu**: si logran exportar un archivo (csv/xlsx), la app permite subirlo para precargar los items en lugar de digitarlos uno a uno (parser propio de Nu, separado del de Bancolombia). Nu normalmente solo deja tomar el extracto en PDF sin capa de texto (una imagen por página): un pipeline de OCR (rasterizar + Tesseract, ##61) lo lee igual y precarga los items — siempre pasando por la misma pantalla de revisión antes de guardar, nunca persistir directo un monto leído por OCR.

### RF7 — Dashboard y cierre de mes

- Dashboard permanente: por bolsa presupuesto vs. gastado vs. disponible, con semáforo de **3 estados**
  (verde: <80% gastado · amarillo: 80–100% · rojo: >100%), tanto a nivel de bolsa como del gasto
  individual de cada persona dentro de ella. Card "Resumen del mes" con ingresos totales vs. gastado
  total (conjunto + personal de ambos). Conjunto contra Gastos del Mes; personal de cada uno contra su
  Dinero Personal.
- **Aporte por persona**: cada bolsa reparte primero su parte `mitad_y_mitad` (si aplica), y el ingreso
  remanente de cada persona se reparte entre las bolsas `proporcional_al_ingreso` — así la suma de lo
  asignado a una persona en todas las bolsas da exacto su ingreso (no se puede repartir bolsas con
  reglas distintas sin reconciliarlas).
- **Ahorro real**: cada persona responde por su propia bolsa de Gastos del Mes — si se pasó de su
  propio presupuesto, es un retiro de sus ahorros; si le sobró, es un bono. No se reparte el
  excedente/bono del hogar por ingreso (el total del hogar es solo informativo). Resultado: "John
  mueve $X a ahorros, Lina mueve $Y; dejar en cuenta $Z cada uno".
- **Cuadre de Inicio** (una vez por persona, al empezar el mes con las transacciones ya importadas):
  digita el saldo actual en su cuenta bancaria; la app calcula cuánto dejar en cuenta y cuánto mover a
  la cuenta de ahorros (Nu), y confirma si el saldo declarado cuadra con lo calculado.
- **Cierre de mes, individual por persona**, con un wizard paso a paso: bloquea si quedan transacciones
  sin clasificar o si el Cuadre de Inicio del mes siguiente no se ha hecho; pregunta por un gasto
  grande de ahorros opcional (vacaciones, compras grandes — afecta al mes que entra, no al que se
  cierra); muestra instrucciones concretas de qué mover en la cuenta de ahorros y qué saldo debe quedar
  tras cada paso; al confirmar el saldo real final, sugiere registrar la diferencia como "Rendimientos"
  si es positiva y está dentro de un umbral configurable. El mes solo pasa a `cerrado` cuando ambas
  personas cerraron su parte; reabrir individualmente es posible y revierte el mes a `abierto`.
- **Ahorros Familiares**: ledger histórico de todo lo que entra/sale de la cajita de ahorros de cada
  persona — aporte mensual (del mes que entra), ajuste del cierre, rendimientos, saldo inicial, y
  movimientos manuales (correcciones, gastos grandes). Cada entrada es editable y borrable a mano
  (con confirmación) para corregir errores sin tener que reabrir/re-cerrar un mes.
- **"Actualizar Sheet"**: botón en la pantalla de transacciones que sube las transacciones ya
  verificadas (según filtro Yo/pareja/ambos) al Google Sheet real que usaba la pareja antes de esta
  app, como respaldo/consulta — crea o reutiliza un tab `Auto-[Mes]-[Año]` copiando la plantilla real.
  Deshabilitado si quedan transacciones sin clasificar de las personas seleccionadas.
- Cerrar mes: congela cifras (summary JSON), genera resumen comparable mes a mes y crea el mes siguiente con la config vigente.

## 4. Objetivos / criterios de aceptación

1. Registrar un gasto desde el celular en <10 s, con fecha de hoy, ayer o cualquier día del mes.
2. Cargar extractos parciales o completos sin duplicados, con ≥70% de clasificación automática (reglas + match) en un mes típico (~200 transacciones).
3. Consolidado visible en cualquier momento; al cierre, cuánto mover a ahorros y cuánto dejar en cuenta.
4. Reducir dependencia del archivo del banco: el registro rápido captura los gastos en tiempo real y el extracto pasa a ser verificación.

## 5. Requerimientos técnicos

- **Stack**: Node.js 22 + TypeScript + Express; React 18 + Vite + Tailwind (PWA básica); PostgreSQL + Prisma; validación con zod; xlsx con SheetJS; `googleapis` para el export a Google Sheets. Monolito: Express sirve el frontend compilado y `/api/*` en un solo contenedor.
- **Auth**: Google OAuth 2.0 (passport o Auth.js), whitelist por variable de entorno (`ALLOWED_EMAILS=jhond5@gmail.com,lina.tic.isc@gmail.com`), credenciales OAuth separadas por ambiente (dev/prod tienen redirect URIs distintas). El export a Google Sheets usa credenciales **separadas** de un service account propio, no las de este login.
- **API REST** `/api`: auth, months (+ summary/incomes/export/sheet-export/comparison), Cuadre de Inicio, cierre individual (close-check/close-preview/close-mine/reopen-mine/closures), family-savings (ledger editable), quick-entries, imports (+ undo), transactions (+ bulk/match), rules (+ suggestions/apply), buckets, cards, settings. JSON, montos como string decimal, fechas ISO. Detalle completo en `03-api.md`.
- **Docker**: Dockerfile multi-stage; `CMD: npx prisma migrate deploy && node dist/index.js`. `docker-compose.yml` para desarrollo local (app + postgres).
- **GitHub + Railway**: ramas `develop` → environment development y `main` → production, cada uno con su Postgres. CI en PR (lint + typecheck + tests). Migraciones automáticas en deploy.
- Lógica de negocio (distribución, dedupe, match, summary, familySavings) en servicios puros con tests unitarios; regresión contra los números reales de meses reales (ver `distribution.test.ts`, `summary.test.ts`, `familySavings.test.ts`).
- Seed idempotente: usuarios John y Lina, buckets actuales y reglas semilla.

## 6. Fuera de alcance del MVP

Integración con APIs bancarias, multi-moneda, más de dos usuarios, presupuestos por categoría de gasto (solo por bolsa), app nativa. **Ya implementado** (dejó de ser roadmap): export mensual a xlsx, y un puente de vuelta a Google Sheets ("Actualizar Sheet") para quien quiera mantener el archivo viejo como respaldo — no contradice el objetivo original de reemplazarlo como herramienta de trabajo diario, es solo un espejo opcional. Roadmap pendiente: bot de WhatsApp, alertas de bolsa al 80%, import automático del correo del banco, más bancos.
