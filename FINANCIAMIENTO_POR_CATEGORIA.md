# Financiamiento a plazos por categoría

El 0% de interés dejó de ser parejo. Proyectores lo mantienen; las demás
categorías llevan recargo en las cuotas. **El precio de lista no cambia.**

## Lo que cambió, en una línea

| | Antes | Ahora |
|---|---|---|
| Precio de lista | igual | **igual, no se toca** |
| Cuota | `precio ÷ meses` | `precio × (1 + recargo) ÷ meses` |
| Recargo | 0% en todo | por categoría, con excepción por producto |
| Dónde se configura | hardcodeado en 2 repos | `config/financiamiento`, desde el POS |
| Copy de la web | "cuotas sin intereses" en todas partes | "pagalo en cuotas" + sello 0% donde aplica |

Con la política inicial, un producto de USD 200 a tasa 36.6243:

| Categoría | Plazo | Recargo | Cuota | Total | vs contado |
|---|---|---|---|---|---|
| Proyector | 3 meses | 0% | C$2,442 | C$7,326 | — |
| Proyector | 6 meses | 0% | C$1,221 | C$7,326 | — |
| Smartwatch | 3 meses | 3% | C$2,515 | C$7,545 | +C$220 |
| Smartwatch | 6 meses | 6% | C$1,295 | C$7,770 | +C$445 |

## Antes de que funcione: dos pasos manuales

**1. Desplegar las reglas.** Sin esto el POS no puede guardar nada — se agregó la
colección `config` y el campo `financiamientoOverride` en `products`:

```bash
firebase deploy --only firestore:rules
```

**2. Desplegar la Cloud Function** (o correr el backfill), para que el override
por producto llegue al espejo público:

```bash
cd functions && npm run build && cd ..
firebase deploy --only functions
# o, si la función no está desplegada:
node scripts/backfill_catalogo_publico.mjs --dry-run   # y después sin el flag
```

Mientras no hagas el paso 1, la tablet y la web siguen andando con el respaldo
del código (proyectores 0%, resto con recargo).

## Dónde se configura

**POS → Configuración → Financiamiento a plazos.** Tabla con el recargo por
categoría y plazo, una casilla "0% interés" que pone todo en cero, y una **vista
previa** que calcula la cuota con el mismo código que usan la tablet y la web —
así ves el resultado antes de guardar.

**Por producto:** en la ficha del catálogo, campo *Financiamiento a plazos*:

- *Según su categoría* — lo normal.
- *Forzar 0% interés* — el modelo caro que sí aguanta absorber el costo.
- *Sin cuotas* — no se ofrecen plazos, solo contado.

## Qué ve cada quien

**PandaLink (el asesor).** Por cada plazo: la cuota mensual grande y el **total a
cobrar** debajo. Si hay recargo, muestra `+C$445 sobre contado` y una nota que
dice de frente que a plazos el monto es mayor. El sello "0% interés" aparece solo
cuando de verdad no hay recargo en ningún plazo.

**PandaWEB (el cliente).** Solo la cuota mensual, sin el total — como pediste. El
sello "0% interés" solo en los productos que lo tienen. La sección de
financiamiento de la portada nombra las categorías que van a 0% en vez de
prometerlo en general.

## Los 13 lugares de copy que había que corregir

Esto era lo más fácil de dejar a medias. Todos corregidos, incluidos los
metadatos SEO que Google indexa:

`config/site.ts` (descripción del sitio + propuesta de valor) · `app/page.tsx`
(hero, tarjeta de ventajas, sección de financiamiento) · `app/catalogo/page.tsx`
(metadata + encabezado) · `app/producto/[id]/page.tsx` (metadata de cada ficha) ·
`components/Footer.tsx` · `components/Precio.tsx` (ficha y tarjeta) ·
`components/comparar/ModalComparar.tsx` · `PandaLink/components/Ficha.tsx` ·
`PandaLink/components/PCard.tsx` · `PandaLink/config.ts`

`FINANCIAMIENTO` en `config/site.ts` quedó reducido a `{ banco: "Banpro" }`. El
mínimo, los plazos y el interés ya no viven ahí: los borra a propósito para que
nadie vuelva a leer un `interes: 0` que ya no es cierto.

## Cómo está construido

`src/lib/financiamiento.ts`, **duplicado idéntico en los tres repos** (mismo
patrón que `categorySpecs.ts`). Si tocás uno, copialo a los otros dos:

```bash
md5sum PandaFactoryPOS-main/src/lib/financiamiento.ts \
       PandaLink/src/lib/financiamiento.ts \
       PandaWEB/src/lib/financiamiento.ts
```

Precedencia: `recargoPorDefecto` ← `porCategoria` ← `financiamientoOverride`.

**Redondeo.** Se redondea la **cuota** hacia arriba al córdoba y el total se
deriva como `cuota × meses`. Al revés — redondear el total y dividir — daría
cuotas con centavos que no se pueden cobrar, y el asesor y el cliente verían
números que no cuadran. Hacia arriba para que el redondeo no juegue en contra.

