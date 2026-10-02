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

- `firebase deploy --only firestore:rules` cuando pueda. Los tres campos nuevos
  de `itemsInBox` (`costoUnitarioReal`, `costoPrevio`, `costoDespues`,
  `stockDespues`) YA pasan con las reglas desplegadas, porque
  `isValidPurchaseTrackingItem` nunca tuvo `hasOnly`; el deploy sólo les pone
  tipo. **Nada se rompe si no se despliega.**
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

## Reglas de trabajo para el agente

- **NUNCA** leas, muevas, copies ni pegues en el chat el JSON del service account. La rotación de la llave la hace el usuario a mano en Google Cloud Console.
- No refactorices `src/hooks/useStoreData.ts` sin leer sus comentarios: `recordSale`, `changeSaleStatus`, `updatePurchase` y `revertTrackingReception` son transacciones con invariantes de stock/WAC deliberadas.
- Después de cada cambio: `npm run lint` (es `tsc --noEmit`). **Verifica la UI
  sólo porque `@types/react` está instalado**: sin él, y con `strict` apagado
  como está, todo React resuelve a `any` y el typecheck no ve nada de las
  pantallas. Si alguna vez `npm run lint` pasa sospechosamente limpio, poné un
  control positivo —una propiedad inventada— antes de creerle. Hay tres suites de pruebas de lógica pura, sin framework: `npm run costo:test` (costo promedio ponderado y su reversión), `npm run financiamiento:cuotas` y `npm run financiamiento:test`. Las de reglas corren con `npm run test:rules` (requiere emulador). Si tocás una fórmula que decide plata, extraela a `src/lib/` y escribile su test — es lo que se hizo con `costoPromedio.ts`.
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
   - cuentas por cobrar.
   - caja / arqueo.

## Comandos

```bash
npm run dev               # localhost:3000
npm run lint              # typecheck (tsc --noEmit)
npm run build             # build de producción (también sirve para ver el bundle)
npm run costo:test        # costo promedio ponderado + reversión (13 casos)
npm run financiamiento:cuotas
npm run financiamiento:test
npm run test:rules        # reglas de Firestore (requiere emulador)
npm run backfill:dry      # simular sync de catalogo_publico
npm run backfill          # sincronizar catálogo de la tablet
npm run auditoria         # fichas incompletas del catálogo
npm run financiamiento    # reporte de margen de las ventas financiadas
firebase deploy --only firestore:rules
```
