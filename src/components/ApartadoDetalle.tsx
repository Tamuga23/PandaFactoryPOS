import { useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  FileText,
  HandCoins,
  Loader2,
  MessageCircle,
  PackageCheck,
  Printer,
  X,
} from 'lucide-react';
import type { AbonoApartado, Apartado } from '../types';
import {
  aFechaInput,
  abonadoNio,
  estadoVisible,
  finDelDia,
  progresoPct,
  redondearCordobas,
  saldoNio,
  validarTelefono,
} from '../lib/apartados';
import { etiquetaMetodo } from '../lib/etiquetas';
import { formatCurrencyNIO, telefonoWhatsApp } from '../lib/utils';
import {
  AvisoError,
  BadgeEstado,
  BarraProgreso,
  Cifra,
  ModalApartado,
  fechaCorta,
  fechaHora,
  mismoTelefono,
  plazoDe,
  plural,
  unidadesDe,
} from './ApartadoPiezas';

/*
  El detalle de un apartado: la cuenta, lo que se llevó, cada abono (los
  anulados también, tachados y con su motivo, igual que en el papel) y lo poco
  que se edita después de apartar.

  Queda abierto DEBAJO de los diálogos que abre (abonar, anular, entregar,
  cancelar) y de los comprobantes: al cerrarlos se vuelve acá, con la cuenta ya
  actualizada. Mientras algo lo tapa, `activo` es false y el marco lo deja
  `inert` (ver ModalApartado).

  Lo editable es lo que las reglas dejan tocar: el teléfono, la fecha límite
  (sólo si está activo) y la nota. Lo pactado —líneas, total, tasa— no se toca.
*/

const C$ = formatCurrencyNIO;

export interface CambiosApartado {
  fechaLimite?: number;
  notes?: string;
  customerPhone?: string;
}

interface Props {
  ap: Apartado;
  ahora: number;
  /** Es el diálogo de más arriba (nada lo tapa). */
  activo: boolean;
  /** El teléfono de la ficha del cliente, si tiene ficha y la ficha tiene teléfono. */
  telefonoFicha?: string;
  buscandoFactura: boolean;
  onCerrar: () => void;
  onAbonar: () => void;
  onAnular: (abono: AbonoApartado) => void;
  onEntregar: () => void;
  onCancelar: () => void;
  onComprobante: () => void;
  onRecordatorio: () => void;
  onVerFactura: () => void;
  /** Lanza con el mensaje para el operador. */
  onGuardar: (cambios: CambiosApartado) => Promise<void>;
}

