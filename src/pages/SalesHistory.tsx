import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { Sale } from '../types';
import { formatCurrency, formatCurrencyNIO } from '../lib/utils';
import { Calendar, User, Phone, MapPin, Trash2, Edit, CheckCircle, RotateCcw, XCircle, Search, FileText, Truck, Printer, MessageCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import ShippingLabelPreview from '../components/ShippingLabelPreview';
import InvoicePreview, { InvoiceData } from '../components/InvoicePreview';
import { buildInvoiceDataFromSale, buildWhatsAppLink } from '../lib/invoice';
import { toast } from '../components/Toast';
import { useEscapeKey } from '../hooks/useEscapeKey';

// P4.1: estados en español para los chips.
const STATUS_LABEL: Record<string, string> = {
  completed: 'Completada', returned: 'Devuelta', cancelled: 'Cancelada',
};
// P4.2: fecha yyyy-MM-dd a medianoche LOCAL.
const localDayStart = (str: string) => {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};

export default function SalesHistory() {
  const {
    sales, deleteSale, updateSale, changeSaleStatus, recordSale, loading, companyInfo,
    olderSales, hasMoreOlderSales, loadingOlderSales, loadMoreSales,
  } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [labelData, setLabelData] = useState<Sale | null>(null);
  // P2.5: pestaña Facturas/Proformas + reimprimir + facturar proforma.
  const [docFilter, setDocFilter] = useState<'FACTURAS' | 'PROFORMAS'>('FACTURAS');
  const [reprintData, setReprintData] = useState<InvoiceData | null>(null);
  const [invoicingProformaId, setInvoicingProformaId] = useState<string | null>(null);
  // P4.2: filtros de fecha / estado / método de pago.
  const [fStart, setFStart] = useState('');
  const [fEnd, setFEnd] = useState('');
  const [fStatus, setFStatus] = useState('todos');
  const [fMethod, setFMethod] = useState('todos');
  // P4.5: modal de confirmación de borrado (reemplaza el doble-clic).
  const [deleteModalSale, setDeleteModalSale] = useState<Sale | null>(null);

  // P4.7: ESC cierra el modal de más arriba.
  useEscapeKey(isEditModalOpen || !!labelData || !!reprintData || !!deleteModalSale, () => {
    if (reprintData) setReprintData(null);
    else if (labelData) setLabelData(null);
    else if (deleteModalSale) setDeleteModalSale(null);
    else setIsEditModalOpen(false);
  });

  // P1.4: ventana en vivo (100) + páginas viejas cargadas bajo demanda.
  const allSales = React.useMemo(() => {
    const seen = new Set(sales.map(s => s.id));
    return [...sales, ...olderSales.filter(s => !seen.has(s.id))];
  }, [sales, olderSales]);

  const filteredSales = allSales.filter(s =>
    (docFilter === 'PROFORMAS' ? s.documentType === 'PROFORMA' : s.documentType !== 'PROFORMA') &&
    (s.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.customerName?.toLowerCase().includes(searchTerm.toLowerCase())) &&
    // P4.2: filtros de estado, método y rango de fechas.
    (fStatus === 'todos' || (s.status || 'completed') === fStatus) &&
    (fMethod === 'todos' || (s.paymentMethod || 'EFECTIVO') === fMethod) &&
    (!fStart || s.date >= localDayStart(fStart)) &&
    (!fEnd || s.date <= localDayStart(fEnd) + 86399999)
  ).sort((a, b) => b.date - a.date);

  // P2.5: reimprimir factura/proforma desde los datos guardados.
  const handleReprint = (sale: Sale) => {
    setReprintData(buildInvoiceDataFromSale(sale, companyInfo));
  };

  // P2.6: compartir por WhatsApp (link con resumen; el PDF se adjunta a mano).
  const handleWhatsApp = (sale: Sale) => {
    const rate = sale.exchangeRate || companyInfo?.defaultExchangeRate || 36.6243;
    const link = buildWhatsAppLink(sale, formatCurrencyNIO(sale.total * rate));
    if (!link) {
      toast.error('El cliente no tiene un teléfono válido registrado.');
      return;
    }
    window.open(link, '_blank');
  };

  // P2.5: convertir proforma en factura (verifica stock en la transacción).
  const handleInvoiceProforma = async (p: Sale) => {
    if (invoicingProformaId) return;
    setInvoicingProformaId(p.id);
    try {
      const newSale: Sale = {
        ...p,
        id: uuidv4(),
        date: Date.now(),
        documentType: 'RECIBO_OFICIAL',
        invoiceNumber: 'POR ASIGNAR',
        status: 'completed',
        paymentMethod: p.paymentMethod || 'EFECTIVO',
        notes: `${p.notes ? p.notes + ' · ' : ''}Origen: proforma ${p.invoiceNumber}`,
      };
      const num = await recordSale(newSale);
      // Marca la proforma como consumida (cancelled) con referencia cruzada.
      await updateSale({
        ...p,
        status: 'cancelled',
        notes: `${p.notes ? p.notes + ' · ' : ''}Facturada como ${num}`,
      });
      toast.success(`Proforma facturada como ${num} — stock descontado.`);
      setReprintData(buildInvoiceDataFromSale({ ...newSale, invoiceNumber: num }, companyInfo));
    } catch (e: any) {
      toast.error(e?.message?.includes('Stock') || e?.message?.includes('inválida')
        ? e.message
        : 'No se pudo facturar la proforma. Verificá el stock.');
    } finally {
      setInvoicingProformaId(null);
    }
  };

  // P1.2 + P4.5: no se borran ventas completadas; el resto pasa por un modal
  // de confirmación con resumen (adiós al doble-clic accidental).
  const handleDeleteClick = (sale: Sale) => {
    if ((sale.status || 'completed') === 'completed' && sale.documentType !== 'PROFORMA') {
      toast.error('Marcá la venta como Devuelta o Cancelada antes de eliminarla (así el stock se repone).');
      return;
    }
    setDeleteModalSale(sale);
  };

  const confirmDelete = async () => {
    if (!deleteModalSale) return;
    try {
      await deleteSale(deleteModalSale.id);
      toast.success(`${deleteModalSale.documentType === 'PROFORMA' ? 'Proforma' : 'Venta'} ${deleteModalSale.invoiceNumber} eliminada.`);
    } catch {
      toast.error('No se pudo eliminar el registro.');
    } finally {
      setDeleteModalSale(null);
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
          <p className="text-xs text-zinc-500">Edite, elimine o gestione ventas, proformas y devoluciones.</p>
        </div>
        {/* P2.5: pestaña Facturas / Proformas */}
        <div className="flex bg-zinc-800 rounded-lg p-1 text-xs font-bold">
          <button
            onClick={() => setDocFilter('FACTURAS')}
            className={`px-4 py-1.5 rounded-md transition-colors ${docFilter === 'FACTURAS' ? 'bg-cyan-600 text-white' : 'text-zinc-400 hover:text-white'}`}
          >
            Facturas
          </button>
          <button
            onClick={() => setDocFilter('PROFORMAS')}
            className={`px-4 py-1.5 rounded-md transition-colors ${docFilter === 'PROFORMAS' ? 'bg-cyan-600 text-white' : 'text-zinc-400 hover:text-white'}`}
          >
            Proformas
          </button>
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

      {/* P4.2: filtros de fecha / estado / método (sobre las ventas cargadas) */}
      <div className="flex flex-wrap items-end gap-3 bg-zinc-900 border border-zinc-800 p-3 rounded-xl">
        <div className="space-y-1">
          <label className="text-[10px] uppercase text-zinc-500 font-bold">Desde</label>
          <input type="date" value={fStart} onChange={e => setFStart(e.target.value)}
            className="block bg-zinc-800 border border-zinc-700 rounded-lg px-3 h-9 text-xs text-zinc-200 outline-none focus:border-cyan-500" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase text-zinc-500 font-bold">Hasta</label>
          <input type="date" value={fEnd} onChange={e => setFEnd(e.target.value)}
            className="block bg-zinc-800 border border-zinc-700 rounded-lg px-3 h-9 text-xs text-zinc-200 outline-none focus:border-cyan-500" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase text-zinc-500 font-bold">Estado</label>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)}
            className="block bg-zinc-800 border border-zinc-700 rounded-lg px-3 h-9 text-xs text-zinc-200 outline-none focus:border-cyan-500 cursor-pointer">
            <option value="todos">Todos</option>
            <option value="completed">Completada</option>
            <option value="returned">Devuelta</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase text-zinc-500 font-bold">Método de pago</label>
          <select value={fMethod} onChange={e => setFMethod(e.target.value)}
            className="block bg-zinc-800 border border-zinc-700 rounded-lg px-3 h-9 text-xs text-zinc-200 outline-none focus:border-cyan-500 cursor-pointer">
            <option value="todos">Todos</option>
            <option value="EFECTIVO">Efectivo</option>
            <option value="TRANSFERENCIA">Transferencia</option>
            <option value="TARJETA">Tarjeta</option>
            <option value="CREDITO">Crédito</option>
          </select>
        </div>
        {(fStart || fEnd || fStatus !== 'todos' || fMethod !== 'todos') && (
          <button
            onClick={() => { setFStart(''); setFEnd(''); setFStatus('todos'); setFMethod('todos'); }}
            className="h-9 px-3 text-xs font-bold text-zinc-400 hover:text-rose-400 transition-colors"
          >
            Limpiar filtros
          </button>
        )}
        <span className="ml-auto text-[10px] text-zinc-500 self-center">{filteredSales.length} resultado(s) en lo cargado</span>
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
                         {STATUS_LABEL[sale.status || 'completed'] || sale.status}
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
                     <p className="text-zinc-500 text-[10px] font-bold uppercase">Total</p>
                     <p className="text-xl font-bold text-cyan-400 truncate">{formatCurrency(sale.total)}</p>
                  </div>
               </div>

               <div className="flex items-center gap-2 w-full lg:w-auto justify-end mt-2 lg:mt-0 flex-wrap">
                  {/* P2.5: proformas → botón FACTURAR; facturas → acciones de estado */}
                  {sale.documentType === 'PROFORMA' ? (
                    (sale.status || 'completed') === 'completed' ? (
                      <button
                        onClick={() => handleInvoiceProforma(sale)}
                        disabled={!!invoicingProformaId}
                        title="Convierte esta proforma en factura (verifica y descuenta stock)"
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                      >
                        {invoicingProformaId === sale.id ? 'Facturando…' : 'FACTURAR'}
                      </button>
                    ) : (
                      <span className="text-[10px] text-zinc-500 italic px-2">
                        {sale.notes?.includes('Facturada como') ? sale.notes.split('·').pop()?.trim() : 'Anulada'}
                      </span>
                    )
                  ) : (
                  <div className="flex items-center bg-zinc-800 rounded-lg p-1">
                    <button
                      onClick={() => handleStatusChange(sale, 'completed')}
                      title="Marcar Completada (descuenta stock si venía anulada)"
                      className={`p-1.5 rounded ${sale.status === 'completed' ? 'bg-cyan-600 text-white' : 'text-zinc-500 hover:text-cyan-400'}`}
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleStatusChange(sale, 'returned')}
                      title="Marcar Devuelta (repone stock)"
                      className={`p-1.5 rounded ${sale.status === 'returned' ? 'bg-amber-600 text-white' : 'text-zinc-500 hover:text-amber-400'}`}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleStatusChange(sale, 'cancelled')}
                      title="Marcar Cancelada (repone stock)"
                      className={`p-1.5 rounded ${sale.status === 'cancelled' ? 'bg-rose-600 text-white' : 'text-zinc-500 hover:text-rose-400'}`}
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                  )}

                  {/* P2.5: reimprimir PDF con los datos guardados */}
                  <button
                    onClick={() => handleReprint(sale)}
                    title="Reimprimir / descargar PDF"
                    className="p-2 text-zinc-400 hover:bg-zinc-800 hover:text-emerald-400 rounded-lg transition-colors"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  {/* P2.6: compartir por WhatsApp */}
                  {sale.customerPhone && (
                    <button
                      onClick={() => handleWhatsApp(sale)}
                      title="Enviar resumen por WhatsApp"
                      className="p-2 text-zinc-400 hover:bg-zinc-800 hover:text-emerald-500 rounded-lg transition-colors"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                  )}

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
                    title="Eliminar registro"
                    className="p-2 transition-colors rounded-lg text-zinc-400 hover:bg-rose-500/10 hover:text-rose-500"
                  >
                    <Trash2 className="w-4 h-4" />
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

      {/* P2.5: reimpresión (modo descarga, sin confirmar) */}
      {reprintData && (
        <InvoicePreview
          data={reprintData}
          isOpen={!!reprintData}
          onClose={() => setReprintData(null)}
        />
      )}

      {/* P4.5: confirmación de borrado con resumen y consecuencias */}
      {deleteModalSale && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={() => setDeleteModalSale(null)}></div>
          <div className="relative bg-zinc-900 border border-rose-500/30 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-rose-400 flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> Eliminar {deleteModalSale.documentType === 'PROFORMA' ? 'proforma' : 'venta anulada'}
            </h3>
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 text-sm text-zinc-200">
              <p className="font-bold">{deleteModalSale.invoiceNumber} — {deleteModalSale.customerName || 'Cliente final'}</p>
              <p className="text-zinc-400 text-xs mt-1">
                {new Date(deleteModalSale.date).toLocaleDateString()} · {deleteModalSale.items.length} ítem(s) · {formatCurrency(deleteModalSale.total)}
                {' '}({formatCurrencyNIO(deleteModalSale.total * (deleteModalSale.exchangeRate || 36.6243))})
              </p>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              {deleteModalSale.documentType === 'PROFORMA'
                ? 'Las proformas no afectan el stock. Esta acción no se puede deshacer.'
                : 'El stock ya fue repuesto al anular esta venta; borrar solo elimina el registro histórico y NO se puede deshacer.'}
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <button
                onClick={() => setDeleteModalSale(null)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-lg transition-colors"
              >
                Eliminar definitivamente
              </button>
            </div>
          </div>
        </div>
      )}

      {isEditModalOpen && editingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={() => setIsEditModalOpen(false)}></div>
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
             <form onSubmit={saveEditedSale}>
                <div className="p-6 border-b border-zinc-800">
                   <h3 className="text-xl font-bold text-zinc-100 italic">Editar Factura {editingSale.invoiceNumber}</h3>
                </div>
                <div className="p-6 space-y-4">
                   <div className="space-y-1">
                      <label className="text-[10px] uppercase text-zinc-500 font-bold">Nombre del cliente</label>
                      <input name="customerName" defaultValue={editingSale.customerName} className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200" />
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] uppercase text-zinc-500 font-bold">Teléfono</label>
                      <input name="customerPhone" defaultValue={editingSale.customerPhone} className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200" />
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] uppercase text-zinc-500 font-bold">Dirección</label>
                      <textarea name="customerAddress" defaultValue={editingSale.customerAddress} rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200"></textarea>
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] uppercase text-zinc-500 font-bold">Transporte</label>
                      <input name="transport" defaultValue={editingSale.transport} className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200" />
                   </div>
                </div>
                <div className="p-6 bg-zinc-800/30 flex justify-end gap-3">
                   <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-zinc-400 hover:text-zinc-200">Cancelar</button>
                   <button type="submit" className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition-all">GUARDAR CAMBIOS</button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}
