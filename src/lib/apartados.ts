import { formatCurrencyNIO, telefonoWhatsApp } from './utils';
import { METODO_PAGO } from './etiquetas';

/*
  Apartados: cuánto se pactó, cuánto pagó el cliente y cuánto le falta.

  Un apartado es plata de un cliente que todavía no compró nada: dejó una prima,
  se le guardó el producto, y la venta recién existe cuando termina de pagar y se
  lo lleva. Mientras tanto, la única verdad del negocio es esta cuenta. Y el
  operador está solo: si el saldo que le dice al cliente en el mostrador no es el
  que después imprime la factura, no hay a quién preguntarle cuál está bien.

  Vive acá, sin Firestore y sin React, por la misma razón que costoPromedio.ts:
  decide plata, así que tiene que poder correrse y probarse sola
  (`npm run apartados:test`), no comprobarse leyendo una transacción.

  TRES DECISIONES QUE SOSTIENEN TODO LO DEMÁS:

  1. La aritmética se hace en CENTAVOS ENTEROS. Sumar abonos en punto flotante
     da cosas como 0.1 + 0.2 = 0.30000000000000004, y un saldo de
     0.00000000000004 no es cero: el apartado nunca quedaría "pagado" y el botón
     de entregar no aparecería nunca. En centavos, cero es cero.

  2. Se redondea COMO EL PAPEL. La factura y el comprobante imprimen con
     `formatCurrencyNIO`, que redondea con `Intl`, y el `round2` de
     validations.ts no siempre da lo mismo. Caso medido, nada exótico: 3
     unidades de US$50 a 36.6243 dan 5493.6449999999995 en punto flotante; el
     papel imprime C$5,493.64 y `round2` da 5493.65. Con `round2` el apartado
     le cobraría al cliente un centavo que la factura final no dice. En un
     barrido de 85.674 totales aparecieron 3 casos así: raros, pero reales.
     Redondeando con el mismo motor que imprime, el número guardado ES el
     impreso, por construcción.

  3. Un abono NUNCA se edita ni se borra. Si se cargó mal, se le agrega una
     anulación (otra lista que sólo crece) y el abono queda en el papel,
     tachado. El cliente puede tener en el teléfono un comprobante con ese
     abono: la copia nueva tiene que explicar la vieja, no contradecirla en
     silencio. Las reglas de Firestore lo hacen cumplir con un chequeo de
     prefijo, igual de inmutable que el kardex.
*/

/**
 * Formas de pago de un abono. Son las del POS menos FINANCIAMIENTO: las cuotas
 * Banpro las paga el banco de una vez al momento de la venta, y un apartado
 * todavía no es una venta. Una tarjeta de crédito en UN pago sí sirve (CREDITO).
 */
export const METODOS_ABONO = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CREDITO'] as const;
export type MetodoAbono = (typeof METODOS_ABONO)[number];

/** Lo que esta cuenta necesita de un abono. `AbonoApartado` (types.ts) lo cumple. */
export interface AbonoCuenta {
  id: string;
  montoNio: number;
  metodo: string;
  fecha: number;
  referencia?: string;
}

/** Lo que esta cuenta necesita de un apartado. `Apartado` (types.ts) lo cumple. */
export interface CuentaApartado {
  totalNio: number;
  abonos: AbonoCuenta[];
  /** Abonos anulados por error de digitación: siguen en `abonos`, pero no son plata. */
  anulaciones?: { abonoId: string }[];
}

/** Lo que NO se pudo reservar al apartar porque no había stock: un ENCARGO. */
export interface LineaEncargo {
  productId: string;
  cantidad: number;
}

/**
 * De dónde salió una unidad encargada que pasó a estar reservada:
 * - `compra`: llegó en una caja de una orden de compra; la recepción la asigna sola.
 * - `stock`: apareció stock por otro camino (una devolución, un ajuste, otro
 *   apartado cancelado) y se reservó con "Reservar ahora".
 * - `reversion`: se revirtió la recepción de la caja que la había traído y
 *   vuelve a estar por llegar. Cantidad NEGATIVA: deshace sin borrar.
 */
