# Revisión completa PandaFactoryPOS — 2026-07-07

## ESTADO — Cuarto critique de diseño (2026-09-20/21)

Se corrieron cuatro evaluadores aislados sobre `src/pages/POS.tsx` (revisión de
diseño, escena real de cobro, detector + medición, conformidad con DESIGN.md).
A ninguno se le dijo qué se había cambiado antes, que es lo que hizo que
encontraran regresiones introducidas en la propia sesión. Puntaje 22/40.

### Los dos P0, los dos introducidos en esta sesión

- **Ninguna venta ni proforma podía registrarse.** `SaleSchema` pide
  `invoiceNumber: z.string().min(1)` y el POS mandaba `''` a propósito, para que
  el preview ocultara el renglón del número en vez de mostrarle al cliente un
  texto interno. Las dos decisiones eran correctas por separado; juntas mataban
  toda escritura en el `safeParse` previo a la transacción. Ni `tsc` ni el build
  podían verlo (el tipo sigue siendo `string`). **Los critiques #2 y #3
  corrieron sobre ese build y no lo vieron**, porque revisaban diseño y ninguno
  caminó la transacción. Arreglado validando una copia con número de relleno
  (`.omit()` no sirve: lanza sobre schemas con `.refine`).
- **F2 facturaba un formulario congelado.** Un arreglo de dependencias con
  `eslint-disable` congeló la clausura del efecto de atajos: todo lo que el
  operador tocara después era invisible para F2/F3, porque nada de eso cambia la
  cantidad de líneas. Apretar F2 con el formulario lleno emitía una factura con
  el cliente vacío, EFECTIVO y a precio de lista.

### Aplicado (commits `0c44d5b`, `a24671f`, `24bfe9e`, `fe9c09f`, `5690518`, `c364745`)

- **Reintentar una venta es idempotente.** `recordSale` lee `sales/{id}` dentro
  de la transacción y sale sin escribir si ya existe. Antes, un reintento tras
  un fallo ambiguo (`unavailable`/`deadline-exceeded`) descontaba stock dos
  veces, saltaba un correlativo y dejaba dos movimientos de kardex con el mismo
  `refId`.
- **El mostrador cobra el precio vigente.** `precioVigente()` se extrajo a
  `validations.ts` y la usan el POS y `buildPublicCatalogDoc`, así que el
  mostrador y el catálogo público no pueden divergir. Antes PandaWEB mostraba
  `precioPromo` y la caja cobraba `price`. Verificado que el catálogo público no
  cambia (7 casos borde).
- **No se puede facturar un envío sin dirección ni teléfono.**
- **Un escaneo fallido ya no envenena los siguientes** (el código quedaba pegado
  en el buscador y todo escaneo posterior concatenaba encima).
- **El aviso de una venta financiada muestra el total a plazos**, no el de
  contado.
- **Semántica de diálogo en los 7 modales que no la tenían** + trampa de foco en
  los 10 que la necesitaban. `useFocusTrap` estaba importado en tres archivos y
  nunca se llamaba. Los tres modales de Inventario compartían `id="modal-title"`.
- **142 de 144 controles de formulario tienen nombre accesible** (69 `htmlFor`,
  88 `aria-label`; los 2 restantes son asociación implícita, correcta).
- **144 de 146 botones declaran anillo de foco** (antes 47).
- **La paleta volvió a cinco colores**: fuera indigo, fuchsia, red y el gradiente
  decorativo de la tarjeta de cliente.
- **Doctrina plana**: 18 sombras en reposo quitadas (decisión del usuario).
- **Dos clases que no generaban CSS**: `aspect-w-1/aspect-h-1` (plugin no
  instalado) y `text-md` ×6 (no existe en Tailwind), verificado contra el CSS
  compilado.
- **DESIGN.md se contradecía a sí mismo en diez lugares** y sus ratios estaban
  calculados sobre los hex de Tailwind v3 cuando el proyecto compila v4 en
  OKLCH. Corregido, con las métricas fechadas.

### Segunda tanda (2026-09-21, commits `a7a5bf2` … `b6927de`)

- **El error de una venta fallida ya no desaparece solo.** El Toast borraba
  TODO aviso a los 4,5 s; los errores ahora se quedan hasta que se cierran. Y
  el diálogo marca la falla junto al botón, que pasa a decir "Reintentar" —
  seguro ahora que `recordSale` es idempotente.
- **El botón decía "Confirmar Venta" en una cotización.** Dice "Guardar
  Cotización".
- **Facturar una proforma es idempotente.** El id de la factura se deriva de la
  proforma (`uuidv5`) en vez de sortearse, y las dos escrituras tienen su propio
  try/catch: después de un `recordSale` exitoso nada puede volver a decir que no
  se pudo facturar. Antes un fallo de `updateSale` se comía el éxito, y el único
  botón disponible creaba una segunda factura.
- **La app imprime.** Botón "Imprimir" con `window.print()` sobre una hoja
  `@media print` nueva, que reusa la paginación que el preview ya calculó.
  *Falta verlo con la app corriendo: las reglas compilan y están en `dist/`,
  pero no hubo navegador en la sesión.*
- **Recuperar un borrador reconcilia contra el catálogo:** descarta productos
  borrados, refresca el stock, acota la cantidad, limpia el `customerId` muerto
  y el aviso dice qué cambió. El precio negociado se respeta.
- **Los dos campos casi homónimos del bloque de pago** ("Referencia de Pago" /
  "Nota / Referencia", con el placeholder del segundo describiendo al primero)
  ahora dicen qué son y adónde van.
- **El descuento manual se acota al tipear:** antes el total se pintaba en
  negativo, en turquesa, y el error llegaba recién al facturar.
- **El precio de efectivo subió al cierre fijo**, junto al total. Era el último
  elemento del área con scroll y quedaba fuera de pantalla siempre.
- **Un solo sistema de avisos:** Configuración tenía el suyo, con su estado y su
  temporizador. Migrado al Toast.
- **La rampa tipográfica está medida y documentada**, con su deuda al lado.
- **144 de 146 botones y 142 de 144 controles** con foco y nombre accesible.

### Pendiente

- **Ver la impresión con la app corriendo.** El botón "Imprimir" ya existe y sus
  reglas compilan, pero nadie vio todavía una vista previa real. Conviene abrir
  una factura de dos páginas y hacer Ctrl+P una vez. Si algo sale mal, el camino
  del PDF quedó intacto. (El ticket de 80mm del P4.6 sigue siendo trabajo aparte.)
- **El `shadow-lg` del botón primario** es la única excepción viva a la doctrina
  plana. Un botón no flota, así que estrictamente la regla lo alcanza; queda
  anotado en DESIGN.md y sin decidir porque toca el control más visible.
- **`text-[11px]` ×28** es un escalón real de la consola que la rampa de
  DESIGN.md no documenta, y 22 `text-[10px]` viven dentro de los lienzos de
  papel, donde ese paso no pertenece.
