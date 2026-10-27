import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, DollarSign, Package, TrendingUp, TrendingDown, HandCoins, ArrowRight } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { Apartado, Sale } from '../types';
import { formatCurrency, formatCurrencyNIO } from '../lib/utils';
import {
  diasRestantes,
  estadoVisible,
  redondearCordobas,
  saldoNio,
  ultimoAbonoEn,
  type EstadoVisible,
} from '../lib/apartados';
import { BadgeEstado } from '../components/ApartadoPiezas';
import { format } from 'date-fns';
// La tabla de ventas recientes decia "Sep 22, 2026 2:30 PM": mes abreviado en
// ingles y reloj de 12 horas, en una aplicacion que por lo demas esta entera en
// espanol y donde nadie dice "2:30 PM".
import { es } from 'date-fns/locale';

const DAY = 86400000;
type Period = 'hoy' | 'semana' | 'mes';
const PERIOD_LEN: Record<Period, number> = { hoy: 1, semana: 7, mes: 30 };
const PERIOD_LABEL: Record<Period, string> = { hoy: 'Hoy', semana: '7 días', mes: '30 días' };

/** Hasta dónde mira "por vencer" el panel de apartados. */
const DIAS_POR_VENCER = 7;
const FILAS_APARTADOS = 6;

type FilaApartado = { ap: Apartado; estado: EstadoVisible; saldo: number; dias: number };

/**
 * Qué decir del plazo de cada fila. Un vencido cuenta desde la fecha límite;
 * un listo NO vence (`estadoVisible`: el cliente ya pagó, la tienda le debe el
 * producto), así que cuenta desde su último abono — es lo que dice cuánto hace
 * que la mercadería de otro ocupa el estante.
 */
const plazoDeFila = (f: FilaApartado, ahora: number): { texto: string; tono: string } => {
  if (f.estado === 'vencido') {
    const n = -f.dias;
    return {
      texto: n <= 0 ? 'venció hoy' : n === 1 ? 'venció ayer' : `venció hace ${n} días`,
      tono: 'text-rose-400',
    };
  }
  if (f.estado === 'listo') {
    const n = diasRestantes(ahora, ultimoAbonoEn(f.ap) ?? f.ap.fecha);
    return {
      texto: n <= 0 ? 'pagado hoy' : n === 1 ? 'pagado ayer' : `pagado hace ${n} días`,
      tono: 'text-zinc-400',
    };
  }
  return {
    texto: f.dias <= 0 ? 'vence hoy' : f.dias === 1 ? 'vence mañana' : `vence en ${f.dias} días`,
    tono: f.dias <= 1 ? 'text-amber-400' : 'text-zinc-400',
  };
};

