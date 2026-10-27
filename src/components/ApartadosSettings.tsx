import React, { useEffect, useState } from 'react';
import { HandCoins, Save, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useStore } from '../context/StoreContext';
import { toast } from './Toast';
import { fechaLimiteDesde, primaMinimaNio } from '../lib/apartados';
import { formatCurrencyNIO } from '../lib/utils';

/**
 * La política de apartados (doc `config/apartados`): prima mínima y plazo.
 *
 * No lee el doc por su cuenta, a diferencia de `FinanciamientoSettings`: la
 * política ya llega en vivo por `useStore()`, que es de donde la toma el POS al
 * apartar. Una lectura aparte podía mostrar acá un número distinto del que el
 * POS está aplicando, y el operador no tendría cómo saber cuál vale.
 *
 * Los dos números rigen para los apartados NUEVOS. Uno que ya existe conserva
 * su fecha límite (se mueve a mano, apartado por apartado) y su prima ya se
 * cobró: cambiar la política no reescribe nada hacia atrás.
 */

/** Total del ejemplo de abajo: redondo, para que el porcentaje se lea solo. */
const TOTAL_EJEMPLO_NIO = 10000;

export default function ApartadosSettings() {
  const { configApartados, guardarConfigApartados } = useStore();
  const [prima, setPrima] = useState(String(configApartados.primaMinimaPct));
  const [plazo, setPlazo] = useState(String(configApartados.plazoDias));
  /*
    Hasta que el operador escribe, el formulario sigue a la política en vivo. El
    snapshot puede llegar después del primer render —y entonces se vería el
    default de fábrica, 0% y 30 días, como si fuera lo guardado— o cambiar desde
    otra sesión. Una vez que escribe, no se le pisa lo que está tipeando.
  */
  const [tocado, setTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (tocado) return;
    setPrima(String(configApartados.primaMinimaPct));
    setPlazo(String(configApartados.plazoDias));
  }, [configApartados.primaMinimaPct, configApartados.plazoDias, tocado]);

  // Los mismos límites que `ConfigApartadosSchema` y las reglas, dichos en
  // castellano antes de que Zod los rechace con su mensaje genérico. Un campo
  // vacío no es 0: `Number('')` da 0 y guardaría "sin mínimo" sin que nadie lo
  // haya escrito.
  const pct = prima.trim() === '' ? NaN : Number(prima);
  const dias = plazo.trim() === '' ? NaN : Number(plazo);
  const errorPrima = Number.isFinite(pct) && pct >= 0 && pct <= 100
    ? null
    : 'La prima mínima es un porcentaje entre 0 y 100. Poné 0 para no pedir mínimo.';
  const errorPlazo = Number.isInteger(dias) && dias >= 1 && dias <= 365
    ? null
    : 'El plazo es una cantidad entera de días, entre 1 y 365.';

  const guardar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const error = errorPrima || errorPlazo;
    if (error) {
      toast.error(error);
      return;
    }
    setGuardando(true);
    try {
      await guardarConfigApartados({ primaMinimaPct: pct, plazoDias: dias });
      setTocado(false);
      toast.success(
        'Política de apartados guardada. Rige para los apartados nuevos: los que ya existen conservan su fecha límite.',
      );
    } catch (err: any) {
      toast.error(
        err?.message || 'No se pudo guardar la política de apartados. Revisá la conexión y probá de nuevo.',
      );
    } finally {
      setGuardando(false);
    }
  };

  // El ejemplo sale de lo TIPEADO, no de lo guardado: sirve para ver qué va a
  // pasar antes de apretar Guardar. `primaMinimaNio` es la misma función que
  // valida la prima en el POS, así que el número de acá es el que se va a exigir.
  const ejemplo = errorPrima || errorPlazo ? null : (
    <>
      Apartando hoy, la fecha límite propuesta sería el{' '}
      <strong className="text-zinc-200 font-semibold">
        {format(fechaLimiteDesde(Date.now(), dias), "EEEE d 'de' MMMM", { locale: es })}
      </strong>
      {' '}y, en un apartado de {formatCurrencyNIO(TOTAL_EJEMPLO_NIO)},{' '}
      {pct > 0 ? (
        <>
          la prima mínima sería{' '}
          <strong className="text-cyan-400 font-semibold tabular-nums">
            {formatCurrencyNIO(primaMinimaNio(TOTAL_EJEMPLO_NIO, pct))}
          </strong>.
        </>
      ) : (
        'cualquier prima mayor que cero reserva el producto.'
      )}
    </>
  );

  // Sin el anillo de foco: va escrito en cada campo, porque `npm run medir:foco`
  // lee las clases literales y no ve a través de una constante.
  const campo =
    'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 tabular-nums';

  return (
    <form
      onSubmit={guardar}
      aria-labelledby="titulo-config-apartados"
      className="bg-zinc-900 border border-zinc-800 rounded-xl p-6"
    >
      <div className="flex items-start justify-between gap-4 mb-1">
        <h2 id="titulo-config-apartados" className="text-xl font-bold text-white flex items-center gap-2">
          <HandCoins className="w-5 h-5 text-cyan-400" aria-hidden="true" />
          Apartados
        </h2>
        <button
          type="submit"
          disabled={guardando}
          className="bg-cyan-700 hover:bg-cyan-800 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-zinc-900 flex items-center gap-2 transition-colors shrink-0"
        >
          {guardando
            ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            : <Save className="w-4 h-4" aria-hidden="true" />}
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      <p className="text-zinc-400 text-sm">
        El cliente reserva productos dejando una prima y paga el resto en abonos. El producto sale del
        stock al apartar y se entrega <b className="text-zinc-300">con todo pagado</b>.
      </p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="cfg-apartados-prima" className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
            Prima mínima (% del total)
          </label>
          <input
            id="cfg-apartados-prima"
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="any"
            value={prima}
            onChange={(e) => { setPrima(e.target.value); setTocado(true); }}
            aria-describedby="cfg-apartados-prima-ayuda"
            aria-invalid={!!errorPrima}
            className={`${campo} focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500`}
          />
          <p id="cfg-apartados-prima-ayuda" className="text-xs text-zinc-400 mt-1">
            0 = sin mínimo: cualquier prima mayor que cero.
          </p>
        </div>
        <div>
          <label htmlFor="cfg-apartados-plazo" className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
            Plazo para completar el pago (días)
          </label>
          <input
            id="cfg-apartados-plazo"
            type="number"
            inputMode="numeric"
            min="1"
            max="365"
            step="1"
            value={plazo}
            onChange={(e) => { setPlazo(e.target.value); setTocado(true); }}
            aria-describedby="cfg-apartados-plazo-ayuda"
            aria-invalid={!!errorPlazo}
            className={`${campo} focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500`}
          />
          <p id="cfg-apartados-plazo-ayuda" className="text-xs text-zinc-400 mt-1">
            La fecha límite que se propone al apartar. En cada apartado se puede mover.
          </p>
        </div>
      </div>

      {ejemplo && (
        <p className="mt-5 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-400 leading-relaxed">
          {ejemplo}
        </p>
      )}
    </form>
  );
}
