import React, { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { AlertTriangle } from 'lucide-react';
import type { Apartado, Customer } from '../types';
import { diasRestantes, redondearCordobas, ultimoAbonoEn, type EstadoVisible } from '../lib/apartados';
import { etiquetaApartado } from '../lib/etiquetas';
import { telefonoWhatsApp } from '../lib/utils';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';

/*
  Piezas de la pantalla de Apartados que comparten la tarjeta, el detalle y los
  diálogos de abonar, anular, entregar y cancelar.

  Están juntas por una razón concreta: el mismo apartado se lee en tres lugares
  a la vez (la tarjeta, el detalle abierto encima y el diálogo encima del
  detalle), y si cada uno armara su fecha, su estado o su teléfono por su
  cuenta, el operador vería "vence hoy" en uno y "vencido" en el otro.
*/

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

/** dd/mm/aaaa: el formato que imprime el comprobante. Pantalla y papel se leen igual. */
export const fechaCorta = (ms: number): string => new Date(ms).toLocaleDateString('es-ES');

/** Fecha y hora de un abono: la hora es lo que sirve para cuadrar la caja del día. */
export const fechaHora = (ms: number): string => format(ms, 'dd/MM/yyyy HH:mm');

export const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`;

export const unidadesDe = (ap: Pick<Apartado, 'items'>): number =>
  (ap.items || []).reduce((s, i) => s + (i.quantity || 0), 0);

export const resumenProductos = (ap: Pick<Apartado, 'items'>): string =>
  (ap.items || []).map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.name}` : i.name)).join(' · ');

/** Días calendario desde `ms` hasta hoy: 0 = hoy, 1 = ayer. */
export const diasDesde = (ms: number, ahora: number): number => Math.max(0, -diasRestantes(ms, ahora));

export const textoPagado = (dias: number): string =>
  dias === 0 ? 'pagado hoy' : dias === 1 ? 'pagado ayer' : `pagado hace ${dias} días`;

/**
 * Lo tipeado en un campo de plata, en córdobas redondeados como los imprime el
 * papel. `null` = vacío; `NaN` = no es un número. Las validaciones de
 * lib/apartados.ts reciben las dos cosas y devuelven el mensaje que corresponde.
 */
export const parsearMonto = (texto: string): number | null => {
  const t = texto.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? redondearCordobas(n) : NaN;
};

// ---------------------------------------------------------------------------
// Estado y plazo
// ---------------------------------------------------------------------------

/*
  El rótulo del badge. `activo` se dice "Pendiente": en pantalla, un activo que
  no está listo ni vencido es uno con saldo pendiente dentro del plazo, y es lo
  que el ámbar avisa. "Activo" en ámbar se leía como una alarma sin motivo. Los
  demás salen del diccionario único (lib/etiquetas.ts).
*/
export const textoEstado = (e: EstadoVisible): string => (e === 'activo' ? 'Pendiente' : etiquetaApartado(e));

const TONO_ESTADO: Record<EstadoVisible, string> = {
  activo: 'bg-amber-500/10 text-amber-500',
  vencido: 'bg-rose-500/10 text-rose-400',
  listo: 'bg-emerald-500/10 text-emerald-500',
  entregado: 'bg-zinc-800 text-zinc-300',
  cancelado: 'bg-zinc-800 text-zinc-300',
};

export function BadgeEstado({ estado }: { estado: EstadoVisible }) {
  return (
    <span
      className={`shrink-0 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${TONO_ESTADO[estado]}`}
    >
      {textoEstado(estado)}
    </span>
  );
}

/**
 * La línea de tiempo de un apartado: hasta cuándo tiene para pagar o, si ya
 * pagó, desde cuándo la tienda le debe el producto. Un `listo` no vence (ver
 * `estadoVisible`), así que su alarma es otra: los días que lleva esperando.
 */