export type OrigenLlegada = 'compra' | 'stock' | 'reversion';

export interface LlegadaEncargo {
  productId: string;
  /** > 0 para `compra` y `stock`; < 0 para `reversion`. */
  cantidad: number;
  fecha: number;
  origen: OrigenLlegada;
  /**
   * USD por unidad: el costo promedio del producto cuando la unidad pasó a
   * estar reservada; el de una reversión es el de lo que deshace. Con él se
   * factura al entregar y vuelve al stock si se cancela (ver costoDeLinea).
   */
  costoUnitario?: number;
  /** La orden y la caja que la trajeron (o la que se revirtió). */
  compraId?: string;
  trackingId?: string;
}

/** Lo que las cuentas de encargos necesitan de un apartado. `Apartado` (types.ts) lo cumple. */
export interface ConEncargo {
  encargo?: LineaEncargo[];
  llegadas?: LlegadaEncargo[];
}

export type EstadoApartado = 'activo' | 'entregado' | 'cancelado';
/**
 * El estado que se MUESTRA. `listo`, `vencido` y `esperando` no se guardan: no
 * hay un servidor que los cambie a medianoche (plan Spark, sin Cloud
 * Functions), así que se derivan cada vez que se pinta la pantalla.
 */
export type EstadoVisible = EstadoApartado | 'listo' | 'vencido' | 'esperando';

// ---------------------------------------------------------------------------
// Redondeo y centavos
// ---------------------------------------------------------------------------

const DOS_DECIMALES = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});

/**
 * Redondea a centavos exactamente como lo imprime `formatCurrencyNIO`. Ver el
 * punto 2 del encabezado. El `+ 0` convierte un `-0` en `0`: `Intl` le pone
 * signo al cero negativo y el papel diría "-C$0.00".
 */
export const redondearCordobas = (n: number): number =>
  Number.isFinite(n) ? Number(DOS_DECIMALES.format(n)) + 0 : 0;

const centavos = (n: number): number => Math.round(redondearCordobas(n) * 100);

/** Formato de dinero de los mensajes: el mismo del resto del sistema. */
const cordobas = (n: number): string => formatCurrencyNIO(n);

// ---------------------------------------------------------------------------
// La cuenta
// ---------------------------------------------------------------------------

/**
 * Total en córdobas de un apartado, con la MISMA secuencia de operaciones que
 * el TOTAL de `InvoicePreview`: cada línea pasa a córdobas (`price × tasa`), se
 * multiplica por la cantidad, se suman, y al final se suma el envío y se resta
 * el descuento. En punto flotante el orden importa; repetirlo es lo que hace
 * que el total guardado y el impreso den el mismo double antes de redondear.
 */
export const totalNioDe = (
  items: { price: number; quantity: number }[],
  tasa: number,
  envioNio = 0,
  descuentoNio = 0,
): number =>
  redondearCordobas(items.reduce((acc, i) => acc + (i.price * tasa) * i.quantity, 0) + envioNio - descuentoNio);

/** Ids de los abonos anulados. */
export const idsAnulados = (ap: { anulaciones?: { abonoId: string }[] }): Set<string> =>
  new Set((ap.anulaciones || []).map((x) => x.abonoId));

/** Los abonos que cuentan. Uno anulado fue un error de digitación: no es plata. */
export const abonosVigentes = <T extends AbonoCuenta>(ap: { abonos: T[]; anulaciones?: { abonoId: string }[] }): T[] => {
  const anulados = idsAnulados(ap);
  return (ap.abonos || []).filter((a) => !anulados.has(a.id));
};

const abonadoCentavos = (ap: CuentaApartado): number =>
  abonosVigentes(ap).reduce((c, a) => c + centavos(a.montoNio), 0);

/** Cuánto pagó el cliente, sin los abonos anulados. */
export const abonadoNio = (ap: CuentaApartado): number => abonadoCentavos(ap) / 100;

/**
 * Cuánto le falta pagar. Negativo sólo si los datos están corruptos (abonos por
 * encima del total), porque `validarAbono` no deja registrar de más; la pantalla
 * igual no lo esconde, para que el problema se vea.
 */
