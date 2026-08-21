# Documentación funcional — Finanzas en Pareja

Este documento describe **qué hace la app hoy**, pantalla por pantalla, desde la perspectiva de
quien la usa (John y Lina). A diferencia de `01-prd.md` (la intención original del producto), este
documento refleja el comportamiento real después de todos los tickets cerrados hasta la fecha
(incluye ##73/##75, el sistema de tipos configurables de registro rápido). Para detalle de modelo de
datos, API o arquitectura, ver `02-modelo-de-datos.md`, `03-api.md` y `04-arquitectura-y-despliegue.md`.

## 1. Qué es la app

Finanzas en Pareja es una app privada de dos usuarios (John y Lina) para reemplazar una hoja de
Google Sheets que llevaban a mano. Cada mes reparte los ingresos del hogar en **bolsas** (rubros
configurables: Ahorros Conjuntos, Dinero Personal, Gastos del Mes, y opcionalmente otras como "Ayuda
Familia"), sigue el gasto real contra esas bolsas, y al cerrar el mes calcula cuánto ahorro real le
corresponde a cada quien. Es mobile-first: la pantalla de arranque en el celular es el registro
rápido de gastos, no el dashboard.

## 2. Acceso y navegación

- **Login**: exclusivamente con Google OAuth ("Continuar con Google"). Solo dos correos están en la
  whitelist (`ALLOWED_EMAILS`); cualquier otra cuenta cae en la pantalla **Usuario no autorizado**
  (mensaje de error + botón para volver al login). La sesión dura ~90 días vía cookie, para no tener
  que re-loguearse seguido en el celular.
- **Navegación**: una barra superior con los links Dashboard / Importar / Revisar / Transacciones /
  Tarjetas / Ahorros Familiares / Configuración, presente en todas las pantallas **excepto** el
  Registro rápido (`/r`), que es intencionalmente minimalista (ver sección 3) y solo tiene un botón
  de vuelta al Dashboard (##72).

## 3. Registro rápido (`/r`)

Es la pantalla de entrada en móvil (instalable como PWA, ícono en el home screen). Pensada para
anotar un gasto en menos de 10 segundos, reemplazando lo que antes se avisaban por WhatsApp.

- **Campos**: monto (teclado numérico grande, autofoco — ##18), descripción corta, tipo, fecha
  (chips "Hoy" / "Ayer" / "Otro día…", default hoy), quién (default el usuario logueado).
- **Monto negativo = ingreso** (##67): si se escribe un monto negativo (ej. una transferencia que le
  hicieron a uno), se registra como un ingreso puntual que resta del gastado, igual que un abono en
  el extracto bancario.
- **Tipos configurables** (##73): el toggle ya no está fijo a "Personal"/"Conjunto". Muestra botones
  por cada tipo **activo** que exista en Configuración → Tipos de registro rápido, en el orden que se
  haya definido ahí. De fábrica hay dos: **Conjunto** (preseleccionado por defecto desde ##75) y
  **Personal**; se pueden agregar más (ej. "Ayuda Familia") sin tocar código.
- **Deep links de un tap** (PRD): `/r?tipo=conjunto` y `/r?tipo=personal` abren el formulario con ese
  tipo ya seleccionado — pensados como atajos de home screen. Si no hay parámetro, se preselecciona
  el primer tipo activo (hoy: Conjunto).
- **Últimos registros**: debajo del formulario, lista de los registros del mes abierto, cada uno
  editable (toca para volver a cargarlo en el formulario) o borrable (con confirmación — ##20).
- **Funciona sin conexión** (##65): si no hay red al guardar, el registro se encola localmente
  (IndexedDB) y se sincroniza solo cuando vuelve la conexión o se reabre la pantalla. Los pendientes
  de sincronizar se muestran en su propia lista, con reintentar/borrar y el error del servidor si
  alguno falló (ej. el mes ya no existe). Los registros encolados también se pueden editar o borrar
  antes de que sincronicen.
- **Match con transacciones** (Fase 3): cuando el extracto del banco se importa y calza con un
  registro rápido pendiente (mismo dueño, mismo monto, fecha cercana), el registro pasa a estado
  `matched` y deja de contar en los totales — el gasto ya lo representa la transacción real, evitando
  doble conteo.

## 4. Dashboard

Pantalla principal en escritorio (y accesible en móvil vía el botón de vuelta desde `/r`).

### 4.1 Selector de mes y creación

Un desplegable en la parte superior elige qué mes ver; "+ Crear mes" abre un formulario chico
(mes/año) que, al crearlo, copia como snapshot los **rubros activos** vigentes en Configuración hacia
ese mes (`month_buckets`) — cambiar la plantilla general después no afecta meses ya creados.

### 4.2 Resumen del mes

Tarjeta con ingresos totales, gastado (conjunto + personal) y disponible, con una barra de progreso
en semáforo (verde/amarillo/rojo según % gastado del presupuesto sumado de las bolsas que trackean
gasto). Debajo, si hay transacciones sin clasificar o registros rápidos sin match, aparecen contadores
con link directo a Revisar.

### 4.3 Ingresos del mes

Un campo de monto por persona (label "Salario" por defecto). Editable mientras el mes esté abierto;
se bloquea si el mes ya se cerró.

### 4.4 Cuadre de Inicio (ticket #29, refinado en #31/#33)

Wizard que se corre **al empezar el mes**, una vez por persona, para repartir lo que hay en la cuenta
bancaria entre "lo que se deja en cuenta" (Gastos del Mes + Dinero Personal) y "lo que se mueve a Nu"
(ahorros). Flujo:

1. Confirma que ya existen transacciones importadas y al día para ese mes (si no, redirige a Importar).
2. Pide el saldo actual de la cuenta.
3. Muestra el desglose calculado: total Gastos del Mes, aporte a Ahorros Conjuntos, total Ahorros
   Personales, gastos a la fecha → cuánto dejar en cuenta y cuánto mover a Nu.
4. Tras hacer la transferencia real, pide confirmar el nuevo saldo de la cuenta.
5. Si coincide con lo esperado, éxito; si no, pantalla de "no coincide" con la diferencia exacta y
   accesos directos a revisar transacciones o corregir el saldo.

Se guarda un historial por persona y mes (nunca se borra); si ya se hizo, el botón ofrece "repetirlo"
con confirmación en vez de sobrescribir en silencio. Un check visual (✓/○) muestra el estado de cada
persona y si el cuadre está completo para ambas.

### 4.5 Rubros de este mes ("Configurar mes")

Panel plegable para ajustar, **solo para el mes seleccionado** (no la plantilla general), el % y
activo/inactivo de cada bolsa. Bloqueado si el mes está cerrado. Exige que las bolsas activas sumen
exactamente 100% antes de dejar guardar.

### 4.6 Presupuesto por bolsa

Una tarjeta por bolsa activa del mes, con: nombre, % y tipo (Ahorro/Personal/Gasto conjunto/Otro),
presupuesto en pesos, y — solo para las bolsas que trackean gasto (Personal y Gasto conjunto) — barra
de semáforo, gastado y disponible, con el mismo desglose **por persona** debajo (##44, disponible por
persona agregado en ##70). El semáforo pasa a amarillo a partir del 80% gastado y a rojo al pasarse
del presupuesto.

### 4.7 Cierre del mes · ahorro real

Sección de fondo oscuro con el resultado: si "Gastos del Mes" se pasó del presupuesto en total, un
texto explica que el sobregasto (o el bono, si sobró) lo asume quien lo generó — **no se reparte por
ingreso**, cada quien responde por su propia bolsa (##47). Por persona se muestra cuánto mueve a
ahorros y cuánto deja en cuenta.

#### Cierre individual por persona (ticket #34, wizard refinado en #36)

Cada persona cierra **su propia parte** del mes de forma independiente (no hay un botón único de
"cerrar el mes"). El mes queda `closed` de verdad recién cuando ambas lo cerraron. Se puede reabrir la
propia parte si hace falta corregir algo. El botón "Cerrar mi parte" solo se habilita cuando el mes
calendario ya terminó (##33 — no se puede cerrar un mes en curso).

El wizard de cierre:

1. Chequea que no haya transacciones sin clasificar (si las hay, bloquea con link a Revisar) y que ya
   se haya hecho el Cuadre de Inicio del mes **siguiente** (si no, bloquea con link al Dashboard).
2. Pide el saldo actual en Nu (general, no la cajita de Ahorros).
3. Pregunta si hubo un "gasto grande de ahorros" este mes (vacaciones, compras grandes) — si sí,
   monto y descripción; el sistema sugiere candidatos mirando transacciones tipo `movement` del mes
   que no parezcan nómina (##39). Ese gasto grande resta de los ahorros del **mes siguiente**, no del
   que se está cerrando (##40), porque afecta el saldo que recién se va a mover.
4. Muestra una guía paso a paso de qué mover en Nu (ajuste de Gastos del Mes del mes que cierra,
   luego el ahorro del mes que entra ya descontado el gasto grande, y el excedente a ahorro personal)
   con el saldo esperado después de cada movimiento (##42).
5. Pide el saldo final en la cajita de Ahorros Conjuntos tras hacer esos movimientos, y lo compara
   contra lo calculado (histórico del ledger de Ahorros Familiares + lo de este cierre). Si cuadra
   exacto, listo. Si la diferencia es chica (≤ el umbral configurado en Configuración → Configuración
   general, default $200.000), ofrece registrarla automáticamente como "Rendimientos". Si es más
   grande, deja completar el cierre igual pero avisa que hay que revisar manualmente (se puede agregar
   un ajuste a mano en Ahorros Familiares).

Al cerrar, se registra un evento en Ahorros Familiares (ahorro del mes + el ajuste correspondiente, y
"Rendimientos" si se aceptó).

### 4.8 Comparativo mes a mes

Tabla con los meses ya cerrados (usa el snapshot congelado en `month_summaries`, no recalcula en
vivo): ingresos, gastado conjunto y ahorro real total, uno por fila.

### 4.9 Exportar a Excel

Botón que descarga un `.xlsx` con el detalle del mes seleccionado.

## 5. Importar extracto

Pantalla para subir el `.xlsx` del extracto de Bancolombia:

- Selecciona mes destino y **dueño del archivo** (se sugiere automáticamente por el nombre del
  archivo si contiene "John" o "Lina").
- Dropzone/selector de archivo con preview de las filas leídas (fecha, descripción, valor) antes de
  confirmar.
- Al importar: se deduplican filas ya existentes (mismo mes+dueño+fecha+descripción+valor, contando
  cuántas veces ya aparecen vs. cuántas trae el archivo), se corre el motor de reglas para
  auto-clasificar lo que se pueda, y se intenta matchear automáticamente contra registros rápidos
  pendientes (mismo dueño/monto/fecha cercana — match único, sin ambigüedad).
- Resultado del batch: importadas / duplicados omitidos / auto-clasificadas / a revisar, más un aviso
  si alguna fila quedó fuera por tener fecha fuera del mes seleccionado.
- **Revisar duplicados**: si hubo duplicados omitidos, se puede abrir una comparación lado a lado
  (transacción ya existente vs. fila detectada en este archivo) para, fila por fila, marcarla como
  "duplicado confirmado" (se descarta) o "es una transacción gemela" (compra distinta con los mismos
  datos, ej. dos cafés el mismo día — se importa igual). Hay un botón para confirmar todo lo demás
  como duplicado de una vez.
- **Historial de batches**: lista de archivos importados con su dueño, contadores, y botón
  **Deshacer** (revierte el batch completo, incluidas las gemelas forzadas) mientras no se haya
  deshecho ya.

## 6. Revisar (cola de clasificación)

Cola de transacciones importadas que quedaron sin clasificar o a revisar, filtrable por mes y por
dueño (Yo / la otra persona / Ambos).

- **Banner de aprendizaje**: si un mismo patrón de descripción se marcó manualmente varias veces con
  el mismo tipo, la app pregunta si quiere convertirlo en regla automática ("¿Creo la regla?").
- **Candidatos de match**: cuando una transacción tiene más de un registro rápido pendiente que
  calzaría (mismo monto/dueño/fecha cercana), no se auto-matchea — aparece en una sección aparte para
  elegir manualmente cuál registro corresponde.
- **Tarjetas de clasificación**: una tarjeta por transacción (fecha, dueño, descripción del banco tal
  cual, valor), con:
  - Si hay conflicto entre reglas activas, chips con las categorías sugeridas por cada regla en
    conflicto.
  - Chips de categoría (Hogar, Transporte, Mercado, etc.) y un campo de detalle libre.
  - Tres botones de tipo: **Personal**, **Movimiento**, **Conjunto**.
  - En pantallas táctiles, swipe horizontal también clasifica (izquierda = Personal, derecha =
    Conjunto — RF5); el swipe vertical no está implementado por conflicto con el scroll de la lista,
    así que "Movimiento" solo tiene el botón. Cada clasificación muestra un toast de confirmación y
    la siguiente tarjeta entra con una animación.

## 7. Transacciones del mes

Tabla completa de las transacciones del mes, con filtros por tipo (Todos/Conjunto/Personal/
Movimiento), texto libre en la descripción, y por dueño (Yo/otra persona/Ambos). Cada fila permite
edición inline: detalle (texto libre), tipo (select con pill de color) y categoría — cualquier cambio
guarda al instante.

**Botón "Actualizar Sheet"** (##51): sube al Google Sheet real las transacciones ya verificadas de las
personas seleccionadas en el filtro de dueño. Se deshabilita si esa selección tiene alguna transacción
todavía sin clasificar ("needs review") — evita subir información a medio depurar.

## 8. Tarjetas (Nu Bank)

Módulo **independiente**: no afecta las bolsas del mes ni sus cálculos, es solo un control de
conciliación de la tarjeta de crédito de cada quien.

- Selector de tarjeta (una por persona) y de mes/ciclo.
- **Monto pagado**: el valor total pagado en el ciclo, capturado primero.
- **Items**: se agregan uno a uno (descripción, fecha, monto, Personal/Conjunto), con dos formas de
  cargarlos:
  - **Fila de captura rápida** (##60): Tab/Enter entre campos, sin soltar el teclado, para meter
    varias compras seguidas.
  - **Formulario "+ Item"** clásico, o **"+ Ajuste"** para diferencias chicas (montos negativos
    permitidos para devoluciones/cancelaciones).
  - **Importar extracto Nu** (csv/xlsx instantáneo, o **PDF vía OCR server-side** — ##59/##61, más
    lento) para precargar filas, editables antes de guardarlas en bloque; el tipo se asigna por fila
    antes de confirmar.
- **Barra de progreso**: Σ de los items registrados contra el monto pagado, con semáforo (cuadra /
  falta / se pasó) y aviso si quedó de más para que se ajuste.
- **Resumen del mes**: split Personal vs. Conjunto de lo registrado, en monto y %.

## 9. Ahorros Familiares (ticket #36, editable desde #49)

Ledger manual de los ahorros de cada persona (independiente del ciclo de cierre de mes, aunque el
cierre también escribe eventos acá):

- Tarjetas de saldo por persona + total del hogar (suma de todas sus entradas).
- Filtro Yo/otra persona/Ambos.
- Tabla de movimientos: fecha, persona, tipo (Saldo inicial / Ahorro del mes / Ajuste de cierre /
  Rendimientos / Manual), descripción, monto (negativo resta).
- Cualquier movimiento se puede **editar o borrar** (confirmación en dos pasos para borrar), y hay un
  formulario para agregar movimientos manuales libres (correcciones, saldo inicial, retiros).

## 10. Configuración

Panel de administración, con estas secciones:

- **Configuración general**: umbral (en pesos) para que el wizard de cierre de mes sugiera
  "Rendimientos" cuando el saldo real de Nu no cuadra exacto contra lo calculado (default $200.000).
- **Rubros — configuración general**: CRUD completo de bolsas (nombre, %, modo de reparto
  proporcional al ingreso o mitad y mitad, tipo semántico Ahorro/Personal/Gasto conjunto/Otro,
  activo). Es la plantilla que se copia a cada mes nuevo; exige que las bolsas activas sumen 100%.
  Editar esta plantilla **no** afecta meses ya creados.
- **Tipos de registro rápido** (##73): CRUD de los tipos seleccionables en `/r` — nombre libre (ej.
  "Ayuda Familia"), tipo semántico fijo (Personal / Conjunto / Movimiento — determina cómo cuenta el
  registro en los totales) y activo/desactivar. No se puede desactivar el último tipo activo, para
  que `/r` nunca se quede sin ninguna opción.
- **Reglas de clasificación**: CRUD de reglas del motor determinístico de la cola de Revisar — patrón
  de texto (case/acentos-insensitive), tipo a asignar, categoría, detalle opcional, modo (Auto aplica
  directo / Sugerir deja la transacción en revisión con la sugerencia precargada), activar/desactivar
  y borrar. Se ve el origen de cada regla (Semilla/Manual/Aprendida) y cuántas veces se disparó.

## 11. Reglas de negocio transversales

Estas reglas aplican en toda la app, no son de una sola pantalla:

- **Los gastos se guardan negativos**, igual que en el extracto bancario; un monto positivo en un
  registro/transacción es un ingreso o abono real y **resta** del gastado.
- **`movement` no entra en ningún total**: traslados entre cuentas propias (ej. pago de nómina interna,
  pago de la tarjeta) no suman ni restan presupuesto, ni en registros rápidos ni en transacciones.
- **Las tarjetas son un control aparte**: lo que se registra en Tarjetas nunca toca las bolsas del mes.
- **Nadie carga con el gasto del otro**: el sobregasto o bono de una bolsa lo asume quien la generó —
  no hay reparto por ingreso al cerrar (##47).
- **Un registro rápido matcheado deja de contar**: una vez concilia con una transacción real, el gasto
  lo representa la transacción, no el registro (evita doble conteo).
- **Nada se borra del histórico de auditoría**: Cuadre de Inicio, cierres de mes y entradas de Ahorros
  Familiares se acumulan como eventos, nunca se sobrescriben en silencio (se puede "repetir" o
  "reabrir", pero queda constancia de lo anterior).

## 12. Evolución del producto (resumen por tema)

Para contexto histórico — no hace falta leer cada ticket, pero ayuda a ubicar cuándo/por qué se
tomó una decisión de producto:

- **Fases de construcción iniciales** (#1–#5): registro rápido → importación/clasificación → tarjetas
  Nu Bank → cierre de mes → pulido general.
- **Ajustes tempranos de UI/datos** (#8, #9, #10, #11, #12, #14, #16, #17): colores, pantalla de no
  autorizado, inputs numéricos, columnas superpuestas, date picker de meses anteriores, seed de
  reglas, botón de crear regla.
- **Registro rápido, UX** (#18, #19, #20): autofoco en monto, zoom raro al escribir, confirmación al
  borrar.
- **Cola de Revisar** (#23, #24, #26, #28): animación de swipe, revisión general del tab, filtro por
  persona, bug de categorías que no marcaban.
- **Cuadre de Inicio y cierre de mes** (#29, #31, #33, #34, #36, #38, #39, #40, #42, #44, #47, #53,
  #55): toda la lógica descrita en la sección 4.4/4.7 se construyó y refinó en esta tanda de tickets;
  #53 fue el fix del cálculo de reparto proporcional vs. mitad-y-mitad que garantiza que la suma de
  aportes de una persona da exacto su ingreso.
- **Transacciones / Sheet** (#49, #51): ledger editable de Ahorros Familiares, botón Actualizar Sheet.
- **Tarjetas** (#58, #59, #60, #61, #63): mejoras de UX, importación de extracto Nu (primero xlsx/csv,
  luego PDF vía OCR), captura rápida por teclado, orden de la tabla.
- **Registro rápido, fase 2** (#65, #67, #70): funcionamiento offline con sincronización automática,
  permitir montos negativos como ingresos, mostrar disponible por persona en el desglose de bolsas.
- **Tipos de registro configurables** (#72, #73, #75): botón de vuelta al Dashboard desde `/r`,
  sistema de tipos configurables (deja de estar hardcodeado a Personal/Conjunto), y Conjunto como
  selección por defecto.