export default function Dashboard() {
  const { stats, loading, user, fetchSalesInRange, apartados } = useStore();

  // P4.4: ventas del período (Hoy/Semana/Mes) + comparación contra el
  // período anterior de igual longitud, consultado por rango (sin tope de 100).
  const [period, setPeriod] = useState<Period>('hoy');
  const [periodData, setPeriodData] = useState<{ current: number; previous: number } | null>(null);
  /*
    Si la consulta por rango falla —permisos, red, cuota de Spark— antes se
    ponía `periodData` en null y la tarjeta caía silenciosamente a
    `stats.todaySalesValue`: el operador elegía "30 días" y leía el número de
    HOY, con el botón de 30 días encendido. Un número equivocado bajo un rótulo
    seguro es peor que no mostrar número.
  */
  const [fallaPeriodo, setFallaPeriodo] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const len = PERIOD_LEN[period];
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
    const startCur = todayStart - (len - 1) * DAY;
    const startPrev = startCur - len * DAY;
    const sum = (arr: Sale[]) =>
      arr.filter(s => s.documentType !== 'PROFORMA' && (s.status || 'completed') === 'completed')
        .reduce((a, s) => a + s.total, 0);
    setFallaPeriodo(false);
    Promise.all([
      fetchSalesInRange(startCur, Date.now()),
      fetchSalesInRange(startPrev, startCur - 1),
    ]).then(([cur, prev]) => {
      if (!cancelled) setPeriodData({ current: sum(cur), previous: sum(prev) });
    }).catch(() => {
      if (cancelled) return;
      setPeriodData(null);
      setFallaPeriodo(true);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, user]);

  if (loading) {
    return <div className="text-zinc-400">Cargando panel…</div>;
  }

  const delta = periodData && periodData.previous > 0
    ? ((periodData.current - periodData.previous) / periodData.previous) * 100
    : null;

  const kpis = [
    {
      title: 'Valor Inventario a costo', value: formatCurrency(stats.totalStockValue), icon: TrendingUp, color: 'text-cyan-400', border: '',
      // `totalStockValue` ya suma lo apartado (sigue siendo de la tienda hasta
      // que se entrega). Se dice cuánto, porque no está en el stock disponible
      // y el número no se podría reconstruir mirando Inventario.
      sub: stats.totalApartadoValue > 0 ? `incluye ${formatCurrency(stats.totalApartadoValue)} apartado` : null,
    },
    { title: 'Productos', value: stats.totalProducts.toString(), icon: Package, color: 'text-white', border: '', sub: null },
    { title: 'Inventario Crítico', value: stats.lowStockItems.length.toString(), icon: AlertTriangle, color: 'text-rose-400', border: 'border-l-rose-500 border-l-2', sub: null },
  ];

  /*
    Apartados que piden algo: los vencidos (cobrar o liberar), los listos (la
    tienda ya cobró y le debe el producto al cliente) y los que vencen esta
    semana. `listo` y `vencido` no se guardan en ningún lado —no hay servidor
    que los cambie a medianoche—, así que se derivan acá, con el reloj de ahora.
  */
  const ahora = Date.now();
  const activos: FilaApartado[] = apartados
    .filter((ap) => ap.status === 'activo')
    .map((ap) => ({ ap, estado: estadoVisible(ap, ahora), saldo: saldoNio(ap), dias: diasRestantes(ap.fechaLimite, ahora) }));
  // Cada `saldoNio` ya viene redondeado al centavo; el redondeo final es para
  // que la suma de varios no arrastre un 0.30000000000000004.
  const porCobrarNio = redondearCordobas(activos.reduce((s, f) => s + Math.max(0, f.saldo), 0));
  const vencidos = activos
    .filter((f) => f.estado === 'vencido')
    .sort((a, b) => a.ap.fechaLimite - b.ap.fechaLimite);
  const listos = activos
    .filter((f) => f.estado === 'listo')
    .sort((a, b) => (ultimoAbonoEn(a.ap) ?? a.ap.fecha) - (ultimoAbonoEn(b.ap) ?? b.ap.fecha));
  const porVencer = activos
    .filter((f) => f.estado === 'activo' && f.dias <= DIAS_POR_VENCER)
    .sort((a, b) => a.ap.fechaLimite - b.ap.fechaLimite);
  const filasApartados = [...vencidos, ...listos, ...porVencer].slice(0, FILAS_APARTADOS);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* P4.4: card de ventas con selector de período y comparación */}
        <div className="bg-zinc-900/50 p-4 border border-zinc-800 rounded-xl">
          <div className="flex items-center justify-between gap-2">
            <p className="text-zinc-400 text-xs font-medium uppercase flex items-center gap-2">
              <DollarSign className="h-4 w-4" aria-hidden="true" /> Ventas
            </p>
            <div className="flex bg-zinc-800 rounded-md p-0.5">
              {(Object.keys(PERIOD_LEN) as Period[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                    period === p ? 'bg-cyan-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                  } focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                >
                  {PERIOD_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
          {fallaPeriodo ? (
            <p className="text-sm font-bold mt-2 text-rose-400">
              No se pudieron leer las ventas del período.
            </p>
          ) : (
            <p className="text-2xl font-bold mt-2 text-cyan-400 tabular-nums">
              {periodData ? formatCurrency(periodData.current) : formatCurrency(stats.todaySalesValue)}
            </p>
          )}
          {delta !== null && (
            <p className={`text-[11px] font-bold mt-1 flex items-center gap-1 ${delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {delta >= 0 ? '+' : ''}{delta.toFixed(0)}% vs período anterior
              <span className="text-zinc-400 font-normal tabular-nums">({formatCurrency(periodData!.previous)})</span>
            </p>
          )}
          {delta === null && periodData && (
            <p className="text-[11px] text-zinc-400 mt-1">Sin ventas en el período anterior para comparar.</p>
          )}
        </div>
        {kpis.map((kpi, idx) => (
          <div key={idx} className={`bg-zinc-900/50 p-4 border border-zinc-800 rounded-xl ${kpi.border}`}>
            <p className="text-zinc-400 text-xs font-medium uppercase flex items-center gap-2">
               <kpi.icon className="h-4 w-4" /> {kpi.title}
            </p>
            <p className={`text-2xl font-bold mt-2 ${kpi.color}`}>{kpi.value}</p>
            {kpi.sub && <p className="text-xs text-zinc-400 mt-1 tabular-nums">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      {/* Sólo si hay apartados activos: un panel vacío sería ruido todos los días. */}
      {activos.length > 0 && (
        <section
          aria-labelledby="titulo-panel-apartados"
          className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden"
        >
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center gap-3">
            <h3 id="titulo-panel-apartados" className="font-semibold text-zinc-200 flex items-center">
              <HandCoins className="h-4 w-4 text-cyan-400 mr-2" aria-hidden="true" />
              Apartados
              <span className="ml-2 text-xs font-normal text-zinc-400 tabular-nums">
                {activos.length} {activos.length === 1 ? 'activo' : 'activos'}
              </span>
            </h3>
            <Link
              to="/apartados"
              className="text-xs font-bold text-zinc-400 hover:text-cyan-400 transition-colors flex items-center gap-1 rounded px-1 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              Ver todos <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4">
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3">
              <p className="text-[10px] uppercase font-bold text-zinc-400">Por cobrar</p>
              <p className="text-lg font-bold text-cyan-400 tabular-nums mt-0.5">{formatCurrencyNIO(porCobrarNio)}</p>
            </div>
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3">
              <p className="text-[10px] uppercase font-bold text-zinc-400">Vencidos</p>
              <p className={`text-lg font-bold tabular-nums mt-0.5 ${vencidos.length > 0 ? 'text-rose-400' : 'text-zinc-300'}`}>
                {vencidos.length}
              </p>
            </div>
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3">
              <p className="text-[10px] uppercase font-bold text-zinc-400">Listos para entregar</p>
              <p className={`text-lg font-bold tabular-nums mt-0.5 ${listos.length > 0 ? 'text-emerald-400' : 'text-zinc-300'}`}>
                {listos.length}
              </p>
            </div>
          </div>

          {filasApartados.length > 0 ? (
            <div className="overflow-x-auto border-t border-zinc-800">
              <table className="w-full text-sm text-left">
                <thead className="bg-zinc-800/50 text-zinc-400 text-xs uppercase">
                  <tr className="border-b border-zinc-800">
                    <th scope="col" className="px-4 py-3">Apartado</th>
                    <th scope="col" className="px-4 py-3">Cliente</th>
                    <th scope="col" className="px-4 py-3">Estado</th>
                    <th scope="col" className="px-4 py-3 text-right">Saldo</th>
                    <th scope="col" className="px-4 py-3 text-right">Plazo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {filasApartados.map((f) => {
                    const plazo = plazoDeFila(f, ahora);
                    return (
                      <tr key={f.ap.id} className="hover:bg-zinc-800/30">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link
                            to={`/apartados?q=${encodeURIComponent(f.ap.numero)}`}
                            className="font-medium text-cyan-400 hover:underline rounded focus:outline-none focus:ring-1 focus:ring-cyan-500"
                          >
                            {f.ap.numero}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-zinc-200 max-w-[16rem] truncate">{f.ap.customerName}</td>
                        <td className="px-4 py-3">
                          {/* El MISMO badge que la pantalla de Apartados: un estado
                              no puede llamarse "Activo" en turquesa acá y
                              "Pendiente" en ámbar un clic después. */}
                          <BadgeEstado estado={f.estado} />
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-zinc-200 tabular-nums whitespace-nowrap">
                          {formatCurrencyNIO(f.saldo)}
                        </td>
                        <td className={`px-4 py-3 text-right tabular-nums whitespace-nowrap ${plazo.tono}`}>{plazo.texto}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 pb-4 text-sm text-zinc-400">
              Ninguno vencido, listo para entregar ni por vencer en los próximos {DIAS_POR_VENCER} días.
            </p>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alerts */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
            <h3 className="font-semibold text-zinc-200 flex items-center">
              <AlertTriangle className="h-4 w-4 text-rose-500 mr-2" />
              Alertas de Bajo Inventario
            </h3>
          </div>
          <div className="flex-1 overflow-x-auto p-0">
            {stats.lowStockItems.length > 0 ? (
              <table className="w-full text-sm text-left">
                <thead className="bg-zinc-800/50 text-zinc-400 text-xs uppercase">
                  <tr className="border-b border-zinc-800">
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3 text-right">Stock</th>
                    <th className="px-4 py-3 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {stats.lowStockItems.map(item => (
                    <tr key={item.id} className="hover:bg-zinc-800/30 bg-rose-500/5">
                      <td className="px-4 py-3 font-medium text-zinc-200">{item.name}</td>
                      <td className="px-4 py-3 text-zinc-400">{item.sku}</td>
                      <td className="px-4 py-3 text-right text-rose-400">{item.stock} / {item.minStockAlert}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 text-[10px]">Bajo Stock</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-5 text-sm text-zinc-400">Todos los productos tienen existencias adecuadas.</div>
            )}
          </div>
        </div>

        {/* Recent Sales */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
            <h3 className="font-semibold text-zinc-200">Ventas Recientes</h3>
          </div>
          <div className="flex-1 overflow-x-auto p-0">
            {stats.recentSales.length > 0 ? (
              <table className="w-full text-sm text-left">
                <thead className="bg-zinc-800/50 text-zinc-400 text-xs uppercase">
                  <tr className="border-b border-zinc-800">
                    <th className="px-4 py-3">Factura</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3 text-right">Items</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {stats.recentSales.map(sale => (
                    <tr key={sale.id} className="hover:bg-zinc-800/30">
                      <td className="px-4 py-3 font-medium text-cyan-400">{sale.invoiceNumber}</td>
                      <td className="px-4 py-3 text-zinc-400 tabular-nums">{format(sale.date, "d 'de' MMM, HH:mm", { locale: es })}</td>
                      <td className="px-4 py-3 text-right text-zinc-300">{sale.items.length}</td>
                      <td className="px-4 py-3 text-right font-medium text-zinc-200">{formatCurrency(sale.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-5 text-sm text-zinc-400">No hay ventas recientes.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
