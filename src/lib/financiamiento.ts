// ---------------------------------------------------------------------------
// Financiamiento a plazos — FUENTE DE VERDAD COMPARTIDA
//
// Duplicado idéntico en los tres repos, igual que categorySpecs.ts:
//   PandaFactoryPOS-main/src/lib/financiamiento.ts   → el POS EDITA las reglas
//   PandaLink/src/lib/financiamiento.ts              → el asesor ve cuota Y total
//   PandaWEB/src/lib/financiamiento.ts               → el cliente ve la cuota
//
// Si tocás uno, copiá el archivo tal cual a los otros dos.
// Solo depende de `./categorySpecs` (misma carpeta en los tres repos), para no
// duplicar la tabla de alias de categorías.
//
// QUÉ MODELA
// El banco le cobra a la tienda un porcentaje por cada venta financiada (hoy 6%
// a 3 meses y 9% a 6 meses). Antes eso se absorbía completo y todo se anunciaba
// como "0% interés parejo". Ahora se traslada parte al cliente SOLO en las
// categorías donde el margen no lo aguanta.
//
// REGLA CLAVE: el precio de lista NO SE TOCA. Es el mismo que se setea en el
// POS y el mismo que paga quien no financia. Lo que cambia es el total a plazos:
//   total = precio × (1 + recargo)
// Los proyectores quedan en recargo 0 → siguen siendo 0% interés de verdad.
//
// LO QUE EL BANCO LE COBRA A LA TIENDA NO VIVE ACÁ. Este archivo llega al
// navegador del cliente; el costo interno (6%/9%) es dato de margen y se maneja
// en scripts/reporte_financiamiento.mjs, que corre con Admin SDK.
// ---------------------------------------------------------------------------

import { resolverCategoriaSpec } from './categorySpecs';

/** Recargo al cliente por plazo, en porcentaje. Clave = meses (string: viene de Firestore). */
export type RecargoPorPlazo = Record<string, number>;

export interface ReglaCategoria {
  /** Recargo por plazo. Si falta un plazo, se usa el del default. */
  recargo?: RecargoPorPlazo;
  /** Monto mínimo en USD para ofrecer cuotas en esta categoría. */
  minUsd?: number;
  /** Plazos ofrecidos. Permite cerrar el de 6 meses en una categoría puntual. */
  plazos?: number[];
}

export interface ConfigFinanciamiento {
  banco: string;
  /** Mínimo global en USD. Por debajo no se ofrecen cuotas. */
  minUsd: number;
  /** Plazos ofrecidos por defecto, en meses. */
  plazos: number[];
  /** Recargo por defecto (categorías sin regla propia). */
  recargoPorDefecto: RecargoPorPlazo;
  /** Reglas por categoría, con el slug canónico como clave. */
  porCategoria?: Record<string, ReglaCategoria>;
  actualizadoEn?: number;
}

/**
 * Override por producto. Va en `products.financiamientoOverride` y se copia al
 * espejo público. Sirve para la excepción: el smartwatch caro que sí aguanta 0%,
 * o el producto en liquidación al que no se le quiere dar plazos.
 */
export interface FinanciamientoOverride {
  /** `true` fuerza 0% en este producto, pase lo que pase con su categoría. */
  sinInteres?: boolean;
  /** Recargo puntual por plazo. Gana sobre la categoría y sobre el default. */
  recargo?: RecargoPorPlazo;
  /** `false` saca este producto del financiamiento por completo. */
  habilitado?: boolean;
  minUsd?: number;
  plazos?: number[];
}

/**
 * Respaldo si Firestore no responde. Refleja la política vigente: proyectores en
 * 0% y el resto con recargo. Una web con la política correcta pero desactualizada
 * es mejor que una web caída — y de todos modos el precio final se confirma con
 * el asesor.
 */
