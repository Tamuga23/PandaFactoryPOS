# Guía para agentes de IA — PandaFactoryPOS

POS + inventario para Panda Store (Nicaragua): React 19 + Vite + TS + Tailwind v4 + Firebase (Firestore con BD nombrada, plan Spark). Alimenta la tablet PandaLink vía `catalogo_publico`. Idioma del proyecto y de la UI: **español**.

## Lectura obligatoria antes de tocar código (en este orden)

1. `README.md` — arquitectura, comandos, flujo del catálogo público (backfill manual, plan Spark).
   `PRODUCT.md` — qué es el producto y qué se le prometió al usuario (hay compromisos marcados como vinculantes).
   `DESIGN.md` — el sistema de diseño, derivado de lo embarcado. Si vas a tocar UI, es obligatorio.
2. `REVISION_2026-07-07_MEJORAS.md` — revisión completa vigente. La sección **ESTADO** arriba dice qué ya se aplicó (todo P1) y qué falta.
3. `REVISION_2026-07.md` + `INTEGRACION_Y_UI_2026-07.md` — historial de fixes previos (no repetir trabajo).
4. `security_spec.md` + bloque comentado al final de `firestore.rules` — diseño de la Fase 2 de seguridad (P0, pendiente).

## Estado al 2026-07-08

- **P1 completo** (facturas correlativas con `counters/*`, devoluciones reponen stock, Reports por rango, landed cost, revertir recepción, validación Zod en writes). Verificado con `tsc --noEmit` en cero errores.
- **P2.5–P2.8 completo** (proforma→factura, reimprimir PDF, precio por línea, método de pago + descuento efectivo, Enter/barcode, historial CRM + WhatsApp, kardex `movimientos` + export CSV, editar/cancelar órdenes, fix timezone, días en tránsito). Verificado por consistencia de símbolos; **correr `npm run lint` antes de deployar** (el entorno de esa sesión no pudo ejecutar tsc).
- ~~Pendiente inmediato del usuario (2026-07-08)~~ **SUPERADO**: ese deploy de reglas se hizo y se verificó contra Firestore real el 2026-09-10 (ver P0.1 abajo).
- **P0.1 RESUELTO (2026-09-10, commit `e029765`)**: las reglas ya no aceptan sesiones anónimas en datos sensibles. `isSignedIn()` → `isStaff()` (custom claim `admin`) en products, sales, purchases, customers, suppliers, movimientos, counters y company. El POS entra con email/password. Lectura pública deliberada en `catalogo_publico`, las dos de objeciones, `config/financiamiento` y el doc `company/shared_store`. Verificado con 26 tests de reglas (`npm run test:rules`) y contra Firestore real con un token anónimo.
- **P0.2 corregido y rebajado a prioridad media**: el service account (`gen-lang-client-*.json`) está en la raíz, pero **NUNCA estuvo en el historial git** — la afirmación anterior era una inferencia por el nombre de carpeta `-main`, no una verificación. Auditado el 2026-09-10 sobre un clon completo: ningún commit, ningún blob (ni los dangling) contiene la llave, y el archivo es 19 días posterior al primer commit. **No hay que reescribir historia.** Falta rotarla por higiene (no está rotada: el sufijo del nombre coincide con su `private_key_id`).

## Estado al 2026-09-22 — barrido de calidad

Ocho commits en `feature/objeciones-tres-capas`, todos con `npm run lint` en cero.
Lo que encontraron los evaluadores corriendo a ciegas (sin saber qué se había
tocado), y que ya está arreglado:

**Plata e inventario**

- **El guard contra facturas repetidas se apagaba solo con 30 proformas.** El
  barrido del máximo emitido ordenaba por `invoiceNumber` descendente y `'P'`
  (0x50) > `'A'` (0x41), así que toda proforma iba por encima de toda factura.
  Con 30 proformas la ventana entera eran proformas, el máximo daba 0 y el
  contador aceptaba cualquier número. La siembra de `recordSale` tenía el mismo
  defecto y peor final: la primera factura de un negocio en marcha salía
  `A-000001` otra vez, con un `catch` vacío. Ahora en `src/lib/correlativos.ts`,
  por rango de prefijo más el valor del contador.
