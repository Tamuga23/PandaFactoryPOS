/*
  El costo promedio ponderado (WAC) y, sobre todo, cómo deshacerlo.

  Vive acá y no adentro de la transacción porque es el número que decide el
  precio de venta: alimenta el valor de inventario del Dashboard y el margen de
  Reportes. Una cuenta así tiene que poder correrse sola y probarse sola
  (`npm run costo:test`), no comprobarse leyendo una transacción de 200 líneas.

  El defecto que originó este archivo: revertir una recepción devolvía el stock
  y dejaba el costo inflado. Como la reversión además reabre el tracking, volver
  a recibir la caja promediaba OTRA VEZ contra ese costo inflado. Cada ciclo
  revertir → re-recibir empujaba el costo hacia el de la última caja y no volvía
  nunca: 5 unidades a $10 más una caja de 10 a $16 daban $14, después $15.33,
  después $15.78, sin que entrara un centavo más de mercadería.
*/

/** Lo que una caja le hizo al costo de un producto. Se guarda al recibirla. */
export interface EfectoCaja {
  /** Unidades de este producto que trajo la caja. */
  unidades: number;
  /** Costo unitario real: costo de la línea + su parte de flete, aduana y seguro. */
  costoUnitarioReal?: number;
  /** Costo promedio ANTES de aplicar la caja. */
  costoPrevio?: number;
  /** Costo promedio DESPUÉS de aplicarla. */
  costoDespues?: number;
  /** Stock DESPUÉS de aplicarla. */
  stockDespues?: number;
  /** Cuántas líneas de la caja tocan este producto. Más de una invalida los promedios intermedios. */
  lineas?: number;
}

export interface ReversionCosto {
  /** El costo que hay que escribir, o `null` si no hay que tocarlo. */
  costo: number | null;
  /**
   * `exacto`   — se restauró el costo previo y es el número correcto.
   * `inversa`  — se le restó a la bolsa el valor que puso la caja.
   * `previo`   — la inversa no cerraba; se volvió al costo previo.
   * `ninguno`  — no hay datos suficientes; el costo queda como está.
   */
  via: 'exacto' | 'inversa' | 'previo' | 'ninguno';
}

/** El promedio ponderado al entrar mercadería. Es la fórmula de toda la vida. */
export const costoAlRecibir = (
  stockPrevio: number,
  costoPrevio: number,
  unidades: number,
  costoUnitarioReal: number,
): number => {
  const nuevoStock = stockPrevio + unidades;
  if (nuevoStock <= 0) return costoUnitarioReal;
  return (stockPrevio * costoPrevio + unidades * costoUnitarioReal) / nuevoStock;
};

/**
 * Deshacer el promedio al revertir una recepción. Dos caminos.
 *
 * CAMINO EXACTO: si el costo que tiene hoy el producto es todavía el que dejó
 * esta caja, y el stock no subió por encima del que ella dejó, entonces nadie
 * metió mercadería desde entonces. Vender y ajustar stock a mano no mueven el
 * promedio —sólo sacan unidades a ese precio—, así que el costo anterior es
 * literalmente el que se guardó. Es el caso normal: una recepción se revierte
 * porque se marcó la caja equivocada, y eso se descubre a los minutos.
 *
 * CAMINO ALGEBRAICO: si el costo cambió, se le resta a la bolsa de valor lo que
 * puso esta caja:
 *
 *     costoAnterior = (stock × costo − unidades × costoUnitarioReal)
 *                     / (stock − unidades)
 *
 * Exacto mientras no hayan salido unidades en el medio. Si salieron, queda por
 * debajo del real, porque esas ventas ya se llevaron valor al promedio mezclado.
 * Se aplica igual: estar cerca es muchísimo mejor que quedarse con el costo
 * inflado, que es lo que pasaba antes. El caller avisa que es aproximado.
 *
 * QUEDA UN CASO QUE NINGUNO DE LOS DOS RESUELVE: que entre otra caja al MISMO
 * costo promedio y que después se venda lo suficiente como para que el stock
 * baje por debajo del que dejó ésta. Ahí las dos señales del camino exacto
 * vuelven a dar verde y el costo restaurado ignora la caja del medio. No se
 * puede distinguir sin un libro de costos —un `movimientos` que además del
 * stock registre el costo después de cada movimiento—, y eso es un cambio de
 * modelo. Está probado en `costoPromedio.test.mjs` que, cuando pasa, el número
 * que sale es el más cercano al real de los dos que sabemos calcular.
 */
export const costoAlRevertir = (
  stockActual: number,
  costoActual: number,
  efecto: EfectoCaja,
): ReversionCosto => {
  const nuevoStock = Math.max(0, stockActual - efecto.unidades);

  const exacto =
    (efecto.lineas ?? 1) === 1 &&
    typeof efecto.costoPrevio === 'number' &&
    typeof efecto.costoDespues === 'number' &&
    Math.abs(costoActual - efecto.costoDespues) < 1e-6 &&
    (typeof efecto.stockDespues !== 'number' || stockActual <= efecto.stockDespues);

  if (exacto) return { costo: efecto.costoPrevio as number, via: 'exacto' };

  if (typeof efecto.costoUnitarioReal === 'number' && nuevoStock > 0) {
    const porInversa =
      (stockActual * costoActual - efecto.unidades * efecto.costoUnitarioReal) / nuevoStock;
    if (Number.isFinite(porInversa) && porInversa >= 0) {
      return { costo: porInversa, via: 'inversa' };
    }
  }

  // La cuenta no cierra, pero igual sabemos cuánto valía antes. Volver a ese
  // número está más cerca de la verdad que quedarse con el costo inflado.
  if (typeof efecto.costoPrevio === 'number') {
    return { costo: efecto.costoPrevio, via: 'previo' };
  }

  // Caja recibida antes de que el sistema guardara nada de esto: no se inventa.
  return { costo: null, via: 'ninguno' };
};