- **Colapsar los 27 usos de 9px y 11px de la consola a 10px.** Viven en cajas
  angostas donde agrandar puede hacer saltar el texto a dos líneas: hay que
  verlo con la app corriendo.

---

## ESTADO — Fixes del smoke test de Carlos (2026-07-08)

- **WhatsApp CON el PDF adjunto**: el preview de factura (POS post-venta, Historial y CRM) tiene botón "Enviar por WhatsApp" que genera el PDF y lo comparte vía `navigator.share` (Windows 10+/Android/iOS lo enrutan a WhatsApp con el archivo adjunto). Si el navegador no soporta compartir archivos, fallback: descarga el PDF y abre el chat wa.me con el texto para adjuntarlo a mano (con aviso). Los botones de WhatsApp en las filas ahora abren el preview con el envío listo (wa.me solo nunca pudo adjuntar archivos).
- **Numeración desde el máximo histórico**: (1) auto-siembra — la primera vez que no existe el contador, se toma el número máximo ya usado (soporta legacy "A001543" y nuevo "A-001543") y se arranca desde ahí; (2) **Configuración → "Próximo número de factura"** para fijarlo a mano (caso de Carlos: fijar 1401; el contador ya existía por las pruebas, así que la siembra automática no aplicaba). Las ventas de prueba A-000001… se pueden anular y borrar del Historial.

---

## ESTADO — P4 aplicado el 2026-07-08 (excepto P4.6)

- **P4.1 Español al 100%**: Inventario, Clientes e Historial traducidos por completo (tablas, modales, placeholders, chips de estado — "Completada/Devuelta/Cancelada").
- **P4.2 Filtros en Historial**: rango de fechas (parseo local), estado y método de pago + botón "Limpiar filtros" + contador de resultados. Operan sobre las ventas cargadas (ventana + páginas).
- **P4.3 Inventario**: chips de filtro por categoría (con conteo por categoría) y orden clickeable por Nombre y Precio además de Stock.
- **P4.4 Dashboard temporal**: card de Ventas con selector Hoy / 7 días / 30 días, consultado POR RANGO a Firestore (sin tope de 100) y **comparación % contra el período anterior** de igual longitud (↑ verde / ↓ rojo).
- **P4.5 Confirmación de borrado en ventas**: modal con resumen (factura, cliente, total C$/USD) y consecuencias explícitas; reemplaza el doble-clic solo en Historial (productos/clientes/compras mantienen el doble-clic, decisión de alcance).
- **P4.7 Menores**: `index.html` con `lang="es"` y título "pandastore — Sistema de Gestión"; login sin `<img>` rota (icono directo); columna Estado de Inventario refleja `activo=false` ("Inactivo"); **ESC cierra modales** en Inventario, Clientes, Historial, Compras y el preview de factura (hook `useEscapeKey`, cierra el de más arriba primero). Focus-trap queda pendiente (requiere lib para hacerlo bien).
- **P4.6 PDF nativo (jspdf-autotable) + ticket 80mm: PENDIENTE a propósito** — rediseñar la factura sin poder previsualizarla antes del deploy es riesgo de regresión visual; el raster actual funciona. Hacerlo con la app corriendo a la vista.

---

## ESTADO — P3.5 aplicado el 2026-07-08

- **Ids unificados**: los productos nuevos SIEMPRE llevan id `uuid` (Catálogo ya no usa el SKU tipeado como id → muere el riesgo de charset A4). El **SKU es campo propio con check de unicidad** (case-insensitive) en `addProduct`/`updateProduct`; el SKU autogenerado de compras ahora es único (timestamp base36). Los productos legacy conservan su id.
- **Form consolidado (versión pragmática)**: el Catálogo Maestro es la ficha COMPLETA — ganó sección "Datos POS" (costo, stock inicial solo en alta, alerta mínima) y campo SKU editable. Inventario **ya no crea productos** (su botón lleva al Catálogo); conserva edición rápida, ajuste de stock con kardex, bulk y borrado. El stock NO se edita desde Catálogo (siempre vía Inventario → kardex con motivo). Nota: se optó por secciones claras en un solo form en vez de pestañas literales (ocultar campos required rompe la validación nativa).
- **specsProyector por slug**: `isProjectorCategory()` compara el slug normalizado (acepta "Projector", "Proyectores", etc.); antes renombrar la categoría perdía las specs en silencio.
- **Errores humanos**: `handleFirestoreError` ahora lanza mensajes legibles por código (`permission-denied` sugiere desplegar reglas, `unavailable` → sin conexión, `resource-exhausted` → cuota Spark, etc.); el detalle técnico va a console.error.
- **Limpieza**: eliminados `_probe_fichas.mjs` y `firebase-blueprint.json`; `Magcubic_Fichas_Productos.xlsx` movido a `docs/`; README actualizado; scripts duplicados `publicar:tablet*` removidos de package.json (quedan `backfill`/`backfill:dry`).

---

## ESTADO — P3.1 aplicado el 2026-07-08

**StoreDataProvider** (`src/context/StoreContext.tsx`, nuevo): `useStoreData()` ahora se instancia UNA sola vez en `App.tsx` (que quedó como `<StoreDataProvider><AppContent/></StoreDataProvider>`); los 13 consumidores (Layout + 9 páginas + 2 componentes de objeciones + AppContent) migraron a `useStore()`. Resultado: 1 set de 8 `onSnapshot` en vez de ≥3 simultáneos → ~3× menos lecturas facturadas de Firestore y menos memoria/re-renders. Cambio mecánico verificado: ningún archivo fuera del provider importa ya `useStoreData`.

Bonus del cambio: `olderSales`/`loadMoreSales` (P1.4) ahora son estado compartido de una sola instancia, como correspondía.

---

## ESTADO — P2.5–P2.8 aplicado el 2026-07-08

