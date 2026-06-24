# Revisión de inconsistencias — PandaFactoryPOS

Leí el código completo (modelo de datos en 4 capas + páginas, componentes, hooks). Separo lo **ligado al cambio de catálogo** (lo que tocamos) de lo **pre-existente** que encontré de paso.

---

## A. Ligado al catálogo (conviene arreglar)

### A1. [ALTA] Una venta puede ser RECHAZADA si el primer ítem del carrito es un producto de catálogo
- `CartItem extends Product`, así que al agregar al carrito (`POS.tsx`, `{ ...product, quantity }`) el ítem arrastra los campos nuevos: `publicar, precioPromo, descEfectivoPct, campania, beneficio, bullets, specsProyector, objecionesOverride, media, categorySlug`.
- `recordSale`/`updateSale` (`useStoreData.ts`) solo borran claves `undefined`, no las extra.
- `isValidSaleItem` en `firestore.rules:52` valida `items[0]` con un `hasOnly` que **NO** incluye esos campos.
- **Consecuencia:** vender (o editar una venta) cuyo primer renglón sea un producto con campos de tablet → `permission-denied` intermitente y difícil de diagnosticar.
- **Esto lo introdujo nuestro cambio** (agregamos campos a `Product`/`CartItem` sin actualizar `isValidSaleItem`).
- **Fix recomendado:** quitar los campos de tablet del ítem al armar la venta (los renglones de venta no necesitan `bullets`/`media`/specs). Alternativa mínima: agregar esos 10 campos al `hasOnly` de `isValidSaleItem`.

### A2. [MEDIA] El selector "Estado: Activo/Inactivo (Oculto)" del form no hace nada
- `ProductCatalog.tsx` arma `status` en `productDataToSave`, pero `Catalog.tsx` (`handleAddProduct`/`handleUpdateProduct`) nunca lo copia al producto; `Product` no tiene `status`; las reglas no lo permiten.
- Además `Catalog.tsx:49` setea `status: p.stock >= 0 ? 'Activo' : 'Inactivo'`, y como `stock >= 0` siempre, al editar siempre muestra "Activo".
- **Consecuencia:** "Inactivo (Oculto)" se descarta en silencio; no hay forma real de ocultar un producto del POS. Si algún día se reenvía `status`, la regla lo rechazaría.
- **Fix:** decidir el significado (p.ej. "Inactivo" → `publicar:false`, o agregar un campo real `activo`/`visibleEnPos` a las 3 capas) o quitar el control.

### A3. [MEDIA] Editar por la pantalla de Catálogo pisa `description` con `name`
- `Catalog.tsx:46` arma el form con `description: p.name`; al guardar (`:107-108`) escribe `name = description` y `description = description`.
- **Consecuencia:** si un producto tenía una `description` distinta del `name` (p.ej. cargada desde Inventario), al editarlo en Catálogo se pierde.
- **Fix:** mantener `name` y `description` separados (el form solo tiene un campo "Descripción" que en realidad es el nombre).

### A4. [BAJA] El SKU/ID del form se usa como ID de documento sin validar el charset
- `Catalog.tsx:71` usa el SKU tipeado como id; `isValidId` (`firestore.rules:11`) exige `^[a-zA-Z0-9_\-]+$`.
- **Consecuencia:** un SKU con espacio, punto, `/` o acento → `permission-denied` al crear, sin aviso en el cliente.
- **Fix:** validar/normalizar el SKU en el form (o generar el id con uuid y guardar el SKV como campo).

> Nota: revisé y `isReordering` **sí** está en el `hasOnly` de `isValidProduct` (no es un bug, por si alguna otra herramienta lo marca).

---

## B. Pre-existentes (no son del cambio de catálogo, pero son reales)