export const saldoNio = (ap: CuentaApartado): number =>
  (centavos(ap.totalNio) - abonadoCentavos(ap)) / 100;

/** Pagado del todo: se puede entregar y facturar. */
export const estaPagado = (ap: CuentaApartado): boolean =>
  centavos(ap.totalNio) - abonadoCentavos(ap) <= 0;

/** Porcentaje pagado, de 0 a 100, para la barra de progreso. */
export const progresoPct = (ap: CuentaApartado): number => {
  const total = centavos(ap.totalNio);
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (abonadoCentavos(ap) / total) * 100));
};

/** Fecha del último abono vigente. En un apartado pagado, es desde cuándo la tienda le debe el producto. */
export const ultimoAbonoEn = (ap: CuentaApartado): number | null => {
  const v = abonosVigentes(ap);
  return v.length ? Math.max(...v.map((a) => a.fecha)) : null;
};

// ---------------------------------------------------------------------------
// Validaciones (devuelven el mensaje para el operador, o null si está bien)
// ---------------------------------------------------------------------------

/**
 * La prima mínima en córdobas, redondeada HACIA ARRIBA al centavo: el redondeo
 * nunca va en contra de la tienda (PRODUCT.md, principio 3). El `- 1e-9` evita
 * que un producto exacto que el punto flotante deja en 30000.000000000004 suba
 * un centavo de más.
 *
 * Los atajos de porcentaje del diálogo (20%, 30%, 50%) salen de acá también:
 * si redondearan al centavo más cercano, con un total de C$1,000.01 y mínimo
 * de 20% el atajo "20%" daría 200.00 y chocaría con su propio mínimo, 200.01.
 */
export const primaMinimaNio = (totalNio: number, primaMinimaPct: number): number => {
  if (!(primaMinimaPct > 0)) return 0;
  return Math.ceil((centavos(totalNio) * Math.min(100, primaMinimaPct)) / 100 - 1e-9) / 100;
};

export const validarPrima = (
  prima: number,
  totalNio: number,
  primaMinimaPct = 0,
): string | null => {
  if (!Number.isFinite(prima) || centavos(prima) <= 0) {
    return 'La prima tiene que ser mayor que cero: es lo que reserva el producto.';
  }
  if (centavos(prima) > centavos(totalNio)) {
    return `La prima no puede pasar del total del apartado (${cordobas(totalNio)}).`;
  }
  const minimo = primaMinimaNio(totalNio, primaMinimaPct);
  if (centavos(prima) < centavos(minimo)) {
    return `La prima mínima es el ${primaMinimaPct}% del total: ${cordobas(minimo)}. ` +
      `Se cambia en Configuración → Apartados.`;
  }
  return null;
};

/**
 * Un abono no puede pasar del saldo. El mensaje pregunta PRIMERO si se tipeó
 * bien: el error más probable no es que el cliente haya dado de más, es un
 * cero de más. Si de verdad dio de más, se registra el saldo y se da vuelto —
 * registrar el monto entero dejaría un saldo negativo y una factura final que
 * no cuadra con lo cobrado.
 */
export const validarAbono = (monto: number, saldo: number): string | null => {
  if (!Number.isFinite(monto) || centavos(monto) <= 0) {
    return 'El abono tiene que ser mayor que cero.';
  }
  if (centavos(saldo) <= 0) {
    return 'Este apartado ya está pagado: no queda saldo que abonar.';
  }
  if (centavos(monto) > centavos(saldo)) {
    return `¿Lo tipeaste bien? El abono (${cordobas(monto)}) pasa del saldo, que es ${cordobas(saldo)}. ` +
      `Si de verdad te dio de más, registrá ${cordobas(saldo)} y dale el vuelto.`;
  }
  return null;
};