- **P2.5 Flujos de venta:** pestaña Facturas/Proformas en Historial con botón **FACTURAR** (convierte proforma en factura con verificación de stock en transacción; la proforma queda anulada con referencia cruzada "Facturada como A-xxxx"); **reimprimir PDF** de cualquier venta desde Historial y CRM (builder compartido `src/lib/invoice.ts`, que también arregló el "[3] meses" literal de la garantía); **precio negociable por línea** en el carrito (clic sobre el precio, se edita en C$, alerta roja si queda bajo el costo); **selector de método de pago** + referencia (EFECTIVO/TRANSFERENCIA/TARJETA/CRÉDITO — base para cuentas por cobrar); **descuento por efectivo**: banner "Aplicar" cuando el método es EFECTIVO y hay productos con `descEfectivoPct` (se quita solo al cambiar de método); **Enter agrega** el match exacto de SKU en la búsqueda (listo para lector de barras).
- **P2.6 CRM:** botón "Historial" por cliente → drawer con total gastado, nº de compras, última compra y lista de ventas con reimprimir + **WhatsApp** (`src/lib/invoice.ts → buildWhatsAppLink`, normaliza +505; el PDF se descarga y se adjunta a mano). Query por `customerId` sin índice compuesto (orden en cliente).
- **P2.7 Kardex:** colección **`movimientos`** (inmutable: solo create en reglas) alimentada DENTRO de las transacciones de venta, devolución/cancelación, recepción de compra y reversión, más ajustes manuales: el modal de stock ahora **exige motivo**, el bulk edit lo acepta, y la edición de producto registra el delta. Botón kardex (🕘) por producto en Inventario con la historia completa. **Export CSV**: inventario (Inventario → Exportar CSV) y ventas del período (Reportes → Exportar CSV), con BOM UTF-8 para Excel.
- **P2.8 Importación:** **editar orden** (ítems: costo/cantidad/peso/color con guard de unidades ya asignadas a cajas; datos generales; landed cost) mientras no haya cajas recibidas; **cancelar orden** (estado `CANCELLED`, preservado por updatePurchase, bloquea recepción); **fix timezone**: fechas de tracking parseadas como fecha LOCAL a mediodía (adiós al hack `+86400000`, que además corría un día al reeditar); **días en tránsito** por caja en el modal de tracking (agente→recepción u hoy).

Archivos: los 10 de P1 + `src/lib/invoice.ts` y `src/lib/csv.ts` (nuevos), `Customers.tsx`, `Inventory.tsx`. Reglas: + `movimientos` y estado `CANCELLED`.

**Pendiente de Carlos (un solo deploy cubre P1+P2):**
1. `npm run lint` — verificación local obligatoria (esta sesión validó consistencia de imports/símbolos sobre los archivos reales, pero el entorno no pudo correr tsc esta ronda).
2. `firebase deploy --only firestore:rules` — **sin esto**: facturar falla (counters), el kardex falla (movimientos) y cancelar órdenes falla (CANCELLED).
3. Smoke test: venta con método TARJETA → reimprimir → proforma → FACTURAR → devolución (ver stock y kardex) → ajuste manual con motivo → export CSV → editar una orden abierta.
4. Commit de todo.

Notas de diseño: el kardex registra desde ahora (sin historial retroactivo); "Quitar" el precio efectivo restaura el precio de catálogo (pierde negociación manual en esas líneas); el link de WhatsApp lleva resumen (wa.me no adjunta PDF); limpiar `freightCost/aduana/seguro` a vacío en "Editar orden" no borra el valor viejo en Firestore (limitación menor de update-merge, apuntada para después).

---

## ESTADO — P1 COMPLETO aplicado el 2026-07-07 (misma sesión)

Todo el bloque P1 quedó implementado y verificado con `tsc --noEmit` (0 errores):

- **P1.1** Facturas correlativas: `recordSale` asigna `A-000001` / `P-000001` (proformas) desde `counters/invoices` y `counters/proformas` dentro de la transacción (a prueba de dos cajas concurrentes). El preview muestra "POR ASIGNAR" y se actualiza con el número real al confirmar. Nueva sección `match /counters/{id}` en `firestore.rules`.
- **P1.2** `changeSaleStatus` transaccional: completed → returned/cancelled repone stock; el camino inverso lo vuelve a descontar (piso en 0; productos borrados se saltan). Historial usa esta función y ya **no permite borrar ventas completadas** (hay que anularlas primero). Proformas nunca tocan stock.
- **P1.3** Reports excluye canceladas/devueltas (solo `completed`); nota visible en el header.
- **P1.4** Reports consulta por **rango de fechas directo a Firestore** (sin el tope de 100), default mes en curso + presets Hoy/7 días/Este mes/90 días. Historial: botón "Cargar ventas anteriores" (paginación con `startAfter`, dedupe con la ventana en vivo). Dashboard: KPI "Ventas de Hoy" (honesto con la ventana de 100).
- **P1.5** Landed cost completo: el form de compras ahora tiene sección "Costos de Importación" (Tarifa $/lb, Flete total, Aduana/DGA, Seguro); los 4 campos viajan a la orden (antes se descartaban) y `updatePurchase` prorratea aduana+seguro por valor dentro del WAC.
- **P1.6** Compras muestra el **nombre** del proveedor (tabla y modal de tracking), no el ID.
- **P1.7** `revertTrackingReception`: botón "Revertir recepción" en cajas recibidas (resta stock, reabre tracking, borra `receptionDate`, recalcula estado; WAC no se recalcula — documentado). Aviso ⚠ cuando un ítem de la orden ya no existe en el catálogo (en la lista de la caja y en el form de recepción). Descuento/envío del POS con clamp ≥0 y guard descuento ≤ total. Zod ahora valida ANTES de escribir en `recordSale`, `recordPurchase`, `addProduct`, `addCustomer`, `addSupplier` (con mensajes legibles); `PurchaseSchema.shippingModality` relajado a string (la UI permite modalidades custom).

**Pendiente de Carlos para activar todo:**
1. `firebase deploy --only firestore:rules` — **OBLIGATORIO antes de usar el POS nuevo**: sin la regla de `counters`, facturar da `permission-denied`.
2. `npm run lint` local de cortesía (aquí ya pasó `tsc` limpio) y probar: venta normal, proforma, devolución (ver stock), revertir una recepción de prueba.
3. Commit de los 11 archivos tocados: `firestore.rules`, `src/types.ts`, `src/lib/validations.ts`, `src/hooks/useStoreData.ts`, `src/pages/{POS,SalesHistory,Reports,Dashboard,Purchases}.tsx`, `src/components/PurchaseRegistration.tsx`, este doc.

Notas de diseño acordadas: devolución y cancelación reponen stock por igual; borrar solo se permite para anuladas/proformas; la reversión de recepción no recalcula el costo promedio hacia atrás; las series A-/P- arrancan en 000001 (los números viejos `A00xxxx` quedan como están).

---

Alcance: código completo (`src/` 24 archivos, `firestore.rules`, `functions/`, `scripts/`, configuración) más contraste con las revisiones previas (`REVISION_2026-07.md`, `INCONSISTENCIAS.md`, `INTEGRACION_Y_UI_2026-07.md`) para no repetir lo ya corregido. Los hallazgos marcados **[NUEVO]** no aparecen en esas revisiones.

Contexto de negocio: tienda de electrónicos (proyectores, smartwatches, cámaras vehiculares, smarthome) en Nicaragua, ventas USD/NIO, importación vía Miami.

---

## P0 — Seguridad (sigue pendiente y empeoró un detalle)

### P0.1 Reglas abiertas a cualquier sesión anónima — ✅ RESUELTO (2026-09-10)

El diagnóstico era correcto: `firestore.rules` solo exigía `isSignedIn()`, el
login del POS era anónimo y la config de Firebase viaja en el bundle, así que
cualquiera podía sacar un token anónimo y leer costos, ventas con datos de
clientes, y borrar todo el negocio (`allow delete: if isSignedIn()`).

