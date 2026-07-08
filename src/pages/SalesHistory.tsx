import React, { useState } from 'react';
import { useStoreData } from '../hooks/useStoreData';
import { Sale } from '../types';
import { formatCurrency } from '../lib/utils';
import { Calendar, User, Phone, MapPin, Trash2, Edit, CheckCircle, RotateCcw, XCircle, Search, FileText, Truck } from 'lucide-react';
import ShippingLabelPreview from '../components/ShippingLabelPreview';
import { toast } from '../components/Toast';

export default function SalesHistory() {
  const {
    sales, deleteSale, updateSale, changeSaleStatus, loading, companyInfo,
    olderSales, hasMoreOlderSales, loadingOlderSales, loadMoreSales,
  } = useStoreData();
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [labelData, setLabelData] = useState<Sale | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  // P1.4: ventana en vivo (100) + páginas viejas cargadas bajo demanda.
  const allSales = React.useMemo(() => {
    const seen = new Set(sales.map(s => s.id));
    return [...sales, ...olderSales.filter(s => !seen.has(s.id))];
  }, [sales, olderSales]);

  const filteredSales = allSales.filter(s =>
    s.documentType !== 'PROFORMA' &&
    (s.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.customerName?.toLowerCase().includes(searchTerm.toLowerCase()))
  ).sort((a, b) => b.date - a.date);

  // P1.2: no se borran ventas completadas — primero anular (repone stock).
  const handleDeleteClick = (sale: Sale) => {
    if ((sale.status || 'completed') === 'completed' && sale.documentType !== 'PROFORMA') {
      toast.error('Marcá la venta como Devuelta o Cancelada antes de eliminarla (así el stock se repone).');
      setConfirmingDelete(null);
      return;
    }
    if (confirmingDelete === sale.id) {
      deleteSale(sale.id);
      setConfirmingDelete(null);
    } else {
      setConfirmingDelete(sale.id);
      setTimeout(() => setConfirmingDelete(null), 3000);
    }
  };

  // P1.2: el cambio de estado ajusta stock en transacción (changeSaleStatus).
  const handleStatusChange = async (sale: Sale, newStatus: Sale['status']) => {
    const prevStatus = sale.status || 'completed';
    if (prevStatus === newStatus) return;
    try {
      await changeSaleStatus(sale, newStatus);
      if (sale.documentType !== 'PROFORMA' && prevStatus === 'completed' && newStatus !== 'completed') {
        toast.success('Estado actualizado — stock repuesto al inventario.');
      } else if (sale.documentType !== 'PROFORMA' && prevStatus !== 'completed' && newStatus === 'completed') {
        toast.success('Estado actualizado — stock descontado nuevamente.');
      } else {
        toast.success('Estado actualizado.');
      }
    } catch {
      toast.error('No se pudo actualizar el estado de la venta.');
    }
  };

  const handleEdit = (sale: Sale) => {
    setEditingSale(sale);
    setIsEditModalOpen(true);
  };

  const saveEditedSale = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingSale) return;

    const formData = new FormData(e.currentTarget);
    const updatedSale: Sale = {
      ...editingSale,
      customerName: formData.get('customerName') as string,
      customerPhone: formData.get('customerPhone') as string,
      customerAddress: formData.get('customerAddress') as string,
      transport: formData.get('transport') as string,
      notes: (formData.get('notes') as string) || editingSale.notes || '',
    } as any; // Cast for custom fields if any

    await updateSale(updatedSale);
    setIsEditModalOpen(false);
    setEditingSale(null);
    toast.success('Venta actualizada.');
  };

  if (loading) return <div className="text-zinc-500 p-8">Cargando historial…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 uppercase tracking-tight italic">Gestión de Ventas</h2>
          <p className="text-xs text-zinc-500">Edite, elimine o gestione ventas y devoluciones.</p>
        </div>
        <div className="relative w-full md:w-64">
           <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
           <input 
            type="text" 
            placeholder="N° de factura o cliente…"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 h-10 text-sm text-zinc-200"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
           />
        </div>
      </div>

      <div className="grid gap-4">
        {filteredSales.map(sale => (
          <div key={sale.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-lg group">
            <div className="p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-zinc-800/50">
               <div className="flex items-center gap-4 w-full lg:w-auto">
                  <div className={`p-3 rounded-lg flex-shrink-0 ${
                    sale.status === 'completed' ? 'bg-cyan-500/10 text-cyan-500' :
                    sale.status === 'returned' ? 'bg-amber-500/10 text-amber-500' :
                    'bg-rose-500/10 text-rose-500'
                  }`}>
                     <FileText className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                     <h4 className="font-bold text-zinc-100 flex items-center gap-2 flex-wrap">
                       {sale.invoiceNumber}
                       <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full ${
                        sale.status === 'completed' ? 'bg-cyan-500/10 text-cyan-500' :
                        sale.status === 'returned' ? 'bg-amber-500/10 text-amber-500' :
                        'bg-rose-500/10 text-rose-500'
                       }`}>
                         {sale.status || 'completed'}
                       </span>
                     </h4>
                     <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" /> {new Date(sale.date).toLocaleString()}
                     </p>
                  </div>
               </div>

               <div className="flex-1 w-full lg:px-8 grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="text-xs space-y-1 min-w-0">
                     <p className="text-zinc-500 font-bold uppercase">Cliente</p>
                     <p className="text-zinc-300 flex items-center gap-1 truncate"><User className="w-3 h-3 shrink-0" /> <span className="truncate">{sale.customerName || 'N/A'}</span></p>
                     <p className="text-zinc-400 flex items-center gap-1 truncate"><Phone className="w-3 h-3 shrink-0" /> <span className="truncate">{sale.customerPhone || '-'}</span></p>
                  </div>
                  <div className="text-xs space-y-1 hidden md:block min-w-0">
                     <p className="text-zinc-500 font-bold uppercase">Dirección/Transp</p>
                     <p className="text-zinc-300 flex items-center gap-1 truncate"><MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{sale.customerAddress || 'N/A'}</span></p>
                     <p className="text-cyan-500 font-bold uppercase truncate">{sale.transport}</p>
                  </div>
                  <div className="text-left md:text-right flex flex-col justify-center">
                     <p className="text-zinc-500 text-[10px] font-bold uppercase">Grand Total</p>
                     <p className="text-xl font-bold text-cyan-400 truncate">{formatCurrency(sale.total)}</p>
                  </div>
               </div>

               <div className="flex items-center gap-2 w-full lg:w-auto justify-end mt-2 lg:mt-0">
                  {/* Status Actions */}
                  <div className="flex items-center bg-zinc-800 rounded-lg p-1">
                    <button 
                      onClick={() => handleStatusChange(sale, 'completed')}
                      title="Set as Completed"
                      className={`p-1.5 rounded ${sale.status === 'completed' ? 'bg-cyan-600 text-white' : 'text-zinc-500 hover:text-cyan-400'}`}
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleStatusChange(sale, 'returned')}
                      title="Set as Returned"
                      className={`p-1.5 rounded ${sale.status === 'returned' ? 'bg-amber-600 text-white' : 'text-zinc-500 hover:text-amber-400'}`}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleStatusChange(sale, 'cancelled')}
                      title="Set as Cancelled"
                      className={`p-1.5 rounded ${sale.status === 'cancelled' ? 'bg-rose-600 text-white' : 'text-zinc-500 hover:text-rose-400'}`}
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <button onClick={() => handleEdit(sale)} className="p-2 text-zinc-400 hover:bg-zinc-800 hover:text-cyan-400 rounded-lg transition-colors">
                    <Edit className="w-4 h-4" />
                  </button>
                  {['DELIVERY MANAGUA', 'CARGOTRANS', 'BUSES INTERLOCALES'].includes(sale.transport || '') && (
                    <button 
                      onClick={() => setLabelData(sale)} 
                      title="Print Shipping Label"
                      className="p-2 text-zinc-400 hover:bg-zinc-800 hover:text-orange-400 rounded-lg transition-colors"
                    >
                      <Truck className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteClick(sale)}
                    className={`p-2 transition-colors rounded-lg ${confirmingDelete === sale.id ? 'bg-rose-500/20 text-rose-500 font-bold text-xs' : 'text-zinc-400 hover:bg-rose-500/10 hover:text-rose-500'}`}
                  >
                    {confirmingDelete === sale.id ? '¿Eliminar?' : <Trash2 className="w-4 h-4" />}
                  </button>
               </div>
            </div>
            
            {/* Expanded items view */}
            <div className="px-4 py-2 bg-zinc-800/20 text-[10px] text-zinc-500 flex flex-wrap gap-x-4">
               {sale.items.map(item => (
                 <span key={item.id}>• {item.quantity}x {item.name}</span>
               ))}
            </div>
          </div>
        ))}

        {filteredSales.length === 0 && (
          <div className="p-20 text-center text-zinc-500 flex flex-col items-center gap-4">
             <FileText className="w-12 h-12 opacity-20" />
             <p className="italic">Ninguna venta coincide con la búsqueda.</p>
          </div>
        )}

        {/* P1.4: paginación hacia atrás (más allá de las 100 en vivo) */}
        {sales.length >= 100 && hasMoreOlderSales && (
          <button
            onClick={loadMoreSales}
            disabled={loadingOlderSales}
            className="w-full py-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {loadingOlderSales ? 'Cargando…' : 'Cargar ventas anteriores'}
          </button>
        )}
      </div>

      {labelData && (
        <ShippingLabelPreview 
          sale={labelData}
          isOpen={!!labelData}
          onClose={() => setLabelData(null)}
          companyLogo={companyInfo?.logoBase64}
          companyName={companyInfo?.name}
        />
      )}

      {isEditModalOpen && editingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={() => setIsEditModalOpen(false)}></div>
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
             <form onSubmit={saveEditedSale}>
                <div className="p-6 border-b border-zinc-800">
                   <h3 className="text-xl font-bold text-zinc-100 italic">Edit Invoice {editingSale.invoiceNumber}</h3>
                </div>
                <div className="p-6 space-y-4">
                   <div className="space-y-1">
                      <label className="text-[10px] uppercase text-zinc-500 font-bold">Customer Name</label>
                      <input name="customerName" defaultValue={editingSale.customerName} className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200" />
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] uppercase text-zinc-500 font-bold">Phone</label>
                      <input name="customerPhone" defaultValue={editingSale.customerPhone} className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200" />
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] uppercase text-zinc-500 font-bold">Address</label>
                      <textarea name="customerAddress" defaultValue={editingSale.customerAddress} rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200"></textarea>
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] uppercase text-zinc-500 font-bold">Transport</label>
                      <input name="transport" defaultValue={editingSale.transport} className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200" />
                   </div>
                </div>
                <div className="p-6 bg-zinc-800/30 flex justify-end gap-3">
                   <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-zinc-400 hover:text-zinc-200">Cancel</button>
                   <button type="submit" className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition-all">GUARDAR CAMBIOS</button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}
