/*
  Los estados viven en Firestore en ingles, porque asi los escribio la primera
  version y cambiarlos ahora obligaria a migrar cada documento. Lo que NO tiene
  que pasar es que ese detalle interno se asome a la pantalla.

  Pasaba en tres lugares a la vez: Historial traducia con un diccionario propio,
  Clientes imprimia `completed` crudo y Compras imprimia `OPEN`. El mismo pedido
  se llamaba distinto segun donde lo mirabas.

  Un solo diccionario, aca. Si manana se agrega un estado, se agrega una vez.
*/

/** Estados de una venta (`Sale['status']`). */
export const ESTADO_VENTA: Record<string, string> = {
  completed: 'Completada',
  returned: 'Devuelta',
  cancelled: 'Cancelada',
};

/** Estados de una orden de compra (`Purchase['status']`). */
export const ESTADO_ORDEN: Record<string, string> = {
  OPEN: 'Abierta',
  PARTIAL: 'Parcial',
  CLOSED: 'Cerrada',
  CANCELLED: 'Cancelada',
};

/**
 * Traduce sin esconder: si aparece un estado que este archivo no conoce, se
 * muestra el valor crudo en vez de una celda vacia. Es feo a proposito — un
 * hueco silencioso es peor que un dato en ingles.
 */
export const etiquetaVenta = (estado?: string) =>
  ESTADO_VENTA[estado || 'completed'] || estado || 'Completada';

export const etiquetaOrden = (estado?: string) =>
  ESTADO_ORDEN[estado || 'OPEN'] || estado || 'Abierta';

/**
 * Estado VISIBLE de un apartado. `listo` y `vencido` no se guardan en
 * Firestore: los deriva `estadoVisible` (src/lib/apartados.ts) al pintar.
 */
export const ESTADO_APARTADO: Record<string, string> = {
  activo: 'Activo',
  listo: 'Listo para entregar',
  vencido: 'Vencido',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

export const etiquetaApartado = (estado?: string) =>
  ESTADO_APARTADO[estado || 'activo'] || estado || 'Activo';

/**
 * Formas de pago, como se dicen en la consola. Son los mismos rótulos del
 * selector del POS: CRÉDITO es tarjeta de crédito en UN pago, no fiado.
 *
 * El recibo oficial NO usa este diccionario —tiene el suyo en InvoicePreview y
 * PRODUCT.md pide no tocar sus campos mientras su estatus fiscal no esté
 * confirmado—; lo usan las pantallas y el comprobante de apartado.
 */
export const METODO_PAGO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  TARJETA: 'Tarjeta de débito',
  CREDITO: 'Tarjeta de crédito',
  FINANCIAMIENTO: 'Cuotas Banpro',
};

export const etiquetaMetodo = (metodo?: string) =>
  METODO_PAGO[metodo || ''] || metodo || '—';