**Cerrado en el commit `e029765`.** Lo que se hizo, y en qué se apartó del plan
original:

1. Proveedor Email/Password habilitado; usuario del staff creado.
2. Claim `admin` vía `scripts/set_admin_claim.mjs` (con `--listar`, `--crear`,
   `--quitar`). No fue "un script de una línea": pagina sobre todos los usuarios
   —hay ~1.700 sesiones anónimas acumuladas— porque con `listUsers(1000)` sin
   paginar, una cuenta con claim más allá de las primeras 1000 queda invisible.
3. `isSignedIn()` → `isStaff()` en products, sales, purchases, customers,
   suppliers, **movimientos** y **counters**, además de company.
4. `loginAnonymouslyUser()` → form de email/contraseña en `App.tsx`, y
   `useStoreData` verifica el claim ANTES de montar las suscripciones (si no,
   una cuenta sin permisos recibe una cascada de `permission-denied` sin
   explicación).

**Desvíos respecto del plan, con su razón:**

- **Se usó el claim `admin`, no `sign_in_provider != 'anonymous'`.** El proveedor
  de email/password permite auto-registro con la API key pública, así que filtrar
  por proveedor no separa al staff de un visitante. Además el proyecto tiene
  Google habilitado: sin el claim, cualquier cuenta de Google entraba.
- **El proveedor Anónimo se deja HABILITADO.** PandaLink y PandaWEB dependen de
  él; una sesión anónima ya no puede leer nada sensible porque no lleva el claim.
- **Se cerraron dos colecciones que el plan no listaba:** `movimientos` (kardex:
  delata velocidad de venta por SKU) y `counters` (tenía `list: if false` pero
  `get` abierto, y los ids son constantes del código → revelaba el volumen total
  de facturas).
- **Se abrieron dos que el plan no contemplaba:** `config/financiamiento` (son
  las cuotas que se le muestran al cliente; cerrarlo hacía que la tablet y la web
  cotizaran condiciones por defecto en silencio) y `company/shared_store` con
  `get` público (datos de contacto ya publicados en la web, para que PandaWEB lea
  la tasa sin sesión).
- **Se arregló la escritura de las objeciones**, que el plan no mencionaba: tenía
  lectura pública pero escritura con `isSignedIn()`, o sea que cualquier anónimo
  podía reescribir las respuestas que ve el cliente en la tablet y en la web.

**Verificación:** 26 tests de reglas contra el emulador (`npm run test:rules`).
Contra las reglas viejas fallan 14, uno por agujero. Además se verificó contra
Firestore real sacando un token anónimo con la API key pública: 403 en todo lo
sensible, 200 en lo público.

**Pendiente relacionado (otro repo):** PandaWEB hace `listCollection("company")`
para la tasa de cambio, que ahora da 403 y cae en silencio a
`USD_TO_NIO_FALLBACK = 36.6243`. No se rompe nada visible (es la tasa del BCN
congelada por ley, la misma constante que ya usan el POS y PandaLink), pero hay
que cambiarlo a `getDocument("company/shared_store")`.

> Nota de datos: `company` tenía 3 documentos duplicados con id de uid anónimo,
> escritos por una versión vieja del POS que guardaba por uid mientras el código
> actual guarda en `shared_store`. Se consolidaron en `company/shared_store`
> (conservando el que el POS mostraba) y se borraron los 3.

### P0.2 El service account está DENTRO del repo (rebajado a P2 el 2026-09-10)

> **CORRECCIÓN (2026-09-10).** La versión original de esta sección afirmaba que
> el archivo **"llegó a commitearse y vive en el historial del repo"**. **Eso es
> falso.** Era una inferencia a partir del nombre de la carpeta (`-main`, típico
> de un ZIP descargado de GitHub), no una verificación. Se auditó el historial y
> la llave **nunca estuvo en ningún commit**.
>
> Verificado de cinco formas sobre un clon completo (no shallow, 43 commits, las
> tres ramas remotas presentes):
> - `git log --all --full-history -- <ruta>` → vacío
> - lo mismo por patrones (`*adminsdk*`, `*service-account*`, `.env`) → vacío
> - `git rev-list --objects --all` filtrando por nombre → vacío
> - los 43 commits grepeados por `BEGIN PRIVATE KEY` → ninguno
> - los 536 objetos del repo, incluidos 6 dangling/unreachable → ninguno
>
> La cronología lo confirma: el primer commit es del **2026-06-10**
> (`Add files via upload`) y el archivo de la llave es del **2026-06-29**, 19
> días después. Se descargó a una carpeta que ya existía.
>
> **Consecuencia: NO hay que reescribir historia.** Nada de BFG ni
> `git filter-repo`, y nadie necesita re-clonar. El punto 3 original queda sin
> efecto.

Estado real: `gen-lang-client-0460782288-firebase-adminsdk-fbsvc-5e894dbc0a.json`
(con `private_key`) sigue en la raíz de la carpeta. El `.gitignore` lo excluye
correctamente (línea 11, `*firebase-adminsdk*.json`, confirmado con
`git check-ignore -v`) y no está trackeado.

La llave **no está rotada**: el sufijo del nombre (`5e894dbc0a`) son los primeros
10 caracteres de su `private_key_id` (`5e894dbc0a7a886f…`), que es la convención
de Google al descargar. Si se hubiera rotado, el archivo nuevo tendría otro
sufijo.

**Prioridad: media, no P0.** La vía de exposición que justificaba el P0 (el
historial de git) no existe. Rotar sigue siendo buena higiene —la llave tiene
~3 meses, vive en una carpeta que se comprime y se comparte, y da control admin
total saltándose todas las reglas— pero no es una emergencia.

Al rotar, **el orden importa**. Seis scripts eligen credencial con
`[GOOGLE_APPLICATION_CREDENTIALS, <nombre fijo>].find(existsSync)`: `existsSync`
mira si el archivo *existe*, no si *sirve*. Si se revoca la llave vieja dejando
el JSON en disco, se elige la llave muerta y los scripts mueren con
`invalid_grant` aunque la variable de entorno esté bien puesta.

1. Consola → Cuentas de servicio → Generar nueva clave privada.
2. Guardarla FUERA de la carpeta del repo (como ya dice el README).
3. `setx GOOGLE_APPLICATION_CREDENTIALS "<ruta nueva>"` → abrir terminal nueva.
4. **Borrar el JSON viejo de la raíz** (antes del paso 6).
5. Probar: `node scripts/set_admin_claim.mjs --listar` debe reportar la ruta nueva.
6. Recién ahí: revocar la clave `5e894dbc0a…` en la consola.

Archivos que referencian el nombre fijo: `scripts/set_admin_claim.mjs`,
`reporte_financiamiento.mjs`, `backfill_catalogo_publico.mjs`,
`seed_fichas_tecnicas.mjs`, `seed_fichas_contenido.mjs`, `auditoria_fichas.mjs`
y `_tmp_read_products.mjs` (este último sin fallback: revienta al rotar, conviene
borrarlo, es basura sin trackear).

