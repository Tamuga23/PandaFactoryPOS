import React, { useState, useMemo } from 'react';
import { useStoreData } from '../hooks/useStoreData';
import { formatCurrency } from '../lib/utils';
import { format, parseISO, startOfMonth } from 'date-fns';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart
} from 'recharts';
import { Sparkles, TrendingUp, DollarSign, Percent, Package } from 'lucide-react';

export default function Reports() {
  const { sales, products, loading } = useStoreData();
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      if (s.documentType === 'PROFORMA') return false;
      if (dateRange.start && s.date < parseISO(dateRange.start).getTime()) return false;
      if (dateRange.end && s.date > parseISO(dateRange.end).getTime() + 86400000) return false;
      return true;
    });
  }, [sales, dateRange]);

  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalCost = 0;

    filteredSales.forEach(sale => {
      totalRevenue += sale.total;
      sale.items.forEach(item => {
        const p = products.find(prod => prod.id === item.id);
        const unitCost = item.cost ?? p?.cost ?? 0;
        totalCost += unitCost * item.quantity;
      });
    });

    const grossProfit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    return { totalRevenue, totalCost, grossProfit, margin };
  }, [filteredSales, products]);

  const areaData = useMemo(() => {
    const monthlyData = filteredSales.reduce((acc, sale) => {
      const dateStr = format(new Date(sale.date), 'yyyy-MM');
      if (!acc[dateStr]) acc[dateStr] = { dateStr, month: format(new Date(sale.date), 'MMM yyyy'), Revenue: 0, Cost: 0 };
      
      acc[dateStr].Revenue += sale.total;
      
      let saleCost = 0;
      sale.items.forEach(item => {
        const p = products.find(prod => prod.id === item.id);
        const unitCost = item.cost ?? p?.cost ?? 0;
        saleCost += unitCost * item.quantity;
      });
      acc[dateStr].Cost += saleCost;
      
      return acc;
    }, {} as Record<string, { dateStr: string, month: string, Revenue: number, Cost: number }>);

    return (Object.values(monthlyData) as any[]).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  }, [filteredSales, products]);

  const categoryData = useMemo(() => {
    const categoryMap = filteredSales.reduce((acc, sale) => {
      sale.items.forEach(item => {
        const p = products.find(prod => prod.id === item.id);
        const cat = item.category || p?.category || 'Uncategorized';
        if (!acc[cat]) acc[cat] = { name: cat, Revenue: 0 };
        acc[cat].Revenue += item.price * item.quantity;
      });
      return acc;
    }, {} as Record<string, { name: string, Revenue: number }>);

    return (Object.values(categoryMap) as any[]).sort((a, b) => b.Revenue - a.Revenue).slice(0, 5); // top 5
  }, [filteredSales, products]);

  const productPerf = useMemo(() => {
    const perfMap = filteredSales.reduce((acc, sale) => {
      sale.items.forEach(item => {
        if (!acc[item.id]) {
          const p = products.find(prod => prod.id === item.id);
          acc[item.id] = {
            id: item.id,
            name: item.name,
            imageBase64: item.imageBase64 || p?.imageBase64,
            quantity: 0,
            revenue: 0,
            cost: 0,
          };
        }
        const unitCost = item.cost ?? products.find(prod => prod.id === item.id)?.cost ?? 0;
        
        acc[item.id].quantity += item.quantity;
        acc[item.id].revenue += item.price * item.quantity;
        acc[item.id].cost += unitCost * item.quantity;
      });
      return acc;
    }, {} as Record<string, any>);

    return (Object.values(perfMap) as any[]).map(p => {
      const grossProfit = p.revenue - p.cost;
      const margin = p.revenue > 0 ? (grossProfit / p.revenue) * 100 : 0;
      return { ...p, grossProfit, margin };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [filteredSales, products]);

  if (loading) return <div className="text-zinc-500 p-6 font-mono">Loading data model...</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 uppercase tracking-tight italic flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-sky-400" /> Financial Dashboard
          </h2>
          <p className="text-sm text-zinc-500 mt-1">Advanced BI interface for analyzing Gross Profit and Margins.</p>
        </div>
        
        <div className="flex items-center gap-3 bg-zinc-950 p-2 rounded-xl border border-zinc-800">
           <div className="flex items-center gap-2 px-2">
              <span className="text-[10px] uppercase font-bold text-zinc-500">From</span>
              <input 
                type="date" 
                value={dateRange.start}
                onChange={e => setDateRange(prev => ({...prev, start: e.target.value}))}
                className="bg-transparent text-sm text-zinc-200 outline-none focus:text-sky-400" 
              />
           </div>
           <div className="h-6 w-px bg-zinc-800"></div>
           <div className="flex items-center gap-2 px-2">
              <span className="text-[10px] uppercase font-bold text-zinc-500">To</span>
              <input 
                type="date" 
                value={dateRange.end}
                onChange={e => setDateRange(prev => ({...prev, end: e.target.value}))}
                className="bg-transparent text-sm text-zinc-200 outline-none focus:text-sky-400" 
              />
           </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
         <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg flex flex-col justify-center relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-20 h-20 bg-emerald-500/10 rounded-full blur-2xl"></div>
            <div className="text-[11px] uppercase font-bold text-zinc-400 flex items-center gap-1.5 mb-2 relative z-10"><DollarSign className="w-4 h-4"/> Total Ventas</div>
            <div className="text-3xl font-bold text-emerald-400 font-mono relative z-10">{formatCurrency(metrics.totalRevenue)}</div>
         </div>
         
         <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg flex flex-col justify-center relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-20 h-20 bg-rose-500/10 rounded-full blur-2xl"></div>
            <div className="text-[11px] uppercase font-bold text-zinc-400 flex items-center gap-1.5 mb-2 relative z-10"><Package className="w-4 h-4"/> Costo de Ventas</div>
            <div className="text-3xl font-bold text-rose-400 font-mono relative z-10">{formatCurrency(metrics.totalCost)}</div>
         </div>

         <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg flex flex-col justify-center relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-20 h-20 bg-cyan-500/10 rounded-full blur-2xl"></div>
            <div className="text-[11px] uppercase font-bold text-zinc-400 flex items-center gap-1.5 mb-2 relative z-10"><TrendingUp className="w-4 h-4"/> Utilidad Bruta</div>
            <div className="text-3xl font-bold text-cyan-400 font-mono relative z-10">{formatCurrency(metrics.grossProfit)}</div>
         </div>

         <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg flex flex-col justify-center relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-20 h-20 bg-fuchsia-500/10 rounded-full blur-2xl"></div>
            <div className="text-[11px] uppercase font-bold text-zinc-400 flex items-center gap-1.5 mb-2 relative z-10"><Percent className="w-4 h-4"/> Margen %</div>
            <div className="text-3xl font-bold text-fuchsia-400 font-mono relative z-10">{metrics.margin.toFixed(1)}%</div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg">
           <h3 className="text-sm font-bold text-zinc-100 mb-6">Revenue vs Cost (Tendencia Mensual)</h3>
           <div className="h-72">
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={areaData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                 <defs>
                   <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#34d399" stopOpacity={0.3}/>
                     <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                   </linearGradient>
                   <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#fb7185" stopOpacity={0.3}/>
                     <stop offset="95%" stopColor="#fb7185" stopOpacity={0}/>
                   </linearGradient>
                 </defs>
                 <XAxis dataKey="month" stroke="#71717a" style={{ fontSize: '11px', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                 <YAxis stroke="#71717a" style={{ fontSize: '11px', fontWeight: 'bold' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                 <Tooltip 
                   contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                   itemStyle={{ fontWeight: 'bold' }}
                   formatter={(value: number) => formatCurrency(value)}
                 />
                 <Area type="monotone" dataKey="Revenue" stroke="#34d399" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                 <Area type="monotone" dataKey="Cost" stroke="#fb7185" strokeWidth={3} fillOpacity={1} fill="url(#colorCost)" />
               </AreaChart>
             </ResponsiveContainer>
           </div>
        </div>

        {/* Categories BarChart */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg flex flex-col">
           <h3 className="text-sm font-bold text-zinc-100 mb-6">Top Categorías por Ingreso</h3>
           <div className="flex-1 min-h-[16rem]">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 10 }}>
                 <XAxis type="number" hide />
                 <YAxis dataKey="name" type="category" stroke="#a1a1aa" style={{ fontSize: '11px', fontWeight: 'bold' }} axisLine={false} tickLine={false} width={80} />
                 <Tooltip 
                    cursor={{ fill: '#27272a' }}
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                    formatter={(value: number) => formatCurrency(value)}
                 />
                 <Bar dataKey="Revenue" fill="#38bdf8" radius={[0, 4, 4, 0]} barSize={24} />
               </BarChart>
             </ResponsiveContainer>
           </div>
        </div>
      </div>

      {/* Product Performance Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-zinc-800">
           <h3 className="text-sm font-bold text-zinc-100">Performance de Productos (Detallado)</h3>
        </div>
        <div className="overflow-x-auto text-sm text-left custom-scrollbar">
           <table className="w-full">
              <thead className="bg-zinc-800/50 text-[10px] uppercase text-zinc-400 font-bold tracking-wider">
                 <tr>
                    <th className="px-6 py-4">Producto</th>
                    <th className="px-6 py-4 text-center">Cant. Vendida</th>
                    <th className="px-6 py-4 text-right">Ingresos</th>
                    <th className="px-6 py-4 text-right">Costo Total</th>
                    <th className="px-6 py-4 text-right text-cyan-400 hover:bg-cyan-500/5 cursor-pointer">Utilidad Bruta</th>
                    <th className="px-6 py-4 text-left w-32 border-l border-zinc-800">Margen %</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 text-xs">
                 {productPerf.map(product => {
                    const isProfitable = product.grossProfit > 0;
                    return (
                      <tr key={product.id} className="hover:bg-zinc-800/30 transition-colors">
                         <td className="px-6 py-3">
                            <div className="flex items-center gap-3">
                               {product.imageBase64 ? (
                                  <img src={product.imageBase64} alt={product.name} className="w-8 h-8 rounded border border-zinc-700 object-cover" />
                               ) : (
                                  <div className="w-8 h-8 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                                     <Package className="w-4 h-4 text-zinc-500" />
                                  </div>
                               )}
                               <span className="font-medium text-zinc-200 line-clamp-1 max-w-[200px]" title={product.name}>{product.name}</span>
                            </div>
                         </td>
                         <td className="px-6 py-3 text-center font-mono text-zinc-400">
                            {product.quantity}
                         </td>
                         <td className="px-6 py-3 text-right font-mono text-zinc-300">
                            {formatCurrency(product.revenue)}
                         </td>
                         <td className="px-6 py-3 text-right font-mono text-rose-400">
                            {formatCurrency(product.cost)}
                         </td>
                         <td className="px-6 py-3 text-right font-mono font-bold text-cyan-400">
                            {formatCurrency(product.grossProfit)}
                         </td>
                         <td className="p-0 border-l border-zinc-800 relative group h-full align-middle">
                            {/* Data Bar Effect */}
                            <div className="absolute inset-y-0 left-0 bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors pointer-events-none" style={{ width: `${Math.max(0, Math.min(100, product.margin))}%` }}></div>
                            <div className="relative z-10 px-6 py-3 font-mono font-bold text-emerald-400">
                               {product.margin.toFixed(1)}%
                            </div>
                         </td>
                      </tr>
                    );
                 })}
                 {productPerf.length === 0 && (
                   <tr>
                     <td colSpan={6} className="px-6 py-10 text-center text-zinc-500 italic">No hay ventas registradas en este periodo.</td>
                   </tr>
                 )}
              </tbody>
           </table>
        </div>
      </div>
      
    </div>
  );
}