/** Al cancelar se devuelve entre nada y todo lo abonado (decisión del dueño: se decide en cada caso). */
export const validarDevolucion = (devuelto: number, abonado: number): string | null => {
  if (!Number.isFinite(devuelto) || centavos(devuelto) < 0) {
    return 'La devolución no puede ser negativa. Si no se le devuelve nada, poné 0.';
  }
  if (centavos(devuelto) > centavos(abonado)) {
    return `No se puede devolver más de lo que abonó (${cordobas(abonado)}).`;
  }
  return null;
};

/**
 * El teléfono es el canal de cobro durante semanas: tiene que servir para
 * WhatsApp. Se valida con la MISMA normalización que arma el link (8 dígitos
 * locales, o un número internacional), así que lo que pasa acá es lo que
 * después abre el chat.
 */
export const validarTelefono = (telefono: string): string | null =>
  telefonoWhatsApp(telefono)
    ? null
    : 'El teléfono tiene que tener 8 dígitos (o el número internacional completo): ' +
      'es por donde se le recuerda el saldo.';

// ---------------------------------------------------------------------------
// Encargos: lo que se apartó sin estar en la tienda
// ---------------------------------------------------------------------------

/*
  Un ENCARGO es un apartado con unidades que la tienda todavía no tiene: vienen
  en una orden de compra o son un pedido especial del cliente. Se cobra igual
  (prima, abonos, comprobante), pero esas unidades no se reservan al apartar
  porque no hay qué reservar. Lo que se hacía antes —subir el stock a mano para
  que el POS dejara apartar— era un stock fantasma: el POS lo podía vender, la
  tablet lo mostraba disponible y el conteo físico no lo encontraba.

  Dos listas en el apartado, y todo lo demás se deriva de ellas:

  - `encargo`: lo que NO se reservó al apartar, por producto. Se escribe al
    crear y no cambia nunca, como las líneas.
  - `llegadas`: cada vez que una parte pasó a estar reservada (llegó en una
    caja, o apareció stock por otro lado) o volvió a estar por llegar (se
    revirtió la recepción). Sólo crece, como los abonos y por la misma razón: el
    historial explica el estado en vez de contradecirlo.

  Lo pendiente es encargo − llegadas, y NO se guarda: un tercer número al lado
  de las dos listas es un dato que puede quedar desfasado de ellas.
*/

const sumaPorProducto = (lista?: { productId: string; cantidad: number }[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const x of lista || []) m.set(x.productId, (m.get(x.productId) || 0) + x.cantidad);
  return m;
};

/** Lo que falta que llegue, por producto. Sólo los productos que todavía esperan algo. */
export const pendientesDe = (ap: ConEncargo): Map<string, number> => {
  const llegado = sumaPorProducto(ap.llegadas);
  const faltan = new Map<string, number>();
  sumaPorProducto(ap.encargo).forEach((encargado, productId) => {
    const falta = encargado - (llegado.get(productId) || 0);
    if (falta > 0) faltan.set(productId, falta);
  });
  return faltan;
};

/** Le falta mercadería: no se puede entregar y su plazo de pago todavía no corre. */
export const tienePendientes = (ap: ConEncargo): boolean => pendientesDe(ap).size > 0;

const porFechaEId = (a: { id: string; fecha: number }, b: { id: string; fecha: number }): number =>
  a.fecha - b.fecha || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Reparte las unidades que llegaron entre los apartados que las esperan, del
 * más viejo al más nuevo. Es la fila del mostrador: el que encargó primero
 * recibe primero, y el reparto no depende del orden en que la pantalla tenía
 * cargada la lista (el desempate por id es sólo para que sea determinista).
 * Devuelve sólo los que reciben algo; lo que sobra queda a la venta.
 */