---

## P1 — Integridad de datos y dinero (bugs reales, corregir antes de agregar features)

### P1.1 [NUEVO] Números de factura aleatorios → colisiones garantizadas
`POS.tsx:100`: `A00${Math.floor(Math.random()*1000)+1000}` genera solo 1.000 números posibles (A001000–A001999). Con ~37 facturas ya hay 50% de probabilidad de duplicado, y no son consecutivos (problema también fiscal: un recibo oficial debería ser correlativo). Fix: contador atómico en Firestore (doc `counters/invoices` con `increment(1)` dentro de la transacción de `recordSale`), formato `A-000123`. Las proformas pueden llevar serie propia (`P-000045`).

### P1.2 [NUEVO] Devoluciones/cancelaciones NO devuelven stock
`SalesHistory.tsx:33` cambia `status` a `returned`/`cancelled` con un simple `updateSale`, y `deleteSale` borra el doc — **ninguno repone las unidades al inventario** (`recordSale` sí lo descuenta). Resultado: cada devolución descuadra el inventario en silencio. Fix: transacción `changeSaleStatus` que al pasar a `returned`/`cancelled` haga `stock: increment(qty)` por ítem (y lo inverso si se re-completa). Para `deleteSale`, decidir política: o repone stock, o mejor aún, prohibir borrar ventas completadas (anular ≠ borrar; hoy se pierde el rastro contable).

### P1.3 [NUEVO] Reports cuenta ventas canceladas y devueltas como ingreso
`Reports.tsx:23-30` solo filtra `PROFORMA`; una venta `cancelled` o `returned` sigue sumando a "Total Ventas", costo y margen. El Dashboard en cambio sí filtra `completed` (`useStoreData.ts:657`) → los dos paneles se contradicen. Fix: en Reports excluir (o desglosar) `status !== 'completed'`.

### P1.4 [NUEVO] Todos los reportes están limitados a las últimas 100 ventas
`useStoreData.ts:64`: `limit(100)`. Reports, Dashboard e Historial operan sobre ese array → cuando pases de 100 ventas, los totales mensuales y el histórico serán silenciosamente incorrectos y las ventas viejas "desaparecerán" del historial. Igual con compras (`limit(100)`). Fix razonable sin re-arquitectura: query por rango de fechas para Reports (traer solo el período seleccionado, sin límite) y paginación (`startAfter`) en Historial. A futuro: agregados mensuales precalculados (doc `stats/YYYY-MM` actualizado al vender) para que Reports no lea todas las ventas.

### P1.5 [NUEVO] Los costos de importación del form se pierden y el landed cost está a medias
- `PurchaseRegistration.tsx:62-64` declara `freightCost/customsTaxes/insuranceCost` pero **nunca renderiza inputs para ellos** (estado muerto, siempre 0).
- Aunque los enviara, `Purchases.tsx:451-479` no los copia al objeto `Purchase` → se descartan.
- En la recepción (`useStoreData.ts:427`) la tarifa de flete usa valores **hardcodeados** (Air 6.5, Sea 2.5 USD/lb) porque `shippingRatePerLb` tampoco se captura en ningún form.
- Aduana y seguro no entran jamás al costo promedio (WAC).

Resultado: el "landed cost" real solo incluye costo + flete estimado con tarifa fija → los márgenes de Reports están inflados. Fix: agregar al form de orden los campos Flete total, Aduana, Seguro y Tarifa $/lb (con defaults por modalidad configurables en Settings), mapearlos en `onAddPurchase`, y prorratear aduana+seguro igual que el flete en `updatePurchase`.

### P1.6 [NUEVO] La tabla de Compras muestra el ID del proveedor, no el nombre
Al seleccionar proveedor se guarda `sup.id` (y los nuevos se crean como `SUP-84213`), y `Purchases.tsx:193` renderiza `p.supplier` crudo. Fix: resolver `suppliers.find(s => s.id === p.supplier)?.name ?? p.supplier` al renderizar (y en el modal de tracking).

### P1.7 Riesgos menores de datos
- Recepciones no se pueden revertir: si marcás una caja como recibida por error, no hay "des-recibir"; toca ajustar stock a mano sin rastro. Sugerencia: acción admin "revertir recepción" (transacción inversa).
- Si se borra un producto con compras abiertas, la recepción lo saltea en silencio (`serverProducts.get` falla) → unidades que nunca entran al stock. Avisar en UI ("N ítems de esta orden ya no existen en catálogo").
- Descuento del POS sin tope: acepta negativo o mayor que el total (`POS.tsx:470`). Clamp 0..total.
- Zod está implementado (`validations.ts` cubre todo) pero `recordSale/addProduct/recordPurchase` **no lo invocan**; solo las objeciones validan. Llamar `safeParse` antes de cada write es gratis y evita `permission-denied` crípticos.

---

## P2 — Funcionalidades que le faltan al negocio (electrónicos)

Ordenadas por impacto/esfuerzo para una tienda de tu perfil:

### P2.1 Seriales / IMEI por unidad (el esqueleto ya existe)
`serialNumbers` ya está en tipos, reglas y Zod para ventas y compras — **pero ninguna UI lo captura**. Para electrónicos es la base de todo lo demás (garantías, RMA, antirrobo). Implementación: input opcional de seriales al recibir cajas (Fase 2 de compras) y al facturar (modal por ítem si el producto tiene "requiere serial"). Con eso podés responder "¿esta unidad la vendí yo y cuándo?" en segundos.

### P2.2 Garantías reales
Hoy la garantía es texto hardcodeado con placeholder sin rellenar: la factura imprime literalmente "[3] meses" (`POS.tsx:168`). Mejoras en orden:
1. Mover el texto de garantía a Settings (editable).
2. `garantiaMeses` por producto/categoría (el campo ya existe en `ProjectorSpecs`) y que la factura lo imprima por ítem.
3. Registro de reclamos/RMA: colección `reclamos` ligada a venta+serial, con estados (recibido → en revisión → reparado/reemplazado/rechazado). Es el dolor #1 de vender electrónicos importados.

### P2.3 Métodos de pago y crédito
El tipo `Sale` soporta `EFECTIVO | TRANSFERENCIA | TARJETA | CREDITO` + `paymentReference`, pero el POS hardcodea EFECTIVO (`POS.tsx:132`) y no hay selector. Consecuencias: no podés filtrar ventas por método, ni cuadrar caja vs banco, y "CREDITO" no lleva cuentas por cobrar. Implementar: selector de método + referencia en el checkout; si es CREDITO, saldo pendiente + abonos (colección `abonos` o array en la venta) y un panel "Por cobrar". El apartado/layaway es común en Nicaragua y encaja aquí mismo.

