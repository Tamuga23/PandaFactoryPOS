// ---------------------------------------------------------------------------
// Cálculos del reporte de financiamiento. FUNCIONES PURAS, sin Firestore.
//
// Están separadas del script para poder probarlas con datos sintéticos: la
// plata que se decide con este reporte justifica tener los números testeados.
// Ver scripts/lib/analisisFinanciamiento.test.mjs
// ---------------------------------------------------------------------------

/**
 * Costo real de una venta financiada.
 *
 * El banco NO cobra un porcentaje sobre tu precio: se queda con un porcentaje
 * de lo que le cobra al cliente. Si cobrás 100 y el banco retiene 9%, recibís
 * 91 — perdiste 9. Para RECIBIR 100 hay que cobrar 100/(1-0.09) = 109.89.
 *
 * Por eso el precio con traspaso se calcula dividiendo, no multiplicando: un
 * recargo del 9% sobre 100 (=109) todavía te deja corto (109×0.91 = 99.19).
 */
export function costoBanco(montoCobrado, tasaPct) {
  return montoCobrado * (tasaPct / 100);
}

/** Cuánto hay que cobrar para NETEAR `objetivo` después de la retención. */
export function precioGrossUp(objetivo, tasaPct) {
  if (tasaPct >= 100) throw new Error('tasa >= 100% no tiene gross-up posible');
  return objetivo / (1 - tasaPct / 100);
}

/**
 * Precio traspasando solo una parte del costo al cliente.
 * `traspasoPct` 0 = lo absorbés todo (situación actual); 100 = gross-up completo.
 */
export function precioConTraspaso(base, tasaBancoPct, traspasoPct) {
  const completo = precioGrossUp(base, tasaBancoPct);
  return base + (completo - base) * (traspasoPct / 100);
}

/**
 * Agrega los renglones de venta por categoría.
 *
 * El método de pago vive en la VENTA, no en el renglón, así que se propaga a
 * cada línea. Una venta mixta (varias categorías con tarjeta) se atribuye
 * proporcionalmente, que es lo correcto: el banco retiene sobre el total.
 *
 * @param ventas  [{ paymentMethod, status, date, items: [{category, price, cost, quantity}] }]
 * @param opts    { umbralUsd } monto mínimo desde el que hoy se ofrecen cuotas
 */