### B1. [ALTA] `PurchaseRegistration.tsx:261-262` guarda precio/costo en NIO, el resto del app asume USD
- Al crear un producto desde el flujo de compras: `price: item.catalogPriceUSD * 36.6243`, `cost: item.unitCost * 36.6243` (aunque el campo se llama `...USD` y el label dice "USD").
- El resto del app trata `product.price` como **USD** (Catalog, presets, `POS.subtotal`).
- **Consecuencia:** esos productos quedan ~36× inflados en POS, Dashboard y Reports. Además usa `36.6243` hardcodeado en vez de `companyInfo.defaultExchangeRate`.
- **Fix:** guardar `price`/`cost` en USD (sin multiplicar) y usar la tasa de company donde haga falta convertir para mostrar.

### B2. [MEDIA] `Dashboard`/`stats.totalStockValue` valúa el inventario a precio de venta, en USD
- `useStoreData.ts:447`: `Σ p.price * p.stock`. Usa precio de venta (no costo) y lo muestra como USD.
- **Consecuencia:** el "valor de inventario" no es a costo; y se rompe con los productos en NIO de B1.
- **Fix:** usar `p.cost` para valor de inventario y unificar la moneda.

### B3. [MEDIA] Zod (`validations.ts`) está incompleto vs los tipos y las reglas
- No hay schema para `Customer`, `Supplier`, `CompanyInfo`, `PurchaseTracking`.
- `SaleSchema` no incluye `customerId` ni `notes`. `PurchaseSchema` no incluye `trackings`, `status`, `stockAdded` ni los campos de logística/landed-cost. `PurchaseItemSchema` no incluye `receivedQuantity`, `color`, `estimatedWeight`.
- **Consecuencia:** validación cliente parcial; si alguna vez se corre `.parse()` se caen/strippean campos válidos. Hoy no rompe porque los writes no usan Zod (van directo con strip de `undefined`).
- **Fix:** completar los schemas o documentar que Zod es "best-effort" y que la verdad la imponen las reglas.

### B4. [MEDIA] `firebase-blueprint.json` está desactualizado
- Le faltan: todos los campos de tablet de `Product`, la entidad `Supplier`, `UniversalObjection`, `PublicCatalogProduct` y subtipos, y las colecciones `suppliers/`, `objeciones_universales/`, `catalogo_publico/`; también campos de logística de `Purchase`.
- **Consecuencia:** documentación que ya no refleja el modelo. Regenerarlo o marcarlo como no-autoritativo.

### B5. [MEDIA] `updatePurchase` calcula stock/costo (WAC) desde el estado del cliente, con `writeBatch` (no transacción)
- `useStoreData.ts:343-407` lee `products`/`purchases` del closure y usa `batch.update`.
- **Consecuencia:** recepciones concurrentes pueden doble-contar stock o calcular WAC con datos viejos. Además, si `shippingModality` es un valor libre (PurchaseRegistration permite custom), la tarifa cae a 0 y el flete no se prorratea.

### B6. [BAJA] Varios
- Reglas validan solo `items[0]`/`trackings[0]` en ventas/compras → ítems 2..N sin validar.
- `refreshMetrics: () => {}` es un no-op; `updateSupplier`/`deleteSupplier` exportados pero sin UI que los use.
- Los casts `{ ...d.data() } as Product` ocultan campos faltantes → `NaN` en stats si un doc viejo no tiene `price`/`minStockAlert`.
- `orderBy('createdAt')` en customers/suppliers: un doc sin `createdAt` se omite silenciosamente del snapshot.
- `company` se lee con `snapshot.docs[0]` pero se escribe en `company/shared_store` (asunción de un solo doc/tenant).

---

## Prioridad sugerida
1. **A1** (rechazo de ventas) — es el único que rompe algo por nuestro cambio. Lo puedo arreglar ya.
2. **B1** (precio en NIO en compras) — corrompe métricas; pre-existente pero alto impacto.
3. **A2/A3** (status fantasma / pisado de description) — UX del catálogo.
4. El resto (Zod/blueprint/WAC) cuando haya tiempo.
