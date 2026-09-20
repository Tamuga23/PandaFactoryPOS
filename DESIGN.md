---
name: PandaStoreOS
description: Consola oscura de punto de venta e importación, densa y plana, con un solo acento turquesa.
colors:
  turquesa-electrico: "#22d3ee"
  turquesa-accion: "#0891b2"
  turquesa-foco: "#06b6d4"
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
    backgroundColor: "{colors.turquesa-foco}"
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
    backgroundColor: "#059669"
    textColor: "{colors.texto-maximo}"
    rounded: "{rounded.control}"
    padding: "12px 24px"
  boton-peligro:
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
  sección. Es el color al que el ojo va primero en cualquier pantalla (72 usos).
- **Turquesa Acción** (`#0891b2`): el relleno del botón primario, y solo eso.
  FACTURAR, Guardar, Nuevo Cliente, Registrar Orden.
- **Turquesa Foco** (`#06b6d4`): dos trabajos — el hover del botón primario (que
  **aclara**, nunca oscurece) y el anillo de foco de todo campo.

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
labels y controles terciarios en reposo · **Texto Terciario** (`#71717a`) para
ayuda, SKU, fechas y estados vacíos.

### El mundo impreso

**Papel** (`#ffffff`) y **Tinta** (`#000000`) con **Azul Documento** (`#1a6ba0`)
gobiernan la factura A4 y la etiqueta de envío. Esta paleta **no comparte nada**
con la consola, y no debe hacerlo: son objetos que se imprimen y se entregan.

### Named Rules

**La Regla de la Luz Única.** El turquesa es el único color de marca. Si algo
está en turquesa es porque es dinero o porque es la acción a tomar. Un segundo
acento decorativo rompe el tablero.

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
- **Label** (700, 10px, `0.05em`, mayúsculas): **la etiqueta del sistema**. 74
  apariciones en 9 archivos. Es el ladrillo tipográfico más reconocible de la
  interfaz — cuando la escala de Tailwind no alcanzó para densificar, se bajó
  a 10px arbitrarios antes que agrandar el formulario.
- **Dato** (monoespaciada, 700, 14px): KPIs, tabla de Reportes, delta del kardex.

### Named Rules

**La Regla de la Caja Alta.** Si es una etiqueta y no contenido, va en
mayúsculas de 10px, negrita. Es lo que separa "qué es este campo" de "qué dice
este campo", sin gastar un pixel de más.

**La Regla del Dinero Alineado.** Toda columna de cifras se alinea a la derecha
y usa `tabular-nums`. *Hoy el sistema no cumple esta regla* — `tabular-nums`
aparece 3 veces en todo el repo y las tres son un número de teléfono. Queda
escrita como objetivo, no como descripción: en un POS, las columnas de C$ que no
alinean son un error de lectura esperando ocurrir.

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

**El apilamiento está desordenado.** Hay 34 usos de `z-index` en siete niveles,
con cuatro valores arbitrarios (`z-50`, `z-[60]`, `z-[80]`, `z-[100]`, `z-[101]`).
Los nueve shells de modal usan **cuatro** valores distintos. Se documenta como
está; no hay una escala nombrada que respetar todavía.

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

- **Flotante** (`shadow-2xl`, 16 usos): lo único que está por encima de la
  interfaz — modales, el panel del carrito, el toast.
- **Afirmación** (`shadow-lg`, 21 usos, 12 de ellos el botón primario): peso
  sobre el botón de acción, a veces teñido de turquesa
  (`shadow-lg shadow-cyan-900/20`).
- **Papel** (`shadow-xl` / `shadow-sm`): los documentos imprimibles y los paneles
  de Reportes y Configuración.

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

- **Primario** — `#0891b2` de fondo, texto blanco, negrita, radio Control. El
  hover **aclara** a `#06b6d4`. El color y el peso no varían nunca; el padding sí
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

**El foco es el punto más frágil del sistema.** Hay **cinco dialectos**
conviviendo, todos hacia el mismo turquesa, ninguno unificado. El más frecuente
(44 líneas) es `focus:border-cyan-500` **sin anillo**. Y `focus-visible` no
existe en ninguna parte: hay 131 `outline-none`, 74 de ellos incondicionales, y
de 135 `<button>` del proyecto **solo 5** declaran anillo de foco.

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
- **Do** aclarar en el hover del botón primario (600 → 500). Oscurecer va al
  revés del sistema.
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