- **Revertir una recepción dejaba el costo promedio inflado, y re-recibirla lo
  inflaba más** — cada ciclo lo empujaba hacia el de la última caja y no volvía.
  La fórmula y su inversa viven ahora en `src/lib/costoPromedio.ts` con 13
  pruebas (`npm run costo:test`), y la recepción guarda en la caja el costo con
  el que entraron las unidades.
- **El "Flete Total USD" declarado se descartaba** si los ítems tenían peso: se
  aplicaba un default de $2.50/lb que el placeholder mostraba en gris como si
  fuera una sugerencia. No se inventa más ninguna tarifa.
- `updateProduct` reescribía el `stock` desde la caché del cliente — la única
  forma de mover inventario que el kardex no podía reconciliar.
- Guardar un cliente fallaba mudo (único formulario sin `try/catch`); recibir
  una caja con un producto borrado decía "N unidades sumadas" sin que entrara
  ninguna; los costos de importación no se podían bajar a cero; una objeción
  nueva con id repetido pisaba la anterior diciendo "creada correctamente"; el
  ajuste masivo de stock leía el stock de la caché y chocaba con el límite de
  500 escrituras a partir de 250 productos.

**Interacción**

- **El Enter del buscador del Catálogo Maestro GUARDABA el producto abierto**:
  el campo vive dentro del `<form>` y la tecla llegaba al submit.
- Un solo diálogo para todo lo que se borra (`src/components/ConfirmarBorrado.tsx`).
  Antes había un doble clic que se desarmaba solo a los 3 segundos, con el aviso
  de la consecuencia en un toast de la esquina: el sistema castigaba al que leía.
- El modal de nueva orden de compra no tenía ni título ni salida visible.
- Estados crudos de Firestore en pantalla (`completed`, `OPEN`): un solo
  diccionario en `src/lib/etiquetas.ts`.
- Compras ordenaba EN EL LUGAR el array del contexto, y no tenía buscador.

**Pendiente del usuario**

- ~~`firebase deploy --only firestore:rules`~~ **HECHO (2026-10-01)**: los
  campos de costo de `itemsInBox` (`costoUnitarioReal`, `costoPrevio`,
  `costoDespues`, `stockDespues`) ya tienen tipo en las reglas desplegadas.
- Rotar el service account (ver P0.2 arriba).

## Estado al 2026-09-23 — critique del Catálogo Maestro

**`npm run lint` no verificaba la interfaz, y ahora sí.** `@types/react` y
`@types/react-dom` no estaban instalados. Como el `tsconfig.json` no tiene
`strict`, `noImplicitAny` está apagado y un import sin tipos resuelve a `any`
EN SILENCIO — sin error ni warning. O sea que `useState` era `any`, el estado de
todos los componentes era `any`, y ninguna propiedad de ninguna pantalla se
verificaba. Se descubrió con un control positivo: una propiedad inventada
inyectada en `ProductCatalog` no producía ningún error, y la misma propiedad en
un `.tsx` suelto sí.

Instalados los dos paquetes aparecieron **exactamente dos errores en todo el
repo**, y los dos eran el mismo bug tapado (`SalesBullet` sin `etiqueta`, que el
formulario escribe y Zod valida). **Si agregás un control positivo antes de
confiar en una verificación, lo vas a agradecer.**

Los nueve hallazgos del critique del Catálogo Maestro, arreglados:

- **La foto subida no le llegaba nunca al cliente.** `imageBase64` lo leen sólo
  el POS, el Inventario y la factura; a la tablet sólo viaja `media.heroImage`,
  una URL que había que pegar 500 líneas más abajo. Ahora se deriva de la foto
  subida (400×400, ~30 KB) cuando no hay URL, y los dos campos están juntos.
  **Los productos que ya existen la generan la primera vez que se guarden.**
