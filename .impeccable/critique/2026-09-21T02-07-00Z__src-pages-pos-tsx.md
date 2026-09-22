---
target: src/pages/POS.tsx
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 5
target_identity: "file:C:\\Users\\carlo.DESKTOP-0BRP765\\Documents\\PandaFactoryPOS-main\\src\\pages\\POS.tsx"
target_fingerprint: "sha256:8d94e250d44389d035ee7333819007afec22b00540454984234c98f675f88163"
target_path: "C:\\Users\\carlo.DESKTOP-0BRP765\\Documents\\PandaFactoryPOS-main\\src\\pages\\POS.tsx"
timestamp: 2026-09-21T02-07-00Z
slug: src-pages-pos-tsx
---
# Critique #4 — src/pages/POS.tsx

Method: cuatro agentes aislados (A revision de diseno · A2 escena real de cobro ·
B detector y medicion · C conformidad DESIGN.md). Ninguno vio la salida de los
otros, y a ninguno se le dijo que se habia cambiado en las rondas anteriores.

## Design Health Score

| # | Heuristica | Puntaje | Hallazgo |
|---|---|---|---|
| 1 | Visibilidad del estado | 2 | La venta fallaba y la pantalla no lo decia: el modal quedaba identico y el aviso se borraba a los 4,5 s |
| 2 | Correspondencia con el mundo real | 3 | C$ con la tasa a la vista, Paga con/Vuelto, CUOTAS BANPRO. El boton dice "Confirmar Venta" tambien en cotizaciones |
| 3 | Control y libertad | 3 | ESC, trampa de foco, descarte en dos pasos, el borrador se ofrece en vez de restaurarse solo |
| 4 | Consistencia y estandares | 2 | Dos campos casi homonimos; el placeholder de uno describe al otro. Diez niveles de z-index |
| 5 | Prevencion de errores | 1 | F2 facturaba un formulario congelado. Se puede facturar un envio sin direccion |
| 6 | Reconocer antes que recordar | 2 | El POS es la unica de las tres superficies que no sabe el precio vigente (precioPromo) |
| 7 | Flexibilidad y eficiencia | 2 | Atajos con leyenda visible, y el acelerador principal emitia datos viejos |
| 8 | Estetica y minimalismo | 3 | Jerarquia inequivoca; densa y plana como declara el sistema |
| 9 | Recuperacion de errores | 1 | Diagnosticos excelentes tirados por temporizador. Reintentar no es idempotente |
| 10 | Ayuda y documentacion | 3 | CREDITO vs FINANCIAMIENTO y el mensaje de no-calificacion con los dos numeros reales |
| **Total** | | **22/40** | **Aceptable** |

El evaluador A puntuo 26/40. La sintesis baja cuatro puntos porque A no sabia lo
que encontro A2: la pantalla no podia registrar ni una sola venta. No es deriva
de puntuacion, es una regresion real introducida en esta sesion.

## Design Specificity

Alta y genuina, salvo en el dato que define el negocio. Total en cordobas con la
tasa impresa, CARGOTRANS / BUSES INTERLOCALES con tres layouts de etiqueta 4x6,
CUOTAS BANPRO explicado contra TARJETA DE CREDITO, Paga con / Vuelto, y "Mostrar
al cliente" — la unica pieza del sistema que admite que la laptop se gira.

El reverso: `precioPromo` no aparece ni una vez en POS.tsx, mientras
validations.ts lo publica a catalogo_publico como `precio.actual`. El mostrador
es la unica de las tres superficies que cobra el precio de lista.

Detector: 0 anti-patterns, 42 advisories (todos design-system-font-size). El
detector sub-cuenta: DESIGN.md declara DOS rampas y el detector valida contra
una, asi que no ve los 22 text-[10px] dentro de los lienzos de papel. Total real
fuera de rampa: 50.

Navegador: no hay herramienta de browser en la sesion. Se compenso comparando
cada clase contra el CSS compilado en dist/, con control positivo.

## Priority Issues

### [P0] Ninguna venta ni proforma podia registrarse — ARREGLADO

