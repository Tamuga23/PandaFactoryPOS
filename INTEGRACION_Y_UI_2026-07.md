# Verificación de integración POS → PandaLink + evaluación UI — 2026-07-02

Alcance: trazado campo por campo del flujo de datos (catálogo, precios, objeciones, bullets, imágenes, videos) desde el form del POS hasta la UI de la tablet, verificación de compilación de lo pusheado, y revisión UI/UX de ambas apps. Seguridad/auth intactas (pendiente P0, a pedido).

## 1. Estado de los repositorios

- **POS: ✔ correcto.** El commit `3013b45` (hoy) contiene todos los fixes de la sesión anterior (transacción en updatePurchase, deps limpias, tasa centralizada, `shippingRatePerLb` en reglas). Compila limpio (`tsc` exit 0 sobre HEAD).
- **PandaLink: ✗ INCOMPLETO.** Los últimos commits son del **29 de junio**. Todo esto existe SOLO en tu disco, sin commitear: la separación en `src/components/`, `src/config.ts`, `src/lib/objeciones.ts`, `src/lib/format.ts`, `tests/` (ni siquiera trackeados), el fix de precios `lista→regular`, y los fixes de hoy. **Acción: en PandaLink correr `git add -A && git commit -m "..." && git push`.** Hasta entonces, un `git checkout`/clone accidental pierde todo eso.

## 2. Bugs de integración encontrados HOY (y ya corregidos en PandaLink)

### 2.1 [CRÍTICO] Las objeciones por categoría nunca aparecían en la tablet
Firestore tiene `objeciones_categoria` con slugs en **español** (`proyector`, seeds `carga_masiva_objeciones.mjs:52`), pero PandaLink normaliza los slugs de PRODUCTO a **inglés** (`proyector→projector`). La cascada filtra por igualdad exacta (`objeciones.ts:15`) → `'proyector' !== 'projector'` → las objeciones de categoría de proyectores (manta, apps, conexión) jamás se mostraban. Dashcam/smartwatch sí funcionaban (sin mapeo).
**Fix aplicado:** `normalizarCategoria` ahora pasa por el mismo `SLUG_MAP` que los productos (`usePandaData.ts`).

### 2.2 [ALTA] Los overrides de objeción perdían el texto del botón
Los seeds escriben overrides como `{ objId: 'apps', respuesta: ... }` sin título. El normalizador ponía `pregunta = objId` y la cascada reemplazaba la objeción base completa → el botón en la Ficha mostraba el slug crudo ("apps", "luz", "enfoque") en vez de "¿Sirve con Netflix / YouTube / HBO?".
**Fix aplicado:** la cascada (`objeciones.ts`) ahora fusiona: el override hereda `pregunta` y `orden` de la objeción base que reemplaza, y el normalizador respeta `titulo` si viene.
**Pendiente de DATOS (tuyo):** `luz` y `enfoque` no existen como objeción base de la categoría proyector → sus botones mostrarán "luz"/"enfoque". Dos opciones: crearlas en el POS (Objeciones por categoría → proyector: "¿Se ve con luz del día?", "¿El enfoque es automático?") o agregar `titulo` a esos overrides por producto.

### 2.3 Mejoras de robustez aplicadas (PandaLink)
- Bullets ahora se ordenan por `order` (el POS los manda 1..n) y la `etiqueta` vacía ya no deja hueco visual en la Ficha.
- Imagen: fallback `media.gallery[0]` agregado (el contrato del POS define `gallery`; la app buscaba `fotos`, un campo que el POS nunca escribe).
- Video: `toYouTubeEmbed` ahora acepta también `youtube.com/shorts/ID` y `/live/ID`.
- Tipo `Media` documentado con `gallery`.

Verificación: `tsc` limpio con el árbol completo (componentes + fixes).

## 3. Contrato de datos — estado campo por campo

| Dato | POS (origen) | Tablet (destino) | Estado |
|---|---|---|---|
| Nombre/beneficio/categoría | form Catálogo → products → backfill | Ficha/PCard/Demo | ✔ |
| Disponible | `stock>0 && publicar!==false` (backfill) | badge + orden del grid | ✔ (`activo` solo oculta en POS: correcto) |
| Precio lista/promo/efectivo | `precio.{lista,actual,efectivo,descEfectivoPct}` | `regular/actual/efectivo` (mapeo lista→regular) | ✔ tras fix; sin precio → "Consultar en caja" (nunca C$0) ✔ |
| `precioPromo` vacío o 0 | form lo convierte a `undefined` (`ProductCatalog.tsx:166`) | — | ✔ no hay riesgo de precio 0 |
| Bullets | `{text, order}` (form y seeds) | `texto` ordenado | ✔ tras fix |
| Objeciones universales | `titulo/order` en vivo (onSnapshot) | `pregunta/orden` | ✔ |
| Objeciones por categoría | slug español en vivo | mapeo de slug | ✔ tras fix 2.1 |
| Overrides por producto | `{objId, titulo?, respuesta}` vía backfill | cascada con herencia | ✔ tras fix 2.2 |
| Imagen | `media.heroImage` (URL, form sección tablet) | Ficha/PCard/Demo | ✔ — OJO: la foto `imageBase64` del inventario NO viaja a la tablet (decisión correcta: 1MB/doc mataría las lecturas). Solo se ve imagen si cargás "Hero Image URL". |
| Video | `media.videoUrl` (URL) | modo Demo (iframe YouTube) | ✔ solo YouTube; URL de otra fuente cae a foto EN SILENCIO |
| Specs proyector | `specsProyector` | calculadora de distancia | ✔ (`throwRatio/distMinEnfoque` numéricos o string) |