- **El campo "Descripción del Producto" era el NOMBRE**, y el `description` real
  quedaba congelado con el nombre original — y sí viajaba a la tablet. Ahora son
  dos campos distintos y editables.
- **Cuatro caminos tiraban el formulario sin preguntar** (las dos pestañas de
  modo, "Cancelar / Limpiar" y elegir otro producto en el buscador). Ahora hay
  detección de cambios sin guardar con comparación estable de claves ordenadas.
- **No se podía quitar una foto**, sólo reemplazarla. `imageBase64` entró en
  `CLEARABLE`.
- **El SKU se mostraba en mayúsculas por CSS y se guardaba como se tipeó.**
  Ahora el formulario convierte el valor y el hook normaliza.
- **Los datos de ficha técnica de una categoría anterior** se preservan a
  propósito pero viajaban al espejo sin que el operador pudiera verlos.
- `aria-label` repetido en las fotos complementarias; "Override" en pantalla.

**Nota para el próximo:** `buildPublicCatalogDoc` en `src/lib/validations.ts`
es **código muerto** — nadie lo llama. El espejo lo escribe sólo
`scripts/backfill_catalogo_publico.mjs`, que tiene su propia copia de la
derivación a mano. Las dos ya divergieron (la del backfill emite un campo
`specs` que no existe en `Product`). Unificarlas es trabajo pendiente y choca
con el principio 2 de PRODUCT.md.

## Estado al 2026-10-01 — producción al día

**Durante tres meses nada de lo de arriba estuvo en producción.** Vercel
despliega a Production sólo con un push a `main`. Todo se subía a
`feature/objeciones-tres-capas`, que genera Previews, y `main` seguía en el
merge del PR #2 del 24 de junio. Esa versión entraba con sesión anónima, y
desde el 10 de septiembre las reglas exigen el claim `admin`, así que la
producción vieja no podía leer datos. Tampoco tenía `vercel.json`.

PR #3 (98 commits) mergeado el 2026-10-01 → `main` en `1583842`, desplegado
como Production. Verificado: `panda-factory-pos.vercel.app` responde 200 en `/`
y en rutas internas, y el bundle servido (`index-P_3gVtIp.js`) tiene el mismo
hash que el build local de la rama.

- **Para que algo llegue a producción hay que mergear a `main`.** Un push a la
  rama sólo produce un Preview.
- El `main` local era un "Initial commit" huérfano, sin ancestro común con
  GitHub y que nunca se subió. Quedó renombrado a `respaldo/main-local-junio`
  (todos sus blobs existen en el historial remoto, así que no tiene nada único),
  y `main` ahora sigue a `origin/main`.
- Reglas desplegadas el mismo día con
  `npx firebase-tools deploy --only firestore:rules`: compilaron y se
  publicaron en la base nombrada que fija `firebase.json`. `firebase-tools` no
  está instalado globalmente, pero `npx` funciona y la sesión de la CLI ya está
  iniciada como `pandastorenic@gmail.com`. Java es 8, demasiado viejo para el
  emulador, así que `npm run test:rules` no corre en este equipo.

## Estado al 2026-10-01 — PWA e ícono

La app se instala como PWA. `vite-plugin-pwa` genera el manifest y el service
worker, que precachea todo el build. Ícono nuevo: ver `DESIGN.md` § Ícono de la app.

- **La versión nueva NO se aplica sola** (`registerType: 'prompt'`). Aplicarla
  recarga la página, y una recarga en medio de una venta tira el carrito.
  `src/components/AvisoActualizacion.tsx` busca versión nueva cada hora y al
  volver la app al frente, y la ofrece con `toast.accion`. No lo cambies a
  `autoUpdate`.
- El `<Toaster />` pasó de `Layout.tsx` a `App.tsx`. Montado en Layout no
  existía durante "Cargando App...", y el error de una suscripción caída en la
  carga inicial se perdía.
- Verificado con Chrome headless contra `vite preview`: cero errores de
  instalabilidad; `/pos` abre sin red desde el precache; con un deploy simulado
  el aviso aparece, la página no se recarga sola, y "Actualizar" recarga con la
  versión nueva.