export function agruparPorCategoria(ventas, { umbralUsd = 100 } = {}) {
  const cats = new Map();

  const dame = (nombre) => {
    const k = nombre || '(sin categoría)';
    if (!cats.has(k)) {
      cats.set(k, {
        categoria: k,
        unidades: 0,
        ingreso: 0,
        costo: 0,
        ingresoTarjeta: 0,
        costoTarjeta: 0,
        unidadesTarjeta: 0,
        ventasTarjeta: 0,
        ventasTarjetaSobreUmbral: 0,
        ingresoTarjetaSobreUmbral: 0,
        /**
         * Una entrada por venta con tarjeta que toca esta categoría:
         * `{ totalVenta, ingresoCategoria }`. El umbral de cuotas se evalúa
         * sobre el TOTAL de la venta, pero lo que se le atribuye a la categoría
         * es solo su parte. Guardar el detalle permite simular un piso nuevo
         * con exactitud en vez de estimarlo con el ticket promedio.
         */
        ventasTarjetaDetalle: [],
        /**
         * Ventas con plazo REGISTRADO (paymentMethod FINANCIAMIENTO). Acá no se
         * asume nada: el plazo y el recargo salen del doc de la venta.
         */
        exactas: { ventas: 0, ingreso: 0, porPlazo: {} },
        porMetodo: {},
      });
    }
    return cats.get(k);
  };

  for (const v of ventas) {
    if (v.status && v.status !== 'completed') continue;
    const items = Array.isArray(v.items) ? v.items : [];
    if (items.length === 0) continue;

    const metodo = v.paymentMethod || 'DESCONOCIDO';
    // `FINANCIAMIENTO` es el registro EXACTO: trae el plazo y el recargo que se
    // cobraron. `TARJETA` es el registro viejo y ambiguo (puede haber sido pago
    // único o cuotas); esas ventas se siguen estimando con la mezcla asumida.
    const plan = v.financiamiento && typeof v.financiamiento === 'object' ? v.financiamiento : null;
    const esFinanciadaExacta = metodo === 'FINANCIAMIENTO' && plan !== null;
    const esTarjeta = metodo === 'TARJETA' || esFinanciadaExacta;
    // El umbral se evalúa sobre el TOTAL de la venta: así se ofrecen las cuotas.
    const totalVenta = items.reduce((s, i) => s + num(i.price) * num(i.quantity), 0);
    const sobreUmbral = totalVenta >= umbralUsd;

    /** Cuánto aportó cada categoría a ESTA venta. */
    const aporteEnVenta = new Map();

    for (const it of items) {
      const c = dame(it.category);
      const cant = num(it.quantity);
      const ingreso = num(it.price) * cant;
      const costo = num(it.cost) * cant;

      c.unidades += cant;
      c.ingreso += ingreso;
      c.costo += costo;
      c.porMetodo[metodo] = (c.porMetodo[metodo] ?? 0) + ingreso;

      if (esTarjeta) {
        c.ingresoTarjeta += ingreso;
        c.costoTarjeta += costo;
        c.unidadesTarjeta += cant;
        if (sobreUmbral) c.ingresoTarjetaSobreUmbral += ingreso;
      }
      if (esFinanciadaExacta) {
        const m = String(plan.plazoMeses);
        c.exactas.ingreso += ingreso;
        c.exactas.porPlazo[m] = (c.exactas.porPlazo[m] ?? 0) + ingreso;
      }
      const nombre = it.category || '(sin categoría)';
      aporteEnVenta.set(nombre, (aporteEnVenta.get(nombre) ?? 0) + ingreso);
    }

    // Conteo de VENTAS (no de renglones) por categoría involucrada.
    if (esTarjeta) {
      for (const [nombre, ingresoCategoria] of aporteEnVenta) {
        const c = dame(nombre);
        c.ventasTarjeta += 1;
        if (sobreUmbral) c.ventasTarjetaSobreUmbral += 1;
        c.ventasTarjetaDetalle.push({ totalVenta, ingresoCategoria });
        if (esFinanciadaExacta) c.exactas.ventas += 1;
      }
    }
  }

  return [...cats.values()]
    .map((c) => ({
      ...c,
      margen: c.ingreso - c.costo,
      margenPct: c.ingreso > 0 ? ((c.ingreso - c.costo) / c.ingreso) * 100 : 0,
      margenTarjeta: c.ingresoTarjeta - c.costoTarjeta,
      participacionTarjetaPct: c.ingreso > 0 ? (c.ingresoTarjeta / c.ingreso) * 100 : 0,
      ticketPromedioTarjeta: c.ventasTarjeta > 0 ? c.ingresoTarjeta / c.ventasTarjeta : 0,
    }))
    .sort((a, b) => b.ingreso - a.ingreso);
}

/**
 * Costo del financiamiento para una categoría, bajo un supuesto de mezcla de
 * plazos. La mezcla es un SUPUESTO porque hoy el POS guarda `paymentMethod:
 * 'TARJETA'` sin el plazo: no se puede saber si fue 3 o 6 meses, ni siquiera si
 * fue financiada o un swipe normal. Ver la advertencia del reporte.
 *
 * @param mezcla { tres: 0..1, seis: 0..1 } — el resto se asume swipe sin cuotas (costo 0).
 */
