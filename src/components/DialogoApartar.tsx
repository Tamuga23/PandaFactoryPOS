import React, { useRef, useState } from 'react';
import { HandCoins, Loader2, AlertTriangle, Truck } from 'lucide-react';
import { CartItem } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { formatCurrencyNIO } from '../lib/utils';
import { etiquetaMetodo } from '../lib/etiquetas';
import {
  METODOS_ABONO,
  totalNioDe,
  redondearCordobas,
  primaMinimaNio,
  validarPrima,
  saldoNio,
  estaPagado,
  fechaLimiteDesde,
  finDelDia,
  aFechaInput,
  type MetodoAbono,
  type ConfigApartados,
} from '../lib/apartados';

/*
  El diálogo de APARTAR: cuánto deja hoy el cliente (la prima), cómo lo pagó y
  hasta cuándo tiene para completar el resto.

  No escribe nada. Junta los datos de la prima y se los entrega al POS, que es
  el dueño de todo lo que tiene que sobrevivir a un reintento: los ids del
  apartado y de la prima (nacen al abrir, no al confirmar), la ficha del
  cliente y la transacción. Por eso el error y el "Procesando…" vienen de
  afuera: el que falla es el POS, y el que reintenta tiene que ver el mismo
  diálogo con el mismo motivo.

  Recibe el carrito VIVO, no una foto tomada al abrir. Al abrir, el POS quita el
  precio de efectivo en el mismo paso en que monta este diálogo; una foto sacada
  en ese momento todavía tendría el precio rebajado, y la prima se validaría
  contra un total que no es el que se va a guardar. Por eso todo se recalcula
  en cada render, con la cuenta que imprime el papel (`totalNioDe`).
*/

export interface PrimaApartado {
  /** En córdobas, redondeada como la imprime el papel. */
  primaNio: number;
  metodo: MetodoAbono;
  /** N° de transferencia o voucher; '' si no hay. */
  referencia: string;
  /** Final del día local elegido (`finDelDia`). */
  fechaLimite: number;
}

interface Props {
  /** El carrito VIVO del POS (ver arriba por qué no una foto). */
  items: CartItem[];
  /** La tasa del día: queda congelada en el apartado. */
  tasa: number;
  envioNio: number;
  descuentoNio: number;
  clienteNombre: string;
  clienteTelefono: string;
  config: Pick<ConfigApartados, 'primaMinimaPct' | 'plazoDias'>;
  /** La forma de pago elegida en el POS: precarga la de la prima si sirve para un abono. */
  metodoInicial?: string;
  /** El N° de transferencia o voucher que ya se tipeó en el POS. */
  referenciaInicial?: string;
  /** El POS tenía elegido CUOTAS BANPRO: acá no aplican y se dice. */
  conCuotas: boolean;
  procesando: boolean;
  /** Motivo del último intento fallido. Con él, el botón pasa a "Reintentar". */
  error: string | null;
  onConfirmar: (datos: PrimaApartado) => void;
  onCerrar: () => void;
}

const esMetodoAbono = (m?: string): m is MetodoAbono =>
  (METODOS_ABONO as readonly string[]).includes(m || '');

// La receta única de campo de DESIGN.md, sin tamaño de letra: cada campo pone
// el suyo (dos `text-*` en el mismo elemento los desempata el orden del CSS,
// no el de la clase).
//
// El anillo de foco NO va acá: va escrito en cada campo. `npm run medir:foco`
// —la medición con la que DESIGN.md sostiene la Regla del Foco Declarado— lee
// las clases literales de cada control y no ve a través de una constante:
// metido acá, los cuatro campos salían "sin foco" y una regresión de verdad se
// habría escondido entre falsos positivos.
const CAMPO = 'w-full bg-zinc-800 border rounded-lg p-2 text-zinc-200 placeholder-zinc-400';
const ETIQUETA = 'text-[10px] uppercase text-zinc-400 font-bold';