- **Sin red abre la interfaz, no los datos.** Firestore no tiene persistencia
  local (`initializeFirestore` sin `persistentLocalCache`), y `recordSale` es
  una transacción, que exige servidor. Habilitar la caché offline es una
  decisión aparte: deja productos, ventas y clientes guardados en el
  dispositivo, y las escrituras que se encolen sin red se aplicarían después
  sobre un stock que pudo cambiar mientras tanto.
- `workbox.maximumFileSizeToCacheInBytes` está en 6 MB porque el chunk
  principal mide 2,0 MB y el tope por defecto es 2 MiB. Si lo pasa, workbox lo
  saca del precache con sólo un warning, y la app deja de abrir sin red.
- En iOS, un acceso directo agregado antes de este cambio conserva el ícono
  viejo. Hay que borrarlo y volver a agregarlo desde Safari.

## Estado al 2026-10-26 — Apartados y saldos pendientes

El cliente reserva productos dejando una **prima** y paga el resto en
**abonos**. Botón **Apartar (F4)** en el POS (exige nombre y teléfono) y
pantalla `/apartados` (barra lateral, después de Terminal POS).

**En producción desde el 2026-10-27**: merge `8ea38fc` a `main`, hecho a mano
y no por PR porque el token de `gh` del keyring está vencido. Fue directo, sin
pasar por un Preview, a pedido del dueño. Verificado: `panda-factory-pos.vercel.app`
sirve `index-BYIEvHyT.js`, el mismo hash del build local, y `/apartados`
responde 200. La red de este equipo estaba intermitente: `git push` y la CLI
de Firebase necesitaron reintentos.

**Decisiones del dueño (2026-10-26), vinculantes:**

- Sin prima mínima fija: cualquier prima > 0. Editable en Configuración →
  Apartados (`config/apartados.primaMinimaPct`, 0 = sin mínimo).
- Plazo por defecto 30 días (`config/apartados.plazoDias`). Es una fecha límite
  de **pago** y se puede mover en cada apartado.
- Al cancelar, cuánto se devuelve se decide **en cada caso** (de 0 a todo lo
  abonado). Ningún papel promete una política de devolución.
- Se entrega **sólo con el saldo en cero**. Entregar debiendo (crédito, cuentas
  por cobrar) NO está hecho y sigue en el backlog.
- Si el carrito tenía el precio de efectivo aplicado, se **quita** al apartar:
  un apartado no es un pago de contado en efectivo.

**Modelo (no es una venta hasta que se entrega):**

- Colección `apartados` (`AP-000001`, contador `counters/apartados`). El stock
  sale al apartar (kardex `apartado`); la factura —un RECIBO_OFICIAL normal, con
  su A-— recién se emite al entregar (`Sale.apartadoId`, id derivado con uuidv5
  para que reintentar no emita dos). Entregar no mueve `stock` ni el kardex.
  Cancelar devuelve las unidades (kardex `liberacion`) **al costo con que
  salieron** (`costoAlRecibir` con el `cost` congelado en la línea).
- `Product.apartadas`: unidades reservadas, fuera de `stock` pero en la tienda.
  Lo escriben SÓLO las transacciones de apartados; `updateProduct` lo descarta
  igual que `stock`. **El Inventario pide conteo físico** cuando hay apartadas y
  `adjustStock({conteoFisico})` graba `stock = conteo − apartadas` leyendo el
  servidor. El ajuste masivo saltea esos productos y `deleteProduct` no los
  borra. Sin esto, un conteo volvía vendible la unidad del cliente.
- Abonos y anulaciones son listas que **sólo crecen**: las reglas lo verifican
  con un chequeo de prefijo. Un abono mal cargado se anula y queda impreso
  tachado, con el motivo.
- La plata va en **centavos enteros** y se redondea **como el papel** (Intl,
  igual que `formatCurrencyNIO`). El `round2` de `validations.ts` NO coincide
  con lo impreso en casos reales: 3 × US$50 a 36.6243 → el papel dice
  C$5,493.64 y `round2` 5,493.65. Toda la cuenta vive en `src/lib/apartados.ts`
  con su prueba (`npm run apartados:test`).
