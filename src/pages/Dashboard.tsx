import { AlertTriangle, DollarSign, Package, TrendingUp } from 'lucide-react';
import { useStoreData } from '../hooks/useStoreData';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';

export default function Dashboard() {
  const { stats, loading } = useStoreData();

  if (loading) {
    return <div className="text-zinc-500">Loading dashboard...</div>;
  }

  const kpis = [
    { title: 'Ventas Totales', value: formatCurrency(stats.totalSalesValue), icon: DollarSign, color: 'text-cyan-400', border: '' },
    { title: 'Valor Inventario', value: formatCurrency(stats.totalStockValue), icon: TrendingUp, color: 'text-sky-400', border: '' },
    { title: 'Productos', value: stats.totalProducts.toString(), icon: Package, color: 'text-white', border: '' },
    { title: 'Inventario Crítico', value: stats.lowStockItems.length.toString(), icon: AlertTriangle, color: 'text-rose-400', border: 'border-l-rose-500 border-l-2' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
