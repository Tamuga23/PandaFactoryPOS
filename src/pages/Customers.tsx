import React, { useState, useRef } from 'react';
import { useStore } from '../context/StoreContext';
import { Customer, Sale } from '../types';
import { Search, Plus, Trash2, Edit, User, Phone, MapPin, Mail, Calendar, History, Printer, MessageCircle, X, FileText, Loader2 } from 'lucide-react';
import { formatCurrency, formatCurrencyNIO } from '../lib/utils';
import InvoicePreview, { InvoiceData } from '../components/InvoicePreview';
import { buildInvoiceDataFromSale, buildWhatsAppMessage } from '../lib/invoice';
import { toast } from '../components/Toast';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';

export default function Customers() {
  const { customers, addCustomer, updateCustomer, deleteCustomer, loading, fetchSalesByCustomer, companyInfo } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  // P2.6: historial de compras del cliente.
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [customerSales, setCustomerSales] = useState<Sale[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [reprintData, setReprintData] = useState<InvoiceData | null>(null);

  // P4.7: ESC cierra el modal de más arriba.
  useEscapeKey(isModalOpen || !!historyCustomer || !!reprintData, () => {
    if (reprintData) setReprintData(null);
    else if (isModalOpen) setIsModalOpen(false);
    else setHistoryCustomer(null);
  });

  /*
    Los dos diálogos no declaraban NADA: ni rol, ni modalidad, ni nombre, ni
    trampa de foco. Para un lector de pantalla la grilla de clientes de atrás
    seguía existiendo en el mismo plano, y tabulando desde adentro del diálogo
    se llegaba a los botones de las tarjetas tapadas por el velo.
  */
  const historialRef = useRef<HTMLDivElement>(null);
  const fichaRef = useRef<HTMLDivElement>(null);
  useFocusTrap(!!historyCustomer, historialRef);
  useFocusTrap(isModalOpen, fichaRef);

  const openHistory = async (customer: Customer) => {
    setHistoryCustomer(customer);
    setLoadingHistory(true);
    try {
      setCustomerSales(await fetchSalesByCustomer(customer.id));
    } catch {
      toast.error('No se pudo cargar el historial del cliente.');
      setCustomerSales([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // El preview incluye "Enviar por WhatsApp" (comparte el PDF real).
  const [reprintWa, setReprintWa] = useState<{ text: string; link: string | null } | null>(null);
  const openSalePreview = (sale: Sale) => {
    const rate = sale.exchangeRate || companyInfo?.defaultExchangeRate || 36.6243;
    setReprintWa(sale.customerPhone ? buildWhatsAppMessage(sale, formatCurrencyNIO(sale.total * rate)) : null);
    setReprintData(buildInvoiceDataFromSale(sale, companyInfo));
  };

  const handleWhatsAppSale = (sale: Sale) => {
    if (!sale.customerPhone) {
      toast.error('El cliente no tiene un teléfono en esta venta.');
      return;
    }
    openSalePreview(sale);
  };

  const filteredCustomers = customers.filter(c => 
    c.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.phone && c.phone.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()))
  ).sort((a, b) => b.createdAt - a.createdAt);

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setEditingCustomer(null);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    if (confirmingDelete === id) {
      deleteCustomer(id);
      setConfirmingDelete(null);
    } else {
      setConfirmingDelete(id);
      setTimeout(() => setConfirmingDelete(null), 3000);
    }
  };

  const saveCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const customerObj = {
      fullName: formData.get('fullName') as string,
      phone: formData.get('phone') as string,
      email: formData.get('email') as string,
      address: formData.get('address') as string,
    };

    if (editingCustomer) {
      // Update
      await updateCustomer({
        ...editingCustomer,
        ...customerObj
      });
    } else {
      // Create new natively
      // NOTE: UUID for new ones created directly from CRM panel
      await addCustomer({
        id: crypto.randomUUID(),
        ...customerObj,
        createdAt: Date.now()
      });
    }

    setIsModalOpen(false);
    setEditingCustomer(null);
  };

  if (loading) return <div className="text-zinc-500 p-8">Cargando clientes…</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 uppercase tracking-tight italic">Clientes (CRM)</h2>
          <p className="text-xs text-zinc-500">Directorio de clientes, contactos e historial de compras.</p>
        </div>
        <div className="flex flex-col md:flex-row w-full md:w-auto gap-3">
          <div className="relative w-full md:w-64">
             <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" aria-hidden="true" />
             <input
              type="text"
              aria-label="Buscar un cliente por nombre o teléfono"
              placeholder="Buscar por nombre o teléfono…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 h-10 text-sm text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>
          <button 
            onClick={handleAddNew}
            className="h-10 px-4 bg-cyan-700 hover:bg-cyan-800 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-colors whitespace-nowrap text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <Plus className="w-4 h-4" />
            Nuevo Cliente
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCustomers.map(customer => (
          /*
            Tenía un gradiente turquesa de fondo que se encendía al hover.
            DESIGN.md dice que el wordmark `pandastore` es el ÚNICO gradiente
            permitido del sistema, y que es identidad, no decoración. El hover
            de una superficie clickeable que no es botón se resuelve subiendo el
            borde, que es lo que el sistema prescribe y lo que ya hacen la
            tarjeta de producto, el chip de categoría y las pestañas.
          */
          <div key={customer.id} className="bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors rounded-xl p-4 flex flex-col justify-between relative group overflow-hidden">
             
                          
             <div className="relative z-10 flex flex-col h-full gap-4">
                {/* Header Profile */}
                <div className="flex items-start justify-between">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-cyan-400 shrink-0">
                         <User className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-zinc-100 truncate text-sm leading-tight">{customer.fullName}</h3>
                        <p className="text-[10px] text-zinc-400 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" /> Registrado: {new Date(customer.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                   </div>
                </div>
                
                {/* Contact Data Layout */}
                <div className="space-y-2 mt-auto text-xs bg-zinc-950/40 p-3 rounded-lg border border-zinc-800/50">
                  <div className="flex items-center gap-2 text-zinc-300">
                     <Phone className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                     <span className="truncate">{customer.phone || 'Sin teléfono'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-300">
                     <Mail className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                     <span className="truncate">{customer.email || 'Sin correo'}</span>
                  </div>
                  <div className="flex items-start gap-2 text-zinc-300">
                     <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                     <span className="line-clamp-2 leading-relaxed">{customer.address || 'Sin dirección'}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                   {/* P2.6: historial de compras */}
                   <button
                     onClick={() => openHistory(customer)}
                     className="flex-1 py-1.5 bg-cyan-600/10 hover:bg-cyan-800/20 text-cyan-400 text-xs font-semibold rounded-md border border-cyan-500/30 transition-colors flex justify-center items-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                   >
                     <History className="w-3 h-3" /> Historial
                   </button>
                   <button
                     onClick={() => handleEdit(customer)}
                     className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-md border border-zinc-700 hover:border-zinc-600 transition-colors flex justify-center items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                   >
                     <Edit className="w-3 h-3" /> Editar
                   </button>
                   <button 
                     onClick={() => handleDeleteClick(customer.id)} 
                     className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors flex justify-center items-center ${confirmingDelete === customer.id ? 'bg-rose-500/20 text-rose-500 border-rose-500/30' : 'bg-zinc-800 hover:bg-rose-500/10 text-zinc-400 hover:text-rose-500 border-zinc-700 hover:border-rose-500/30'} focus:outline-none focus:ring-2 focus:ring-rose-500`}
                   >
                     {confirmingDelete === customer.id ? '¿Eliminar?' : <Trash2 className="w-3.5 h-3.5" />}
                   </button>
                </div>
             </div>
          </div>
        ))}
        {filteredCustomers.length === 0 && (
          <div className="col-span-1 md:col-span-2 lg:col-span-3 p-20 text-center text-zinc-500 flex flex-col items-center gap-4 bg-zinc-900 border border-zinc-800 border-dashed rounded-xl">
             <User className="w-12 h-12 opacity-20" />
             <p className="italic">Sin clientes todavía. ¡Creá el primero!</p>
          </div>
        )}
      </div>

      {/* P2.6: drawer de historial del cliente */}
      {historyCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            onClick={() => setHistoryCustomer(null)}
            aria-hidden="true"
          ></div>
          <div
            ref={historialRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-historial-cliente"
            tabIndex={-1}
            autoFocus
            className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
          >
            <div className="p-5 border-b border-zinc-800 flex justify-between items-start shrink-0">
              <div>
                <h3 id="titulo-historial-cliente" className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                  <History className="w-5 h-5 text-cyan-400" aria-hidden="true" /> Historial de {historyCustomer.fullName}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">{historyCustomer.phone || 'Sin teléfono'} {historyCustomer.email ? `· ${historyCustomer.email}` : ''}</p>
              </div>
              <button
                onClick={() => setHistoryCustomer(null)}
                aria-label="Cerrar el historial"
                className="p-2 bg-zinc-800 rounded-lg text-zinc-400 hover:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {(() => {
              const completed = customerSales.filter(s => s.documentType !== 'PROFORMA' && (s.status || 'completed') === 'completed');
              const totalSpent = completed.reduce((acc, s) => acc + s.total, 0);
              const lastDate = customerSales.length > 0 ? Math.max(...customerSales.map(s => s.date)) : null;
              return (
                <div className="grid grid-cols-3 gap-3 p-4 shrink-0">
                  <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 text-center">
                    <p className="text-[10px] uppercase font-bold text-zinc-400">Total Gastado</p>
                    <p className="text-lg font-bold text-emerald-400">{formatCurrency(totalSpent)}</p>
                  </div>
                  <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 text-center">
                    <p className="text-[10px] uppercase font-bold text-zinc-400">Compras</p>
                    <p className="text-lg font-bold text-cyan-400">{completed.length}</p>
                  </div>
                  <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 text-center">
                    <p className="text-[10px] uppercase font-bold text-zinc-400">Última</p>
                    <p className="text-sm font-bold text-zinc-300 mt-1">{lastDate ? new Date(lastDate).toLocaleDateString() : '—'}</p>
                  </div>
                </div>
              );
            })()}

            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 custom-scrollbar">
              {loadingHistory ? (
                <div className="p-10 text-center text-zinc-500 flex justify-center items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando historial…
                </div>
              ) : customerSales.length === 0 ? (
                <div className="p-10 text-center text-zinc-500 italic text-sm">Este cliente no tiene ventas asociadas todavía.</div>
              ) : (
                customerSales.map(sale => (
                  <div key={sale.id} className="bg-zinc-800/40 border border-zinc-700/50 rounded-lg p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-zinc-200 flex items-center gap-2 flex-wrap">
                        <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        {sale.invoiceNumber}
                        <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded-full ${
                          sale.documentType === 'PROFORMA' ? 'bg-zinc-700 text-zinc-300' :
                          (sale.status || 'completed') === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                          sale.status === 'returned' ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500'
                        }`}>
                          {sale.documentType === 'PROFORMA' ? 'proforma' : (sale.status || 'completed')}
                        </span>
                      </p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {new Date(sale.date).toLocaleDateString()} · {sale.items.length} ítem(s) · {sale.items.slice(0, 2).map(i => i.name).join(', ')}{sale.items.length > 2 ? '…' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-sm font-bold text-cyan-400 mr-2">{formatCurrency(sale.total)}</span>
                      <button
                        onClick={() => openSalePreview(sale)}
                        title="Reimprimir PDF"
                        className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      {sale.customerPhone && (
                        <button
                          onClick={() => handleWhatsAppSale(sale)}
                          title="Enviar resumen por WhatsApp"
                          className="p-1.5 text-zinc-400 hover:text-emerald-500 hover:bg-zinc-800 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* P2.5/P2.6: reimpresión desde el historial del cliente */}
      {reprintData && (
        <InvoicePreview
          data={reprintData}
          isOpen={!!reprintData}
          onClose={() => { setReprintData(null); setReprintWa(null); }}
          whatsApp={reprintWa}
        />
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
            aria-hidden="true"
          ></div>
          <div
            ref={fichaRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-ficha-cliente"
            tabIndex={-1}
            autoFocus
            className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
          >
             <form onSubmit={saveCustomer}>
                <div className="p-6 border-b border-zinc-800">
                   <h3 id="titulo-ficha-cliente" className="text-xl font-bold text-zinc-100 italic flex items-center gap-2">
                      <User className="w-5 h-5 text-cyan-400" aria-hidden="true" />
                      {editingCustomer ? 'Editar Cliente' : 'Nuevo Cliente'}
                   </h3>
                </div>
                <div className="p-6 space-y-4">
                   <div className="space-y-1">
                      <label htmlFor="ficha-cliente-nombre" className="text-[10px] uppercase text-zinc-400 font-bold">Nombre completo (requerido)</label>
                      <input id="ficha-cliente-nombre"
                         name="fullName"
                         required
                         defaultValue={editingCustomer?.fullName}
                         placeholder="Juan Pérez"
                         className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:border-cyan-500 focus:outline-none" 
                      />
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                        <label htmlFor="ficha-cliente-telefono" className="text-[10px] uppercase text-zinc-400 font-bold">Teléfono</label>
                        <input id="ficha-cliente-telefono" 
                           name="phone" 
                           defaultValue={editingCustomer?.phone} 
                           placeholder="8765 9876"
                           className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:border-cyan-500 focus:outline-none" 
                        />
                     </div>
                     <div className="space-y-1">
                        <label htmlFor="ficha-cliente-correo" className="text-[10px] uppercase text-zinc-400 font-bold">Correo electrónico</label>
                        <input id="ficha-cliente-correo" 
                           name="email" 
                           type="email"
                           defaultValue={editingCustomer?.email} 
                           placeholder="jhon@mail.com"
                           className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:border-cyan-500 focus:outline-none" 
                        />
                     </div>
                   </div>
                   <div className="space-y-1">
                      <label htmlFor="ficha-cliente-direccion" className="text-[10px] uppercase text-zinc-400 font-bold">Dirección / datos de envío</label>
                      <textarea id="ficha-cliente-direccion" 
                         name="address" 
                         defaultValue={editingCustomer?.address} 
                         rows={3} 
                         placeholder="Barrio Santa Ana, De la iglesia 2c al sur..."
                         className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:border-cyan-500 focus:outline-none resize-none"
                      ></textarea>
                   </div>
                </div>
                <div className="p-6 bg-zinc-800/30 flex justify-end gap-3 border-t border-zinc-800">
                   <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2 text-sm text-zinc-400 hover:text-white font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded">Cancelar</button>
                   <button type="submit" className="px-6 py-2 bg-cyan-700 hover:bg-cyan-800 text-white font-bold rounded-lg transition-all text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">Guardar</button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}