export function plazoDe(ap: Apartado, visible: EstadoVisible, ahora: number): { texto: string; tono: string } {
  if (visible === 'entregado') {
    return { texto: `Entregado el ${fechaCorta(ap.entregadoEn ?? ap.updatedAt)}`, tono: 'text-zinc-400' };
  }
  if (visible === 'cancelado') {
    return { texto: `Cancelado el ${fechaCorta(ap.canceladoEn ?? ap.updatedAt)}`, tono: 'text-zinc-400' };
  }
  if (visible === 'listo') {
    const t = textoPagado(diasDesde(ultimoAbonoEn(ap) ?? ap.fecha, ahora));
    return { texto: t.charAt(0).toUpperCase() + t.slice(1), tono: 'text-emerald-400' };
  }
  const limite = `Fecha límite ${fechaCorta(ap.fechaLimite)}`;
  const d = diasRestantes(ap.fechaLimite, ahora);
  if (visible === 'vencido') {
    const n = Math.max(0, -d);
    return {
      texto: `${limite} · ${n === 0 ? 'venció hoy' : `vencido hace ${plural(n, 'día', 'días')}`}`,
      tono: 'text-rose-400',
    };
  }
  if (d <= 0) return { texto: `${limite} · vence hoy`, tono: 'text-amber-400' };
  if (d === 1) return { texto: `${limite} · vence mañana`, tono: 'text-amber-400' };
  return { texto: `${limite} · vence en ${d} días`, tono: 'text-zinc-400' };
}

// ---------------------------------------------------------------------------
// Teléfonos
// ---------------------------------------------------------------------------

/** El teléfono de la ficha del cliente, si el apartado tiene ficha y la ficha tiene teléfono. */
export const telefonoDeFicha = (
  ap: Pick<Apartado, 'customerId'>,
  fichas: Map<string, Customer>,
): string | undefined => {
  if (!ap.customerId) return undefined;
  const tel = (fichas.get(ap.customerId)?.phone || '').trim();
  return tel || undefined;
};

/**
 * A dónde va el WhatsApp. El apartado guarda el teléfono del día en que se
 * creó; si el cliente cambió de número en su ficha, el cobro tiene que ir al
 * nuevo (ver `buildWhatsAppApartado`). Pero sólo si el de la ficha sirve: un
 * número de la ficha mal tipeado no puede dejar sin canal a un apartado cuyo
 * teléfono sí anda.
 */
export const telefonoVigente = (
  ap: Pick<Apartado, 'customerId' | 'customerPhone'>,
  fichas: Map<string, Customer>,
): string => {
  const ficha = telefonoDeFicha(ap, fichas);
  return ficha && telefonoWhatsApp(ficha) ? ficha : ap.customerPhone;
};

/** "8888-1234" y "+505 8888 1234" son el mismo número. */
export const mismoTelefono = (a?: string, b?: string): boolean => {
  const x = telefonoWhatsApp(a);
  const y = telefonoWhatsApp(b);
  if (x && y) return x === y;
  return (a || '').replace(/\D/g, '') === (b || '').replace(/\D/g, '');
};

// ---------------------------------------------------------------------------
// Piezas visuales
// ---------------------------------------------------------------------------

export function BarraProgreso({ pct, tono, etiqueta }: { pct: number; tono: string; etiqueta: string }) {
  const ancho = Math.min(100, Math.max(0, pct));
  return (
    <div
      role="progressbar"
      aria-label={etiqueta}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ancho)}
      className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden"
    >
      <div className={`h-full rounded-full ${tono}`} style={{ width: `${ancho}%` }} />
    </div>
  );
}

/** Una cifra con su rótulo. Las cifras de plata no se recortan nunca: un monto cortado miente. */
export function Cifra({ etiqueta, valor, tono = 'text-zinc-100' }: { etiqueta: string; valor: string; tono?: string }) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 min-w-0">
      <p className="text-[10px] uppercase text-zinc-400 font-bold">{etiqueta}</p>
      <p className={`text-lg font-bold tabular-nums break-words ${tono}`}>{valor}</p>
    </div>
  );
}