Recordatorios operativos del flujo (plan Spark):
1. Cambios en `products` (precios, stock, bullets, media, publicar) llegan a la tablet SOLO tras `npm run backfill`. Las objeciones sí llegan en vivo.
2. Sugerencia de validación en POS: en el campo Video URL, avisar "solo YouTube" (hoy si pegás un link de Facebook/Drive, la tablet muestra foto sin explicación).

## 4. UI/UX — hallazgos y prioridades

### POS (línea: zinc + cyan, dark)
Diagnóstico: funcional y decente, pero le falta pulido. Los 5 cambios de mayor impacto:

1. **Eliminar los `alert()` nativos** (POS.tsx:59,65,77,215; Purchases.tsx:84,118,133; Inventory.tsx:134). Rompen la estética dark, bloquean el flujo y varios están en inglés. Reemplazar por un toast/banner inline (como el que ya tenés en ProductCatalog:280 — ese patrón está bien).
2. **Unificar la paleta de acción: cyan O sky, no ambos** (+ hay `blue-600` suelto en ProductCatalog:556,664). Propuesta: cyan = acción principal; emerald = éxito; rose = error/peligro; amber = pendiente/warning. Un buscar-reemplazar de `sky-`→`cyan-` y `blue-`→`cyan-` resuelve el 90%.
3. **Español al 100%**: quedan strings visibles en inglés ("Search products to add...", "Loading POS...", "Cart is empty", headers de tabla en Purchases, "No purchase history found."). La app es español-first; la mezcla se ve descuidada.
4. **Componentes base** (`Button`, `Input`, `Card`, `Toast`): hoy hay ~15 variantes de botón primario y focos inconsistentes (`ring-1` vs `ring-2` vs sin ring). Un archivo `src/components/ui.tsx` con 4 componentes elimina la deriva visual de raíz.
5. **Checkout del POS en secciones**: el panel de cobro mezcla cliente/envío/pago sin agrupación y el preview re-pide confirmación. Agrupar en "Cliente → Envío → Pago" (acordeón) y dejar el preview como solo-lectura + un único botón Confirmar.

Menores: touch targets chicos (botones +/- del carrito `p-1`, trash `w-4`), `text-[10px]` en headers de tabla, z-index ad-hoc (50/60/100/101), y el PDF de factura usa azules hardcodeados (`#1a6ba0`) ajenos a la línea.

### PandaLink (tablet, vendedor con cliente enfrente)
Diagnóstico: arquitectura y estados muy bien resueltos; los ajustes son de ergonomía de venta:

1. **Precio efectivo siempre visible cuando hay descuento**: hoy el precio de cierre vive detrás del botón "Empujón final" (Ficha:200-219). En la práctica el vendedor olvida tocarlo. Mostrar tarjeta/efectivo lado a lado desde el inicio y dejar el botón como énfasis, no como compuerta.
2. **Búsqueda global en el header sticky**: el buscador solo existe dentro de Catálogo (App.tsx:246). Si el cliente dice "el HY350", son 2-3 taps + scroll. Un input en el top bar con overlay de resultados baja la venta a 1 tap.
3. **Botones de objeción más grandes**: `py-2.5 text-[13px]` en grid de 2 columnas (Ficha:100-108) queda por debajo del mínimo táctil (~44px). Subir a `min-h-[52px] text-sm`. Es EL control que se usa bajo presión.
4. **Producto agotado no debe invitar al tap**: el PCard agotado sigue 100% clicable e igual de vistoso; dentro de la ficha, "Empujón final" y "Demo" siguen activos. Poner `opacity-60` + badge "Agotado" grande en el card, y en la Ficha deshabilitar el cierre (el catálogo ya los ordena al final ✔ y el asistente guiado ya los excluye ✔).
5. **Layout landscape**: la Ficha es `grid-cols-2` fija y el catálogo `grid-cols-4`; en tablet 10" horizontal sobra aire y el panel derecho del Demo es `w-72` fijo. Ajustar con breakpoints (`lg:grid-cols-3` en ficha, panel demo `w-80 xl:w-96`). Además `tailwind.config.js` está casi vacío: definir ahí el token de acento para no repetir `cyan-500` a mano.

Menores: copy "Mostrar al cliente (girar tablet)" no aplica en landscape → "Mostrar demo al cliente"; "en la voz de Carlos" hardcodeado en ObjecionDrawer (si algún día atiende otro vendedor, leerlo de config.ts); borde del drawer invisible en dark (`border-zinc-800` sobre fondo zinc → usar cyan).

### Coherencia entre las dos apps
La dirección es correcta (commit "design: alinear estilo visual con PandaStore POS"). Para cerrarla: mismo acento (cyan-500/600 en ambas — PandaLink a veces usa `stone-*` de la fase light donde el POS usa `zinc-*`), mismos colores semánticos (emerald/rose/amber con igual significado), y misma tipografía de labels (los `text-[11px] uppercase tracking-wide` de PandaLink son un buen patrón — llevarlos al POS en vez de los headers `text-[10px]`).

## 5. Checklist para vos (en orden)

1. **PandaLink: commitear y pushear TODO** (`git add -A && git commit && git push`) — incluye los fixes de integración de hoy. Antes: `npm run build` para confirmar (a mí me compila limpio).
2. Correr `npm run backfill:dry` → `npm run backfill` en el POS para refrescar `catalogo_publico`.
3. Datos: crear objeciones de categoría `luz` y `enfoque` para proyector (o poner `titulo` en esos overrides) — ver 2.2.
4. UI: decidir si querés que implemente los top-5 de cada app (los del POS son ~1 día de trabajo; los de PandaLink ~medio día).
5. P0 de seguridad sigue pendiente al final, como acordamos (`REVISION_2026-07.md`).
