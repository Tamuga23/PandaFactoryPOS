import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Ban, HandCoins, Loader2, PackageCheck, Undo2 } from 'lucide-react';
import type { AbonoApartado, Apartado } from '../types';
import {
  METODOS_ABONO,
  abonadoNio,
  abonosVigentes,
  estaPagado,
  metodoPredominante,
  partesDeApartado,
  redondearCordobas,
  saldoNio,
  validarAbono,
  validarDevolucion,
  type MetodoAbono,
} from '../lib/apartados';
import { etiquetaMetodo } from '../lib/etiquetas';
import { formatCurrencyNIO } from '../lib/utils';
import { TRANSPORTES_CON_ETIQUETA } from '../lib/invoice';
import {
  Aviso,
  AvisoError,
  CampoDinero,
  ModalApartado,
  fechaCorta,
  fechaHora,
  parsearMonto,
  plural,
  unidadesDe,
} from './ApartadoPiezas';

/*
  Los cuatro diálogos que mueven plata o stock de un apartado: abonar, anular
  un abono, entregar y cancelar.

  Ninguno escribe nada por su cuenta. Juntan el dato, llaman a la pantalla, y
  si la pantalla lanza, el motivo se queda ACÁ: adentro del diálogo, con
  `role="alert"` y el botón en "Reintentar" (PRODUCT.md, principio 5). El aviso
  de la esquina sale lejos de donde el operador está mirando, y si no ve por qué
  falló, aprieta de nuevo.

  Mientras guardan, ni ESC ni el telón los cierran: un diálogo que se cierra a
  mitad de una transacción deja al operador sin saber si el abono entró.

  Se abren encima del detalle, por eso van en `z-[60]`.
*/

const C$ = formatCurrencyNIO;

