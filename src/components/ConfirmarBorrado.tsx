import React, { useRef } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';

/*
  Un solo diálogo para todo lo que se borra y no vuelve.

  Antes había dos formas de borrar en la aplicación, y la peor era la más usada.

  1. El doble clic con temporizador — Inventario, Clientes y Compras. El primer
     clic armaba el botón, que cambiaba a "¿Eliminar?", y el segundo borraba.
     Tenía tres defectos encadenados:

     · El aviso de la consecuencia («este producto tiene 12 en stock», «este
       cliente tiene 4 compras») salía como toast, en la esquina, mientras la
       decisión estaba bajo el cursor. Hay que mirar a dos lados a la vez.

     · El botón se desarmaba SOLO a los 3 segundos. Leer el aviso tarda más que
       eso, así que el sistema castigaba al que leía: volvías la vista al botón
       y ya se había desarmado. El que no leía, borraba.

     · Y no decía qué se pierde. "¿Eliminar?" es una pregunta sin objeto.

  2. El modal de Historial de Ventas, que sí hacía todo bien —resumen de lo que
     se borra, la consecuencia por escrito, foco atrapado, ESC— y que además
     protegía la acción MENOS grave de las cuatro: borrar una venta ya anulada,
     que no mueve stock.

  Este componente es el segundo, generalizado. No hay temporizador: el diálogo
  espera lo que haga falta. `autoFocus` va en el CONTENEDOR y nunca en el botón
  rojo — con el foco puesto ahí, un Enter de más borra algo.
*/

export interface ConsecuenciaBorrado {
  /** `peligro` para lo que se pierde de verdad; `aviso` para lo que hay que mirar. */
  tono: 'peligro' | 'aviso' | 'neutro';
  texto: string;
}

interface Props {
  abierto: boolean;
  /** Ej. "Eliminar producto", "Eliminar orden de compra". */
  titulo: string;
  /** Línea principal del resumen: el nombre de lo que se borra. */
  nombre: string;
  /** Segunda línea: los datos que permiten reconocerlo (fecha, monto, SKU). */
  detalle?: React.ReactNode;
  /** Lo que pasa si se confirma. Se muestran en orden, pegadas al botón. */
  consecuencias?: ConsecuenciaBorrado[];
  /** Texto del botón rojo. Por defecto dice qué se elimina. */
  textoConfirmar?: string;
  onConfirmar: () => void;
  onCancelar: () => void;
}

const TONO: Record<ConsecuenciaBorrado['tono'], string> = {
  peligro: 'text-rose-300',
  aviso: 'text-amber-400',
  neutro: 'text-zinc-400',
};

export default function ConfirmarBorrado({
  abierto,
  titulo,
  nombre,
  detalle,
  consecuencias = [],
  textoConfirmar = 'Eliminar definitivamente',
  onConfirmar,
  onCancelar,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(abierto, ref);
  useEscapeKey(abierto, onCancelar);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      {/* El telón es un blanco de clic para el mouse, no un control: sin
          `aria-hidden` un lector anuncia un clicable sin nombre justo antes
          del diálogo. El camino de teclado equivalente es ESC, que ya está. */}
      <div
        className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
        onClick={onCancelar}
        aria-hidden="true"
      ></div>

      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-confirmar-borrado"
        tabIndex={-1}
        autoFocus
        className="relative bg-zinc-900 border border-rose-500/30 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4"
      >
        <h3
          id="titulo-confirmar-borrado"
          className="text-lg font-bold text-rose-400 flex items-center gap-2"
        >
          <Trash2 className="w-5 h-5 shrink-0" aria-hidden="true" />
          {titulo}
        </h3>

        {/* Qué se borra. Sin esto la pregunta no tiene objeto. */}
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 text-sm text-zinc-200">
          <p className="font-bold break-words">{nombre}</p>
          {detalle && <p className="text-zinc-400 text-xs mt-1 tabular-nums">{detalle}</p>}
        </div>

        {/* Qué pasa si confirmás. Va acá, al lado del botón, no en un toast
            de la esquina que hay que mirar mientras se decide en otro lado. */}
        {consecuencias.length > 0 && (
          <ul className="space-y-2 list-none">
            {consecuencias.map((c, i) => (
              <li key={i} className={`text-xs leading-relaxed flex gap-2 ${TONO[c.tono]}`}>
                {c.tono !== 'neutro' && (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                )}
                <span>{c.texto}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-zinc-400 leading-relaxed">
          Esta acción no se puede deshacer.
        </p>

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onCancelar}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 focus:ring-offset-zinc-900"
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