export const asignarLlegadas = (
  candidatos: { id: string; fecha: number; pendiente: number }[],
  unidades: number,
): { id: string; cantidad: number }[] => {
  let quedan = Number.isFinite(unidades) ? Math.max(0, Math.floor(unidades)) : 0;
  // Copia: ordenar en el lugar le desordenaría la lista a quien la pasó.
  const vistos = new Set<string>();
  const fila: { id: string; fecha: number; pendiente: number }[] = [];
  for (const c of candidatos) {
    if (vistos.has(c.id)) continue; // el mismo apartado dos veces no cobra dos veces
    vistos.add(c.id);
    fila.push(c);
  }
  fila.sort(porFechaEId);
  const reparto: { id: string; cantidad: number }[] = [];
  for (const c of fila) {
    if (quedan <= 0) break;
    const espera = Number.isFinite(c.pendiente) ? Math.floor(c.pendiente) : 0;
    if (espera <= 0) continue;
    const cantidad = Math.min(espera, quedan);
    reparto.push({ id: c.id, cantidad });
    quedan -= cantidad;
  }
  return reparto;
};

/**
 * El costo unitario (USD) de las unidades reservadas de un producto: las que
 * salieron del stock al apartar, al costo congelado en la línea, y las que
 * llegaron después, cada una al costo con que pasó a estar reservada.
 *
 * Es el costo con que se FACTURA al entregar —el margen de Reportes sale de la
 * línea de la venta— y con el que las unidades vuelven al stock si se cancela.
 * Con el costo congelado al apartar, un encargo apartado cuando el producto
 * costaba $80 que llegó en una caja de $95 declararía $15 de margen que no
 * existe.
 *
 * Se calcula como desvío sobre el costo de la línea (c0 + Σ q·(c − c0) / N) y
 * no como cociente de valores: con un desvío de cero el resultado es c0 EXACTO.
 * Así un apartado común, o uno cuya caja se revirtió, se factura con el mismo
 * número de siempre y no con uno que difiere en el decimal 17.
 *
 * No se redondea a centavos, igual que el costo promedio de costoPromedio.ts
 * del que sale: es un costo, no un cobro, y redondearlo haría que el margen no
 * cuadre con el valor del inventario.
 */
export const costoDeLinea = (
  costoAlCrear: number,
  reservadasAlCrear: number,
  llegadas: { cantidad: number; costoUnitario?: number }[],
): number => {
  let unidades = Math.max(0, reservadasAlCrear);
  let desvio = 0;
  for (const l of llegadas) {
    const costo = typeof l.costoUnitario === 'number' && Number.isFinite(l.costoUnitario) ? l.costoUnitario : costoAlCrear;
    unidades += l.cantidad;
    desvio += l.cantidad * (costo - costoAlCrear);
  }
  if (unidades <= 0 || desvio === 0) return costoAlCrear;
  const costo = costoAlCrear + desvio / unidades;
  return Number.isFinite(costo) && costo >= 0 ? costo : costoAlCrear;
};

/** Lo que un apartado tiene de un producto, separado por de dónde salió. */
export interface ParteDeProducto {
  productId: string;
  /** Unidades del producto en el apartado, sumando todas sus líneas. */
  total: number;
  /** Encargadas al apartar: no había stock. */
  encargadas: number;
  /** Llegadas netas: compras y stock, menos reversiones. */
  llegadas: number;
  /** Encargadas que todavía no llegaron. NO están en la tienda. */
  pendiente: number;
  /** En la tienda con el nombre del cliente (cuentan en `Product.apartadas`). */
  reservadas: number;
  /** Costo de la línea al apartar (USD). */
  costoAlCrear?: number;
  /** Costo unitario de las reservadas: ver costoDeLinea. */
  costo?: number;
}

/**
 * Cada producto del apartado partido en reservado y pendiente. Es lo que
 * necesitan cancelar (lo reservado vuelve al stock a su costo; lo pendiente sólo
 * baja `encargadas`), entregar (el costo de la factura) y el valor de
 * inventario (lo pendiente no está en la tienda).
 */