- "Aceptado al apartar ⇒ facturable al entregar": al crear, la venta que se
  va a emitir se arma y se pasa por `SaleSchema`. Un dato que la factura
  rechazaría se descubre con el cliente enfrente, no un mes después.
- Idempotencia: el id del apartado, de la prima y de cada abono nacen al ABRIR
  el diálogo y se reusan en los reintentos.

**Trampas que ya mordieron (no repetir):**

- **Zod 4 no deja derivar schemas con `.refine`**: `.omit()`, `.pick()` y
  `.partial()` lanzan, `.extend()` lanza si pisa una clave y `.merge()` borra
  el refine. Como los schemas viven a nivel de módulo, el error tumba la app al
  importar `validations.ts`, con `tsc` en cero. Los schemas de apartados son
  `z.object` propios. Después de tocar `validations.ts`, importalo con `npx tsx`
  para ver que carga.
- **Firestore rules: `lista[0:0]` NO es la lista vacía**, es "Index out of
  bound". Va con una guarda `viejo.size() == 0 ||` delante. Sin ella no entraba
  nunca la primera anulación. Lo encontró la suite en el emulador.
- `CAMPOS_PRODUCTO` (validations.ts) es el espejo del `hasOnly` de
  `isValidProduct`: si cambia uno, cambia el otro. Las transacciones lo usan
  para decir qué campo sobra en vez del "Sin permisos" que culpa al deploy.

**De paso se arreglaron tres bugs que ya existían:**

- En el modal de stock de Inventario, guardar SÓLO la alerta mínima igual
  llamaba a `adjustStock` con el número de cuando se abrió el diálogo: si en el
  medio el POS vendía, ese guardado deshacía la venta. Sin cambio de conteo,
  ahora se escriben sólo la alerta y la marca de re-orden.

- F2/F3 facturaban el precio de ANTES de la negociación si se apretaban con
  el precio de la línea en edición: el `setTimeout` llamaba al handler del
  render anterior. Ahora el atajo es un pedido en estado que se ejecuta
  después del render.
- El "Total a cobrar" del POS (y el vuelto) podía diferir un centavo de la
  factura cuando había envío. Ahora sale de la misma cuenta que el papel.

**Pendiente del usuario, en este orden:**

1. ~~`npx firebase-tools deploy --only firestore:rules`~~ **HECHO
   (2026-10-27)**: compiló y se publicó en la base nombrada. Tenía que ir ANTES
   del merge: el código nuevo se suscribe a `apartados` al iniciar sesión, y
   sin las reglas esa suscripción se cae y el Layout muestra el cartel rojo en
   TODAS las pantallas. Ojo para el próximo deploy: el aviso "Unable to fetch
   the CLI MOTD" es sólo la bienvenida de la CLI; el primer intento falló una
   vez contra `cloudresourcemanager` y al reintentar pasó.
2. ~~Probar el flujo en un Preview~~: se salteó a pedido del dueño. **Lo que
   SIGUE pendiente es probarlo en producción** con un producto de prueba:
   apartar, abonar, anular un abono, entregar, cancelar otro, y mirar las
   apartadas en Inventario. Hasta entonces el flujo sólo está verificado por
   typecheck, pruebas de lógica y de reglas, y revisión de código.
3. ~~Mergear a `main`~~ **HECHO (2026-10-27)**, ver arriba.