**En PandaWEB las cuotas se calculan una sola vez** en `lib/catalog.ts`, donde
están la tasa y las reglas, y viajan dentro de `producto.planes`. Ningún
componente vuelve a calcularlas — ni el comparador, que es cliente. Así no puede
pasar que la tarjeta, la ficha y el comparador muestren tres cuotas distintas del
mismo producto, que es exactamente el tipo de bug que ya había con los slugs.

**El costo del banco (6% / 9%) no está en ningún doc que llegue al navegador.**
`config/financiamiento` solo tiene lo que el cliente puede ver. Ese número es
dato de margen y vive en `npm run financiamiento`, que corre con Admin SDK.

## Lo que este cambio NO recupera

Tu 3% y 6% recuperan **algo más de la mitad** de lo que te cobra el banco:

| $100 a 6 meses | Cliente paga | Vos recibís |
|---|---|---|
| Antes (0%) | $100.00 | $91.00 |
| Ahora (+6%) | $106.00 | $96.46 |
| Para netear $100 | $109.89 | $100.00 |

Es una decisión válida — partís el costo con el cliente — pero conviene tenerla
explícita. Si algún día querés recuperarlo completo, el número es
`precio ÷ (1 − tasa)`, no `precio × (1 + tasa)`. La tabla sale al final de
`npm run financiamiento`.

## Cobrar una venta financiada

Se agregó la forma de pago **FINANCIAMIENTO (cuotas)**, separada de **TARJETA
(pago único)**. El selector de plazo aparece **solo** con FINANCIAMIENTO.

Al elegirla, el POS calcula los plazos disponibles para ese carrito y muestra
cuota, total y recargo de cada uno. **No se puede cobrar sin elegir plazo** —
registrar el plazo es el único motivo por el que existe esta forma de pago.

Si el carrito **mezcla categorías**, el recargo se **pondera por monto**: un
proyector de $300 al 0% junto a un smartwatch de $100 al 3% dan 0.75%, no 3%. Las
alternativas eran peores: el recargo más alto le cobraría de más a la parte del
proyector, y el más bajo dejaría plata sobre la mesa.

Bordes, todos del lado prudente:

- Un producto con las cuotas deshabilitadas deja **toda la venta** sin plazos.
- El mínimo que se exige es el **más alto** de las categorías del carrito.
- Los plazos son la **intersección**: si una categoría cerró el de 6 meses, no se
  ofrece para esa venta.
- El mínimo se evalúa sobre el **total** de la venta, no por línea.

En cada venta financiada queda una **foto del plan cobrado** —
`Sale.financiamiento: { plazoMeses, recargoPct, cuotaNio, totalNio, banco }`. Es
una foto, no una referencia a la config: si mañana cambiás las tasas, las ventas
viejas siguen contando lo que de verdad pasó. Y `totalNio` tiene que ser exacto
`cuotaNio × plazoMeses`, validado por Zod y por las reglas — si no cuadra, el
número que vio el cliente no era el que se cobró.

El plan se muestra en el **recibo impreso** (bajo el TOTAL) y en la fila del
**historial**, y hay filtro por forma de pago. El recibo usa la foto guardada, no
recalcula: reimprimir seis meses después da el mismo papel.

**El reporte ya no estima esas ventas, las mide.** `npm run financiamiento` ahora
usa el plazo real donde existe y solo estima el registro viejo de TARJETA, con
una columna `medido` que dice qué parte del costo es dato duro. Cuando esa
columna llegue a 100%, la mezcla asumida deja de importar.

## Lo que sigue pendiente

**Confirmá con Banpro.** Donde el recargo por pagar con tarjeta se permite, Visa
lo topa en 3% y Mastercard en 4%: tu 6% a 6 meses se pasa de los dos. El contrato
de afiliación tuyo es el que manda, y vale preguntar en la misma llamada si te
mejoran el 9% por volumen.

**Las ventas históricas quedan como TARJETA.** No se pueden reclasificar: el dato
del plazo nunca existió. El reporte las sigue estimando y las separa de las
medidas, así que no se mezclan supuestos con hechos.

## Verificación hecha

- `tsc --noEmit` limpio en los tres proyectos.
- 48 pruebas del módulo compartido (`npm run financiamiento:cuotas`): el total
  siempre es `cuota × meses`, el precio de lista nunca cambia, los slugs en
  inglés de PandaLink resuelven igual, el umbral corta bien, los tres niveles de
  precedencia funcionan, y un doc de config roto cae al default sin anunciar 0%
  donde no lo hay.
- La suite existente de PandaWEB (`npm test`) adaptada y en verde: 39 pruebas,
  incluidas las nuevas de recargo por categoría.
- 26 pruebas del reporte de margen (`npm run financiamiento:test`).
- Recorrido completo simulado: doc del espejo → normalizador → cuotas, con
  proyector en 0%, smartwatch con recargo, override forzando 0%, producto bajo el
  umbral y producto sin cuotas. El precio de lista quedó intacto en los cinco.
- Auditoría de texto: no quedó ninguna promesa de "sin intereses" fuera de la
  condicional que nombra las categorías que sí lo tienen.
