---
target: src/pages/POS.tsx
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\carlo.DESKTOP-0BRP765\\Documents\\PandaFactoryPOS-main\\src\\pages\\POS.tsx"
target_fingerprint: "sha256:aae18df7c6e4d29d6b54f2cb44e97859da2e1542a8d7488b75d0f9204eec1f5a"
target_path: "C:\\Users\\carlo.DESKTOP-0BRP765\\Documents\\PandaFactoryPOS-main\\src\\pages\\POS.tsx"
timestamp: 2026-09-20T20-32-36Z
slug: src-pages-pos-tsx
---
**Method: dual-agent.** Segunda corrida, mismo rubro. Sin degradacion.

## Design Health Score: 23/40 (sin cambio contra la corrida 1)

| # | Heuristica | Antes | Ahora | Hallazgo |
|---|---|:-:|:-:|---|
| 1 | Visibilidad | 2 | 3 | Camino feliz OK; Layout dice "Resumen Principal del Sistema" sobre el POS |
| 2 | Mundo real | 3 | 3 | Dos campos casi homonimos; "Verifique/intente" rompe el voseo |
| 3 | Control/libertad | 2 | 3 | Barra de recuperacion; "Vaciar" destruye en 1 clic sin confirmar |
| 4 | Consistencia | 2 | 2 | POS: focus:border 10x, anillo 0x. Inventory: receta canonica 16x |
| 5 | Prevencion | 2 | 2 | FACTURAR y Proforma comparten icono; metodo de pago reescribe precios |
| 6 | Reconocimiento | 3 | 3 | Precio editable sin afordancia; linea sin total |
| 7 | Flexibilidad | 2 | 2 | Sin atajo para FACTURAR; 12 clics para 12 unidades |
| 8 | Minimalista | 2 | 2 | Cierre manda; cuerpo = 11 controles de peso identico |
| 9 | Recuperacion errores | 3 | 2 | El error tiraba el diagnostico y aconsejaba mal (ARREGLADO en esta sesion) |
| 10 | Ayuda | 2 | 1 | Tres `title` en hover y un pie en italica |

El total no se movio: subieron 3 heuristicas y bajaron 2. La 9 y la 10 bajaron porque los evaluadores miraron mas profundo, no porque se rompio algo.

## Confirmado arreglado

Bloque de cierre fijo = fortaleza #1 ("la unica parte del proyecto que cumple la Regla del Dinero Alineado"). Toast con correlativo, etiqueta pospuesta y titulo que se da vuelta: pico-final bien resuelto. Detector: 0 warnings, sus 25 hallazgos son falsos positivos cubiertos por DESIGN.md.

## BUG INTRODUCIDO Y ARREGLADO EN ESTA SESION

La persistencia del carrito se borraba a si misma en el montaje que la ofrecia: los dos efectos corren en el mismo commit, el segundo con cart=[] hacia removeItem. Arreglado con guarda de montaje + guarda de borrador pendiente, y sacando la condicion cart.length===0 que escondia la oferta.

## TAMBIEN ARREGLADO

El error de facturacion descartaba el diagnostico de db.ts y recordSale para decir siempre "verifique el stock" — consejo equivocado para 4 de 5 causas. Ahora muestra el mensaje real.

## Prioritarios pendientes

### [P1] El boton irreversible y el total nunca estan juntos en pantalla
"Confirmar Venta" arriba del modal; TOTAL al pie de un A4 de 1123px. Arreglo: franja de resumen en la barra del modal (Cliente / Metodo / TOTAL). Comando: /impeccable layout

### [P1] Al cliente se le muestra la consola, no el documento
Al girar la laptop lee "Revisa la cotizacion / Confirmar Venta / Editar Datos" sobre bg-zinc-950. Es el objetivo declarado del usuario, fallando. Arreglo: modo presentacion (pantalla completa, sin cromatica de consola, A4 escalado al viewport, ESC para salir). Comando: /impeccable shape

### [P2] Cambiar el metodo de pago reescribe precios negociados en silencio
removeCashDiscount no invierte el descuento: restaura el precio de catalogo y borra la negociacion manual. Sin aviso. Comando: /impeccable harden

### [P2] Teclado y lectores
0 htmlFor en 9 labels; FACTURAR sin anillo de foco; autocompletado de clientes es <div onClick> sin teclado. Comando: /impeccable audit

## Contraste

67 combinaciones, 3 fallan, las tres text-zinc-500: tasa de cambio 3.38:1 (POS:1034), carrito vacio 3.67:1 (689), "Cargando POS" 4.12:1 (467). La tasa es el dato de verificacion y es el texto de menor contraste del bloque de cierre.

## Menores

Badge de stock en cyan donde DESIGN.md asigna emerald a "disponible"; "Monto Bruto" por Subtotal; carrito sin total de linea; sin h1/h2 propios; salto de encabezado h1->h3 bajo 768px; sin calculo de vuelto con EFECTIVO por defecto.
