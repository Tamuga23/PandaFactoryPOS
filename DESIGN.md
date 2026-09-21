---
name: PandaStoreOS
description: Consola oscura de punto de venta e importación, densa y plana, con un solo acento turquesa.
colors:
  turquesa-electrico: "#22d3ee"
  turquesa-accion: "#0e7490"
  turquesa-foco: "#06b6d4"
  turquesa-accion-hover: "#155e75"
  carbon-fondo: "#09090b"
  carbon-superficie: "#18181b"
  carbon-control: "#27272a"
  carbon-borde: "#3f3f46"
  carbon-borde-hover: "#52525b"
  texto-maximo: "#ffffff"
  texto-cuerpo: "#e4e4e7"
  texto-control: "#d4d4d8"
  texto-secundario: "#a1a1aa"
  texto-terciario: "#71717a"
  confirmacion: "#10b981"
  confirmacion-alerta: "#34d399"
  peligro: "#f43f5e"
  peligro-alerta: "#fb7185"
  advertencia: "#f59e0b"
  papel: "#ffffff"
  tinta: "#000000"
  azul-documento: "#1a6ba0"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
  micro:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    letterSpacing: "0.05em"
  dato:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.875rem"
    fontWeight: 700
rounded:
  chip: "4px"
  segmento: "6px"
  control: "8px"
  tarjeta: "12px"
  modal: "16px"
  pildora: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  gutter: "32px"
components:
  boton-primario:
    backgroundColor: "{colors.turquesa-accion}"
    textColor: "{colors.texto-maximo}"
    rounded: "{rounded.control}"
    padding: "12px 24px"
  boton-primario-hover:
    backgroundColor: "{colors.turquesa-accion-hover}"
    textColor: "{colors.texto-maximo}"
  boton-secundario:
    backgroundColor: "{colors.carbon-control}"
    textColor: "{colors.texto-control}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  boton-secundario-hover:
    backgroundColor: "{colors.carbon-borde}"
    textColor: "{colors.texto-maximo}"
  boton-confirmar:
    backgroundColor: "#047857"
    textColor: "{colors.texto-maximo}"
    rounded: "{rounded.control}"
    padding: "12px 24px"
  boton-peligro-disparador:
    backgroundColor: "rgba(225,29,72,0.2)"
    borderColor: "rgba(244,63,94,0.3)"
    textColor: "{colors.peligro-alerta}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  boton-peligro-confirmar:
    backgroundColor: "#e11d48"
    textColor: "{colors.texto-maximo}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  campo:
    backgroundColor: "{colors.carbon-control}"
    textColor: "{colors.texto-cuerpo}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    typography: "{typography.body}"
  campo-foco:
    backgroundColor: "{colors.carbon-control}"
    textColor: "{colors.texto-cuerpo}"
    borderColor: "{colors.turquesa-foco}"
    ringColor: "{colors.turquesa-foco}"
    ringWidth: "1px"
  tarjeta:
    backgroundColor: "{colors.carbon-superficie}"
    textColor: "{colors.texto-cuerpo}"
    rounded: "{rounded.tarjeta}"
    padding: "24px"
  modal:
    backgroundColor: "{colors.carbon-superficie}"
    textColor: "{colors.texto-cuerpo}"
    rounded: "{rounded.modal}"
  badge:
    textColor: "{colors.turquesa-foco}"
    rounded: "{rounded.pildora}"
    padding: "2px 8px"
    typography: "{typography.label}"
  nav-item-activo:
    backgroundColor: "{colors.carbon-control}"
    textColor: "{colors.texto-maximo}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
---

# Design System: PandaStoreOS

## Overview

**Creative North Star: "La Consola de Vuelo"**

Esto no es una app que se mira: es un tablero que se opera. Una sola persona,
sentada frente a una laptop, cobrando con el cliente esperando. Todo lo que
importa tiene que estar visible sin desplazarse y sin pensar. Por eso el chasís
es oscuro y mate, la información va apretada, y hay exactamente **una** luz en
el tablero: el turquesa. Cuando algo brilla en turquesa, o es plata o es la
próxima acción. Nada más tiene derecho a ese color.

