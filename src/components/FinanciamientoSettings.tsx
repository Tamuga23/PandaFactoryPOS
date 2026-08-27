import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { CreditCard, Save, Loader2, Percent, AlertTriangle } from 'lucide-react';
import { db } from '../lib/db';
import { SPECS_POR_CATEGORIA } from '../lib/categorySpecs';
import {
  CONFIG_FINANCIAMIENTO_DEFAULT,
  calcularPlanes,
  normalizarConfig,
  todosSinInteres,
  type ConfigFinanciamiento,
} from '../lib/financiamiento';
import { ConfigFinanciamientoSchema } from '../lib/validations';

/**
 * Editor de las reglas de financiamiento a plazos (doc `config/financiamiento`).
 *
 * Qué controla: el recargo que se le suma al precio SOLO cuando el cliente elige
 * pagar en cuotas. El precio de lista no se toca nunca — es el mismo que paga
 * quien no financia.
 *
 * Lo que el banco le cobra a la tienda (6% a 3 meses, 9% a 6) NO se edita acá a
 * propósito: este doc lo leen la tablet y la web, así que no puede contener
 * datos de costo. Ese número vive en `npm run financiamiento`, que corre con
 * Admin SDK y nunca llega al navegador.
 */

// Nombres visibles de las categorías. Las claves salen del catálogo compartido,
// así que agregar una categoría en categorySpecs.ts la hace aparecer acá sola.
const NOMBRES: Record<string, string> = {
  proyector: 'Proyectores',
  smartwatch: 'Smartwatches',
  camara: 'Cámaras de seguridad',
  dashcam: 'Dashcams',
  parlante: 'Parlantes',
  smarthome: 'Smart home',
  smarttv: 'Smart TV y streaming',
};

const CATEGORIAS = Object.keys(SPECS_POR_CATEGORIA);

/** Precio de ejemplo de la vista previa. */
const PRECIO_DEMO = 200;

type Notificar = (mensaje: string, tipo: 'success' | 'error' | 'info') => void;