export default function DialogoApartar({
  items,
  tasa,
  envioNio,
  descuentoNio,
  clienteNombre,
  clienteTelefono,
  config,
  metodoInicial,
  referenciaInicial = '',
  conCuotas,
  procesando,
  error,
  onConfirmar,
  onCerrar,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const primaRef = useRef<HTMLInputElement>(null);
  const fechaRef = useRef<HTMLInputElement>(null);
  const retiraRef = useRef<HTMLInputElement>(null);
  useFocusTrap(true, ref);
  // Con la transacción en vuelo no se cierra: cerrar no la cancela, y su
  // resultado —el número o el motivo del error— tiene que tener dónde verse.
  useEscapeKey(!procesando, onCerrar);

  // "Hoy" queda fijo al abrir: es la base de la fecha propuesta y del mínimo
  // del calendario, y no tiene que moverse mientras el operador tipea.
  const [ahora] = useState(() => Date.now());
  const [prima, setPrima] = useState('');
  const [metodo, setMetodo] = useState<MetodoAbono>(() =>
    esMetodoAbono(metodoInicial) ? metodoInicial : 'EFECTIVO',
  );
  const [referencia, setReferencia] = useState(referenciaInicial);
  const [fecha, setFecha] = useState(() => aFechaInput(fechaLimiteDesde(ahora, config.plazoDias)));
  const [retiraOtroDia, setRetiraOtroDia] = useState(false);
  // Un campo vacío recién abierto no es un error: los avisos de lo que falta
  // aparecen al tipear la prima o al intentar confirmar.
  const [intentado, setIntentado] = useState(false);

  const totalNio = totalNioDe(items, tasa, envioNio, descuentoNio);
  const lineas = items.length;
  const unidades = items.reduce((s, i) => s + i.quantity, 0);

  /*
    ENCARGO: lo que no está en la tienda no se reserva hoy; queda esperando la
    caja. Con el stock que ve la pantalla —el servidor decide con el suyo, y
    el aviso final dice lo que de verdad quedó—.
  */
  const porLlegar = items
    .map((i) => ({ id: i.id, nombre: i.name, cantidad: Math.max(0, i.quantity - Math.max(0, i.stock || 0)) }))
    .filter((x) => x.cantidad > 0);
  const esEncargo = porLlegar.length > 0;

  const primaNum = prima.trim() === '' ? NaN : Number(prima);
  const errorPrima = validarPrima(primaNum, totalNio, config.primaMinimaPct);
  const mostrarErrorPrima = errorPrima !== null && (prima.trim() !== '' || intentado);

  // La cuenta en vivo pasa por las mismas funciones que el apartado guardado
  // (centavos enteros): el saldo que se le dice al cliente es el del papel.
  const montoTipeado = prima.trim() === '' ? 0 : primaNum;
  const legible = Number.isFinite(montoTipeado) && montoTipeado >= 0;
  const cuenta = {
    totalNio,
    abonos: [{ id: 'prima', fecha: ahora, metodo, montoNio: legible ? montoTipeado : 0 }],
  };
  const saldo = saldoNio(cuenta);
  // En un encargo, pagar todo de entrada es lo normal (un pedido especial
  // prepagado) y no se lo puede llevar hoy: la pregunta de abajo no aplica.
  const pagaTodo = errorPrima === null && estaPagado(cuenta) && !esEncargo;

  const hoy = aFechaInput(ahora);
  /*
    Decisión del dueño (2026-10-27): el plazo de un encargo corre DESDE QUE
    LLEGA. Hoy no hay fecha que elegir; se guarda una provisoria (la de
    siempre) que no se muestra mientras espera, y la recepción de la caja la
    reescribe con el día en que llegó.
  */
  const fechaLimite = esEncargo ? fechaLimiteDesde(ahora, config.plazoDias) : finDelDia(fecha);
  const errorFecha =
    fechaLimite === null
      ? 'Elegí una fecha límite válida.'
      : fechaLimite < (finDelDia(hoy) ?? 0)
        ? 'La fecha límite no puede ser anterior a hoy.'
        : null;

  /*
    Atajos de prima. Salen de `primaMinimaNio`, que redondea HACIA ARRIBA: con
    un total de C$1,000.01 y mínimo de 20%, un "20%" redondeado al centavo más
    cercano daría 200.00 y chocaría con su propio mínimo, 200.01. Los
    porcentajes que no llegan al mínimo no se ofrecen: un atajo que lleva a un
    error es una trampa.
  */
  const pctMinimo = Math.min(100, Math.max(0, config.primaMinimaPct || 0));
  const atajos: { clave: string; texto: string; valor: number; nombre?: string }[] = [];
  if (pctMinimo > 0) {
    const v = primaMinimaNio(totalNio, pctMinimo);
    atajos.push({ clave: 'minimo', texto: `Mínimo ${pctMinimo}% · ${formatCurrencyNIO(v)}`, valor: v });
  }
  for (const pct of [20, 30, 50]) {
    if (pct <= pctMinimo) continue;
    const v = primaMinimaNio(totalNio, pct);
    atajos.push({ clave: String(pct), texto: `${pct}%`, valor: v, nombre: `Prima del ${pct}%: ${formatCurrencyNIO(v)}` });
  }
  if (pctMinimo < 100) {
    atajos.push({ clave: 'todo', texto: 'Todo', valor: totalNio, nombre: `Todo el total: ${formatCurrencyNIO(totalNio)}` });
  }

  const elegirPrima = (valor: number) => {
    setPrima(String(redondearCordobas(valor)));
    setRetiraOtroDia(false);
  };

  const confirmar = (e: React.FormEvent) => {
    e.preventDefault();
    if (procesando) return;
    setIntentado(true);
    if (errorPrima) {
      primaRef.current?.focus();
      return;
    }
    if (errorFecha || fechaLimite === null) {
      fechaRef.current?.focus();
      return;
    }
    if (pagaTodo && !retiraOtroDia) {
      retiraRef.current?.focus();
      return;
    }
    onConfirmar({
      primaNio: redondearCordobas(primaNum),
      metodo,
      referencia: referencia.trim(),
      fechaLimite,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* El telón es un blanco de clic, no un control: el camino de teclado es ESC. */}
      <div
        className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
        onClick={procesando ? undefined : onCerrar}
        aria-hidden="true"
      ></div>

      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-apartar"
        className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl max-h-[calc(100vh-2rem)] overflow-y-auto custom-scrollbar"
      >
        {/*
          `noValidate`: la validación es la de lib/apartados.ts, con sus
          mensajes. La del navegador saltaba antes con un globo propio (y en
          otro idioma) por un `step` o un `min`.
        */}
        <form onSubmit={confirmar} noValidate aria-busy={procesando} className="p-5 sm:p-6 space-y-4">
          <div>
            <h3 id="titulo-apartar" className="text-lg font-bold text-zinc-100 flex items-start gap-2">
              <HandCoins className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span className="min-w-0 break-words">Apartar para {clienteNombre}</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-1 tabular-nums">
              {clienteTelefono} · {lineas} {lineas === 1 ? 'línea' : 'líneas'}
              {unidades !== lineas && <> · {unidades} unidades</>}
            </p>
          </div>

          <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 flex items-baseline justify-between gap-3">
            <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 shrink-0">
              Total del apartado
              <span className="block normal-case tracking-normal font-normal text-zinc-400">
                a {tasa.toFixed(4)}
              </span>
            </span>
            <span className="text-3xl font-bold text-cyan-400 tabular-nums leading-none truncate">
              {formatCurrencyNIO(totalNio)}
            </span>
          </div>

          {/*
            El POS pudo quedar en CUOTAS BANPRO y su número grande decía "Total
            a plazos". No se bloquea —el apartado no usa esa forma de pago—,
            pero el total de acá es otro y el operador tiene que saber por qué.
          */}
          {conCuotas && (
            <p className="text-xs text-amber-400 leading-snug flex gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Las cuotas Banpro no aplican a un apartado: el total es de contado.</span>
            </p>
          )}

          <div className="space-y-1.5">
            <label htmlFor="apartar-prima" className={ETIQUETA}>Prima (C$)</label>
            <input
              ref={primaRef}
              id="apartar-prima"
              autoFocus
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={prima}
              onChange={(e) => {
                setPrima(e.target.value);
                // Lo que se confirmó era "lo retira otro día CON ESTA prima".
                setRetiraOtroDia(false);
              }}
              aria-invalid={mostrarErrorPrima || undefined}
              aria-describedby={mostrarErrorPrima ? 'apartar-prima-error' : undefined}
              className={`${CAMPO} focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 ${mostrarErrorPrima ? 'border-rose-500/60' : 'border-zinc-700'} text-lg font-bold text-right tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
            />
            {totalNio > 0 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Montos de prima sugeridos">
                {atajos.map((a) => {
                  const activo =
                    prima.trim() !== '' && legible &&
                    redondearCordobas(montoTipeado) === redondearCordobas(a.valor);
                  return (
                    <button
                      key={a.clave}
                      type="button"
                      onClick={() => elegirPrima(a.valor)}
                      aria-label={a.nombre}
                      title={a.nombre}
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border tabular-nums transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                        activo
                          ? 'bg-cyan-500/15 border-cyan-500 text-white'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-600'
                      }`}
                    >
                      {a.texto}
                    </button>
                  );
                })}
              </div>
            )}
            {mostrarErrorPrima && (
              <p id="apartar-prima-error" className="text-[11px] text-rose-400 leading-snug">
                {errorPrima}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="apartar-metodo" className={ETIQUETA}>Método</label>
              <select
                id="apartar-metodo"
                value={metodo}
                onChange={(e) => setMetodo(e.target.value as MetodoAbono)}
                className={`${CAMPO} focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 border-zinc-700 text-sm cursor-pointer`}
              >
                {METODOS_ABONO.map((m) => (
                  <option key={m} value={m}>{etiquetaMetodo(m)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="apartar-referencia" className={ETIQUETA}>
                Referencia
                <span className="normal-case font-normal text-zinc-400"> · opcional</span>
              </label>
              {/* 100 es el tope de `referencia` en el esquema del abono. */}
              <input
                id="apartar-referencia"
                type="text"
                maxLength={100}
                placeholder="N° de transferencia / voucher…"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                className={`${CAMPO} focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 border-zinc-700 text-sm`}
              />
            </div>
          </div>

          {esEncargo ? (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-2">
              <p className="text-[10px] uppercase tracking-wider font-bold text-amber-400 flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" aria-hidden="true" />
                Encargo · se reserva cuando llegue
              </p>
              <ul className="text-xs text-zinc-200 space-y-0.5">
                {porLlegar.map((x) => (
                  <li key={x.id} className="flex gap-2 tabular-nums">
                    <span className="text-amber-400 font-bold shrink-0">{x.cantidad} ×</span>
                    <span className="min-w-0 break-words">{x.nombre}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-zinc-300 leading-snug">
                {unidades > porLlegar.reduce((s, x) => s + x.cantidad, 0) && 'Lo que está en la tienda se reserva hoy. '}
                La fecha límite de pago se fija cuando llegue: {config.plazoDias} días después de recibirla.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <label htmlFor="apartar-fecha" className={ETIQUETA}>Fecha límite de pago</label>
              {/* `color-scheme: dark`: sin eso el ícono del calendario es gris oscuro sobre carbón. */}
              <input
                ref={fechaRef}
                id="apartar-fecha"
                type="date"
                min={hoy}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                aria-invalid={errorFecha ? true : undefined}
                aria-describedby="apartar-fecha-ayuda"
                className={`${CAMPO} focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 ${errorFecha ? 'border-rose-500/60' : 'border-zinc-700'} text-sm [color-scheme:dark]`}
              />
              <p
                id="apartar-fecha-ayuda"
                className={`text-[11px] leading-snug ${errorFecha ? 'text-rose-400' : 'text-zinc-400'}`}
              >
                {errorFecha || `Plazo de la tienda: ${config.plazoDias} días. Se puede mover después.`}
              </p>
            </div>
          )}

          {/*
            El saldo va al pie, pegado al botón: es la última cifra que se lee
            antes de confirmar y la que el cliente se lleva en la cabeza.
          */}
          <div className="flex items-baseline justify-between gap-3 pt-3 border-t border-zinc-800">
            <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400">
              Saldo pendiente
            </span>
            <span className="text-lg font-bold text-zinc-100 tabular-nums">
              {legible && saldo >= 0 ? formatCurrencyNIO(saldo) : '—'}
            </span>
          </div>

          {/*
            Prima igual al total: el apartado nace pagado. Si el cliente se lo
            lleva ahora, lo que corresponde es una venta —factura y garantía hoy,
            no un comprobante y una factura recién al entregar—. No se prohíbe
            (puede pagar todo y retirarlo el sábado), pero se pregunta.
          */}
          {pagaTodo && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-2">
              <p className="text-xs text-amber-400 leading-snug flex gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  Con la prima igual al total el apartado queda pagado. Si se lo lleva hoy, no es un
                  apartado: cerrá y cobralo con FACTURAR (F2).
                </span>
              </p>
              <label htmlFor="apartar-retira" className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer select-none">
                <input
                  ref={retiraRef}
                  id="apartar-retira"
                  type="checkbox"
                  checked={retiraOtroDia}
                  onChange={(e) => setRetiraOtroDia(e.target.checked)}
                  aria-invalid={intentado && !retiraOtroDia ? true : undefined}
                  className="w-4 h-4 rounded accent-cyan-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
                />
                Lo retira otro día
              </label>
              {intentado && !retiraOtroDia && (
                <p className="text-[11px] text-rose-400 leading-snug">
                  Marcalo para apartarlo pagado, o volvé y facturalo.
                </p>
              )}
            </div>
          )}

          {/*
            El error vive ACÁ, pegado al botón, y el botón pasa a "Reintentar":
            el aviso flotante queda en la esquina opuesta y se lo tapa el modal.
          */}
          {error && !procesando && (
            <div
              role="alert"
              className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2"
            >
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-rose-300 text-xs leading-snug">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onCerrar}
              disabled={procesando}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-sm font-semibold rounded-lg border border-zinc-700 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Volver
            </button>
            <button
              type="submit"
              disabled={procesando}
              className="flex items-center gap-2 px-5 py-2.5 bg-cyan-700 hover:bg-cyan-800 text-white text-sm font-bold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {procesando
                ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                : <HandCoins className="w-4 h-4" aria-hidden="true" />}
              {procesando ? 'Procesando…' : error ? 'Reintentar' : 'Confirmar apartado'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
