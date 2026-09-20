---
target: src/pages/POS.tsx
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Users\\carlo.DESKTOP-0BRP765\\Documents\\PandaFactoryPOS-main\\src\\pages\\POS.tsx"
target_fingerprint: "sha256:005e791d3c81d832325702b6212ee2e460568c60e023b70bfdb2982d72fb114d"
target_path: "C:\\Users\\carlo.DESKTOP-0BRP765\\Documents\\PandaFactoryPOS-main\\src\\pages\\POS.tsx"
timestamp: 2026-09-20T15-48-57Z
slug: src-pages-pos-tsx
---
**Method: dual-agent** — A (revisión de diseño) y B (detector + evidencia) corrieron aisladas y en paralelo. Sin degradación.

## Design Health Score

| # | Heurística | Score | Hallazgo clave |
|---|-----------|:---:|---|
| 1 | Visibilidad del estado | 2 | La venta irreversible no confirma nada: 0 `toast.success` (7 error + 1 info) |
| 2 | Correspondencia mundo real | 3 | Voseo correcto; el mínimo de cuotas en US$ en pantalla de C$ |
| 3 | Control y libertad | 2 | Carrito solo en `useState`: F5 lo borra sin aviso |
| 4 | Consistencia y estándares | 2 | 9 campos con radio de chip (4px) donde DESIGN.md fija 8px |
| 5 | Prevención de errores | 2 | Reset post-venta no limpia selectedCustomerId ni paymentMethod |
| 6 | Reconocer antes que recordar | 3 | Autocompletado, stock primero, cuotas comparables |
| 7 | Flexibilidad y eficiencia | 2 | Enter agrega por SKU; sin atajo para la acción primaria ni Tab en catálogo |
| 8 | Estético y minimalista | 2 | TOTAL a 18px: los 4 elementos clave en un rango de 4px |
| 9 | Recuperación de errores | 3 | Mensajes que nombran el objeto; nacen a ~900px de su campo |
| 10 | Ayuda y documentación | 2 | Ayuda real pero dispersa, escrita como letra chica |
| **Total** | | **23/40** | **Aceptable** |

Modo Operate: las 10 aplican, ninguna n/a.

## Veredicto de especificidad

Traje de confección con dos piezas a medida cosidas en el forro. Solo el panel de plazos con recargo ponderado por categoría y el precio negociable NIO/USD son irrepetibles. El resto (grilla 2/3 + carrito 1/3, tarjeta de producto, pila de formulario) es chasís por defecto. El reparto de espacio está invertido: 67% para una grilla que se recorre dos veces por venta, 33% con scroll propio para todas las decisiones y el botón irreversible.

Detector: 9 hallazgos en POS.tsx, todos advisory (8x 11px, 1x 9px), exit 0. Los 9 reales; el detector se perdió la línea 699. Sobre el lenguaje compartido: 35 hallazgos, y los 3 de severidad warning son FALSOS POSITIVOS verificados (2 wordmark pandastore, 1 par de estados hover que no coexisten).

Overlays: ninguno. No hay herramienta de navegador en la sesión.

## Lo que funciona

1. El panel de plazos dice el sobreprecio en voz alta ("el cliente paga C$Y más") — casi ninguna interfaz de financiamiento lo hace.
2. Los errores nombran el objeto y dicen qué hacer, en voseo.
3. Enter agrega por SKU: compatible con lector de códigos sin agregar un control.

## Problemas prioritarios

### [P0] El plan de cuotas se calcula sobre un total que no es el total
planesVenta recibe solo `i.price * i.quantity` (POS.tsx:169-181), sin envío ni descuento. `total` (POS.tsx:108) sí los incluye. Con descuento C$500 a 3 meses, la pantalla dice "paga C$332 más" cuando paga C$832 más. Afirmación falsa sobre plata, dicha al cliente e impresa. Arreglo: prorratear envío y descuento antes de llamar a planesParaVenta; derivar el texto de planElegido.totalNio - total*rate. Comando: /impeccable harden

