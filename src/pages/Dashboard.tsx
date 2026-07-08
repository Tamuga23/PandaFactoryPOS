import { useState, useEffect } from 'react';
import { AlertTriangle, DollarSign, Package, TrendingUp, TrendingDown } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { Sale } from '../types';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';

const DAY = 86400000;
type Period = 'hoy' | 'semana' | 'mes';
const PERIOD_LEN: Record<Period, number> = { hoy: 1, semana: 7, mes: 30 };
const PERIOD_LABEL: Record<Period, string> = { hoy: 'Hoy', semana: '7 días', mes: '30 días' };

export default function Dashboard() {
  const { stats, loading, user, fetchSalesInRange } = useStore();

  // P4.4: ventas del período (Hoy/Semana/Mes) + comparación contra el
  // período anterior de igual longitud, consultado por rango (sin tope de 100).
  const [period, setPeriod] = useState<Period>('hoy');
  const [periodData, setPeriodData] = useState<{ current: number; previous: number } | null>(null);

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
    Promise.all([
      fetchSalesInRange(startCur, Date.now()),
      fetchSalesInRange(startPrev, startCur - 1),
    ]).then(([cur, prev]) => {
      if (!cancelled) setPeriodData({ current: sum(cur), previous: sum(prev) });
    }).catch(() => { if (!cancelled) setPeriodData(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, user]);

  if (loading) {
    return <div className="text-zinc-500">Cargando panel…</div>;
  }

  const delta = periodData && periodData.previous > 0
    ? ((periodData.current - periodData.previous) / periodData.previous) * 100
    : null;

  const kpis = [
    { title: 'Valor Inventario (a costo)', value: formatCurrency(stats.totalStockValue), icon: TrendingUp, color: 'text-cyan-400', border: '' },
    { title: 'Productos', value: stats.totalProducts.toString(), icon: Package, color: 'text-white', border: '' },
    { title: 'Inventario Crítico', value: stats.lowStockItems.length.toString(), icon: AlertTriangle, color: 'text-rose-400', border: 'border-l-rose-500 border-l-2' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* P4.4: card de ventas con selector de período y comparación */}
        <div className="bg-zinc-900/50 p-4 border border-zinc-800 rounded-xl">
          <div className="flex items-center justify-between gap-2">
            <p className="text-zinc-500 text-xs font-medium uppercase flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Ventas
            </p>
            <div className="flex bg-zinc-800 rounded-md p-0.5">
              {(Object.keys(PERIOD_LEN) as Period[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                    period === p ? 'bg-cyan-600 text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {PERIOD_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
          <p className="text-2xl font-bold mt-2 text-cyan-400">
            {periodData ? formatCurrency(periodData.current) : formatCurrency(stats.todaySalesValue)}
          </p>
          {delta !== null && (
            <p className={`text-[11px] font-bold mt-1 flex items-center gap-1 ${delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {delta >= 0 ? '+' : ''}{delta.toFixed(0)}% vs período anterior
              <span className="text-zinc-600 font-normal">({formatCurrency(periodData!.previous)})</span>
            </p>
          )}
          {delta === null && periodData && (
            <p className="text-[11px] text-zinc-600 mt-1">Sin ventas en el período anterior para comparar.</p>
          )}
        </div>
        {kpis.map((kpi, idx) => (
          <div key={idx} className={`bg-zinc-900/50 p-4 border border-zinc-800 rounded-xl ${kpi.border}`}>
            <p className="text-zinc-500 text-xs font-medium uppercase flex items-center gap-2">
               <kpi.icon className="h-4 w-4" /> {kpi.title}
            </p>
            <p className={`text-2xl font-bold mt-2 ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

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
                      <td className="px-4 py-3 text-zinc-500">{item.sku}</td>
                      <td className="px-4 py-3 text-right text-rose-400">{item.stock} / {item.minStockAlert}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 text-[10px]">Bajo Stock</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-5 text-sm text-zinc-500">Todos los productos tienen existencias adecuadas.</div>
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
                      <td className="px-4 py-3 text-zinc-500">{format(sale.date, 'MMM dd, yyyy h:mm a')}</td>
                      <td className="px-4 py-3 text-right text-zinc-300">{sale.items.length}</td>
                      <td className="px-4 py-3 text-right font-medium text-zinc-200">{formatCurrency(sale.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-5 text-sm text-zinc-500">No hay ventas recientes.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