export const CONFIG_FINANCIAMIENTO_DEFAULT: ConfigFinanciamiento = {
  banco: 'Banpro',
  minUsd: 100,
  plazos: [3, 6],
  recargoPorDefecto: { '3': 3, '6': 6 },
  porCategoria: {
    proyector: { recargo: { '3': 0, '6': 0 } },
  },
};

/** Regla efectiva para un producto: default ← categoría ← override. */
export function reglaEfectiva(
  config: ConfigFinanciamiento,
  categoria?: string | null,
  override?: FinanciamientoOverride | null,
): { habilitado: boolean; minUsd: number; plazos: number[]; recargo: RecargoPorPlazo } {
  const canon = resolverCategoriaSpec(categoria);
  const porCat = canon ? config.porCategoria?.[canon] : undefined;

  const recargo: RecargoPorPlazo = {
    ...config.recargoPorDefecto,
    ...(porCat?.recargo ?? {}),
    ...(override?.recargo ?? {}),
  };

  // `sinInteres` es un atajo: pone en 0 todos los plazos del producto.
  if (override?.sinInteres) {
    for (const k of Object.keys(recargo)) recargo[k] = 0;
  }

  return {
    habilitado: override?.habilitado !== false,
    minUsd: override?.minUsd ?? porCat?.minUsd ?? config.minUsd,
    plazos: override?.plazos ?? porCat?.plazos ?? config.plazos,
    recargo,
  };
}

export interface PlanCuotas {
  meses: number;
  /** Recargo aplicado, en %. 0 = financiamiento sin interés de verdad. */
  recargoPct: number;
  sinInteres: boolean;
  /** Cuota mensual en córdobas, ya redondeada. Es el número que se muestra. */
  cuotaNio: number;
  /** Total a pagar en córdobas = cuotaNio × meses. Cuadra con la cuota exacta. */
  totalNio: number;
  /** Total en USD, derivado del total en córdobas. Informativo. */
  totalUsd: number;
  /** Cuánto más que el precio de contado, en córdobas. 0 si es sin interés. */
  sobrePrecioNio: number;
}

/**
 * Planes de cuotas de un producto.
 *
 * REDONDEO: se redondea la CUOTA (hacia arriba, al córdoba) y el total se deriva
 * como cuota × meses. Al revés — redondear el total y dividir — daría cuotas con
 * centavos que no se pueden cobrar, y el asesor en la tablet y el cliente en la
 * web verían números que no cuadran entre sí. Hacia arriba y no al más cercano
 * para que el redondeo nunca juegue en contra de la tienda.
 *
 * @param precioUsd  precio vigente (promo si existe). NO se modifica nunca.
 * @param tasaNio    tasa USD→NIO
 */
export function calcularPlanes(
  precioUsd: number | undefined | null,
  tasaNio: number,
  opciones: {
    config: ConfigFinanciamiento;
    categoria?: string | null;
    override?: FinanciamientoOverride | null;
  },
): PlanCuotas[] {
  const { config, categoria, override } = opciones;
  if (precioUsd == null || !Number.isFinite(precioUsd) || precioUsd <= 0) return [];
  if (!Number.isFinite(tasaNio) || tasaNio <= 0) return [];

  const regla = reglaEfectiva(config, categoria, override);
  if (!regla.habilitado) return [];
  if (precioUsd < regla.minUsd) return [];

  const precioNio = precioUsd * tasaNio;

  return [...regla.plazos]
    .filter((m) => Number.isFinite(m) && m > 0)
    .sort((a, b) => a - b)
    .map((meses) => {
      const recargoPct = Number(regla.recargo[String(meses)] ?? 0) || 0;
      const totalBrutoNio = precioNio * (1 + recargoPct / 100);
      const cuotaNio = Math.ceil(totalBrutoNio / meses);
      const totalNio = cuotaNio * meses;
      return {
        meses,
        recargoPct,
        sinInteres: recargoPct === 0,
        cuotaNio,
        totalNio,
        totalUsd: totalNio / tasaNio,
        sobrePrecioNio: Math.max(0, totalNio - Math.round(precioNio)),
      };
    });
}