### P2.4 Caja (apertura, cierre, arqueo)
No existe el concepto de sesión de caja: monto inicial, ventas en efectivo del turno, retiros, arqueo al cierre. Sin esto no detectás faltantes. Colección `cajas` con apertura/cierre + reporte del turno. Se vuelve imprescindible el día que tengas un vendedor que no seas vos.

### P2.5 Flujos de venta incompletos
- **Proforma → Factura**: la proforma se guarda pero no hay forma de convertirla en venta; hay que rearmar el carrito. Botón "Facturar esta proforma" en Historial (cargar items al POS o convertir directo con verificación de stock).
- **Reimprimir factura**: Historial solo reimprime la etiqueta de envío; no se puede regenerar el PDF de una factura pasada (cliente que perdió su recibo = callejón). Reusar `InvoicePreview` desde `SalesHistory` con los datos guardados.
- **Precio negociado por línea**: el carrito no permite ajustar precio de un ítem (típico en electrónica: "te lo dejo en X"). Hoy el único recurso es el descuento global en NIO.
- **Descuento por efectivo**: `descEfectivoPct` existe para la tablet, pero el POS no lo aplica automáticamente al cobrar en efectivo. Cerrar el círculo: si método = EFECTIVO y el producto tiene `descEfectivoPct`, sugerir el precio efectivo.
- **Enter para agregar**: la búsqueda del POS no tiene manejo de teclado (`onKeyDown` inexistente). Con un lector de código de barras (que "tipea" el SKU + Enter) hoy no pasa nada. Quick win: Enter agrega el match exacto de SKU al carrito. De paso deja el POS listo para pistola de barras (~$25).

### P2.6 CRM sin historial
`Customers` es solo un directorio: no muestra compras del cliente, total gastado, última compra ni sus garantías activas. Con `customerId` ya guardado en las ventas, un drawer "Historial del cliente" (query `sales where customerId ==`, requiere índice) convierte la pantalla en algo útil para recompra y postventa. De ahí sale gratis "enviarle la factura por WhatsApp" (`wa.me/<phone>` con el PDF).

### P2.7 Inventario: kardex y auditoría
Los ajustes manuales de stock (modal "Manage Stock", bulk edit) no registran motivo ni dejan rastro; el stock puede cambiar sin explicación. Colección `movimientos` (tipo: venta/compra/ajuste/devolución, delta, motivo, quién) alimentada desde las transacciones existentes = kardex por producto + responsabilidad. Complemento: export CSV/Excel del inventario y de reports (hoy no hay ningún export; para el contador lo vas a necesitar sí o sí).

### P2.8 Operativa de importación
- Poder **editar/cancelar una orden** después de creada (hoy solo se gestionan trackings; un typo en costo/cantidad obliga a borrar y recrear).
- Fechas de tracking usan el hack `+86400000` (+1 día) para compensar timezone (`Purchases.tsx:97-98`) — parsear como fecha local (`new Date(y, m-1, d)`) y eliminar el hack.
- ETA y días en tránsito por caja (ya tenés las fechas; es solo mostrar la resta) para reclamos al courier.

---

## P3 — Backend / arquitectura

### P3.1 [NUEVO] `useStoreData()` se instancia 14 veces → suscripciones duplicadas
Cada componente que llama al hook (App, Layout y cada página/componente — 14 archivos) monta su **propio set de 8 `onSnapshot`** sobre colecciones completas. En todo momento hay ≥3 sets activos (App + Layout + página) = 3× lecturas de Firestore facturadas/quota, 3× memoria, 3× re-renders. En plan Spark (50K lecturas/día) y con productos que cargan `imageBase64` de ~100KB, esto es lo que más rápido te va a agotar la cuota. Fix: crear `StoreDataProvider` (React Context) que llame al hook UNA vez en App y exponga `useStore()` a los hijos. Cambio mecánico, alto impacto.

### P3.2 Imágenes base64 dentro de los documentos
Cada producto arrastra su imagen en el doc (límite 1MB, y cada snapshot re-baja todas las imágenes). Con catálogo pequeño sobrevive, pero: (a) la lista del POS baja megas en cada carga, (b) el bulk `list` de products se encarece. Camino correcto: Firebase Storage + URL (Spark incluye 5GB) o al menos thumbnails ≤200px en el doc y hero por URL (como ya hacés con `media.heroImage`).

### P3.3 Resiliencia offline
`initializeFirestore` sin `persistentLocalCache` → si se cae el internet, el POS no puede ni listar productos. Para un punto de venta físico: habilitar `persistentLocalCache()` (lecturas desde caché y writes en cola automática). Nota: `experimentalForceLongPolling: true` penaliza latencia; PandaLink ya usa `experimentalAutoDetectLongPolling` — alinear.

### P3.4 Sincronización del catálogo público
El backfill manual funciona pero depende de que te acuerdes de correrlo (precios viejos en tablet = fricción con el cliente en vivo). Opciones: (a) pasar a Blaze y desplegar `onProductWritten` que ya está escrita — con tu volumen el costo será ~$0; (b) mantener Spark pero mostrar en el POS un indicador "catálogo público desactualizado" comparando `updatedAt` vs `espejoActualizadoAt`; o (c) mover el backfill a un workflow (GitHub Action manual) para correrlo desde el teléfono.

### P3.5 Consistencia y limpieza
- Ids de producto inconsistentes: Inventory usa `uuidv4()`, Catálogo usa el SKU tipeado (con riesgo de charset, A4 ya documentado). Unificar: id = uuid siempre, SKU como campo con **check de unicidad** (hoy podés crear dos productos con el mismo SKU).
- Dos pantallas crean/editan productos (Inventario y Catálogo Maestro) con lógica de imagen duplicada y campos distintos — consolidar en un solo form con pestañas (Datos POS / Tablet) elimina toda una clase de bugs (A2/A3 fueron exactamente eso).
- `specsProyector` solo se guarda si `category === 'Projector'` literal (`ProductCatalog.tsx:172`) — si un día renombrás la categoría a "Proyectores", las specs se dejan de guardar en silencio. Comparar contra slug normalizado.
- Validación de reglas solo revisa `items[0]` (P2.8 previo, sigue pendiente).
- `handleFirestoreError` mete un JSON crudo en el mensaje de error → toasts ilegibles. Mapear a mensajes humanos.
- Restos a borrar del repo: `_probe_fichas.mjs`, `Magcubic_Fichas_Productos.xlsx` (mover a docs), `firebase-blueprint.json` (marcado obsoleto), y el service account (P0.2).
- `package.json` scripts duplicados (`backfill` ≡ `publicar:tablet`).

---

## P4 — UI/UX

Lo grueso del pulido visual ya se hizo en la sesión del 2026-07-02 (toasts, paleta cyan, checkout agrupado). Lo que queda:

1. **Idioma mixto aún visible [NUEVO en estas pantallas]**: Inventory está 100% en inglés ("Add Product", "Current Inventory Status", "Manage Stock", "Low Stock", "Bulk Edit"…), Customers ("Customers CRM", "Edit Profile", "No phone"…), y SalesHistory mezcla ("Grand Total", "Set as Returned", "Edit Invoice", "Delete?"). Un vendedor nuevo no tiene por qué entender inglés — vale la pasada final de traducción.
2. **Historial de ventas sin filtros de fecha/estado**: solo busca por factura/cliente sobre las últimas 100. Agregar rango de fechas + filtro por estado + método de pago (cuando exista P2.3).
3. **Inventario sin filtro por categoría** (solo búsqueda libre) — con 4 categorías claras, chips de filtro arriba de la tabla es lo natural. Ordenar solo funciona por stock; habilitar nombre/precio.
4. **Dashboard sin dimensión temporal**: "Ventas Totales" (que además es "de las últimas 100") sin decir de qué período. Reemplazar por: Hoy / Semana / Mes + comparación contra período anterior. Es LA pantalla de apertura del negocio.
5. **Confirmaciones destructivas**: el patrón "clic 2 veces en 3s" (borrar venta/producto/cliente) es fácil de disparar sin querer y no explica consecuencias. Modal de confirmación con resumen ("Borrar factura A001234 de C$3,500 — esta acción no repone stock") al menos para ventas.
6. **PDF de factura**: se genera rasterizando HTML → pesado y texto no seleccionable. Funciona, pero considerar `jspdf-autotable` (ya está en package.json ¡sin uso!) para un PDF nativo liviano; y no hay formato ticket 80mm si algún día usás impresora térmica.
7. Menores: `/logo.png` referenciado en `App.tsx:56` no existe en `public/` (el fallback lo oculta, pero el logo del login nunca aparece); `index.html` con `lang="en"` y título "PandaFactoryOS" (branding: pandastore); modales sin cierre con ESC ni focus-trap; estado "Inactivo" del selector de Catálogo sí funciona ahora vía `activo`, pero en Inventory la columna Status muestra "Active/Low Stock" sin reflejar `activo=false`.

---

## ESTADO — Critique de diseño del POS (2026-09-20)

Se corrió `/impeccable critique src/pages/POS.tsx`. Puntaje inicial **23/40**
(modo Operate, las 10 heurísticas aplican). Snapshot completo en
`.impeccable/critique/2026-09-20T15-48-57Z__src-pages-pos-tsx.md`.

**Aplicado (commit `b207b81` y siguiente):**

- **P0 — las cuotas se calculaban sobre el bruto.** `planesParaVenta` recibía
  solo `price × quantity`, sin envío ni descuento, mientras el total cobrado sí
  los incluía. Con US$300 y C$500 de descuento, la pantalla decía *"paga C$332
  más"* y cobraba C$832 más: el error era exactamente el descuento, cobrado de
  vuelta dentro de la cuota. Se prorratea el ajuste sobre las líneas para
  conservar el peso de cada categoría (lo que pondera el recargo). 9 casos de
  regresión nuevos.
- **P2 — herencia de estado entre ventas.** El reset no limpiaba
  `selectedCustomerId`, `paymentMethod` ni `plazoMeses`: la venta siguiente sin
  nombre se archivaba en el historial del cliente anterior. `transport` queda
  pegajoso a propósito.
- **Reparto y jerarquía del panel de cobro.** El catálogo pasa de 2/3 a 3/5 y el
  panel de cobro de 1/3 a 2/5. Se elimina el doble scroll (el panel tenía dos
  áreas apiladas, la de líneas y el formulario con `max-h-[50vh]`) y el cierre
  —total y FACTURAR— queda fijo al pie. El TOTAL sube de 18px a 30px con
  `tabular-nums`, y en venta financiada la caja se invierte: manda el total a
  plazos, el contado baja a línea secundaria. Rótulo "Pago" propio (antes 7+
  controles caían bajo "Entrega y ajustes"). Botón "Vaciar" (no existía forma de
  abandonar un carrito salvo sacar las líneas de a una).

**Pendiente de ese critique, en orden:**

1. **P1 — el momento que ve el cliente.** `'POR ASIGNAR'` impreso en la proforma
   (`POS.tsx:225`), TOTAL fuera de pantalla en el A4, **cero `toast.success`** al
   confirmar una operación irreversible, y la etiqueta de envío montada detrás
   del preview (`z-[60]` contra `z-[100]`) que aparece de golpe al cerrar.
2. **P1 — contraste sistémico, y es de los tokens de `DESIGN.md`, no del POS.**
   `text-white` sobre `bg-cyan-600` (el botón primario, `turquesa-accion`) da
   **3.68:1** contra un piso AA de 4.5:1, y aparece en 11 archivos. El label
   canónico `text-[10px] text-zinc-500` da **3.67:1** en 8 archivos. Las tarjetas
   sin stock con `opacity-50` caen a **1.83–4.39:1**. Arreglar en el sistema.
3. **P1 — el carrito no sobrevive a un F5.** Vive solo en `useState`. Persistir
   en `localStorage` (cumple con Spark, no necesita servidor).
4. **Accesibilidad del POS:** 11/11 botones sin anillo de foco declarado (el
   resto del repo declara `focus:ring` 27 veces en `ProductCatalog` y 24 en
   `Inventory`), 11/11 controles sin `htmlFor`/`id`, 4 botones de solo ícono sin
   `aria-label`, `onClick` sobre `<div>` en la acción principal, y `aria-live`
   ausente en todo `src/` (los 7 toasts de error no se anuncian).
5. **Menores:** sin estado vacío de búsqueda, 9 campos con radio de chip (4px)
   donde `DESIGN.md` fija 8px, inputs numéricos que arrancan en `0`, el mismo
   ícono para Factura y Proforma, la tasa de cambio nunca visible, y
   `paymentReference` que se captura pero **no existe** en `InvoicePreview` ni en
   `invoice.ts`.

**Hueco propio detectado:** `DESIGN.md` declara el mundo "Papel" (los documentos
imprimibles) pero no le publica rampa tipográfica propia, y por eso el detector
marca 23 tamaños de `InvoicePreview` como fuera de sistema. Falta esa sección.

---

## ESTADO — Segundo critique del POS (2026-09-20)

Segunda corrida de `/impeccable critique src/pages/POS.tsx`. **23/40, sin
cambio** contra la primera. A los evaluadores NO se les dijo qué se había
arreglado, justamente para que el puntaje fuera comparable — y gracias a eso
encontraron una regresión que la sesión había introducido.

Subieron tres heurísticas (visibilidad 2→3, control 2→3, mundo real igual) y
bajaron dos (recuperación de errores 3→2, ayuda 2→1). Las que bajaron lo
hicieron porque se miró más profundo, no porque se rompiera algo: el error de
facturación siempre descartó el diagnóstico; la primera corrida no lo vio.