export default function ApartadoDetalle({
  ap,
  ahora,
  activo,
  telefonoFicha,
  buscandoFactura,
  onCerrar,
  onAbonar,
  onAnular,
  onEntregar,
  onCancelar,
  onComprobante,
  onRecordatorio,
  onVerFactura,
  onGuardar,
}: Props) {
  const visible = estadoVisible(ap, ahora);
  const abierto = ap.status === 'activo';
  const conSaldo = visible === 'activo' || visible === 'vencido';
  const abonado = abonadoNio(ap);
  const saldo = saldoNio(ap);
  const devuelto = ap.devueltoNio ?? 0;
  const plazo = plazoDe(ap, visible, ahora);
  const tasa = ap.exchangeRate;
  const anulaciones = new Map((ap.anulaciones || []).map((x) => [x.abonoId, x]));
  const primaId = ap.abonos?.[0]?.id;

  /*
    Edición. `null` = sin tocar, y el campo muestra el valor VIVO: si otro
    equipo cambia el teléfono mientras el detalle está abierto, se ve el nuevo
    en vez de un valor congelado al abrir que después parecería un cambio
    propio sin guardar.
  */
  const [tel, setTel] = useState<string | null>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [pidiendoCerrar, setPidiendoCerrar] = useState(false);

  const telVivo = ap.customerPhone || '';
  const fechaViva = aFechaInput(ap.fechaLimite);
  const notaViva = ap.notes || '';
  const telCambio = tel !== null && tel.trim() !== telVivo.trim();
  const fechaCambio = abierto && fecha !== null && fecha !== fechaViva;
  const notaCambio = nota !== null && nota.trim() !== notaViva.trim();
  const hayCambios = telCambio || fechaCambio || notaCambio;

  const errorTel = telCambio && tel !== null ? validarTelefono(tel) : null;
  const fechaNueva = fechaCambio && fecha !== null ? finDelDia(fecha) : null;
  const errorFecha = !fechaCambio
    ? null
    : fechaNueva === null
      ? 'Elegí una fecha válida.'
      : fechaNueva < ap.fecha
        ? 'La fecha límite no puede ser anterior al día en que se apartó.'
        : null;
  // Un listo no vence: el aviso sólo tiene sentido si queda saldo.
  const avisoFecha =
    fechaCambio && !errorFecha && fechaNueva !== null && fechaNueva < ahora && saldo > 0
      ? 'Con esa fecha el apartado queda vencido.'
      : null;

  // La ficha del cliente tiene OTRO número: los mensajes van a ése si sirve.
  const fichaDistinta = !!telefonoFicha && !mismoTelefono(telefonoFicha, tel ?? telVivo);
  const fichaSirve = !!telefonoFicha && !!telefonoWhatsApp(telefonoFicha);

  const guardar = async (): Promise<boolean> => {
    if (!hayCambios) return true;
    if (errorTel || errorFecha || guardando) return false;
    const cambios: CambiosApartado = {};
    if (telCambio && tel !== null) cambios.customerPhone = tel.trim();
    if (fechaCambio && fechaNueva !== null) cambios.fechaLimite = fechaNueva;
    if (notaCambio && nota !== null) cambios.notes = nota.trim();
    setGuardando(true);
    setErrorGuardar(null);
    try {
      await onGuardar(cambios);
      setTel(null);
      setFecha(null);
      setNota(null);
      setPidiendoCerrar(false);
      return true;
    } catch (e: any) {
      setErrorGuardar(e?.message || 'No se pudieron guardar los cambios. Revisá la conexión y reintentá.');
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const descartar = () => {
    setTel(null);
    setFecha(null);
    setNota(null);
    setErrorGuardar(null);
    setPidiendoCerrar(false);
  };

  /*
    Cerrar con cambios sin guardar pregunta en vez de tirarlos. Tres caminos
    cierran este diálogo (la X, ESC y el telón), y en el Catálogo Maestro cuatro
    caminos parecidos tiraban el formulario sin aviso. Sin temporizador: la
    pregunta espera lo que haga falta.
  */
  const pedirCerrar = () => {
    if (guardando) return;
    if (hayCambios) {
      setPidiendoCerrar(true);
      return;
    }
    onCerrar();
  };

  const guardarYCerrar = async () => {
    if (await guardar()) onCerrar();
  };

  const tonoSaldo =
    saldo < 0 ? 'text-rose-400' : visible === 'listo' || visible === 'entregado' ? 'text-emerald-400' : 'text-cyan-400';
  // Un saldo negativo es un dato corrupto (más abonado que el total): se
  // muestra tal cual para que el problema se vea, no se tapa con "Pagado".
  const valorSaldo = saldo < 0 ? C$(saldo) : saldo === 0 ? 'Pagado' : C$(saldo);

  return (
    <ModalApartado
      activo={activo}
      idTitulo="titulo-detalle-apartado"
      ancho="max-w-3xl"
      ocupado={guardando}
      onCerrar={pedirCerrar}
    >
      <div className="p-5 border-b border-zinc-800 flex items-start justify-between gap-4 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 id="titulo-detalle-apartado" className="text-lg font-bold text-zinc-100 tabular-nums">
              {ap.numero}
            </h3>
            <BadgeEstado estado={visible} />
          </div>
          <p className="text-sm font-semibold text-zinc-200 truncate mt-0.5">{ap.customerName}</p>
          <p className="text-xs text-zinc-400 mt-0.5">
            Apartado el {fechaCorta(ap.fecha)} · {plural(unidadesDe(ap), 'unidad', 'unidades')}
          </p>
        </div>
        <button
          type="button"
          onClick={pedirCerrar}
          aria-label="Cerrar el detalle del apartado"
          className="p-2 bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-6 custom-scrollbar">
        {/* La cuenta */}
        <section aria-label="Cuenta del apartado" className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Cifra etiqueta="Total" valor={C$(ap.totalNio)} />
            <Cifra etiqueta="Abonado" valor={C$(abonado)} />
            {ap.status === 'cancelado' ? (
              <Cifra etiqueta="Devuelto" valor={C$(devuelto)} tono="text-zinc-200" />
            ) : (
              <Cifra etiqueta="Saldo" valor={valorSaldo} tono={tonoSaldo} />
            )}
          </div>
          <BarraProgreso
            pct={progresoPct(ap)}
            tono={
              ap.status === 'cancelado'
                ? 'bg-zinc-600'
                : visible === 'listo' || visible === 'entregado'
                  ? 'bg-emerald-500'
                  : 'bg-cyan-500'
            }
            etiqueta={`Pagado el ${Math.round(progresoPct(ap))}% del total`}
          />
          <p className={`text-xs flex items-center gap-1.5 ${plazo.tono}`}>
            <CalendarClock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            {plazo.texto}
          </p>

          {ap.status === 'entregado' && (
            <p className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 text-sm text-zinc-300">
              Entregado el {fechaCorta(ap.entregadoEn ?? ap.updatedAt)}
              {ap.invoiceNumber ? (
                <>
                  {' '}con la factura <strong className="text-zinc-100">{ap.invoiceNumber}</strong>
                </>
              ) : null}
              .
            </p>
          )}
          {ap.status === 'cancelado' && (
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 text-sm text-zinc-300 space-y-1">
              <p className="tabular-nums">
                Cancelado el {fechaCorta(ap.canceladoEn ?? ap.updatedAt)}. Se le devolvió{' '}
                <strong className="text-zinc-100">{C$(devuelto)}</strong> y se retuvo{' '}
                <strong className="text-zinc-100">{C$(redondearCordobas(abonado - devuelto))}</strong>.
              </p>
              {ap.motivoCancelacion && <p className="text-xs text-zinc-400">Motivo: {ap.motivoCancelacion}</p>}
            </div>
          )}
          {saldo < 0 && (
            <p className="text-xs text-rose-300 leading-relaxed">
              Hay más abonado que el total del apartado. Revisá los abonos: si uno se cargó dos veces, anulalo.
            </p>
          )}
        </section>

        {/* Productos */}
        <section aria-labelledby="detalle-productos">
          <h4 id="detalle-productos" className="text-[10px] uppercase font-bold text-zinc-400 mb-2">
            Productos
          </h4>
          <div className="overflow-x-auto border border-zinc-800 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-zinc-800/50 text-[10px] uppercase text-zinc-400 font-bold">
                <tr>
                  <th scope="col" className="text-left px-3 py-2">Producto</th>
                  <th scope="col" className="text-right px-3 py-2">Cant.</th>
                  <th scope="col" className="text-right px-3 py-2">Precio</th>
                  <th scope="col" className="text-right px-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {(ap.items || []).map((i, idx) => (
                  <tr key={`${i.id}-${idx}`}>
                    <td className="px-3 py-2 text-zinc-200">
                      <span className="block">{i.name}</span>
                      {i.sku && <span className="block text-[11px] text-zinc-400">{i.sku}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{i.quantity}</td>
                    {/* `price × tasa`: la misma cuenta del comprobante y de la factura. */}
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-300 whitespace-nowrap">
                      {C$(i.price * tasa)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-100 font-semibold whitespace-nowrap">
                      {C$(i.price * tasa * i.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-zinc-800">
                {(ap.shipping || 0) > 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-1.5 text-right text-xs text-zinc-400">Envío</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-zinc-300 whitespace-nowrap">
                      +{C$(ap.shipping || 0)}
                    </td>
                  </tr>
                )}
                {(ap.discount || 0) > 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-1.5 text-right text-xs text-zinc-400">Descuento</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-zinc-300 whitespace-nowrap">
                      −{C$(ap.discount || 0)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right text-xs font-bold uppercase text-zinc-400">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-zinc-100 whitespace-nowrap">
                    {C$(ap.totalNio)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Abonos */}
        <section aria-labelledby="detalle-abonos">
          <h4 id="detalle-abonos" className="text-[10px] uppercase font-bold text-zinc-400 mb-2">
            Abonos
          </h4>
          <ul className="border border-zinc-800 rounded-lg divide-y divide-zinc-800 list-none">
            {(ap.abonos || []).map((a) => {
              const anulacion = anulaciones.get(a.id);
              return (
                <li key={a.id} className="px-3 py-2.5 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 flex items-center gap-2 flex-wrap">
                      <span className={anulacion ? 'line-through text-zinc-400' : ''}>{etiquetaMetodo(a.metodo)}</span>
                      {a.id === primaId && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                          Prima
                        </span>
                      )}
                      {anulacion && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400">
                          Anulado
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-zinc-400 tabular-nums mt-0.5">
                      {fechaHora(a.fecha)}
                      {a.referencia ? ` · ref. ${a.referencia}` : ''}
                    </p>
                    {anulacion && (
                      <p className="text-[11px] text-rose-300 mt-0.5 leading-snug">
                        Anulado el {fechaCorta(anulacion.fecha)}: {anulacion.motivo}
                      </p>
                    )}
                  </div>
                  <p
                    className={`text-sm font-bold tabular-nums text-right whitespace-nowrap ${
                      anulacion ? 'line-through text-zinc-400' : 'text-zinc-100'
                    }`}
                  >
                    {C$(a.montoNio)}
                  </p>
                  {abierto && !anulacion && (
                    <button
                      type="button"
                      onClick={() => onAnular(a)}
                      aria-label={`Anular el abono de ${C$(a.montoNio)} del ${fechaCorta(a.fecha)}`}
                      className="shrink-0 px-2 py-1 text-xs font-semibold text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-rose-500"
                    >
                      Anular
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Datos editables */}
        <section aria-labelledby="detalle-datos" className="space-y-3">
          <h4 id="detalle-datos" className="text-[10px] uppercase font-bold text-zinc-400">
            Datos del apartado
          </h4>

          {(ap.transport || ap.customerAddress || ap.customerEmail) && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {ap.transport && (
                <div>
                  <dt className="inline text-zinc-400">Transporte: </dt>
                  <dd className="inline text-zinc-200">{ap.transport}</dd>
                </div>
              )}
              {ap.customerEmail && (
                <div>
                  <dt className="inline text-zinc-400">Correo: </dt>
                  <dd className="inline text-zinc-200 break-all">{ap.customerEmail}</dd>
                </div>
              )}
              {ap.customerAddress && (
                <div className="sm:col-span-2">
                  <dt className="inline text-zinc-400">Dirección: </dt>
                  <dd className="inline text-zinc-200">{ap.customerAddress}</dd>
                </div>
              )}
            </dl>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="detalle-telefono" className="text-[10px] uppercase text-zinc-400 font-bold">
                Teléfono de contacto
              </label>
              <input
                id="detalle-telefono"
                type="tel"
                value={tel ?? telVivo}
                onChange={(e) => {
                  setTel(e.target.value);
                  setPidiendoCerrar(false);
                }}
                maxLength={50}
                autoComplete="off"
                aria-invalid={errorTel ? true : undefined}
                aria-describedby={errorTel ? 'detalle-telefono-error' : undefined}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 tabular-nums focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />
              {errorTel && (
                <p id="detalle-telefono-error" className="text-xs text-rose-300 leading-snug">
                  {errorTel}
                </p>
              )}
            </div>
            <div className="space-y-1">
              {abierto ? (
                <>
                  <label htmlFor="detalle-fecha-limite" className="text-[10px] uppercase text-zinc-400 font-bold">
                    Fecha límite de pago
                  </label>
                  <input
                    id="detalle-fecha-limite"
                    type="date"
                    value={fecha ?? fechaViva}
                    min={aFechaInput(ap.fecha)}
                    onChange={(e) => {
                      setFecha(e.target.value);
                      setPidiendoCerrar(false);
                    }}
                    aria-invalid={errorFecha ? true : undefined}
                    aria-describedby={errorFecha || avisoFecha ? 'detalle-fecha-aviso' : undefined}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 [color-scheme:dark] focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  />
                  {(errorFecha || avisoFecha) && (
                    <p
                      id="detalle-fecha-aviso"
                      className={`text-xs leading-snug ${errorFecha ? 'text-rose-300' : 'text-amber-400'}`}
                    >
                      {errorFecha || avisoFecha}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[10px] uppercase text-zinc-400 font-bold">Fecha límite de pago</p>
                  <p className="text-sm text-zinc-300 py-2 tabular-nums">{fechaCorta(ap.fechaLimite)}</p>
                </>
              )}
            </div>
          </div>

          {fichaDistinta && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
              <p className="flex-1 min-w-[12rem] text-xs text-amber-300 leading-snug">
                {fichaSirve ? (
                  <>
                    La ficha de {ap.customerName} tiene otro teléfono: <strong className="tabular-nums">{telefonoFicha}</strong>.
                    Los recordatorios y comprobantes por WhatsApp van a ése.
                  </>
                ) : (
                  <>
                    La ficha de {ap.customerName} tiene otro teléfono ({telefonoFicha}), pero no sirve para WhatsApp: los
                    mensajes van al de este apartado.
                  </>
                )}
              </p>
              {fichaSirve && (
                <button
                  type="button"
                  onClick={() => {
                    setTel(telefonoFicha ?? null);
                    setPidiendoCerrar(false);
                  }}
                  className="shrink-0 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white text-[11px] font-bold rounded-lg transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500"
                >
                  Usar el de la ficha
                </button>
              )}
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="detalle-nota" className="text-[10px] uppercase text-zinc-400 font-bold">
              Nota
            </label>
            <textarea
              id="detalle-nota"
              rows={2}
              maxLength={2000}
              value={nota ?? notaViva}
              onChange={(e) => {
                setNota(e.target.value);
                setPidiendoCerrar(false);
              }}
              aria-describedby="detalle-nota-ayuda"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 resize-none focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            ></textarea>
            <p id="detalle-nota-ayuda" className="text-[11px] text-zinc-400">
              {ap.status === 'entregado'
                ? 'La factura ya se emitió: un cambio acá sale sólo en el comprobante.'
                : 'La ve el cliente: sale en el comprobante y en la factura.'}
            </p>
          </div>

          <AvisoError mensaje={errorGuardar} />

          {hayCambios && !pidiendoCerrar && (
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={descartar}
                disabled={guardando}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white font-semibold rounded transition-colors disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={() => void guardar()}
                disabled={guardando || !!errorTel || !!errorFecha}
                className="px-5 py-2 bg-cyan-700 hover:bg-cyan-800 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                {guardando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                {guardando ? 'Guardando…' : errorGuardar ? 'Reintentar' : 'Guardar cambios'}
              </button>
            </div>
          )}
        </section>
      </div>

      <div className="p-4 border-t border-zinc-800 bg-zinc-800/30 flex flex-wrap items-center gap-2 shrink-0">
        {pidiendoCerrar && (
          <div
            role="alert"
            className="w-full flex flex-wrap items-center gap-x-3 gap-y-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-1"
          >
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
            <p className="flex-1 min-w-[12rem] text-xs text-amber-300">Hay cambios sin guardar en los datos del apartado.</p>
            <button
              type="button"
              onClick={() => {
                descartar();
                onCerrar();
              }}
              disabled={guardando}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white font-semibold rounded transition-colors disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              Cerrar sin guardar
            </button>
            <button
              type="button"
              onClick={() => void guardarYCerrar()}
              disabled={guardando || !!errorTel || !!errorFecha}
              className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {guardando ? 'Guardando…' : 'Guardar y cerrar'}
            </button>
          </div>
        )}

        {/* Rosa en dos escalones: éste es el disparador teñido; el sólido vive
            en el diálogo que pide cuánto se devuelve. */}
        {abierto && (
          <button
            type="button"
            onClick={onCancelar}
            className="mr-auto px-3 py-2 bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/30 text-rose-400 text-sm font-bold rounded-lg transition-colors flex items-center gap-2 focus:outline-none focus:ring-1 focus:ring-rose-500"
          >
            <Ban className="w-4 h-4" aria-hidden="true" />
            Cancelar apartado
          </button>
        )}

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onComprobante}
            className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <Printer className="w-4 h-4" aria-hidden="true" />
            Comprobante
          </button>
          {conSaldo && (
            <button
              type="button"
              onClick={onRecordatorio}
              className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <MessageCircle className="w-4 h-4" aria-hidden="true" />
              Recordatorio
            </button>
          )}
          {ap.status === 'entregado' && (
            <button
              type="button"
              onClick={onVerFactura}
              disabled={buscandoFactura}
              className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {buscandoFactura ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileText className="w-4 h-4" aria-hidden="true" />
              )}
              Ver factura
            </button>
          )}
          {conSaldo && (
            <button
              type="button"
              onClick={onAbonar}
              className="px-4 py-2 bg-cyan-700 hover:bg-cyan-800 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <HandCoins className="w-4 h-4" aria-hidden="true" />
              Abonar
            </button>
          )}
          {visible === 'listo' && (
            <button
              type="button"
              onClick={onEntregar}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <PackageCheck className="w-4 h-4" aria-hidden="true" />
              Entregar y facturar
            </button>
          )}
        </div>
      </div>
    </ModalApartado>
  );
}
