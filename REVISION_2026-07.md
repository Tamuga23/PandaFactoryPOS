# Revisión PandaFactoryPOS + integración PandaLink — 2026-07-02

Alcance: código completo del POS (24 archivos en `src/`, reglas, functions) y PandaLink como consumidor (`catalogo_publico`, `objeciones_universales`, `objeciones_categoria`). Verifiqué también qué puntos de `INCONSISTENCIAS.md` siguen vigentes.

## ESTADO — aplicado el 2026-07-02 (misma sesión, por decisión de Carlos: P0 queda para el final)

**Decisión de arquitectura:** el proyecto se mantiene en plan **Spark** (gratuito). No se despliegan Cloud Functions; `catalogo_publico` se sincroniza manualmente con `npm run backfill` (script nuevo en package.json). `functions/` queda como referencia por si algún día se pasa a Blaze.

Aplicado en PandaLink:
- Normalizador de precios: mapea `precio.lista → precio.regular` (arregla el precio regular en 0 en la ficha) y se eliminó la rama legacy que podía mostrar `cost` como precio (`usePandaData.ts`).
- `firebase.ts`: falsa alarma — el archivo en disco siempre estuvo completo (la "truncación" era una vista desfasada de mi entorno de verificación). Quedó con `experimentalAutoDetectLongPolling`.

Aplicado en el POS:
- `updatePurchase` reescrito con `runTransaction`: stock/WAC se calculan con datos del servidor, guard contra doble recepción concurrente (compara `isReceived` contra el doc del servidor), `receivedQuantity` parte del estado del servidor, y un solo write por producto aunque venga en varias cajas (P2.9).
- `totalStockValue` ahora valúa a **costo** con guards contra docs viejos; label del Dashboard actualizado (P2.10).
- Tasa 36.6243 centralizada en `DEFAULT_EXCHANGE_RATE` (`lib/utils.ts`); POS.tsx y Purchases.tsx la importan (P2.11). Los de Settings son legítimos (default del form).
- Zod completado: `customerId`/`notes` en SaleSchema, `isReordering` en ProductSchema (P2.12 — el resto ya estaba más completo de lo que decía INCONSISTENCIAS B3).
- `firestore.rules`: `shippingRatePerLb` agregado al whitelist de purchases (hallazgo nuevo: el tipo y Zod lo declaran pero las reglas lo rechazarían). **Requiere `firebase deploy --only firestore:rules`** — no toca nada del modelo de seguridad P0.
- Higiene: fuera `@google/genai`, `dotenv`, `express`, `localforage`, `html2canvas`, `motion` (sin uso); `firebase-admin` y herramientas de build a devDependencies; eliminado el `define` de GEMINI_API_KEY en vite.config; borrado `testConnection()` de db.ts; package renombrado a `pandafactory-pos`; scripts nuevos `backfill`, `backfill:dry`, `test:rules`; README reescrito (P3.13-17).

Pendiente tras esta sesión:
1. **Carlos:** correr `npm install` y `npm run lint` en ambos proyectos (mi entorno de verificación no pudo compilar por un desfase de sincronización de archivos, no por errores del código). Si algo falla, es casi seguro un typo mío en useStoreData.ts.
2. **Carlos:** borrar a mano `_probe.tmp` y `_sandbox_probe.txt` (mi entorno no puede borrar archivos), y commitear ambos proyectos (PandaLink tiene ~20 archivos sin commit).
3. **Carlos:** desplegar reglas cuando quiera (`firebase deploy --only firestore:rules`) y correr `npm run backfill:dry` → `npm run backfill` para que la tablet vea el precio `regular`... (nota: el fix se hizo del lado de PandaLink leyendo `lista`, así que el backfill NO es urgente para esto).
4. P0 completo (Fase 2 de reglas + rotar service account) — a pedido de Carlos, se deja para el final.
5. Consolidar las 3 copias de `buildPublicCatalogDoc` (P1.6, parcial: la rama peligrosa de PandaLink ya se eliminó) y validación de ítems 2..N en reglas (P2.8).

---

## Ya corregido (no repetir esfuerzo)