/** Una línea del carrito, para financiar una venta completa. */
export interface LineaVenta {
  categoria?: string | null;
  override?: FinanciamientoOverride | null;
  /** Monto de la línea en USD (precio × cantidad). */
  montoUsd: number;
}

/**
 * Planes para una VENTA completa (la usa el POS al cobrar).
 *
 * Una venta va al banco como UNA transacción a UN plazo, pero el carrito puede
 * mezclar categorías con recargos distintos: un proyector al 0% junto a un
 * smartwatch al 3%. Acá el recargo se PONDERA por el monto de cada línea, así
 * cada producto aporta el suyo en la proporción que le toca. Las alternativas
 * eran peores: usar el recargo más alto le cobraría de más a la parte del
 * proyector, y usar el más bajo dejaría plata sobre la mesa.
 *
 * Reglas de borde, todas del lado prudente:
 *   - Si cualquier línea tiene el financiamiento deshabilitado, la venta entera
 *     queda sin cuotas.
 *   - El mínimo que se exige es el MÁS ALTO de las categorías del carrito.
 *   - Los plazos ofrecidos son la INTERSECCIÓN: si una categoría cerró el de 6
 *     meses, no se ofrece para toda la venta.
 */
export function planesParaVenta(
  lineas: LineaVenta[],
  tasaNio: number,
  config: ConfigFinanciamiento,
): PlanCuotas[] {
  if (lineas.length === 0) return [];
  if (!Number.isFinite(tasaNio) || tasaNio <= 0) return [];

  const validas = lineas.filter((l) => Number.isFinite(l.montoUsd) && l.montoUsd > 0);
  const totalUsd = validas.reduce((s, l) => s + l.montoUsd, 0);
  if (totalUsd <= 0) return [];

  const reglas = validas.map((l) => ({
    monto: l.montoUsd,
    regla: reglaEfectiva(config, l.categoria, l.override),
  }));

  if (reglas.some((r) => !r.regla.habilitado)) return [];

  const minUsd = Math.max(...reglas.map((r) => r.regla.minUsd));
  if (totalUsd < minUsd) return [];

  // Intersección de plazos.
  let plazos = [...reglas[0].regla.plazos];
  for (const r of reglas.slice(1)) plazos = plazos.filter((m) => r.regla.plazos.includes(m));
  if (plazos.length === 0) return [];

  const totalNioBase = totalUsd * tasaNio;

  return plazos
    .sort((a, b) => a - b)
    .map((meses) => {
      // Recargo ponderado por monto.
      const recargoPonderado =
        reglas.reduce(
          (s, r) => s + r.monto * (Number(r.regla.recargo[String(meses)] ?? 0) || 0),
          0,
        ) / totalUsd;
      const recargoPct = Math.round(recargoPonderado * 100) / 100;
      const totalBrutoNio = totalNioBase * (1 + recargoPct / 100);
      const cuotaNio = Math.ceil(totalBrutoNio / meses);
      const totalNio = cuotaNio * meses;
      return {
        meses,
        recargoPct,
        sinInteres: recargoPct === 0,
        cuotaNio,
        totalNio,
        totalUsd: totalNio / tasaNio,
        sobrePrecioNio: Math.max(0, totalNio - Math.round(totalNioBase)),
      };
    });
}

/** ¿Este producto tiene al menos un plazo sin interés? Para el badge "0%". */
export function tieneSinInteres(planes: PlanCuotas[]): boolean {
  return planes.some((p) => p.sinInteres);
}

/** ¿TODOS los plazos son sin interés? Habilita decir "0% interés" sin matices. */
export function todosSinInteres(planes: PlanCuotas[]): boolean {
  return planes.length > 0 && planes.every((p) => p.sinInteres);
}

/**
 * ¿Esta categoría se anuncia como 0% interés? Sirve para la copy de la web, que
 * ya no puede decir "sin intereses" de forma pareja: ahora nombra las
 * categorías que de verdad lo tienen.
 */
