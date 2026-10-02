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