/**
 * El error del último intento, adentro del diálogo donde el operador está
 * mirando (PRODUCT.md, principio 5). El aviso de la esquina se va solo hacia
 * otro lado; éste se queda hasta el próximo intento.
 */
export function AvisoError({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null;
  return (
    <div role="alert" className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-rose-300 text-xs leading-snug">{mensaje}</p>
    </div>
  );
}

export function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="text-amber-300 text-xs leading-snug">{children}</div>
    </div>
  );
}

/** Campo de plata en córdobas. */
export function CampoDinero({
  id,
  valor,
  onCambio,
  inputRef,
  invalido,
  describedBy,
}: {
  id: string;
  valor: string;
  onCambio: (v: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  invalido?: boolean;
  describedBy?: string;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-400"
      >
        C$
      </span>
      <input
        ref={inputRef}
        id={id}
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        autoComplete="off"
        placeholder="0.00"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        // Con el campo enfocado, la rueda del mouse le cambia el valor en
        // algunos navegadores: hacer scroll en el diálogo movía el monto un
        // centavo sin que nadie lo tipeara. Un monto de plata no se mueve solo.
        onWheel={(e) => e.currentTarget.blur()}
        aria-invalid={invalido || undefined}
        aria-describedby={describedBy}
        className={`w-full bg-zinc-800 border ${invalido ? 'border-rose-500/60' : 'border-zinc-700'} rounded-lg pl-11 pr-3 py-2.5 text-xl font-bold text-zinc-100 text-right tabular-nums placeholder-zinc-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// El marco de todos los diálogos de la pantalla
// ---------------------------------------------------------------------------

interface ModalProps {
  /**
   * Es el de más arriba. Tapado por otro diálogo, no atrapa el foco ni escucha
   * ESC, y queda `inert`: dos trampas de foco activas a la vez se pelean el Tab
   * y ninguna deja recorrer la suya.
   */
  activo?: boolean;
  idTitulo: string;
  /** `z-50` el detalle; `z-[60]` lo que se abre encima de él. */
  capa?: string;
  ancho?: string;
  borde?: string;
  /** Guardando: ni ESC ni el telón lo cierran a mitad de camino. */
  ocupado?: boolean;
  /** Lo que recibe el foco al abrir (si no, el contenedor). NUNCA un botón destructivo. */
  focoInicial?: React.RefObject<HTMLElement | null>;
  onCerrar: () => void;
  children: React.ReactNode;
}

export function ModalApartado({
  activo = true,
  idTitulo,
  capa = 'z-50',
  ancho = 'max-w-md',
  borde = 'border-zinc-700',
  ocupado = false,
  focoInicial,
  onCerrar,
  children,
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(activo, ref);
  useEscapeKey(activo && !ocupado, onCerrar);

  /*
    El foco entra con un efecto y no con `autoFocus`, a propósito. Estos
    diálogos se apilan (el detalle, y encima abonar o cancelar), y cuando uno
    queda tapado o se cierra, la limpieza de su trampa le devuelve el foco a la
    tarjeta de atrás. `autoFocus` corre ANTES que esas limpiezas y perdía: el
    diálogo nuevo abría con el foco en un botón tapado, y un Enter apretaba algo
    que no se ve. Un efecto corre DESPUÉS, y declarado acá —después de
    `useFocusTrap`— la trampa alcanza a anotar a quién devolverle el foco al
    cerrar antes de que se mueva.
  */
  useEffect(() => {
    if (!activo) return;
    (focoInicial?.current ?? ref.current)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo]);

  return (
    <div className={`fixed inset-0 ${capa} flex items-center justify-center p-4`} inert={!activo}>
      {/* El telón es un blanco de clic, no un control: el equivalente de teclado es ESC. */}
      <div
        className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
        onClick={ocupado ? undefined : onCerrar}
        aria-hidden="true"
      ></div>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className={`relative bg-zinc-900 border ${borde} rounded-2xl w-full ${ancho} max-h-[90vh] shadow-2xl overflow-hidden flex flex-col`}
      >
        {children}
      </div>
    </div>
  );
}