export function esCategoriaSinInteres(
  config: ConfigFinanciamiento,
  categoria: string,
): boolean {
  const regla = reglaEfectiva(config, categoria);
  return regla.plazos.every((m) => (Number(regla.recargo[String(m)] ?? 0) || 0) === 0);
}

/** El plan de cuota más baja, para el gancho "desde C$X al mes". */
export function planMasBajo(planes: PlanCuotas[]): PlanCuotas | null {
  if (planes.length === 0) return null;
  return planes.reduce((min, p) => (p.cuotaNio < min.cuotaNio ? p : min));
}

/**
 * Normaliza un doc crudo de Firestore a ConfigFinanciamiento, cayendo al
 * default campo por campo. Un doc a medio escribir no debe dejar la web sin
 * financiamiento ni, peor, anunciar 0% donde ya no lo hay.
 */
export function normalizarConfig(raw: unknown): ConfigFinanciamiento {
  const d = CONFIG_FINANCIAMIENTO_DEFAULT;
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;

  const numeros = (v: unknown, def: number[]): number[] => {
    if (!Array.isArray(v)) return def;
    const l = v.map(Number).filter((n) => Number.isFinite(n) && n > 0);
    return l.length > 0 ? l : def;
  };

  const recargos = (v: unknown): RecargoPorPlazo | undefined => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
    const out: RecargoPorPlazo = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const n = Number(val);
      // Un recargo negativo o absurdo se descarta: mejor caer al default que
      // mostrarle al cliente una cuota inventada.
      if (Number.isFinite(n) && n >= 0 && n <= 100) out[String(k)] = n;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  };

  const porCategoria: Record<string, ReglaCategoria> = {};
  const rawCat = o.porCategoria;
  if (rawCat && typeof rawCat === 'object' && !Array.isArray(rawCat)) {
    for (const [slug, val] of Object.entries(rawCat as Record<string, unknown>)) {
      if (!val || typeof val !== 'object') continue;
      const v = val as Record<string, unknown>;
      const regla: ReglaCategoria = {};
      const r = recargos(v.recargo);
      if (r) regla.recargo = r;
      const min = Number(v.minUsd);
      if (Number.isFinite(min) && min >= 0) regla.minUsd = min;
      if (Array.isArray(v.plazos)) regla.plazos = numeros(v.plazos, []);
      if (Object.keys(regla).length > 0) porCategoria[slug.toLowerCase()] = regla;
    }
  }

  const minUsd = Number(o.minUsd);

  return {
    banco: typeof o.banco === 'string' && o.banco.trim() ? o.banco.trim() : d.banco,
    minUsd: Number.isFinite(minUsd) && minUsd >= 0 ? minUsd : d.minUsd,
    plazos: numeros(o.plazos, d.plazos),
    recargoPorDefecto: recargos(o.recargoPorDefecto) ?? d.recargoPorDefecto,
    porCategoria: Object.keys(porCategoria).length > 0 ? porCategoria : d.porCategoria,
    actualizadoEn: Number.isFinite(Number(o.actualizadoEn)) ? Number(o.actualizadoEn) : undefined,
  };
}

/** Normaliza el override de un producto. Descarta lo que no tenga sentido. */
export function normalizarOverride(raw: unknown): FinanciamientoOverride | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: FinanciamientoOverride = {};

  if (o.sinInteres === true) out.sinInteres = true;
  if (o.habilitado === false) out.habilitado = false;

  const min = Number(o.minUsd);
  if (Number.isFinite(min) && min >= 0) out.minUsd = min;

  if (Array.isArray(o.plazos)) {
    const l = o.plazos.map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (l.length > 0) out.plazos = l;
  }

  if (o.recargo && typeof o.recargo === 'object' && !Array.isArray(o.recargo)) {
    const r: RecargoPorPlazo = {};
    for (const [k, v] of Object.entries(o.recargo as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0 && n <= 100) r[String(k)] = n;
    }
    if (Object.keys(r).length > 0) out.recargo = r;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}