**Regresión encontrada y corregida (`652b148`):** la persistencia del carrito
se borraba a sí misma en el montaje que la ofrecía. Los dos `useEffect` corren
en el mismo commit; el de guardado corría con `cart = []` y hacía `removeItem`.

**Aplicado en esta tanda:**

- **Los dos cambios de plata silenciosos** (`f796426`). `removeCashDiscount` no
  invertía el descuento: restauraba el precio de catálogo y borraba la
  negociación manual — y lo dispara el cambio de forma de pago, así que el
  total cambiaba solo, sin aviso, después de haberle dicho un número al
  cliente. Ahora se recuerda `precioAntesEfectivo` y se avisa. Además se cerró
  el camino al descuento compuesto (editar el precio reseteaba
  `efectivoApplied` y el chip lo re-ofrecía sobre un precio ya rebajado).
- **Accesibilidad** (`f029d22`, `52de81b`). Los 9 labels pasan a tener
  `htmlFor`/`id` (eran texto suelto: un lector anunciaba nueve campos en
  blanco). El décimo, "Plazo de las cuotas", era un `<label>` huérfano que
  rotulaba un grupo de botones: pasa a `role="radiogroup"` con `aria-checked`
  por tarjeta. Los 9 campos migran al foco canónico de `DESIGN.md`. FACTURAR y
  proforma suman anillo. El autocompletado de clientes pasa de `<div onClick>`
  a `<ul role="listbox">` con botones, y deja de montarse vacío.
  `focus:ring` va de 1 a 44 usos; `htmlFor` de 0 a 9.
- **Contraste** (`f029d22`). Los 3 `text-zinc-500` que fallaban AA pasan a
  `zinc-400`. La peor era la tasa de cambio a **3.38:1**, que se había puesto
  justamente para poder verificar. Los dos `zinc-500` que quedan son iconos
  decorativos. También se neutralizan los rótulos "Descuento" (rose) y "Envío"
  (cyan): son colores que `DESIGN.md` reserva para destructivo y para
  dinero/acción, y un rótulo no es ninguna de las dos cosas.
- **El total junto al botón irreversible** (`ae577f6`). Franja de resumen en la
  barra del modal con cliente, forma de pago y total. El TOTAL vive al pie de
  un A4 de 1123px, así que se confirmaba de memoria.
- **Modo presentación** (`e8c0917`). "Mostrar al cliente" oculta la consola y
  escala el A4 al viewport. Es el de mayor retorno respecto del objetivo
  declarado: hasta ahora, al girar la laptop, el cliente veía el tablero
  interno del negocio.

**Cerrado después, en la misma sesión:**

- **Atajos de teclado** (`ce8f5df`): F2 factura, F3 proforma, `/` enfoca la
  búsqueda — y se anuncian en pantalla. La cantidad ahora se tipea (eran 12
  clics para 12 unidades).
- **Botonera distinguible** (`ce8f5df`): FACTURAR y Proforma compartían el
  ícono `FileText`, dos consecuencias opuestas con el mismo glifo.
- **Título real de página** (`ce8f5df`): el header decía "Resumen Principal del
  Sistema" en todas las pantallas. Y se cerró el salto h1→h3 bajo 768px con un
  `h2` solo-lector en el header móvil.
- **Badge de stock a emerald** (`ce8f5df`): en cyan competía con los 31 precios
  de la misma grilla, diluyendo la Regla de la Luz Única.
- **Vuelto, rótulos de pago y ayuda contextual** (`5cb34bf`). El critique
  proponía eliminar CRÉDITO por redundante; el usuario aclaró que **no lo es**:
  TARJETA es débito, CRÉDITO es tarjeta de crédito en un pago, y FINANCIAMIENTO
  son cuotas con tarjeta **Banpro exclusivamente**. El problema eran los
  rótulos, no la cantidad de opciones. Además se avisa cuando la venta da de
  alta una ficha de cliente, que antes pasaba en silencio.
- **Total de línea, descarte en dos pasos y focus-trap** (`1b08353`): el
  carrito obligaba a multiplicar de memoria; "Vaciar" destruía en un clic
  mientras borrar una venta ya registrada exige modal de dos pasos; y tabular
  dentro del preview sacaba el foco al formulario de atrás (P4.6, pendiente
  desde `AGENTS.md`). Nuevo hook `src/hooks/useFocusTrap.ts`, más `role="dialog"`
  y `aria-modal` que faltaban.

**Cerrado por decisión del usuario, no por trabajo pendiente:**

- **El margen en vivo por línea.** El critique lo señalaba como la mayor
  oportunidad de carácter del producto. El usuario decidió explícitamente que
  **no quiere el costo visible en pantalla** mientras negocia, porque el cliente
  está enfrente. Se queda con color y tooltip. No es un olvido.

**Pendiente de este critique:**

1. **Ayuda (heurística en 1/4).** Nada explica la diferencia entre Proforma y
   Factura, ni entre CRÉDITO y FINANCIAMIENTO (que decide si se registra un
   plan de cuotas), ni que tipear un nombre crea una ficha de cliente.
2. **FACTURAR y Proforma comparten el ícono `FileText`**: dos consecuencias
   opuestas con el mismo glifo.
3. **Sin atajo de teclado para FACTURAR** ni para enfocar la búsqueda; la
   cantidad solo sube de a uno (12 clics para 12 unidades).
4. **El margen sigue siendo un tooltip.** El POS conoce el `cost` de cada línea
   y solo lo usa para pintar el precio de rosa. Es el mecanismo insignia del
   producto sin llegar a la decisión.
5. **Sin cálculo de vuelto**, con EFECTIVO como método por defecto.
6. **Salto de encabezado h1→h3** bajo 768px (el `h2` del shell es `hidden md:`).
7. **El badge de stock usa cyan** donde `DESIGN.md` asigna emerald a
   "disponible", y compite con los precios en cyan de la misma grilla.

---

## Quick wins sugeridos (mayor retorno / menor esfuerzo)

| # | Acción | Refs |
|---|--------|------|
| 1 | ~~Rotar service account~~ → rebajado a prioridad media: la llave NUNCA estuvo en el historial git (auditado 2026-09-10). Sigue pendiente rotarla por higiene | P0.2 |
| 2 | Facturas correlativas con contador transaccional | P1.1 |
| 3 | Reponer stock en devolución/cancelación | P1.2 |
| 4 | Excluir canceladas de Reports | P1.3 (2 líneas) |
| 5 | Mostrar nombre de proveedor en Compras | P1.6 (1 línea) |
| 6 | Selector de método de pago en checkout | P2.3 |
| 7 | Reimprimir factura desde Historial | P2.5 |
| 8 | StoreDataProvider (context) | P3.1 |
| 9 | Traducción final Inventory/Customers/SalesHistory | P4.1 |
| 10 | Fase 2 de seguridad completa | P0.1 |

Con P0 + P1 cerrados, el sistema queda confiable; P2 es donde está el valor diferencial para una tienda de electrónicos (seriales → garantías → RMA → caja → crédito).