/** Encabezado común: título con su ícono y, debajo, de quién es el apartado. */
function Encabezado({ id, icono, titulo, tono = 'text-zinc-100', ap }: {
  id: string;
  icono: React.ReactNode;
  titulo: React.ReactNode;
  tono?: string;
  ap: Apartado;
}) {
  return (
    <div className="p-5 border-b border-zinc-800 shrink-0">
      <h3 id={id} className={`text-lg font-bold flex items-center gap-2 ${tono}`}>
        {icono}
        <span className="min-w-0">{titulo}</span>
      </h3>
      <p className="text-xs text-zinc-400 mt-0.5 truncate">
        {ap.numero} · {ap.customerName}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Abonar
// ---------------------------------------------------------------------------

/**
 * Registrar un abono.
 *
 * `abonoId` lo trae la pantalla y nace al ABRIR el diálogo: un reintento usa el
 * mismo, así que si el primer intento sí se guardó pero la respuesta no llegó,
 * la transacción lo reconoce y no lo cobra dos veces.
 *
 * Si el abono deja el saldo en cero hay una segunda confirmación con el monto en
 * grande. El error más probable no es que el cliente pague de más, es un cero de
 * más al tipear (o el atajo "Saldo completo" apretado sin haber recibido todo),
 * y ese abono es el que habilita entregar y facturar.
 */
export function DialogoAbonar({
  ap,
  abonoId,
  onCerrar,
  onRegistrar,
}: {
  ap: Apartado;
  abonoId: string;
  onCerrar: () => void;
  onRegistrar: (abono: AbonoApartado) => Promise<void>;
}) {
  const [texto, setTexto] = useState('');
  const [metodo, setMetodo] = useState<MetodoAbono>('EFECTIVO');
  const [referencia, setReferencia] = useState('');
  const [paso, setPaso] = useState<'monto' | 'confirmar'>('monto');
  const [intentado, setIntentado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const montoRef = useRef<HTMLInputElement>(null);
  const confirmarRef = useRef<HTMLDivElement>(null);

  // El saldo es el VIVO: si mientras el diálogo está abierto entra otro abono
  // desde otro equipo, la validación y el "saldo después" ya lo cuentan.
  const saldo = saldoNio(ap);
  const monto = parsearMonto(texto);
  const errorMonto =
    monto === null ? (intentado ? validarAbono(0, saldo) : null) : validarAbono(monto, saldo);
  const saldoDespues = monto !== null && !errorMonto ? redondearCordobas(saldo - monto) : null;
  const quedaPagado = saldoDespues !== null && saldoDespues <= 0;
  // Si el saldo cambió por debajo y este abono ya no lo cancela, la segunda
  // confirmación ("queda pagado") estaría mintiendo: se vuelve al monto.
  const enConfirmacion = paso === 'confirmar' && quedaPagado;
  const conReferencia = metodo !== 'EFECTIVO';
  const ref = referencia.trim();

  // Al pasar a la confirmación, el foco va al MONTO grande y no al botón: un
  // segundo Enter de inercia no confirma nada que no se haya leído.
  useEffect(() => {
    if (paso === 'confirmar') confirmarRef.current?.focus();
    else montoRef.current?.focus();
  }, [paso]);

  const registrar = async () => {
    if (enviando) return;
    setIntentado(true);
    if (monto === null || errorMonto) {
      setPaso('monto');
      montoRef.current?.focus();
      return;
    }
    if (!enConfirmacion && quedaPagado) {
      setPaso('confirmar');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await onRegistrar({
        id: abonoId,
        fecha: Date.now(),
        montoNio: monto,
        metodo,
        ...(conReferencia && ref ? { referencia: ref } : {}),
      });
      // Con éxito la pantalla cierra el diálogo y abre el comprobante.
    } catch (e: any) {
      setError(e?.message || 'No se pudo registrar el abono. Revisá la conexión y reintentá.');
      setEnviando(false);
    }
  };

  const etiquetaBoton = enviando ? 'Registrando…' : error ? 'Reintentar' : null;

  return (
    <ModalApartado idTitulo="titulo-abonar" capa="z-[60]" ocupado={enviando} onCerrar={onCerrar} focoInicial={montoRef}>
      <form
        className="flex flex-col flex-1 min-h-0"
        onSubmit={(e) => {
          e.preventDefault();
          void registrar();
        }}
      >
        <Encabezado
          id="titulo-abonar"
          ap={ap}
          icono={<HandCoins className="w-5 h-5 text-cyan-400 shrink-0" aria-hidden="true" />}
          titulo="Registrar un abono"
        />

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {enConfirmacion && monto !== null ? (
            <div ref={confirmarRef} tabIndex={-1} className="py-4 text-center space-y-1 focus:outline-none">
              <p className="text-base font-semibold text-zinc-200">¿Recibiste</p>
              <p className="text-4xl font-bold text-cyan-400 tabular-nums break-words">{C$(monto)}?</p>
              <p className="text-sm text-zinc-200 pt-2">Con este abono el apartado queda pagado.</p>
              <p className="text-xs text-zinc-400">
                {etiquetaMetodo(metodo)}
                {conReferencia && ref ? ` · ref. ${ref}` : ''}
              </p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-[10px] uppercase text-zinc-400 font-bold">Saldo actual</p>
                <p className="text-3xl font-bold text-cyan-400 tabular-nums break-words">{C$(saldo)}</p>
                <p className="text-xs text-zinc-400 tabular-nums mt-0.5">
                  Total {C$(ap.totalNio)} · abonado {C$(abonadoNio(ap))}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-end justify-between gap-2">
                  <label htmlFor="abono-monto" className="text-[10px] uppercase text-zinc-400 font-bold">
                    Monto del abono
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setTexto(String(saldo));
                      montoRef.current?.focus();
                    }}
                    disabled={enviando || saldo <= 0}
                    className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  >
                    Saldo completo
                  </button>
                </div>
                <CampoDinero
                  id="abono-monto"
                  valor={texto}
                  onCambio={setTexto}
                  inputRef={montoRef}
                  invalido={!!errorMonto}
                  describedBy={errorMonto ? 'abono-monto-error' : undefined}
                />
                {errorMonto && (
                  <p id="abono-monto-error" className="text-xs text-rose-300 leading-snug">
                    {errorMonto}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="abono-metodo" className="text-[10px] uppercase text-zinc-400 font-bold">
                    Forma de pago
                  </label>
                  <select
                    id="abono-metodo"
                    value={metodo}
                    onChange={(e) => setMetodo(e.target.value as MetodoAbono)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  >
                    {METODOS_ABONO.map((m) => (
                      <option key={m} value={m}>
                        {etiquetaMetodo(m)}
                      </option>
                    ))}
                  </select>
                </div>
                {/* En efectivo no hay número que anotar. Si se tipeó uno y
                    después se pasó a efectivo, no se manda. */}
                {conReferencia && (
                  <div className="space-y-1">
                    <label htmlFor="abono-referencia" className="text-[10px] uppercase text-zinc-400 font-bold">
                      Referencia
                    </label>
                    <input
                      id="abono-referencia"
                      type="text"
                      value={referencia}
                      onChange={(e) => setReferencia(e.target.value)}
                      maxLength={100}
                      autoComplete="off"
                      placeholder="N° de transferencia o voucher"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                )}
              </div>

              <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3" aria-live="polite">
                <p className="text-[10px] uppercase text-zinc-400 font-bold">Saldo después de este abono</p>
                <p
                  className={`text-2xl font-bold tabular-nums break-words ${quedaPagado ? 'text-emerald-400' : 'text-zinc-100'}`}
                >
                  {saldoDespues === null ? '—' : C$(saldoDespues)}
                </p>
                {quedaPagado && (
                  <p className="text-xs text-emerald-400 mt-0.5">Con este abono queda pagado: se puede entregar y facturar.</p>
                )}
              </div>
            </>
          )}

          <AvisoError mensaje={error} />
        </div>

        <div className="p-4 bg-zinc-800/30 border-t border-zinc-800 flex flex-wrap justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={enConfirmacion ? () => setPaso('monto') : onCerrar}
            disabled={enviando}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white font-semibold rounded transition-colors disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          >
            {enConfirmacion ? 'Corregir el monto' : 'Volver'}
          </button>
          {enConfirmacion && monto !== null ? (
            <button
              type="submit"
              disabled={enviando}
              className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {enviando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {etiquetaBoton ?? `Sí, recibí ${C$(monto)}`}
            </button>
          ) : (
            <button
              type="submit"
              disabled={enviando}
              className="px-5 py-2 bg-cyan-700 hover:bg-cyan-800 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {enviando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {etiquetaBoton ?? 'Registrar abono'}
            </button>
          )}
        </div>
      </form>
    </ModalApartado>
  );
}

// ---------------------------------------------------------------------------
// Anular un abono
// ---------------------------------------------------------------------------

/**
 * Anular un abono cargado por error. No es un formulario a propósito: Enter no
 * anula nada, hay que apretar el botón rosa.
 */
export function DialogoAnularAbono({
  ap,
  abono,
  onCerrar,
  onAnular,
}: {
  ap: Apartado;
  abono: AbonoApartado;
  onCerrar: () => void;
  onAnular: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState('');
  const [intentado, setIntentado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const motivoRef = useRef<HTMLTextAreaElement>(null);

  const saldoAntes = saldoNio(ap);
  const saldoDespues = saldoNio({
    ...ap,
    anulaciones: [...(ap.anulaciones || []), { abonoId: abono.id, motivo: '', fecha: 0 }],
  });
  const esPrima = ap.abonos[0]?.id === abono.id;
  const faltaMotivo = !motivo.trim();
  const errorMotivo = intentado && faltaMotivo ? 'Escribí por qué se anula: queda impreso en el comprobante.' : null;

  const anular = async () => {
    if (enviando) return;
    setIntentado(true);
    if (faltaMotivo) {
      motivoRef.current?.focus();
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await onAnular(motivo.trim());
    } catch (e: any) {
      setError(e?.message || 'No se pudo anular el abono. Revisá la conexión y reintentá.');
      setEnviando(false);
    }
  };

  return (
    <ModalApartado
      idTitulo="titulo-anular-abono"
      capa="z-[60]"
      borde="border-rose-500/30"
      ocupado={enviando}
      onCerrar={onCerrar}
      focoInicial={motivoRef}
    >
      <Encabezado
        id="titulo-anular-abono"
        ap={ap}
        tono="text-rose-400"
        icono={<Undo2 className="w-5 h-5 shrink-0" aria-hidden="true" />}
        titulo="Anular un abono"
      />

      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 text-sm text-zinc-200">
          <p className="font-bold tabular-nums">
            {esPrima ? 'Prima' : 'Abono'} de {C$(abono.montoNio)}
          </p>
          <p className="text-zinc-400 text-xs mt-1 tabular-nums">
            {fechaHora(abono.fecha)} · {etiquetaMetodo(abono.metodo)}
            {abono.referencia ? ` · ref. ${abono.referencia}` : ''}
          </p>
        </div>

        <p className="text-sm text-zinc-300 leading-relaxed">
          El abono de {C$(abono.montoNio)} del {fechaCorta(abono.fecha)} deja de contar para el saldo, pero queda en el
          comprobante, tachado, con este motivo.
        </p>

        <div className="space-y-1">
          <label htmlFor="anular-motivo" className="text-[10px] uppercase text-zinc-400 font-bold">
            Motivo (obligatorio)
          </label>
          <textarea
            id="anular-motivo"
            ref={motivoRef}
            rows={2}
            maxLength={300}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej.: se tipeó 15,000 en vez de 1,500"
            aria-invalid={errorMotivo ? true : undefined}
            aria-describedby={errorMotivo ? 'anular-motivo-error' : undefined}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 placeholder-zinc-400 resize-none focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          ></textarea>
          {errorMotivo && (
            <p id="anular-motivo-error" className="text-xs text-rose-300">
              {errorMotivo}
            </p>
          )}
        </div>

        <ul className="space-y-2 list-none">
          <li className="text-xs leading-relaxed flex gap-2 text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span className="tabular-nums">
              El saldo pasa de {C$(saldoAntes)} a {C$(saldoDespues)}.
            </span>
          </li>
          <li className="text-xs leading-relaxed flex gap-2 text-zinc-400">
            <span>
              Si el cliente tiene un comprobante con este abono, mandale el nuevo: lo muestra tachado y explica por qué.
            </span>
          </li>
        </ul>

        <AvisoError mensaje={error} />
      </div>

      <div className="p-4 bg-zinc-800/30 border-t border-zinc-800 flex flex-wrap justify-end gap-3 shrink-0">
        <button
          type="button"
          onClick={onCerrar}
          disabled={enviando}
          className="px-4 py-2 text-sm text-zinc-400 hover:text-white font-semibold rounded transition-colors disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-cyan-500"
        >
          Volver
        </button>
        <button
          type="button"
          onClick={() => void anular()}
          disabled={enviando}
          className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 focus:ring-offset-zinc-900"
        >
          {enviando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {enviando ? 'Anulando…' : error ? 'Reintentar' : 'Anular el abono'}
        </button>
      </div>
    </ModalApartado>
  );
}

// ---------------------------------------------------------------------------
// Entregar y facturar
// ---------------------------------------------------------------------------

export function DialogoEntregar({
  ap,
  onCerrar,
  onEntregar,
}: {
  ap: Apartado;
  onCerrar: () => void;
  onEntregar: () => Promise<void>;
}) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abonos = abonosVigentes(ap).length;
  const pagado = estaPagado(ap);
  const sinDireccion = TRANSPORTES_CON_ETIQUETA.includes(ap.transport || '') && !(ap.customerAddress || '').trim();

  const entregar = async () => {
    if (enviando) return;
    setEnviando(true);
    setError(null);
    try {
      await onEntregar();
    } catch (e: any) {
      setError(e?.message || 'No se pudo entregar el apartado. Revisá la conexión y reintentá.');
      setEnviando(false);
    }
  };

  return (
    <ModalApartado idTitulo="titulo-entregar" capa="z-[60]" ocupado={enviando} onCerrar={onCerrar}>
      <Encabezado
        id="titulo-entregar"
        ap={ap}
        icono={<PackageCheck className="w-5 h-5 text-emerald-400 shrink-0" aria-hidden="true" />}
        titulo="Entregar y facturar"
      />

      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
        <p className="text-sm text-zinc-200 leading-relaxed">
          Se emite la factura por <strong className="tabular-nums text-zinc-100">{C$(ap.totalNio)}</strong> a nombre de{' '}
          <strong className="text-zinc-100">{ap.customerName}</strong>, pagada en {plural(abonos, 'abono', 'abonos')}. El
          stock ya se descontó al apartar: no se descuenta de nuevo.
        </p>

        <ul className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 space-y-1 list-none">
          {(ap.items || []).map((i, idx) => (
            <li key={`${i.id}-${idx}`} className="text-sm text-zinc-200 flex justify-between gap-3">
              <span className="min-w-0">{i.name}</span>
              <span className="text-zinc-400 tabular-nums shrink-0">× {i.quantity}</span>
            </li>
          ))}
        </ul>

        {/* El recibo oficial imprime UNA forma de pago. Se dice cuál va a
            salir y dónde queda el resto, antes de que el papel lo diga. */}
        <p className="text-xs text-zinc-400 leading-relaxed">
          La factura lleva una sola forma de pago: {etiquetaMetodo(metodoPredominante(ap))}, la que más plata movió. Cada
          abono, con su referencia, va detallado en la nota.
        </p>

        {!pagado && (
          <Aviso>
            Según esta pantalla todavía falta cobrar <strong className="tabular-nums">{C$(saldoNio(ap))}</strong>. Se
            entrega con el saldo en cero: si de verdad falta, registrá el abono primero.
          </Aviso>
        )}
        {sinDireccion && (
          <Aviso>
            El envío por {ap.transport} imprime una etiqueta, y este apartado no tiene dirección: vas a tener que
            completarla a mano en el paquete.
          </Aviso>
        )}

        <AvisoError mensaje={error} />
      </div>

      <div className="p-4 bg-zinc-800/30 border-t border-zinc-800 flex flex-wrap justify-end gap-3 shrink-0">
        <button
          type="button"
          onClick={onCerrar}
          disabled={enviando}
          className="px-4 py-2 text-sm text-zinc-400 hover:text-white font-semibold rounded transition-colors disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-cyan-500"
        >
          Volver
        </button>
        <button
          type="button"
          onClick={() => void entregar()}
          disabled={enviando}
          className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {enviando ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <PackageCheck className="w-4 h-4" aria-hidden="true" />
          )}
          {enviando ? 'Emitiendo la factura…' : error ? 'Reintentar' : 'Entregar y facturar'}
        </button>
      </div>
    </ModalApartado>
  );
}

// ---------------------------------------------------------------------------
// Cancelar
// ---------------------------------------------------------------------------

/**
 * Cancelar un apartado. Cuánto se le devuelve se decide en cada caso (decisión
 * del dueño): por eso el campo es OBLIGATORIO y arranca vacío. Un default de 0
 * o de "todo" decidiría por el operador en el momento más delicado con el
 * cliente, y un Enter de más lo dejaría escrito. Tampoco es un formulario:
 * Enter no cancela nada.
 */
export function DialogoCancelar({
  ap,
  onCerrar,
  onCancelar,
}: {
  ap: Apartado;
  onCerrar: () => void;
  onCancelar: (devueltoNio: number, motivo: string) => Promise<void>;
}) {
  const [texto, setTexto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [intentado, setIntentado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const devueltoRef = useRef<HTMLInputElement>(null);

  const abonado = abonadoNio(ap);
  const devuelto = parsearMonto(texto);
  const errorDevuelto =
    devuelto === null
      ? intentado
        ? 'Escribí cuánto le devolvés. Si no le devolvés nada, poné 0.'
        : null
      : validarDevolucion(devuelto, abonado);
  const retenido = devuelto !== null && !errorDevuelto ? redondearCordobas(abonado - devuelto) : null;
  // Sólo vuelve al stock lo que está en la tienda; lo encargado que no llegó
  // nunca estuvo en el stock.
  let unidades = 0;
  let porLlegar = 0;
  partesDeApartado(ap).forEach((p) => {
    unidades += p.reservadas;
    porLlegar += p.pendiente;
  });

  const cancelar = async () => {
    if (enviando) return;
    setIntentado(true);
    if (devuelto === null || errorDevuelto) {
      devueltoRef.current?.focus();
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await onCancelar(devuelto, motivo.trim());
    } catch (e: any) {
      setError(e?.message || 'No se pudo cancelar el apartado. Revisá la conexión y reintentá.');
      setEnviando(false);
    }
  };

  const textoRetenido =
    abonado <= 0
      ? 'No hay nada abonado: no hay nada que devolver ni que retener.'
      : retenido === null
        ? 'Lo que no le devuelvas queda retenido.'
        : retenido > 0
          ? `Se retiene ${C$(retenido)}.`
          : 'Se le devuelve todo lo abonado: no se retiene nada.';

  return (
    <ModalApartado
      idTitulo="titulo-cancelar-apartado"
      capa="z-[60]"
      borde="border-rose-500/30"
      ocupado={enviando}
      onCerrar={onCerrar}
      focoInicial={devueltoRef}
    >
      <Encabezado
        id="titulo-cancelar-apartado"
        ap={ap}
        tono="text-rose-400"
        icono={<Ban className="w-5 h-5 shrink-0" aria-hidden="true" />}
        titulo="Cancelar el apartado"
      />

      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3">
          <p className="text-[10px] uppercase text-zinc-400 font-bold">Abonado</p>
          <p className="text-2xl font-bold text-zinc-100 tabular-nums break-words">{C$(abonado)}</p>
          <p className="text-xs text-zinc-400 tabular-nums mt-0.5">
            de un total de {C$(ap.totalNio)} · {plural(abonosVigentes(ap).length, 'abono', 'abonos')}
          </p>
        </div>

        <div className="space-y-1">
          <div className="flex items-end justify-between gap-2">
            <label htmlFor="cancelar-devuelto" className="text-[10px] uppercase text-zinc-400 font-bold">
              ¿Cuánto le devolvés?
            </label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setTexto('0');
                  devueltoRef.current?.focus();
                }}
                disabled={enviando}
                className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                Nada
              </button>
              <button
                type="button"
                onClick={() => {
                  setTexto(String(abonado));
                  devueltoRef.current?.focus();
                }}
                disabled={enviando}
                className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                Todo
              </button>
            </div>
          </div>
          <CampoDinero
            id="cancelar-devuelto"
            valor={texto}
            onCambio={setTexto}
            inputRef={devueltoRef}
            invalido={!!errorDevuelto}
            describedBy={errorDevuelto ? 'cancelar-devuelto-error' : undefined}
          />
          {errorDevuelto && (
            <p id="cancelar-devuelto-error" className="text-xs text-rose-300 leading-snug">
              {errorDevuelto}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="cancelar-motivo" className="text-[10px] uppercase text-zinc-400 font-bold">
            Motivo (opcional)
          </label>
          <textarea
            id="cancelar-motivo"
            rows={2}
            maxLength={300}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej.: el cliente ya no lo quiere"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 placeholder-zinc-400 resize-none focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          ></textarea>
        </div>

        {/* Qué pasa si confirmás, pegado al botón (como ConfirmarBorrado). */}
        <ul className="space-y-2 list-none">
          <li className="text-xs leading-relaxed flex gap-2 text-zinc-400">
            <span>
              {unidades === 0
                ? ''
                : unidades === 1
                  ? 'La unidad vuelve al stock y queda a la venta.'
                  : `Las ${unidades} unidades vuelven al stock y quedan a la venta.`}
              {porLlegar > 0 &&
                `${unidades > 0 ? ' ' : ''}${porLlegar === 1 ? 'La que estaba por llegar deja' : `Las ${porLlegar} que estaban por llegar dejan`} de estar encargada${porLlegar === 1 ? '' : 's'}: si llega${porLlegar === 1 ? '' : 'n'}, queda${porLlegar === 1 ? '' : 'n'} a la venta.`}
            </span>
          </li>
          <li className="text-xs leading-relaxed flex gap-2 text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span className="tabular-nums">{textoRetenido}</span>
          </li>
          <li className="text-xs leading-relaxed flex gap-2 text-rose-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>No se puede deshacer.</span>
          </li>
        </ul>

        <AvisoError mensaje={error} />
      </div>

      <div className="p-4 bg-zinc-800/30 border-t border-zinc-800 flex flex-wrap justify-end gap-3 shrink-0">
        {/* "Volver" y no "Cancelar": al lado de "Cancelar apartado", un botón
            que se llama igual y hace lo contrario es una trampa. */}
        <button
          type="button"
          onClick={onCerrar}
          disabled={enviando}
          className="px-4 py-2 text-sm text-zinc-400 hover:text-white font-semibold rounded transition-colors disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-cyan-500"
        >
          Volver
        </button>
        <button
          type="button"
          onClick={() => void cancelar()}
          disabled={enviando}
          className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 focus:ring-offset-zinc-900"
        >
          {enviando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {enviando ? 'Cancelando…' : error ? 'Reintentar' : 'Cancelar apartado'}
        </button>
      </div>
    </ModalApartado>
  );
}