export const partesDeApartado = (
  ap: ConEncargo & { items: { id: string; quantity: number; cost?: number }[] },
): Map<string, ParteDeProducto> => {
  const total = new Map<string, number>();
  // El costo de la PRIMERA línea que lo tenga, como `cantidadesPorProducto` del
  // hook: dos líneas del mismo producto salen del mismo catálogo en el mismo
  // momento.
  const costoAlCrear = new Map<string, number>();
  for (const i of ap.items || []) {
    total.set(i.id, (total.get(i.id) || 0) + i.quantity);
    if (!costoAlCrear.has(i.id) && typeof i.cost === 'number' && Number.isFinite(i.cost)) costoAlCrear.set(i.id, i.cost);
  }
  const encargo = sumaPorProducto(ap.encargo);
  const llegadasDe = new Map<string, LlegadaEncargo[]>();
  for (const l of ap.llegadas || []) llegadasDe.set(l.productId, [...(llegadasDe.get(l.productId) || []), l]);

  const partes = new Map<string, ParteDeProducto>();
  total.forEach((t, productId) => {
    const encargadas = Math.min(t, Math.max(0, encargo.get(productId) || 0));
    const suyas = llegadasDe.get(productId) || [];
    const llegadas = suyas.reduce((s, l) => s + l.cantidad, 0);
    const pendiente = Math.max(0, encargadas - llegadas);
    const c0 = costoAlCrear.get(productId);
    partes.set(productId, {
      productId,
      total: t,
      encargadas,
      llegadas,
      pendiente,
      reservadas: t - pendiente,
      costoAlCrear: c0,
      costo: c0 === undefined ? undefined : costoDeLinea(c0, t - encargadas, suyas),
    });
  });
  return partes;
};

/**
 * Lo que una caja le dejó a un apartado, por producto, neto de reversiones
 * anteriores (una caja se puede recibir, revertir y volver a recibir). Es
 * exactamente lo que hay que deshacer si se revierte esa recepción.
 *
 * Con el costo y no sólo la cantidad: la reversión tiene que salir al MISMO
 * costo con que entró, para que el costo de la línea vuelva a ser el de antes
 * de que llegara la caja. Si todas las llegadas tienen el mismo costo se
 * devuelve ése tal cual, sin pasar por un cociente que lo corra un decimal.
 */
export const llegadasDeCaja = (
  ap: ConEncargo,
  compraId: string,
  trackingId: string,
): Map<string, { cantidad: number; costoUnitario?: number }> => {
  const suma = new Map<string, { cantidad: number; valor: number; costos: Set<number>; sinCosto: boolean }>();
  for (const l of ap.llegadas || []) {
    if (l.compraId !== compraId || l.trackingId !== trackingId) continue;
    const prev = suma.get(l.productId) ?? { cantidad: 0, valor: 0, costos: new Set<number>(), sinCosto: false };
    const tieneCosto = typeof l.costoUnitario === 'number' && Number.isFinite(l.costoUnitario);
    if (tieneCosto) prev.costos.add(l.costoUnitario as number);
    suma.set(l.productId, {
      cantidad: prev.cantidad + l.cantidad,
      valor: prev.valor + (tieneCosto ? l.cantidad * (l.costoUnitario as number) : 0),
      costos: prev.costos,
      sinCosto: prev.sinCosto || !tieneCosto,
    });
  }
  const netas = new Map<string, { cantidad: number; costoUnitario?: number }>();
  suma.forEach((v, productId) => {
    if (v.cantidad <= 0) return;
    // Sin costo en alguna, la reversión tampoco lo lleva: así costoDeLinea las
    // valúa igual (al costo de la línea) y se anulan entre sí.
    if (v.sinCosto) netas.set(productId, { cantidad: v.cantidad });
    else if (v.costos.size === 1) netas.set(productId, { cantidad: v.cantidad, costoUnitario: [...v.costos][0] });
    else netas.set(productId, { cantidad: v.cantidad, costoUnitario: Math.max(0, v.valor / v.cantidad) });
  });
  return netas;
};

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

const DIA = 86_400_000;

const inicioDelDia = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * La fecha límite se guarda como el FINAL del día local. Un apartado que vence
 * "el 25" tiene que seguir activo toda la tarde del 25: guardarlo a medianoche
 * lo daba por vencido justo el día que el cliente venía a pagar.
 */