**Correr las pruebas de reglas en este equipo:** `npm run test:rules` (vía
firebase-tools) pide Java 21+ y el `java` del PATH es 17. Lo que funcionó el
2026-10-27: levantar el jar del emulador ya cacheado
(`~/.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar`) con el
Java 25 de Android Studio (`C:/Program Files/Android/Android Studio/jbr/bin/java.exe
-jar <jar> --host 127.0.0.1 --port 8089`) y correr
`npx vitest run firestore.rules.test.ts` con
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8089`. Resultado: 66/66.

## Estado al 2026-10-27 — Apartado por ENCARGO (productos sin stock)

El dueño aparta también equipos que NO tiene: vienen en una orden de compra o
son un pedido especial. Antes el POS no dejaba agregar un producto agotado y
`crearApartado` exigía stock, y la salida que quedaba era subir el stock a mano:
un stock fantasma que el POS vendía y la tablet mostraba disponible.

**Decisiones del dueño (2026-10-27), vinculantes:**

- El plazo de pago de un encargo corre **desde que llega** la mercadería:
  cuando se reserva la última unidad pendiente,
  `fechaLimite = fechaLimiteDesde(llegada, config.plazoDias)`.
- La prima es la misma de los apartados (`config/apartados.primaMinimaPct`).
  No hay configuración aparte para encargos.

**Modelo (es el mismo apartado; lo que cambia es que una parte puede no estar):**

- `Product.encargadas`: prometidas a clientes que todavía NO llegaron. No son
  físicas (el conteo sigue siendo `stock + apartadas`). Lo escriben sólo las
  transacciones de apartados y la recepción/reversión de compras;
  `updateProduct` y `adjustStock` lo descartan, `deleteProduct` no borra con
  encargadas, y viaja en `TABLET_ONLY_SALE_ITEM_FIELDS`.
- `Apartado.encargo` (lo que no se reservó al crear, inmutable) y
  `Apartado.llegadas` (sólo crece; cantidad negativa = reversión). Lo pendiente
  se DERIVA (`pendientesDe`), no se guarda. Estado visible nuevo `esperando`
  ("Esperando mercadería"), que gana sobre listo y vencido.
- `crearApartado` reserva lo que hay en el servidor y encarga el resto; ya no
  lanza "Stock insuficiente". Devuelve `encargo` para que el POS diga qué quedó
  por llegar (el servidor pudo encontrar menos stock que la pantalla).
- `updatePurchase` reserva lo recibido para los encargos que lo esperan, en la
  MISMA transacción, del más viejo al más nuevo (`asignarLlegadas`), caja por
  caja, al costo promedio que queda después de recibir. Los candidatos salen de
  la lista en vivo y se LEEN por id (una transacción no admite consultas).
- `revertTrackingReception` deshace primero lo que esa caja reservó
  (`llegadasDeCaja`): las unidades vuelven al stock al costo con que salieron,
  y recién ahí corre la reversión de siempre, así el promedio sigue cayendo en
  el camino exacto de `costoAlRevertir`.
- `reservarEncargo(apartadoId)`: el botón "Reservar ahora" de Apartados, para
  stock que apareció por otro camino (devolución, ajuste, cancelación).
- Cancelar devuelve al stock sólo lo reservado (a su costo, `partesDeApartado`)
  y a lo pendiente sólo le baja `encargadas`. Entregar exige que no falte nada,
  y la línea de la factura lleva el costo de lo que de verdad se entregó
  (`costoDeLinea`), no el del día en que se apartó.
- El POS deja cargar más que el stock; FACTURAR frena antes del preview si una
  línea no alcanza, y la proforma sigue permitida. El carrito lee el stock en
  vivo, no el que se copió al agregar la línea.

**Trampa que ya mordió (no repetir):** validar las cinco llegadas nuevas una por
una pasaba el **tope de 1000 expresiones por pedido** del motor de reglas: con
cinco válidas el pedido se rechazaba igual. `llegadasSoloCrecen` valida la
primera y la última nuevas (con una o dos, que es casi toda caja, son todas);
las del medio las cuida Zod. Es el mismo criterio que `isValidSaleItem(items[0])`.
El tope de 5 por escritura lo respeta el código (`MAX_LLEGADAS_POR_ESCRITURA`):
lo que no entra queda por llegar y se reserva desde Apartados.

**De paso, un bug que ya existía (lo encontró la revisión):** `updatePurchase`
copiaba la orden UNA vez, afuera de la transacción, y marcaba las cajas
`isReceived` sobre esa copia. Si Firestore reintentaba el callback (algo que
leyó cambió antes del commit: una venta en otro equipo), el reintento no
encontraba nada que recibir y la caja quedaba "recibida" sin que sus unidades
entraran al stock. Ahora cada intento hace su propia copia de una plantilla
limpia. Leer los encargos en esa transacción hacía el reintento más probable.

Límites conocidos, aceptados: la recepción y la reversión encuentran los
encargos en la lista en vivo de apartados (una transacción no admite
consultas); uno creado en otro equipo segundos antes puede no estar. En la
recepción se avisa (`sinReservar`); en la reversión no. Y revertir una caja
cuyo encargo ya se entregó descuenta la caja entera del stock, igual que
cuando sus unidades se vendieron (se avisa con `encargosCerrados`).

Verificado: `npm run lint` en cero con control positivo, las cuatro suites,
`validations.ts` cargado con `npx tsx`, `medir:foco` 350/350, `npm run build`,
y las reglas en el emulador **76/76** (diez pruebas nuevas de encargos).

**En producción desde el 2026-10-27**, a pedido del dueño ("producción de
una"): reglas desplegadas primero (compilaron; sólo los dos avisos viejos de
`isValidCompany`), después commit `148d67a` y merge `7408e46` a `main`, hecho
a mano porque el token de `gh` sigue vencido. Verificado:
`panda-factory-pos.vercel.app` sirve `index-DzXcFe0G.js`, el mismo hash del
build local, y `/apartados` responde 200.

**Pendiente del usuario:** probarlo en producción con un producto de prueba:
apartar con stock 0, recibir la caja de una orden que lo trae, revertir esa
recepción, volver a recibirla, entregar; y cancelar otro encargo a medio
llegar. Hasta entonces está verificado por typecheck, pruebas de lógica y de
reglas, y revisión de código, no en pantalla.

## Reglas de trabajo para el agente

- **NUNCA** leas, muevas, copies ni pegues en el chat el JSON del service account. La rotación de la llave la hace el usuario a mano en Google Cloud Console.
- No refactorices `src/hooks/useStoreData.ts` sin leer sus comentarios: `recordSale`, `changeSaleStatus`, `updatePurchase` y `revertTrackingReception` son transacciones con invariantes de stock/WAC deliberadas.
- Después de cada cambio: `npm run lint` (es `tsc --noEmit`). **Verifica la UI
  sólo porque `@types/react` está instalado**: sin él, y con `strict` apagado
  como está, todo React resuelve a `any` y el typecheck no ve nada de las
  pantallas. Si alguna vez `npm run lint` pasa sospechosamente limpio, poné un
  control positivo —una propiedad inventada— antes de creerle. Hay cuatro suites de pruebas de lógica pura, sin framework: `npm run costo:test` (costo promedio ponderado y su reversión), `npm run apartados:test` (saldo, prima, abonos y redondeo igual al papel), `npm run financiamiento:cuotas` y `npm run financiamiento:test`. Las de reglas corren con `npm run test:rules` (requiere emulador). Si tocás una fórmula que decide plata, extraela a `src/lib/` y escribile su test — es lo que se hizo con `costoPromedio.ts`.
- Toda escritura nueva a Firestore debe pasar por Zod (`src/lib/validations.ts`) Y estar permitida en `firestore.rules` (validación por whitelist de campos — si agregás un campo, tocá tipo + schema + regla).
- El proyecto se queda en plan **Spark**: no despliegues Cloud Functions ni sugieras Blaze salvo pedido explícito. `catalogo_publico` se sincroniza con `npm run backfill`.
- No borres los `.md` de revisiones; actualizá su sección ESTADO cuando apliques algo.
- UI: paleta cyan (acción) / emerald (éxito) / rose (peligro) / amber (warning), dark zinc, todo en español.

## Backlog priorizado (detalles en REVISION_2026-07-07_MEJORAS.md)

1. ~~**P0.1**~~ **HECHO (2026-09-10, `e029765`)**: proveedor Email/Password, claim `admin` (`scripts/set_admin_claim.mjs`), `isSignedIn()` → `isStaff()` en las colecciones sensibles (incluidas `movimientos` y `counters`), login email/password en `App.tsx` con verificación del claim en `useStoreData` antes de montar las suscripciones. El proveedor Anónimo queda HABILITADO a propósito: lo usan PandaLink y PandaWEB, y sin el claim no pueden leer nada sensible. Detalle y desvíos del plan en `REVISION_2026-07-07_MEJORAS.md` § P0.1.
2. **P0.2** — (humano) rotar service account. **NO hace falta tocar el historial git**: se auditó y la llave nunca se commiteó. Al rotar, borrá el JSON viejo de la raíz ANTES de revocar la clave en la consola — seis scripts eligen credencial con `existsSync`, que mira si el archivo existe y no si sirve, así que una llave revocada pero presente en disco los hace fallar con `invalid_grant` aunque `GOOGLE_APPLICATION_CREDENTIALS` esté bien puesta.
3. ~~P4~~ **HECHO (2026-07-08) excepto el PDF nativo**: traducción completa, filtros en Historial, chips de categoría + sort en Inventario, Dashboard Hoy/7d/30d con comparación, modal de confirmación al borrar ventas, ESC en modales (`src/hooks/useEscapeKey.ts`). El focus-trap TAMBIÉN está hecho: `src/hooks/useFocusTrap.ts`, con seis consumidores. Pendiente sólo: PDF nativo con jspdf-autotable + formato ticket 80mm (hacerlo con la app corriendo, hay riesgo de regresión visual).
4. ~~P3.1~~ **HECHO (2026-07-08)**: `StoreDataProvider` en `src/context/StoreContext.tsx`; los componentes consumen `useStore()`. NUNCA llamar `useStoreData()` directo fuera del provider.
   ~~P3.5~~ **HECHO (2026-07-08)**: id de producto = uuid siempre + SKU único (check en hook); alta de productos SOLO en Catálogo Maestro (ficha completa con Datos POS); specs de proyector por slug; errores Firestore humanizados en `db.ts`; repo limpio (blueprint/probe eliminados, xlsx en `docs/`, scripts dedup).
5. **P2 que QUEDA** (proforma→factura, reimprimir, método de pago y kardex ya están hechos — estaban listados acá y en ESTADO a la vez):
   - seriales/IMEI: tipos y reglas ya lo soportan, falta la UI.
   - **garantías configurables**: la factura imprime el texto de `DEFAULT_WARRANTY_TEXT` (`src/lib/invoice.ts`), que dice "3 meses" fijo. El modelo ya tiene `garantiaMeses` por categoría en `src/lib/categorySpecs.ts`; falta que la factura lo lea y que se pueda fijar un default de tienda. Un campo en `company` obliga a tocar `hasOnly` en `firestore.rules` y por lo tanto a desplegar.
   - cuentas por cobrar: entregar el producto con saldo pendiente. Los
     APARTADOS (reserva con prima, entrega con el saldo en cero) ya están
     hechos (2026-10-26); entregar debiendo NO, por decisión del dueño.
   - caja / arqueo. Ojo al hacerlo: los abonos de apartados también son plata
     que entra a caja (`cajaEntre` en `src/lib/apartados.ts` ya los cuenta,
     neto de las devoluciones por cancelación).

## Comandos

```bash
npm run dev               # localhost:3000
npm run lint              # typecheck (tsc --noEmit)
npm run build             # build de producción (también sirve para ver el bundle)
npm run costo:test        # costo promedio ponderado + reversión (13 casos)
npm run apartados:test    # cuenta de los apartados: saldo, prima, abonos, redondeo
npm run financiamiento:cuotas
npm run financiamiento:test
npm run test:rules        # reglas de Firestore (requiere emulador)
npm run backfill:dry      # simular sync de catalogo_publico
npm run backfill          # sincronizar catálogo de la tablet
npm run auditoria         # fichas incompletas del catálogo
npm run financiamiento    # reporte de margen de las ventas financiadas
npm run iconos            # regenera los PNG y el favicon.ico desde los SVG
npx firebase-tools deploy --only firestore:rules
```