SaleSchema pide invoiceNumber min(1); el POS mandaba '' a proposito para que el
preview ocultara el renglon del numero. Las dos decisiones correctas por
separado mataban toda escritura en el safeParse previo a la transaccion.
Verificado ejecutando el schema real. Introducido en d579b06 (11:25 de hoy): los
critiques #2 y #3 corrieron sobre ese build y no lo vieron, porque revisaban
diseno y ninguno camino la transaccion. El primer arreglo escrito tambien estaba
mal (.omit() lanza sobre schemas con refinements) y lo atrapo la misma prueba.

### [P0] F2 facturaba un formulario congelado — ARREGLADO

Arreglo de dependencias [cart.length, ...] con un eslint-disable que silenciaba
la regla que existe para atrapar esto. Todo lo que el operador tocara despues
era invisible para F2/F3. Apretar F2 con el formulario lleno emitia una factura
con el cliente vacio, EFECTIVO y a precio de lista.

### [P1] Reintentar una venta fallida no es idempotente — PENDIENTE

Falla ambigua (unavailable/deadline-exceeded) + reintento = stock descontado dos
veces, correlativo saltado, dos movimientos de kardex con el mismo refId.
Arreglo: leer saleRef dentro de la transaccion y devolver su numero si existe.

### [P1] El POS no sabe el precio vigente — PENDIENTE

precioPromo ausente de POS.tsx. El cliente vio C$3.259 en PandaWEB; el mostrador
cobra C$4.029. Rompe en silencio el principio declarado del producto.

### [P1] Se puede facturar un envio sin direccion — PENDIENTE

handleTryCheckout valida dos cosas. El transporte es el unico campo con
consecuencia fisica y el que menos validacion tiene. La etiqueta en blanco
aparece despues del clic irreversible.

### [P1] 7 de 12 modales no son dialogos, 10 de 12 dejan escapar el Tab — PENDIENTE

Incluido el que borra una venta ya registrada.

### [P1] DESIGN.md se contradecia a si mismo en diez lugares — ARREGLADO

La correccion del hover de la ronda anterior dejo sin tocar la lista de Do's (la
unica seccion en imperativo) y la receta del boton primario en Components.
Ademas todos los ratios del documento salieron de los hex de Tailwind v3 y el
proyecto compila v4 en OKLCH: el margen de rose-600 no era 0.20 sino 0.03.

## Persona Red Flags

- Alex (experto): el atajo publicitado al pie era el que emitia datos viejos.
  Solo fallaba por teclado, que es el modo que el producto promueve.
- Sam (lector de pantalla): la region aria-live nacia con su primer aviso. 128 de
  142 controles de formulario sin nombre programatico; POS es el unico archivo
  que lo hace bien (12/13).
- Riley (bordes): cerrar la pestana con la barra de borrador en pantalla pierde
  la venta nueva en silencio. "Recuperar venta" restaura precio, stock y cliente
  sin revalidar: customerId puede viajar colgante.
- Carlos (el dueno, operando solo): es su propia mesa de ayuda y el producto le
  retiraba la explicacion por temporizador en el unico instante irreversible.

## Minor Observations

- El aviso de exito de una venta financiada muestra el total DE CONTADO.
- Un escaneo sin coincidencia deja el codigo pegado en el buscador y envenena
  todos los escaneos siguientes. El camino de exito si limpia.
- La app no imprime: no hay window.print() ni @media print en todo el repo.
- El precio negociado en cordobas no vuelve igual (3500 -> C$3.499,82).
- Dos clases muertas verificadas contra el CSS compilado: aspect-w-1/aspect-h-1
  (plugin no instalado) y text-md x6 (no existe en Tailwind). ARREGLADAS.

## Questions to Consider

1. Si el precio con promocion y el de efectivo ya se le publicaron al cliente en
   PandaWEB y en la tablet, por que el mostrador es la unica superficie que
   cobra el precio de lista y le deja al operador la tarea de acordarse?
2. El modelo ya sabe pedir cedula y RUC, pero el POS manda clientDocumentType
   NINGUNO fijo y ni siquiera copia el documento del cliente elegido. Es
   deliberado que una factura de esta tienda nunca pueda llevar el RUC del
   comprador, o es un campo que se quedo sin UI?
3. El cobro tiene que ser un formulario dentro del panel del carrito? Con nueve
   controles que no entran sin scroll y el cliente enfrente, que se perderia si
   FACTURAR abriera el cobro como paso propio?