### [P1] El momento que el cliente ve es el menos profesional
'POR ASIGNAR' (POS.tsx:225) impreso en el A4, TOTAL fuera de pantalla, 0 toast.success al confirmar, y la etiqueta de envío montada detrás del preview (z-[60] vs z-[100]) que aparece de golpe al cerrar. Arreglo: no imprimir POR ASIGNAR nunca; toast.success con número y monto; título del modal a "Venta A-000123 registrada"; montar la etiqueta al cerrar. Comando: /impeccable clarify

### [P1] El botón primario del sistema no pasa contraste AA
text-white sobre bg-cyan-600 = 3.68:1 (FACTURAR, POS.tsx:787). Labels/placeholders zinc-500 = 3.08-3.67:1. Tarjetas sin stock con opacity-50 = 1.83-4.39:1. Es SISTÉMICO: bg-cyan-600 es turquesa-accion en 11 archivos; el label zinc-500 en 8. Nota: los tamaños que marca el detector (9px/11px) NO son los que fallan contraste — son conjuntos disjuntos. Arreglo en DESIGN.md, no en el POS. Comando: /impeccable audit

### [P1] El carrito no sobrevive a nada
Solo en useState. F5 o navegar a Catálogo Maestro destruye la venta en curso. El operador ES el administrador: salir a mitad de venta es parte del trabajo. Arreglo: localStorage + barra "Venta en curso recuperada". Comando: /impeccable harden

### [P2] La venta siguiente hereda el estado de la anterior
El reset (POS.tsx:332-340) no limpia selectedCustomerId, paymentMethod ni plazoMeses. La venta siguiente sin nombre se archiva en el historial del cliente anterior. Comando: /impeccable harden

## Banderas rojas por persona

- **Alex (experto)**: sin atajo para FACTURAR; tarjetas son div onClick (sin Tab); 11 clics para 12 unidades; sin venta en espera.
- **Sam (accesibilidad)**: 11/11 botones sin foco declarado (el repo tiene 27 en ProductCatalog, 24 en Inventory; el POS 1). 11/11 controles sin nombre accesible (0 htmlFor, 0 id); 5 sin ni placeholder, justo los que mueven plata. Color como único significado. Toasts sin aria-live.
- **Riley (bordes)**: SKU mal tecleado = grilla vacía en silencio. Venta financiada con descuento no cierra. F5 pierde todo. Producto sin stock responde con error pese a cursor-not-allowed.
- **Carlo (dueño-operador)**: negocia sin ver margen pese a tener cost en mano. paymentReference se captura y NO existe en InvoicePreview ni invoice.ts. Header dice "Resumen Principal del Sistema".
- **Yessica (clienta)**: lee "Cotización No # POR ASIGNAR". Cuota y total impreso no cierran. bankDetails se renderiza pero invoice.ts nunca lo llena.

## Observaciones menores

- Sin estado vacío de búsqueda.
- 9 campos rompen el radio del sistema (4px vs 8px).
- Inputs numéricos arrancan en 0.
- Mismo ícono FileText para Factura y Proforma.
- Modal dice "Vista Previa de Factura" en Cotizaciones.
- La tasa de cambio no se muestra nunca.
- tabular-nums ausente: los dígitos bailan en la caja de totales.
- HUECO EN DESIGN.md: se declaró el mundo "Papel" sin rampa tipográfica propia; por eso el detector marca 23 tamaños en InvoicePreview como fuera de sistema. Falta esa sección.
- taxRate = 0 con procedencia "to match screenshot logic".

## Preguntas

1. ¿Por qué el único artefacto que el cliente ve se genera con "POR ASIGNAR" y el total fuera de pantalla?
2. Las objeciones ya están en producción, escritas para el mostrador. ¿Por qué viven en dos rutas aparte y no en el carrito?
3. El POS conoce el costo y solo lo usa para pintar de rojo. ¿Qué cambia si muestra el margen en vivo?
4. ¿Qué se gana invirtiendo la proporción 67/33?