- A1: `sanitizeSaleItem` (`useStoreData.ts:16`) ya quita los campos tablet de los renglones de venta.
- A2: `activo` existe en tipos/reglas y el POS filtra `p.activo === false` (`POS.tsx:37`).
- A3: editar en Catálogo ya no pisa `description` (`Catalog.tsx:114`).
- B1: `PurchaseRegistration.tsx:261` guarda `price` en USD sin multiplicar.

---

## P0 — Seguridad (esto es lo más importante del proyecto)

### 1. Cualquier persona puede leer y escribir TODA tu base de datos
Las reglas solo exigen `isSignedIn()`, y el proyecto tiene **auth anónima habilitada** (la usan el POS y PandaLink). La API key es pública y está commiteada en ambos repos (`firebase-applet-config.json`) y en el bundle de la tablet. Consecuencia real: cualquiera con la key hace `signInAnonymously` y puede:

- Leer `products` **incluyendo `cost`** — todo el esfuerzo del espejo `catalogo_publico` sin costo hoy no protege nada.
- Leer `sales` y `customers` — nombres, teléfonos, direcciones y cédulas de tus clientes.
- Crear, modificar y **borrar** productos, ventas, compras, clientes y proveedores.

**Fix:** implementar la "Fase 2" que ya está comentada al final de `firestore.rules`:
1. Auth real (email/password) para el POS + custom claim `admin` vía Admin SDK.
2. `products`, `sales`, `purchases`, `customers`, `suppliers`, `company`: solo `isAdmin()`.
3. Tablet sigue anónima pero solo lee `catalogo_publico` y las 2 colecciones de objeciones.

Es un cambio de ~20 líneas de reglas + un script para setear el claim. Nada de lo demás en este informe importa tanto como esto.

### 2. Ventas mutables y borrables
`security_spec.md` declara "Sales are immutable", pero las reglas permiten `update` (sin validar diff) y `delete` a cualquier autenticado. Si el POS necesita editar ventas (usa `updateSale`), exigí admin y validá qué campos pueden cambiar; si no, `update, delete: if false`. Actualizá el spec para que refleje la decisión.

### 3. Service account en la raíz del proyecto
`gen-lang-client-...-adminsdk-...json` no está en git (bien, `.gitignore` lo cubre), pero vive dentro de una carpeta que se comparte/zipea. Esa clave da acceso admin total al proyecto. **Rotala en GCP** (IAM → Service Accounts → Keys) y guardá la nueva fuera del proyecto; los scripts ya soportan `GOOGLE_APPLICATION_CREDENTIALS`.

---

## P1 — Integración con PandaLink

### 4. `PandaLink/src/lib/firebase.ts` está truncado en disco
El archivo corta a mitad de un identificador (`firebaseCo`) — **PandaLink no compila así**. La versión en git (HEAD) está completa pero con `experimentalForceLongPolling`. Completá el archivo con el cambio a `experimentalAutoDetectLongPolling` y commiteá: el working tree de PandaLink tiene ~20 archivos modificados sin commit, incluyendo este.

### 5. Contrato de precios desalineado: `lista` vs `regular`
El POS y la Cloud Function escriben `precio: { lista, actual, efectivo }` (`validations.ts:298`, `functions/src/index.ts`), pero la tablet lee `p.precio?.regular` (`Ficha.tsx:36`). El normalizador de PandaLink solo construye `regular` cuando el doc NO trae `precio` — y los docs de `catalogo_publico` siempre lo traen. Resultado: el precio regular/tachado queda 0 en la ficha. Unificá el nombre (uno u otro) en ambos lados.

### 6. La lógica del espejo existe 4 veces
`buildPublicCatalogDoc` está copiada a mano en `src/lib/validations.ts`, `functions/src/index.ts` y `scripts/backfill_catalogo_publico.mjs`; PandaLink además tiene su propio normalizador con "schemas legacy". Ya divergieron (punto 5). Opciones: paquete compartido, o mínimo un test de contrato que compare el output de las tres copias contra los tipos de PandaLink.