La profundidad no se finge con sombras. Se construye con capas de Carbón que se
van aclarando: el fondo (#09090b) está más lejos, la superficie (#18181b) es
donde vive el contenido, el control (#27272a) es lo que se toca. Una sombra en
este sistema significa una sola cosa — *esto flota por encima de todo lo demás* —
y por eso aparece en modales y en el toast, no en tarjetas en reposo. Cuatro
pantallas enteras (Dashboard, Catálogo y las dos de Objeciones) no tienen ni una
sola sombra y se leen perfectamente. Esa es la prueba.

Los controles son **sólidos y confiados**: cada acción acá mueve plata o
inventario, así que un botón tiene que verse pulsable y un estado tiene que ser
inequívoco. El sistema grita en mayúsculas pequeñas — la etiqueta canónica es de
10px, negrita y en caja alta — porque la densidad manda sobre el respiro. Y
existe un segundo mundo, deliberado: la factura y la etiqueta de envío se
imprimen en **Papel** blanco con tinta negra. Es lo único de este sistema que
el cliente llega a tocar, y por eso no comparte nada con la consola.

**Key Characteristics:**

- Un solo acento. El turquesa se gana su lugar por escasez.
- Plano por doctrina. La sombra marca flotación, no jerarquía.
- Denso por oficio. 10px en caja alta antes que aire vacío.
- Semántica estable: turquesa actúa, esmeralda confirma, rosa destruye, ámbar advierte.
- Dos mundos: la consola oscura para el operador, el papel blanco para el cliente.

## Colors

Cuatro familias y nada más. El Carbón construye el 80% de la pantalla; el
Turquesa es la única voz de marca; esmeralda, rosa y ámbar solo hablan cuando
hay algo semántico que decir.

### Primary

- **Turquesa Eléctrico** (`#22d3ee`): la cifra y el dato que importa. Precio en el
  POS, total de la venta, utilidad bruta en Reportes, íconos de encabezado de
  sección. Es el color al que el ojo va primero en cualquier pantalla (97 usos).
- **Turquesa Acción** (`#0e7490`): el relleno del botón primario, y solo eso.
  FACTURAR, Guardar, Nuevo Cliente, Registrar Orden. Sobre él, texto blanco da
  **5.36:1** — pasa AA. El valor anterior (`#0891b2`) daba 3.68:1 y no llegaba:
  el botón más importante de la app era el que no cumplía.
- **Turquesa Acción Hover** (`#155e75`): el hover del primario, que **oscurece**
  (700 → 800) y da **7.27:1**. Aclarar al 600 daba 3.68:1 y no pasaba AA; ver la
  corrección en la Regla del Relleno Oscuro.
- **Turquesa Foco** (`#06b6d4`): el anillo de foco de todo campo.

El turquesa también aparece teñido al 10% (`bg-cyan-500/10`, 19 usos) como
superficie de badge informativo y de ícono contenido.

### Secondary

- **Confirmación** (`#10b981`): el texto dentro de un badge de éxito — CLOSED, IN
  STOCK, entrada de kardex, "0% interés".
- **Confirmación Alerta** (`#34d399`): el mismo verde un escalón más claro, para
  texto suelto y el ícono del toast de éxito. **No son intercambiables**: el 500
  vive dentro de un badge teñido, el 400 vive sobre el fondo.

### Tertiary

- **Peligro** (`#f43f5e`) y **Peligro Alerta** (`#fb7185`): misma regla que el
  verde. El 500 es texto de badge (Bajo Stock, salida de kardex); el 400 es
  alerta suelta e ícono.
- **Advertencia** (`#f59e0b`): tránsito, pendiente, parcial. El de menor uso.

### Neutral

- **Carbón Fondo** (`#09090b`): el fondo de la app. También es la capa *hundida*
  dentro de una tarjeta — este sistema no usa `shadow-inner`, mete un bloque de
  Carbón Fondo y logra lo mismo.
- **Carbón Superficie** (`#18181b`): tarjeta, panel, modal, barra lateral. La
  variante al 50% (`bg-zinc-900/50`) es la tarjeta más suave del Dashboard.
- **Carbón Control** (`#27272a`): el token más usado del proyecto (192 veces).
  Relleno de *todo* lo que se toca: campo, select, botón secundario, chip, tab.
  También es el fondo del ítem de navegación activo.
- **Carbón Borde** (`#3f3f46`): el borde del control. Acompaña a Carbón Control
  en 178 apariciones de `border border-zinc-700`.
- **Carbón Borde Hover** (`#52525b`): el borde de toda superficie clickeable que
  no es botón — tarjeta de producto, chip de categoría, tab — al pasar el mouse.

Texto, de más a menos voz: **Texto Máximo** (`#ffffff`) para títulos y texto sobre
color · **Texto Cuerpo** (`#e4e4e7`) por defecto · **Texto Control** (`#d4d4d8`)
para la etiqueta del botón secundario · **Texto Secundario** (`#a1a1aa`) para
**las etiquetas de campo**, los placeholders y los controles terciarios en reposo
· **Texto Terciario** (`#71717a`) solo para lo genuinamente accesorio: unidades
sueltas y metadatos que se pueden no leer.

> La etiqueta de campo usaba Texto Terciario y daba **3.67:1** sobre la
> superficie — por debajo del piso AA de 4.5:1, y era el texto de menor
> contraste de la pantalla. Pero el nombre de un campo no es información
> accesoria: dice qué se está por escribir. Pasa a Texto Secundario, que da
> **6.91:1**. Los placeholders estaban peor (**3.08:1**, el peor ratio del
> proyecto) y suben igual, a **5.81:1**.

### El mundo impreso

**Papel** (`#ffffff`) y **Tinta** (`#000000`) con **Azul Documento** (`#1a6ba0`)
gobiernan la factura A4 y la etiqueta de envío. Esta paleta **no comparte nada**
con la consola, y no debe hacerlo: son objetos que se imprimen y se entregan.

**El mundo Papel tiene su propia escala tipográfica, y no es la de la consola.**
Son lienzos de tamaño fijo — la factura mide `794×1123px` (A4 a 96 dpi) y la
etiqueta `384×576px` — donde el píxel equivale a un punto de impresión, así que
la escala en `rem` de la interfaz no aplica. La rampa real, medida sobre lo que
ya se imprime:

- **Titular de documento** (30px / 800): "Factura" o "Cotización" en Azul
  Documento; en la etiqueta, 30px / 900 con interletraje negativo.
- **Destinatario** (24px / 900): el nombre grande de la etiqueta de envío.
- **Cuerpo de documento** (11px / 600): datos de cliente, filas de la tabla.
- **Micro de documento** (9px y 8px): pies, condiciones, referencias.

Los pesos 800 y 900 **solo existen acá**. No están en el `@import` de Inter, así
que el navegador los sintetiza: se tolera en un documento que se rasteriza a PDF
una vez, y no se debe llevar a la interfaz.

### Named Rules

**La Regla de la Luz Única.** El turquesa es el único color de marca. Si algo
está en turquesa es porque es dinero o porque es la acción a tomar. Un segundo
acento decorativo rompe el tablero.

**La Regla del Relleno Oscuro.** Sobre un relleno de color con texto blanco, el
tono base va en el escalón **700** y el hover **oscurece al 800**. Medido:
`cyan-700` 5.28:1 → `cyan-800` 7.22:1; `emerald-700` 5.36:1 → `emerald-800`
7.6:1. Los dos estados pasan AA. `rose-600` es la excepción: da **4.53:1** y se
queda donde está, pero su hover **también oscurece** — `rose-500` da 3.75:1 y
reprueba.

> **Nota de medición (2026-09-20).** Los ratios de este documento estaban
> calculados sobre los hex de **Tailwind v3**. El proyecto compila **Tailwind
> v4**, que define su paleta en **OKLCH** (`--color-rose-600: oklch(58.6%
> 0.253 17.585)`, verificado en el CSS que se embarca). Los números bajan un
> par de centésimas en todos lados, y en un caso eso importa: el margen de
> `rose-600` no era 0.20 sino **0.03**. Cualquier ratio nuevo se mide contra
> los valores OKLCH de `node_modules/tailwindcss/theme.css`, no contra una
> tabla de hex de v3.

> **Corrección (2026-09-20).** La primera versión de esta regla decía que el
> hover **aclara** al 600, "nunca oscurece". Era una inferencia del patrón
> incumbente (600→500) y quedó **en contradicción con el propio piso AA** apenas
> la base subió a 700: el hover al 600 da **3.68:1**, el mismo número que esta
> regla declaraba reprobado dos líneas más arriba. O sea que el botón más
> importante de la app caía bajo AA justo mientras el mouse estaba encima.
> Se corrige la regla, no el número: sobre relleno oscuro con texto blanco, el
> hover **oscurece**.

**La Regla del Foco Declarado.** Todo control interactivo declara su foco. No
existe el dialecto "ninguno": un botón sin `focus:` hereda el anillo del
navegador sobre una superficie casi negra, que es impredecible. Para campos,
`focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500`; para botones,
`focus:ring-2` del color de su acción.

**La Regla del Tinte sin Borde.** El badge canónico es tinte al 10% + texto al
500, *sin* borde (56 casos contra 24). El borde `/20` se agrega solo cuando el
badge necesita despegarse de un fondo ya teñido.

**La Regla de los Dos Escalones.** Destruir tiene dos pasos y dos colores: el
disparador es rosa teñido (`bg-rose-600/20` + borde + texto rosa), y solo el
diálogo de confirmación usa rosa sólido. Nunca un borrado directo en sólido.

## Typography

**Fuente única:** Inter (con `ui-sans-serif, system-ui, sans-serif` de respaldo),
cargada en los pesos 300/400/500/600/700.

**Carácter:** funcional y apretada. La jerarquía no la da el tamaño — casi todo
vive entre 10px y 14px — la da el **peso y la caja**. `font-bold` aparece 286
veces contra 95 de `font-medium`: el sistema es afirmativo por defecto.

### Hierarchy

- **Display / Título de página** (700, 20px, `tracking-tight`, mayúsculas, *itálica*):
  la firma visual del proyecto. Mayúsculas + interletraje negativo + cursiva.
- **Title / Título de panel y modal** (700, 20px, sin cursiva): encabezado de
  tarjeta o diálogo. Convive con el anterior sin una regla que los separe.
- **Body** (400, 14px): cuerpo base, valor de campo, celda de tabla.
- **Micro** (400, 12px): ayuda, metadato de tarjeta, chip.
- **Label** (700, 10px, `0.05em`, mayúsculas): **la etiqueta del sistema**. 136
  apariciones en 13 archivos. Es el ladrillo tipográfico más reconocible de la
  interfaz — cuando la escala de Tailwind no alcanzó para densificar, se bajó
  a 10px arbitrarios antes que agrandar el formulario.
  **Ojo:** 22 de esas apariciones viven **dentro de los lienzos de papel**
  (13 en la factura, 9 en la etiqueta), y 10px no está en la rampa del papel.
  Es la mezcla de los dos mundos filtrándose por el lado que nadie audita: el
  detector no la ve porque valida contra una sola rampa.
- **Dato** (monoespaciada, 700, 14px): KPIs, tabla de Reportes, delta del kardex.

### Named Rules

**La Regla de la Caja Alta.** Si es una etiqueta y no contenido, va en
mayúsculas de 10px, negrita. Es lo que separa "qué es este campo" de "qué dice
este campo", sin gastar un pixel de más.

**La Regla del Dinero Alineado.** Toda columna de cifras se alinea a la derecha
y usa `tabular-nums`. *El sistema la cumple a medias*: `tabular-nums` aparece
**14 veces**, de las cuales 3 son teléfonos de la etiqueta de envío y el resto
es dinero — el POS entero ya la cumple (carrito, totales, vuelto) y la factura
también.

Lo que falta está identificado y es chico: las cuatro pantallas donde el
operador **compara** cifras en vez de cobrar una sola — el Total del Historial
(la cifra más grande de cada fila, y además alineada a la derecha recién desde
`md:`), la columna Precio de Inventario, la columna Total del Dashboard y los
montos de Clientes. En un POS, las columnas de C$ que no alinean son un error de
lectura esperando ocurrir.

> Ojo con el mecanismo: Reportes consigue el mismo efecto con `font-mono`, que
> **cambia la familia**. `tabular-nums` conserva Inter. Elegir uno de los dos y
> no mezclarlos.

## Layout

El shell es fijo y sin contenedor máximo: barra lateral de **256px** (`w-64`)
que pasa de `fixed` a `static` en 768px, header de escritorio de **64px**
(`h-16`), y un `<main>` con scroll propio.

El **único gutter responsive del proyecto** es el padding de ese main:
`py-6 px-4 sm:px-6 md:px-8`. Todo lo demás es fijo.

Los breakpoints se reparten por función, no por tamaño: `md:` (47 usos) es el
del shell y el de los formularios en dos columnas; `sm:` (60) es sobre todo el
de los modales heredados y el de las cabeceras `flex-col sm:flex-row`; `lg:` (29)
es el del POS de dos paneles y los KPI en cuatro columnas. `xl:` aparece **una
sola vez** en todo el proyecto y `2xl:` no existe.

El molde dominante de formulario es `grid-cols-1 md:grid-cols-2 gap-6`: una
columna en móvil, dos desde 768px.

El ritmo es la escala de 4px de Tailwind — `gap-2` (124 usos), `px-4` (129),
`py-2` (84) — pero conviven medios pasos (`.5`, `1.5`, `2.5`) y sobras (`p-5`,
`p-10`, `p-20`). Es un ritmo reconocible, no una escala cerrada.

**Densidad de tabla: no está unificada.** Conviven seis densidades de celda
(`px-4 py-2`, `px-4 py-3`, `px-6 py-4`, entre otras) según la página. Es la
inconsistencia estructural más visible del sistema.

**El apilamiento está desordenado.** Hay 36 declaraciones vivas de `z-index` en
**diez** niveles: `z-0` · `z-10` · `z-30` · `z-40` · `z-50` · `z-[60]` · `z-[80]` ·
`z-[100]`–`z-[102]` · `z-[200]`. Los shells de modal usan **cuatro** valores
distintos. Se documenta como está; no hay una escala nombrada que respetar
todavía.

Lo único que sí es regla: **los avisos (`z-[200]`) van siempre por encima de
todo modal**, porque son el único canal de los errores que bloquean el cobro.

> Un empate de `z-index` no es neutral: desempata el orden del DOM. El telón
> del menú móvil (`Layout.tsx`) y la barra "Ver Carrito" del POS compartían
> `z-40`, los dos `fixed` en el contexto raíz, y la barra — montada después,
> dentro de `<main>` — se pintaba **encima** del velo. La barra bajó a `z-30`.
> Nota de CSS que vale para todo el proyecto: `<main>` es `position: relative`
> con `z-index: auto`, o sea que **no crea contexto de apilamiento**, y ningún
> ancestro suyo tiene `transform`, `filter` ni `will-change`. Por eso los
> modales `fixed` de las páginas suben limpio hasta la raíz.

**Lienzos de impresión.** La factura es un A4 literal de `794×1123px` con
`40px` de margen; la etiqueta es de `384×576px`. Son los únicos tamaños fijos
grandes del sistema y no responden a breakpoints.

## Elevation & Depth

**Este sistema es plano por doctrina.** No hay `hover:shadow-*` en ningún lado, no
hay `shadow-inner`, y cuatro archivos completos no declaran una sola sombra.

La profundidad se construye con tres recursos, en este orden:

1. **Capas tonales.** Carbón Fondo → Carbón Superficie → Carbón Control. Es el
   mecanismo principal.
2. **Bordes de dos niveles.** `border-zinc-800` separa la tarjeta de la página
   (50 usos); `border-zinc-700` separa el control dentro de la tarjeta (178).
3. **Hundido por color.** Un bloque de Carbón Fondo dentro de una tarjeta hace
   el trabajo que en otros sistemas haría una sombra interior.

### Shadow Vocabulary

- **Flotante** (`shadow-2xl`): lo único que está por encima de la interfaz —
  modales, el panel del carrito, el toast, el desplegable del autocompletado y
  la barra fija del POS en móvil. Todos ellos tapan contenido de verdad.
- **Afirmación** (`shadow-lg`, en el botón primario): peso sobre el botón de
  acción, a veces teñido de turquesa (`shadow-lg shadow-cyan-900/20`).
  **Es la única excepción viva a la doctrina plana y está pendiente de
  decisión**: un botón no flota, así que estrictamente la regla lo alcanza.
  Se deja anotado en vez de cambiarlo de callada, porque toca el control más
  visible de la aplicación.
- **Papel** (`shadow-xl`): **sólo los documentos imprimibles.**

> **Decisión (2026-09-20).** Esta lista bendecía `shadow-xl` / `shadow-sm` en
> "los paneles de Reportes y Configuración", que es exactamente lo que la Regla
> del Reposo Plano de abajo prohíbe. Dos secciones vecinas mandaban cosas
> opuestas y quien maquetaba un panel nuevo podía cumplir cualquiera de las dos
> creyendo que cumplía el sistema. **Gana la doctrina plana**: se quitaron 18
> sombras en reposo — los 7 paneles de Reportes, los 3 de Configuración, el de
> Financiamiento, el del Catálogo Maestro y sus dos pestañas, el ítem de
> navegación activo, la tarjeta de producto del POS, la tarjeta de cliente y la
> fila del Historial. Ninguna de esas superficies flota sobre nada.

### Named Rules

**La Regla del Reposo Plano.** Las superficies son planas cuando no pasa nada.
Una sombra significa flotación sobre el resto de la interfaz, nunca jerarquía ni
respuesta al hover. Si querés que algo destaque en reposo, subí su capa tonal o
su borde — no le pongas sombra.

## Shapes

Seis radios en uso real, cada uno con su trabajo:

- **Chip** (4px, `rounded`): checkbox, chip pequeño. 74 usos.
- **Segmento** (6px, `rounded-md`): controles segmentados y tabs. 18 usos.
- **Control** (8px, `rounded-lg`): **el radio por defecto**. Botón, campo, select.
  191 usos — domina el sistema.
- **Tarjeta** (12px, `rounded-xl`): panel y tarjeta de página. 74 usos.
- **Modal** (16px, `rounded-2xl`): diálogos y los paneles grandes de Reportes y
  Configuración. 21 usos.
- **Píldora** (`rounded-full`): badges de estado y avatares. 35 usos.

El borde es fino y universal: 1px, siempre presente, nunca grueso. Es lo que
sostiene la planitud — sin sombra, el borde es lo único que define dónde termina
una superficie.

### Named Rules

**La Regla del Radio por Rol.** El radio dice qué tipo de cosa es: 8px se toca,
12px contiene, 16px flota, full es un estado. Elegir un radio por gusto rompe la
señal.

## Components

No existe ninguna librería de componentes. No hay `src/components/ui/`, ni
`Button.tsx`, ni `Modal.tsx`: cada control está escrito a mano en su JSX. Lo
notable es que, aun así, **el color es consistente y la geometría no**.

### Buttons

- **Primario** — **Turquesa Acción** (`#0e7490`, `bg-cyan-700`) de fondo, texto
  blanco, negrita, radio Control. El hover **oscurece** a Turquesa Acción Hover
  (`#155e75`, `bg-cyan-800`). 22 botones lo cumplen y ninguno usa ya el
  `#0891b2` de relleno. El color y el peso no varían nunca; el padding sí
  (cinco combinaciones distintas en uso) y la sombra es opcional en tres formas.
- **Secundario** — Carbón Control de fondo, Texto Control de etiqueta, hover a
  Carbón Borde con texto blanco.
- **Confirmar** — esmeralda sólido. Cierra la venta, finaliza la recepción,
  guarda la configuración.
- **Peligro** — dos escalones: disparador teñido (`bg-rose-600/20` + borde
  `rose-500/30` + texto `rose-400`), y rosa sólido solo en el diálogo.
- **Terciario / icono** — sin fondo, Texto Secundario en reposo, y al hover toma
  el color de su acción: blanco para neutro, turquesa para editar, rosa para
  borrar.
- **Deshabilitado** — `opacity: 0.5` en 35 casos. Es el único tratamiento.

### Inputs / Fields

Receta única en 117 apariciones: Carbón Control de fondo, Carbón Borde de 1px,
radio Control.

**El foco sigue siendo el punto más frágil del sistema, pero ya no es un
desierto.** Hay **cinco dialectos** conviviendo, todos hacia el mismo turquesa,
ninguno unificado. La receta recomendada — `focus:border-cyan-500 focus:ring-1
focus:ring-cyan-500` con anillo — **ya es mayoría en campos**. `focus-visible`
no existe en ninguna parte del proyecto.

El agujero real no está en los campos: está en los **botones**, y está muy
concentrado. `POS.tsx`, `ShippingLabelPreview.tsx` y `Toast.tsx` declaran foco
en el 100% de los suyos; `SalesHistory.tsx` (17 botones), `Purchases.tsx` (15),
`Customers.tsx` (9) y las dos pantallas de Objeciones casi no declaran ninguno.
Son, además, las pantallas de las acciones irreversibles.

> Las cifras de esta sección se habían quedado viejas y **daban vuelta el
> diagnóstico**: decían que el dialecto dominante era el campo sin anillo
> (ya no lo es) y que los botones con foco eran 5 de 135 (son más, y el hueco
> está concentrado en cuatro archivos, no repartido). Un documento que mide mal
> manda a trabajar sobre el problema equivocado. Las métricas absolutas de aquí
> en más se leen como una foto con fecha, no como una constante.

### Cards / Containers

Carbón Superficie + borde Carbón 800 + radio Tarjeta. La variante translúcida
(`/50`) es la tarjeta del Dashboard. El padding va de 16px a 32px según la
página.

### Badges

Tinte al 10% del color semántico + texto al 500, radio Píldora, tipografía
Label. El borde al 20% es opcional y minoritario.

### Navigation

Ítem de barra lateral: en reposo, Texto Secundario sobre nada. Activo: fondo
Carbón Control, etiqueta blanca e **ícono en Turquesa Foco** — el ícono es lo que
marca el estado, no solo el fondo.

### Toast

Carbón Superficie al 95% + `backdrop-blur` + borde del color semántico al 40% +
`shadow-2xl` + radio Tarjeta. Tres variantes: esmeralda, rosa y turquesa.

> **Nota:** existe un **segundo** sistema de notificación en Configuración — una
> barra fija de relleno sólido (`bg-emerald-600` / `bg-rose-600` / `bg-cyan-600`).
> Hace el mismo trabajo que el Toast con otro lenguaje. Es deuda, no patrón.

## Do's and Don'ts

### Do:

- **Do** usar el turquesa solo para dinero y para la próxima acción. Su escasez
  es lo que lo hace funcionar.
- **Do** construir profundidad con capas tonales y bordes, no con sombras.
- **Do** usar la etiqueta de 10px en caja alta y negrita para todo rótulo de
  campo. Es la firma del sistema.
- **Do** oscurecer en el hover de todo relleno de color con texto blanco
  (700 → 800). Aclarar al 600 devuelve el botón primario a **3.68:1**, que es el
  número que este mismo documento declara reprobado en la Regla del Relleno
  Oscuro. Esta línea decía lo contrario hasta el 2026-09-20 y era la
  contradicción más cara del documento: los Do's son la única sección escrita
  en imperativo, o sea la que más se obedece, y mandaba reintroducir a mano la
  falla de AA que el sistema acababa de arreglar en 22 botones.
- **Do** dar dos escalones a toda acción destructiva: teñido primero, sólido solo
  al confirmar.
- **Do** alinear a la derecha y usar `tabular-nums` en cualquier columna de
  cifras nueva. El sistema todavía no lo hace; empezá a cumplirlo.
- **Do** declarar un anillo de foco visible en cada control nuevo. Ya hay cinco
  dialectos: elegí `focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500` y no
  inventes un sexto.

### Don't:

- **Don't** agregar un segundo color de marca. Esmeralda, rosa y ámbar son
  semántica, no paleta.
- **Don't** poner sombra a una tarjeta en reposo, ni elevarla al hover.
- **Don't** mezclar la paleta del documento impreso (Papel, Tinta, Azul
  Documento) con la de la consola. Son dos mundos y deben seguir siéndolo.
- **Don't** usar `outline-none` sin dar un foco visible en su lugar.
- **Don't** usar `animate-in`, `fade-in`, `zoom-in-95` ni `slide-in-from-bottom-5`:
  el plugin `tailwindcss-animate` **no está instalado** y esas clases no generan
  CSS. Las únicas animaciones reales son `animate-spin` y `animate-pulse`.
- **Don't** usar `font-black` (900) ni `font-extrabold` (800) en la interfaz: no
  están en el `@import` de Inter y el navegador los sintetiza. Hoy solo aparecen
  en los documentos imprimibles.
- **Don't** parecerse a un SaaS genérico de dashboard (gradientes pastel,
  ilustraciones, tarjetas flotando con mucho aire), a un POS viejo de ferretería
  (gris de sistema, bordes gruesos en cada celda, botones 3D), ni a una terminal
  retro (verde fósforo, monoespaciada en todo). Los tres están descartados
  explícitamente.
- **Don't** tocar el wordmark `pandastore`: minúscula, `panda` en blanco, `store`
  con el gradiente `#22d3ee → #0a85a8`. Es el único gradiente permitido del
  sistema y es identidad, no decoración.
