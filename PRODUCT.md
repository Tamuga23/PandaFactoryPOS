# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Usuario primario: el dueño de Panda Store, operando solo.** Cobra desde una
laptop/PC, no desde tablet ni celular. No hay varios vendedores con sesiones
simultáneas: hoy existe una sola cuenta de staff con el custom claim `admin`.

Eso tiene dos consecuencias que el código todavía no refleja del todo:

- **El layout móvil es respaldo, no el camino principal.** `Layout.tsx` y
  `POS.tsx` traen un recorrido móvil completo (menú lateral deslizante, barra
  inferior fija, botón de volver en el carrito). Funciona, pero no es la escena
  real de cobro. Confirmado por el usuario el 2026-09-19.
- **No hay a quién escalarle un error.** El operador es también el
  administrador: cuando algo falla, el mensaje en pantalla es todo el soporte
  que hay.

**Audiencias secundarias, indirectas:** el cliente final nunca toca este POS,
pero sí ve sus salidas — la factura o proforma en PDF, el mensaje de WhatsApp,
y el catálogo público. Y el asesor de piso usa PandaLink (tablet), que se
alimenta de lo que se carga acá.

## Product Purpose

Sistema de punto de venta e inventario para Panda Store (Nicaragua): venta de
proyectores, dashcams, smartwatches, parlantes y dispositivos de hogar
inteligente importados.

Cubre el ciclo completo de una tienda importadora, no solo el mostrador:

- **Compra e importación:** órdenes con trackings, flete, aduana, seguro y
  tarifa por libra → landed cost real y costo promedio ponderado.
- **Inventario:** stock, alertas de mínimo, kardex inmutable (`movimientos`)
  con cada venta, devolución, compra y ajuste.
- **Venta:** carrito, precio negociable por línea, cliente, entrega, forma de
  pago, descuento por efectivo, financiamiento a plazos.
- **Documento:** recibo oficial o proforma con numeración correlativa
  transaccional, PDF y envío por WhatsApp.
- **Contenido de venta:** fichas técnicas, bullets, beneficios y objeciones por
  producto y por categoría, que bajan a la tablet y a la web.

Éxito, según el usuario: **el flujo ya funciona; lo que falta es presentación.**
No hay un cuello de botella de velocidad ni una fuente conocida de errores de
carga. El objetivo declarado es que el sistema se vea y se sienta más
profesional frente al cliente. Confirmado el 2026-09-19.

## Positioning

Un POS genérico administra un mostrador. Este administra **una tienda que
importa**, y alimenta **tres superficies desde un solo registro de producto**:

1. `products` — la verdad interna, la única que lleva `cost`.
2. `catalogo_publico` — proyección derivada **sin costo**, que consume PandaLink
   (PWA de tablet para el piso de venta) y PandaWEB (catálogo público).
3. Los documentos que se le entregan al cliente (PDF, WhatsApp).

Dos mecanismos que un POS de estante no replica tal cual:

- **El landed cost de importación está en el modelo**, no en una planilla
  aparte: flete, aduana, seguro y tarifa por libra se prorratean al costo de
  cada unidad recibida.
- **Las reglas de financiamiento viven en un solo lugar** (`config/financiamiento`)
  y las tres superficies calculan la misma cuota con ellas. El recargo es por
  categoría (proyectores a 0% real, el resto 3% a 3 meses y 6% a 6 meses), con
  override por producto.

## Operating Context

- **Nicaragua.** Precios de lista en USD, cobro en córdobas (NIO). La tasa
  `36.6243` está congelada por ley del BCN y aparece como constante en los tres
  repos; no es un valor que flote.
- **Escena de cobro:** una persona, una laptop, en la tienda.
- **Sistema de tres repos** que comparten proyecto y base de datos de Firebase:
  - `PandaFactoryPOS` (este) — administra. Login email/password + claim `admin`.
  - `PandaLink` — PWA de tablet para el asesor en el piso. Sesión anónima, solo
    lee `catalogo_publico`, objeciones y `config/financiamiento`.
  - `PandaWEB` — catálogo público (Next.js), recibe tráfico de Google Ads.
- **La sincronización del catálogo público es manual.** El plan Spark no
  permite Cloud Functions, así que `npm run backfill` corre a mano cada vez que
  cambian precios, stock o campos de tablet. La Cloud Function `onProductWritten`
  existe en `functions/` pero no está desplegada.
- **Proveedor de importación:** MagCubic / Hanying (proyectores), 70mai
  (dashcams), Amazfit (smartwatches), Anker (parlantes).

## Capabilities and Constraints

**Confirmado en código:**

- Productos con SKU único, id uuid, costo, stock, alerta de mínimo, categoría,
  specs por categoría, media, y campos de publicación a la tablet.
- Ventas transaccionales que descuentan stock y escriben kardex. Devolución y
  cancelación reponen stock. Numeración correlativa vía `counters/`.
- Dos tipos de documento: `RECIBO_OFICIAL` y `PROFORMA`, con series propias.
- Formas de pago: efectivo, transferencia, tarjeta, crédito y financiamiento.
- Financiamiento: mínimo 100 USD, plazos de 3 y 6 meses, recargo por categoría
  con override por producto. El total siempre cuadra con cuota × meses.