export function costoFinanciamiento(cat, { costoBanco: tasas, mezcla, soloSobreUmbral = true }) {
  const base = soloSobreUmbral ? cat.ingresoTarjetaSobreUmbral : cat.ingresoTarjeta;

  // Parte MEDIDA: ventas con plazo registrado. Se cobra la tasa del plazo real.
  const exactas = cat.exactas ?? { ingreso: 0, porPlazo: {} };
  let costoExacto = 0;
  for (const [meses, ingreso] of Object.entries(exactas.porPlazo)) {
    // Un plazo sin tasa configurada (ej. 12 meses) no se puede costear: se
    // reporta como 0 en vez de inventar un número.
    costoExacto += costoBanco(ingreso, tasas[Number(meses)] ?? 0);
  }

  // Parte ESTIMADA: el resto (ventas viejas registradas como TARJETA), con la
  // mezcla asumida. A medida que se acumulen ventas con plazo registrado, este
  // pedazo se encoge hasta desaparecer.
  const baseEstimada = Math.max(0, base - exactas.ingreso);
  const enTres = baseEstimada * mezcla.tres;
  const enSeis = baseEstimada * mezcla.seis;
  const costoEstimado = costoBanco(enTres, tasas[3]) + costoBanco(enSeis, tasas[6]);

  const costo = costoExacto + costoEstimado;
  return {
    baseFinanciada: exactas.ingreso + enTres + enSeis,
    costo,
    costoExacto,
    costoEstimado,
    ingresoMedido: exactas.ingreso,
    ingresoEstimado: baseEstimada,
    /** Qué porcentaje del costo sale de datos reales y no de un supuesto. */
    confiabilidadPct: base > 0 ? (Math.min(exactas.ingreso, base) / base) * 100 : 100,
    costoTres: costoBanco(enTres, tasas[3]),
    costoSeis: costoBanco(enSeis, tasas[6]),
    /** Qué tajada del margen bruto de la categoría se lleva el banco. */
    pctDelMargen: cat.margen > 0 ? (costo / cat.margen) * 100 : Infinity,
    /** Margen efectivo de la categoría una vez pagado el banco. */
    margenNetoPct: cat.ingreso > 0 ? ((cat.margen - costo) / cat.ingreso) * 100 : 0,
  };
}

/**
 * Qué recupera cada palanca, sin cambiarle el precio a nadie.
 *
 *  - cerrarSeis: dejar de ofrecer 6 meses (9%) y empujar todo a 3 meses (6%).
 *    No se recupera todo: la venta a 3 meses sigue costando.
 *  - subirPiso: dejar de ofrecer cuotas por debajo de `nuevoPisoUsd`. Se calcula
 *    venta por venta con el detalle real, no con el ticket promedio (el promedio
 *    de una categoría con tickets de $80 y $150 da $115 y haría creer que un
 *    piso de $150 mata TODAS las ventas, cuando solo mata las de $80).
 *    Es el escenario OPTIMISTA: asume que esas ventas igual se cierran de
 *    contado. Si el cliente se va, el costo real es la venta perdida — por eso
 *    se devuelve también cuánta venta queda expuesta.
 *  - subirLista: cuánto habría que subir el precio de TODA la categoría para
 *    recuperar el costo. Es el número honesto del traslado a precio: el costo
 *    se genera solo en las ventas financiadas, pero la subida la pagan todos.
 */
export function palancas(cat, { costoBanco: tasas, mezcla, nuevoPisoUsd, umbralUsd = 100 }) {
  const actual = costoFinanciamiento(cat, { costoBanco: tasas, mezcla });

  const todoATres = costoBanco(actual.baseFinanciada, tasas[3]);

  // Piso exacto: qué ingreso de esta categoría dejaría de ser financiable.
  const detalle = cat.ventasTarjetaDetalle ?? [];
  const financiableHoy = detalle.filter((d) => d.totalVenta >= umbralUsd);
  const seguiriaFinanciada = financiableHoy.filter((d) => d.totalVenta >= nuevoPisoUsd);
  const ingresoQueSale = financiableHoy
    .filter((d) => d.totalVenta < nuevoPisoUsd)
    .reduce((s, d) => s + d.ingresoCategoria, 0);
  const ingresoQueQueda = seguiriaFinanciada.reduce((s, d) => s + d.ingresoCategoria, 0);

  const costoConPiso =
    costoBanco(ingresoQueQueda * mezcla.tres, tasas[3]) +
    costoBanco(ingresoQueQueda * mezcla.seis, tasas[6]);

  return {
    hoy: actual.costo,
    cerrarSeis: { costo: todoATres, ahorro: actual.costo - todoATres },
    subirPiso: {
      costo: costoConPiso,
      ahorro: actual.costo - costoConPiso,
      aplica: ingresoQueSale > 0,
      ventasAfectadas: financiableHoy.length - seguiriaFinanciada.length,
      ventaExpuesta: ingresoQueSale,
    },
    subirLista: {
      pct: cat.ingreso > 0 ? (actual.costo / cat.ingreso) * 100 : 0,
    },
  };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
