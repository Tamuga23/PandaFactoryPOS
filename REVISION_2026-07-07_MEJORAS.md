# Revisión completa PandaFactoryPOS — 2026-07-07

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

### P0.1 Reglas abiertas a cualquier sesión anónima (ya documentado, sigue vigente)
`firestore.rules` solo exige `isSignedIn()` y el login es anónimo. La config de Firebase viaja en el bundle del cliente: **cualquier persona que abra la app (o extraiga la config) puede leer costos, ventas con datos de clientes, y borrar TODO el negocio** (`allow delete: if isSignedIn()`). El plan de Fase 2 (claim `admin`, cerrar lecturas) ya está diseñado al final de `firestore.rules` — es lo más importante del proyecto y conviene no posponerlo más. Mínimo viable en una tarde:
1. Activar proveedor Email/Password en Firebase Auth y crear tu usuario.
2. Setear claim `admin` con un script de una línea (ya tenés firebase-admin en scripts/).
3. Reemplazar `isSignedIn()` por `isAdmin()` en products/sales/purchases/customers/suppliers/company, y dejar `catalogo_publico` + objeciones con lectura para la tablet.
4. Cambiar `loginAnonymouslyUser()` por un form de email/contraseña en `App.tsx`.

### P0.2 [NUEVO] El service account está DENTRO del repo
`gen-lang-client-0460782288-firebase-adminsdk-fbsvc-5e894dbc0a.json` (con `private_key`) está en la raíz de la carpeta. El `.gitignore` lo excluye, pero la carpeta es un download de GitHub (`-main`), lo que indica que **el archivo llegó a commitearse y vive en el historial del repo**. Esa llave da control admin total del proyecto (omite todas las reglas). Acción inmediata:
1. Rotar/eliminar la llave en Google Cloud Console → IAM → Service Accounts → Keys.
2. Generar una nueva y guardarla FUERA de la carpeta del repo (como ya dice el README).
3. Si el repo es/fue público o compartido: purgar el historial (BFG / git filter-repo) o recrear el repo.

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

## Quick wins sugeridos (mayor retorno / menor esfuerzo)

| # | Acción | Refs |
|---|--------|------|
| 1 | Rotar service account + sacarlo del repo | P0.2 |
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