Además, borrá del normalizador de PandaLink la rama legacy que mapea `cost → precio.actual` (`usePandaData.ts` ~línea 40): si algún día la tablet vuelve a leer un doc con `cost`, mostraría tu **costo** como precio al cliente.

### 7. Verificá que la Cloud Function esté desplegada
`CATALOGO_TABLET_RESUMEN.md` dice "sin deploy a Firebase". Si `onProductWritten` no está desplegada, `catalogo_publico` solo se actualiza cuando corrés el backfill a mano → la tablet muestra precios/stock viejos. Chequeá con `firebase functions:list`. La región debe ser `us-east1` (la de tu BD nombrada; el código ya lo maneja).

---

## P2 — Correcciones en el POS

8. **Reglas validan solo el primer elemento** de `items` en ventas y compras, y de `trackings` (`isValidSale`, `isValidPurchase`). Un cliente malicioso u otro bug puede meter cualquier cosa del ítem 2 en adelante. Firestore rules no itera listas: mitigá acotando tamaño + validando en Cloud Function, o aceptá el riesgo documentándolo.
9. **`updatePurchase` calcula stock y costo promedio (WAC) desde el estado del cliente** con `writeBatch` (`useStoreData.ts:343-407`). Dos recepciones concurrentes duplican stock. Usá `runTransaction` leyendo el producto dentro de la transacción.
10. **`totalStockValue` valúa inventario a precio de venta** (`useStoreData.ts:447`, `Σ price × stock`). Para valor de inventario usá `cost`.
11. **Tasa de cambio `36.6243` hardcodeada 5 veces** en `POS.tsx` como fallback. Extraé una constante o bloqueá la venta si no hay `companyInfo.defaultExchangeRate`.
12. **Zod incompleto** (`validations.ts`): faltan schemas de Customer/Supplier/CompanyInfo y campos en Sale/Purchase (detalle en INCONSISTENCIAS B3). Hoy no rompe porque no se hace `.parse()` en los writes; completalo o borralo para no tener una falsa sensación de validación.

## P3 — Higiene

13. **`package.json` del front**: se llama `react-example`; tiene en `dependencies` cosas que no van al navegador: `firebase-admin`, `express`, `dotenv`, `@types/uuid`, y `@google/genai` que **no se usa en ningún lado de `src/`** (resto del boilerplate de AI Studio, igual que el README). Movelas a `scripts/` o borralas. `vite`/`@vitejs/plugin-react` van en devDependencies.
14. **`vite.config.ts` inyecta `GEMINI_API_KEY` al bundle** (`define`): si esa variable existe en `.env.local`, tu key queda visible en el JS público. Como genai no se usa, borrá el define y la dependencia.
15. **Tests sin cablear**: existe `firestore.rules.test.ts` + vitest instalado, pero no hay script `test`. Agregá `"test": "vitest run"` (con emulador de Firestore) y un `"lint": "eslint ."` real — hoy `lint` es solo `tsc --noEmit`. Correr el test de reglas es especialmente valioso antes del cambio P0.
16. **Basura en la raíz**: `_probe.tmp`, `_sandbox_probe.txt`. `firebase-blueprint.json` desactualizado (le faltan Supplier, campos tablet, colecciones nuevas) — regeneralo o marcalo como no-autoritativo. `testConnection()` en `db.ts` hace una lectura a `test/connection` en cada carga que siempre da permission-denied — borrala.
17. **README del POS** es el boilerplate de AI Studio; reemplazalo con la doc real (ya tenés buen material en CATALOGO_TABLET_RESUMEN.md).

## Orden sugerido de ataque

1. Rotar la clave del service account (5 min) y arreglar `firebase.ts` de PandaLink (5 min).
2. Fase 2 de reglas: admin claim + cerrar lecturas/escrituras (1 tarde, incluye correr `firestore.rules.test.ts` adaptado).
3. Alinear `lista`/`regular` y confirmar deploy de la Cloud Function (el bug visible en tablet).
4. Transacción en `updatePurchase` + inventario a costo.
5. Higiene de package.json/tests/README cuando haya tiempo.