export const fechaLimiteDesde = (fecha: number, dias: number): number => {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

/** `yyyy-MM-dd` (lo que da un `<input type="date">`) → final de ese día local. */
export const finDelDia = (yyyyMMdd: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((yyyyMMdd || '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
};

/** Milisegundos → `yyyy-MM-dd` local, para precargar un `<input type="date">`. */
export const aFechaInput = (ms: number): string => {
  const d = new Date(ms);
  const dd = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
};

/**
 * Días calendario hasta la fecha límite: 0 = vence hoy, 1 = mañana, negativo =
 * vencido hace N días. Se cuenta entre medianoches y se redondea para que una
 * hora de diferencia en el reloj no cambie el día.
 */
export const diasRestantes = (fechaLimite: number, ahora: number): number =>
  Math.round((inicioDelDia(fechaLimite) - inicioDelDia(ahora)) / DIA);

/**
 * `listo` gana sobre `vencido`: si el cliente ya pagó todo, la tienda le debe
 * el producto, y mostrarlo como "vencido" invitaría a liberarlo. Por eso un
 * `listo` nunca vence y necesita su propia alarma (días desde `ultimoAbonoEn`).
 *
 * Y `esperando` gana sobre los dos: mientras falte mercadería, el apartado no
 * se puede entregar aunque esté pagado, y no vence porque el plazo de pago
 * corre desde que llega (decisión del dueño, 2026-10-27). La `fechaLimite` que
 * tiene guardada mientras espera es provisoria y no se muestra.
 */
export const estadoVisible = (
  ap: CuentaApartado & ConEncargo & { status: EstadoApartado; fechaLimite: number },
  ahora: number,
): EstadoVisible => {
  if (ap.status !== 'activo') return ap.status;
  if (tienePendientes(ap)) return 'esperando';
  if (estaPagado(ap)) return 'listo';
  if (ahora > ap.fechaLimite) return 'vencido';
  return 'activo';
};

// ---------------------------------------------------------------------------
// Para la factura final
// ---------------------------------------------------------------------------

/**
 * La forma de pago que lleva la factura al entregar: la que más plata movió.
 * Una venta guarda UN solo método; el desglose va en la nota de la factura
 * (`resumenPagos`) y abono por abono en el comprobante. Empate: la más reciente.
 */
export const metodoPredominante = (ap: CuentaApartado): MetodoAbono => {
  const suma = new Map<string, { c: number; ultimo: number }>();
  for (const a of abonosVigentes(ap)) {
    const prev = suma.get(a.metodo) ?? { c: 0, ultimo: 0 };
    suma.set(a.metodo, { c: prev.c + centavos(a.montoNio), ultimo: Math.max(prev.ultimo, a.fecha) });
  }
  let elegido: MetodoAbono = 'EFECTIVO';
  let mejor = { c: -1, ultimo: -1 };
  suma.forEach((v, metodo) => {
    if (!(METODOS_ABONO as readonly string[]).includes(metodo)) return;
    if (v.c > mejor.c || (v.c === mejor.c && v.ultimo > mejor.ultimo)) {
      elegido = metodo as MetodoAbono;
      mejor = v;
    }
  });
  return elegido;
};

/**
 * El desglose de cómo se pagó, para la NOTA de la factura que se emite al
 * entregar. El recibo oficial imprime UNA forma de pago y PRODUCT.md pide no
 * tocar sus campos; la nota sí se imprime, y es donde queda constancia de que
 * hubo una transferencia con su referencia bancaria — el dato que sirve para
 * reclamar. Agrupa por método para que el largo no dependa de cuántos abonos
 * hubo: la caja de la nota es chica y no se pagina.
 */
export const resumenPagos = (ap: CuentaApartado & { numero: string }): string => {
  const vigentes = abonosVigentes(ap);
  const porMetodo = new Map<string, { c: number; refs: string[] }>();
  for (const a of vigentes) {
    const prev = porMetodo.get(a.metodo) ?? { c: 0, refs: [] };
    const ref = (a.referencia || '').trim();
    porMetodo.set(a.metodo, {
      c: prev.c + centavos(a.montoNio),
      refs: ref && !prev.refs.includes(ref) ? [...prev.refs, ref] : prev.refs,
    });
  }
  const partes = Array.from(porMetodo.entries())
    .sort((x, y) => y[1].c - x[1].c)
    .map(([metodo, v]) =>
      `${METODO_PAGO[metodo] || metodo} ${cordobas(v.c / 100)}` +
      (v.refs.length ? ` (ref. ${v.refs.join(', ')})` : ''));
  const n = vigentes.length;
  return `Apartado ${ap.numero}, pagado en ${n} ${n === 1 ? 'abono' : 'abonos'}: ${partes.join(' · ')}`;
};

// ---------------------------------------------------------------------------
// Numeración y agregados para las pantallas
// ---------------------------------------------------------------------------

/** `AP-000001`. Serie propia, contador `counters/apartados`. */
export const numeroApartado = (n: number): string => `AP-${String(n).padStart(6, '0')}`;

/**
 * Qué apartados activos reservan un producto, para decirlo con número y
 * nombre donde se cuenta o se borra inventario.
 */
export const apartadosConProducto = <T extends { status: string; numero: string; customerName: string; items: { id: string; quantity: number }[] }>(
  apartados: T[],
  productId: string,
): { apartado: T; unidades: number }[] =>
  apartados
    .filter((ap) => ap.status === 'activo')
    .map((ap) => ({
      apartado: ap,
      // Sólo lo que está en la tienda: lo encargado que no llegó no se cuenta
      // en el estante (es lo que lee el conteo físico del Inventario).
      unidades:
        (ap.items || []).filter((i) => i.id === productId).reduce((s, i) => s + i.quantity, 0) -
        (pendientesDe(ap as ConEncargo).get(productId) || 0),
    }))
    .filter((x) => x.unidades > 0);

/**
 * Lo que pasó por caja en un rango: lo que entró en abonos vigentes y lo que se
 * devolvió al cancelar (con la fecha de la cancelación). Se devuelven por
 * separado y neto: un día con una devolución de C$1,000 no puede mostrar
 * C$1,000 más de lo que hay en el cajón.
 */
export const cajaEntre = (
  apartados: (CuentaApartado & { canceladoEn?: number; devueltoNio?: number })[],
  desde: number,
  hasta: number,
): { recibidoNio: number; devueltoNio: number; netoNio: number; abonos: number } => {
  let recibido = 0;
  let devuelto = 0;
  let abonos = 0;
  for (const ap of apartados) {
    for (const a of abonosVigentes(ap)) {
      if (a.fecha >= desde && a.fecha <= hasta) {
        recibido += centavos(a.montoNio);
        abonos++;
      }
    }
    if (typeof ap.canceladoEn === 'number' && ap.canceladoEn >= desde && ap.canceladoEn <= hasta) {
      devuelto += centavos(ap.devueltoNio || 0);
    }
  }
  return { recibidoNio: recibido / 100, devueltoNio: devuelto / 100, netoNio: (recibido - devuelto) / 100, abonos };
};

// ---------------------------------------------------------------------------
// Configuración (doc `config/apartados`)
// ---------------------------------------------------------------------------

export interface ConfigApartados {
  /** Prima mínima, en % del total. 0 = sin mínimo (decisión del dueño, 2026-10-26). */
  primaMinimaPct: number;
  /** Días que se guarda el producto. Define la fecha límite que se propone. */
  plazoDias: number;
  actualizadoEn?: number;
}

export const CONFIG_APARTADOS_DEFAULT: ConfigApartados = { primaMinimaPct: 0, plazoDias: 30 };

/** Lo que venga de Firestore, saneado. Un valor absurdo cae al default en vez de inventar una regla. */
export const normalizarConfigApartados = (raw: unknown): ConfigApartados => {
  const d = CONFIG_APARTADOS_DEFAULT;
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  const pct = Number(o.primaMinimaPct);
  const dias = Number(o.plazoDias);
  const out: ConfigApartados = {
    primaMinimaPct: Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : d.primaMinimaPct,
    plazoDias: Number.isInteger(dias) && dias >= 1 && dias <= 365 ? dias : d.plazoDias,
  };
  if (typeof o.actualizadoEn === 'number') out.actualizadoEn = o.actualizadoEn;
  return out;
};