- Clientes con cédula/RUC/pasaporte, historial e integración con WhatsApp.
- Compras con trackings parciales, recepción reversible y landed cost.
- Objeciones universales y por categoría, editables desde el POS.

**Restricciones técnicas:**

- **Plan Spark (gratuito) de Firebase.** Sin Cloud Functions desplegadas. Es una
  restricción de diseño, no un detalle de infraestructura: cualquier feature
  que dependa de un trigger del servidor no se puede construir hoy.
- Base de datos Firestore **nombrada** (no `(default)`).
- Mono-tenant: una sola tienda. `ownerId` existe como campo pero no es frontera
  de propiedad; las reglas nunca lo comparan contra `request.auth.uid`.
- Toda escritura pasa por Zod (`src/lib/validations.ts`) **y** por una lista
  blanca de campos en `firestore.rules`. Agregar un campo exige tocar tipo,
  schema y regla juntos.

**Explícitamente NO decidido — no asumir ninguna de las dos respuestas:**

- **Estatus fiscal del `RECIBO_OFICIAL`.** Se le preguntó al usuario el
  2026-09-19 si el formato está atado a un requisito de la DGI u otra norma
  nicaragüense y no lo marcó como intocable, pero tampoco lo descartó. **Hasta
  confirmarlo, ningún trabajo futuro debe reordenar, quitar ni renombrar campos
  del recibo oficial**, ni afirmar que no hay requisito legal.
- **Si el orden del flujo de cobro** (catálogo → carrito → cliente → entrega →
  pago) responde a una razón operativa. No fue marcado como intocable, pero
  tampoco se confirmó que sea libre.

## Brand Commitments

**Vinculante, confirmado por el usuario el 2026-09-19:**

- **El wordmark `pandastore`** — en minúscula, sin espacio, con `panda` en
  blanco y `store` con gradiente cyan (`from-cyan-400 to-[#0a85a8]`, aplicado
  con `bg-clip-text`). Aparece en el login (`App.tsx`), en la barra lateral y
  en el encabezado móvil (`Layout.tsx`). Es identidad, no decoración: el
  gradiente sobre un logotipo no es el mismo caso que un gradiente sobre un
  título, y no debe "corregirse".
- **La paleta oscura zinc con acento cyan.** Fondo `zinc-950`, superficies
  `zinc-900`, bordes `zinc-800`, acento cyan. Semántica establecida en el
  código: cyan = acción, emerald = éxito/disponible, rose = peligro,
  amber = advertencia.
- **Todo en español**, voz de vos (voseo nicaragüense) en la interfaz y en los
  mensajes de error.

**Assets existentes:** `public/favicon.png`, `public/banpro.svg` (logo de
Banpro, el banco del financiamiento). No hay `/logo.png` pese a que el código
alguna vez lo referenció.

**Datos de la tienda** (en `company/shared_store`): Panda Store, Camino de
Oriente, detrás de INISER, en Colectivo Dreamy · +505 8372 5528 ·
pandastorenic@gmail.com.

## Evidence on Hand

- **Catálogo real en producción:** 31 productos publicados en
  `catalogo_publico`, con fichas técnicas y objeciones cargadas.
- **Lista de precios del proveedor:** `docs/Magcubic_Fichas_Productos.xlsx` y la
  price list de Hanying con specs por modelo.
- **Contenido de venta redactado:** `scripts/fichas_contenido.json` y
  `scripts/fichas_tecnicas.json` — bullets, beneficios, descripciones y
  objeciones por producto, ya en producción.
- **PandaWEB recibe tráfico pago de Google Ads.** Es tráfico real, no una
  maqueta.

**Ausencias que no se deben fabricar:** no hay testimonios de clientes, ni
casos de estudio, ni métricas de conversión, ni benchmarks, ni premios, ni
menciones de prensa. No hay fotografía propia de producto más allá de las
imágenes del proveedor. Cualquier trabajo futuro que necesite prueba social
tiene que pedirla, no inventarla.

## Product Principles

1. **El costo nunca sale del POS.** `cost` vive solo en `products`.
   `catalogo_publico` es una proyección derivada por lista blanca explícita, no
   un spread del producto: un campo sensible nuevo no se filtra por defecto.
2. **Un solo registro alimenta las tres superficies.** Mostrador, tablet y web
   leen del mismo producto. Cualquier feature que obligue a mantener el mismo
   dato en dos lados está mal planteada.
3. **Lo que el cliente ve tiene que cuadrar con lo que se cobra.** La cuota por
   los meses da exactamente el total, y el redondeo nunca va en contra de la
   tienda. Hay tests que lo sostienen.
4. **El plan Spark es una restricción de diseño.** Sin Cloud Functions, todo
   lo que hoy funciona tiene que seguir funcionando con un script corrido a
   mano. No se diseña asumiendo un trigger de servidor.
5. **El operador está solo.** No hay mesa de ayuda ni segundo par de ojos: un
   error tiene que explicarse a sí mismo en pantalla y decir qué hacer, porque
   nadie va a leer una consola.