export default function FinanciamientoSettings({
  tasaCambio,
  notificar,
}: {
  tasaCambio: number;
  notificar: Notificar;
}) {
  const [config, setConfig] = useState<ConfigFinanciamiento>(CONFIG_FINANCIAMIENTO_DEFAULT);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [precioDemo, setPrecioDemo] = useState<number | string>(PRECIO_DEMO);

  useEffect(() => {
    getDoc(doc(db, 'config', 'financiamiento'))
      .then((snap) => {
        // Sin doc todavía: se arranca del default y se crea al guardar.
        if (snap.exists()) setConfig(normalizarConfig(snap.data()));
      })
      .catch(() => notificar('No se pudieron leer las reglas de financiamiento.', 'error'))
      .finally(() => setCargando(false));
    // notificar es estable en la práctica; no se re-suscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plazos = config.plazos;

  /** Recargo efectivo de una categoría en un plazo (0 si tiene regla propia en 0). */
  const recargoDe = (slug: string | null, meses: number): number => {
    const propio = slug ? config.porCategoria?.[slug]?.recargo?.[String(meses)] : undefined;
    return Number(propio ?? config.recargoPorDefecto[String(meses)] ?? 0) || 0;
  };

  const setRecargo = (slug: string | null, meses: number, valor: string) => {
    const n = valor === '' ? 0 : Number(valor);
    if (!Number.isFinite(n) || n < 0 || n > 100) return;
    setConfig((prev) => {
      if (slug === null) {
        return { ...prev, recargoPorDefecto: { ...prev.recargoPorDefecto, [String(meses)]: n } };
      }
      const porCategoria = { ...(prev.porCategoria ?? {}) };
      const regla = { ...(porCategoria[slug] ?? {}) };
      // Al fijar un recargo propio hay que materializar TODOS los plazos: si se
      // deja uno sin definir, hereda el default y la categoría queda a medias.
      const recargo: Record<string, number> = { ...(regla.recargo ?? {}) };
      for (const m of prev.plazos) {
        if (recargo[String(m)] === undefined) recargo[String(m)] = recargoDe(slug, m);
      }
      recargo[String(meses)] = n;
      porCategoria[slug] = { ...regla, recargo };
      return { ...prev, porCategoria };
    });
  };

  /** Pone la categoría en 0% en todos los plazos, o la devuelve al default. */
  const toggleSinInteres = (slug: string, activar: boolean) => {
    setConfig((prev) => {
      const porCategoria = { ...(prev.porCategoria ?? {}) };
      if (activar) {
        const recargo: Record<string, number> = {};
        for (const m of prev.plazos) recargo[String(m)] = 0;
        porCategoria[slug] = { ...(porCategoria[slug] ?? {}), recargo };
      } else {
        const regla = { ...(porCategoria[slug] ?? {}) };
        delete regla.recargo;
        if (Object.keys(regla).length === 0) delete porCategoria[slug];
        else porCategoria[slug] = regla;
      }
      return { ...prev, porCategoria };
    });
  };

  const esSinInteres = (slug: string) => plazos.every((m) => recargoDe(slug, m) === 0);

  // Vista previa: exactamente lo que van a calcular PandaLink y PandaWEB, porque
  // usa el MISMO módulo compartido.
  const preview = useMemo(() => {
    const precio = Number(precioDemo);
    if (!Number.isFinite(precio) || precio <= 0) return [];
    return CATEGORIAS.map((slug) => ({
      slug,
      nombre: NOMBRES[slug] ?? slug,
      planes: calcularPlanes(precio, tasaCambio, { config, categoria: slug }),
    }));
  }, [precioDemo, config, tasaCambio]);

  const guardar = async () => {
    const paraGuardar = { ...config, actualizadoEn: Date.now() };
    const parsed = ConfigFinanciamientoSchema.safeParse(paraGuardar);
    if (!parsed.success) {
      notificar(
        `Reglas inválidas — ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        'error',
      );
      return;
    }
    setGuardando(true);
    try {
      await setDoc(doc(db, 'config', 'financiamiento'), paraGuardar);
      notificar('Reglas de financiamiento guardadas. La tablet las toma al instante; la web, en 15 min.', 'success');
    } catch {
      notificar('No se pudo guardar. ¿Desplegaste firestore.rules con la colección `config`?', 'error');
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex items-center gap-3 text-zinc-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando reglas de financiamiento…
      </div>
    );
  }

  const cordobas = (n: number) => `C$${n.toLocaleString('es-NI')}`;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-cyan-400" />
          Financiamiento a plazos
        </h2>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-zinc-950 font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shrink-0"
        >
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar reglas
        </button>
      </div>
      <p className="text-zinc-400 text-sm">
        El recargo se suma <b className="text-zinc-300">solo si el cliente paga en cuotas</b>. El precio
        de lista no cambia: es el mismo que paga quien no financia.
      </p>

      {/* --- Parámetros generales --- */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Monto mínimo para ofrecer cuotas (USD)
          </label>
          <input
            type="number"
            min="0"
            step="any"
            value={config.minUsd}
            onChange={(e) => setConfig({ ...config, minUsd: Number(e.target.value) || 0 })}
            className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-cyan-500 outline-none"
          />
          <p className="text-xs text-zinc-500 mt-1">Debajo de este monto no se muestran cuotas en ningún lado.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Banco</label>
          <input
            type="text"
            value={config.banco}
            onChange={(e) => setConfig({ ...config, banco: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-cyan-500 outline-none"
          />
        </div>
      </div>

      {/* --- Recargo por categoría --- */}
      <div className="mt-8 border-t border-zinc-800/50 pt-6">
        <h3 className="text-md font-medium text-cyan-400 mb-1">Recargo por categoría</h3>
        <p className="text-xs text-zinc-500 mb-4">
          Poné 0 en los dos plazos, o marcá &ldquo;0% interés&rdquo;, para que la categoría se anuncie
          como financiamiento sin interés.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-xs uppercase tracking-wide">
                <th className="text-left font-medium pb-2">Categoría</th>
                {plazos.map((m) => (
                  <th key={m} className="text-center font-medium pb-2 w-28">{m} meses</th>
                ))}
                <th className="text-center font-medium pb-2 w-28">0% interés</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              <tr>
                <td className="py-2.5 text-zinc-300">
                  <span className="font-medium">Por defecto</span>
                  <span className="block text-xs text-zinc-500">Categorías sin regla propia</span>
                </td>
                {plazos.map((m) => (
                  <td key={m} className="py-2.5 px-2">
                    <div className="relative">
                      <input
                        type="number" min="0" max="100" step="any"
                        value={config.recargoPorDefecto[String(m)] ?? 0}
                        onChange={(e) => setRecargo(null, m, e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg pl-3 pr-7 py-1.5 text-center focus:ring-1 focus:ring-cyan-500 outline-none"
                      />
                      <Percent className="w-3 h-3 text-zinc-500 absolute right-2 top-1/2 -translate-y-1/2" />
                    </div>
                  </td>
                ))}
                <td />
              </tr>

              {CATEGORIAS.map((slug) => {
                const cero = esSinInteres(slug);
                return (
                  <tr key={slug}>
                    <td className="py-2.5 text-zinc-300">{NOMBRES[slug] ?? slug}</td>
                    {plazos.map((m) => (
                      <td key={m} className="py-2.5 px-2">
                        <div className="relative">
                          <input
                            type="number" min="0" max="100" step="any"
                            value={recargoDe(slug, m)}
                            onChange={(e) => setRecargo(slug, m, e.target.value)}
                            className={`w-full bg-zinc-800 border text-white rounded-lg pl-3 pr-7 py-1.5 text-center focus:ring-1 focus:ring-cyan-500 outline-none ${
                              recargoDe(slug, m) === 0 ? 'border-emerald-700/60' : 'border-zinc-700'
                            }`}
                          />
                          <Percent className="w-3 h-3 text-zinc-500 absolute right-2 top-1/2 -translate-y-1/2" />
                        </div>
                      </td>
                    ))}
                    <td className="py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={cero}
                        onChange={(e) => toggleSinInteres(slug, e.target.checked)}
                        className="w-4 h-4 bg-zinc-800 border-zinc-700 rounded text-emerald-500 focus:ring-emerald-500"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- Vista previa --- */}
      <div className="mt-8 border-t border-zinc-800/50 pt-6">
        <div className="flex items-center justify-between gap-4 mb-1">
          <h3 className="text-md font-medium text-cyan-400">Vista previa</h3>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            Producto de USD
            <input
              type="number" min="1" step="any"
              value={precioDemo}
              onChange={(e) => setPrecioDemo(e.target.value)}
              className="w-24 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-2 py-1 text-center focus:ring-1 focus:ring-cyan-500 outline-none"
            />
          </label>
        </div>
        <p className="text-xs text-zinc-500 mb-4">
          Calculado con el mismo código que usan la tablet y la web, a tasa {tasaCambio}. La tablet
          muestra cuota y total; la web, solo la cuota.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {preview.map(({ slug, nombre, planes }) => (
            <div key={slug} className="bg-zinc-800/40 border border-zinc-800 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-medium text-zinc-200">{nombre}</span>
                {planes.length > 0 && todosSinInteres(planes) && (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    0% interés
                  </span>
                )}
              </div>
              {planes.length === 0 ? (
                <p className="text-xs text-zinc-500 italic">
                  Sin cuotas (el precio no alcanza el mínimo de ${config.minUsd})
                </p>
              ) : (
                <div className="space-y-1">
                  {planes.map((p) => (
                    <div key={p.meses} className="flex items-baseline justify-between text-xs">
                      <span className="text-zinc-400">{p.meses} cuotas de</span>
                      <span className="text-zinc-100 font-semibold">{cordobas(p.cuotaNio)}</span>
                      <span className="text-zinc-500">
                        total {cordobas(p.totalNio)}
                        {p.sobrePrecioNio > 3 && (
                          <span className="text-amber-400/80"> (+{cordobas(p.sobrePrecioNio)})</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex gap-2.5 text-xs text-amber-300/90 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p>
            Antes de dejar de anunciar 0% parejo, confirmá con tu ejecutivo de {config.banco} que el
            contrato de afiliación te permite cobrar más al cliente que financia. Donde el recargo se
            permite, Visa lo topa en 3% y Mastercard en 4%.
          </p>
          <p className="mt-1.5 text-amber-300/70">
            Para ver cuánto te cuesta hoy el 0% por categoría: <code className="text-amber-200">npm run financiamiento</code>
          </p>
        </div>
      </div>
    </div>
  );
}
