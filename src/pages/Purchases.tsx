import React, { useState, useMemo } from 'react';
import { useStoreData } from '../hooks/useStoreData';
import { Purchase, Product, PurchaseTracking } from '../types';
import { formatCurrency } from '../lib/utils';
import { Trash2, Calendar, User, Plus, Package, Clock, CheckCircle2, Navigation, Edit } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import PurchaseRegistration from '../components/PurchaseRegistration';

export default function Purchases() {
  const { products, purchases, recordPurchase, updatePurchase, deletePurchase, addProduct, companyInfo, loading, suppliers, addSupplier } = useStoreData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [trackingModalPurchase, setTrackingModalPurchase] = useState<Purchase | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  // Tracking CRUD states
  const [editingTracking, setEditingTracking] = useState<PurchaseTracking | null>(null);
  const [isAddingTracking, setIsAddingTracking] = useState(false);
  const [trackNumber, setTrackNumber] = useState('');
  const [trackStatus, setTrackStatus] = useState('');
  const [agentDate, setAgentDate] = useState('');
  const [receptionDate, setReceptionDate] = useState('');
  const [finalWeight, setFinalWeight] = useState('');
  const [boxItems, setBoxItems] = useState<{itemId: string, quantity: number}[]>([]);
  const [isSavingPhase2, setIsSavingPhase2] = useState(false);

  const handleDeleteClick = (id: string) => {
    if (confirmingDelete === id) {
      deletePurchase(id);
      setConfirmingDelete(null);
    } else {
      setConfirmingDelete(id);
      setTimeout(() => setConfirmingDelete(null), 3000);
    }
  };

  const closeTrackingForm = () => {
    setIsAddingTracking(false);
    setEditingTracking(null);
    setTrackNumber('');
    setTrackStatus('');
    setAgentDate('');
    setReceptionDate('');
    setFinalWeight('');
    setBoxItems([]);
  };

  const openTrackingModal = (p: Purchase) => {
    setTrackingModalPurchase(p);
    closeTrackingForm();
  };

  const initEditTracking = (tracking: PurchaseTracking) => {
    setEditingTracking(tracking);
    setTrackNumber(tracking.trackingNumber || '');
    setTrackStatus(tracking.status || '');
    setAgentDate(tracking.agentDeliveryDate ? new Date(tracking.agentDeliveryDate).toISOString().split('T')[0] : '');
    setReceptionDate(tracking.receptionDate ? new Date(tracking.receptionDate).toISOString().split('T')[0] : '');
    setFinalWeight(tracking.finalWeight ? String(tracking.finalWeight) : '');
    setBoxItems([...tracking.itemsInBox]);
    setIsAddingTracking(true);
  };

  const handleBoxItemChange = (itemId: string, maxQty: number, value: string) => {
    const val = parseInt(value) || 0;
    const clamped = Math.min(Math.max(0, val), maxQty);
    
    setBoxItems(prev => {
      const existing = prev.find(i => i.itemId === itemId);
      if (existing) {
        if (clamped === 0) return prev.filter(i => i.itemId !== itemId);
        return prev.map(i => i.itemId === itemId ? { ...i, quantity: clamped } : i);
      } else {
        if (clamped === 0) return prev;
        return [...prev, { itemId, quantity: clamped }];
      }
    });
  };

  const saveTracking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingModalPurchase) return;

    if (boxItems.length === 0) {
        alert("Please add at least one item to this box.");
        return;
    }

    setIsSavingPhase2(true);

    const newTracking: PurchaseTracking = {
      id: editingTracking?.id || uuidv4(),
      trackingNumber: trackNumber,
      status: trackStatus,
      isReceived: editingTracking ? editingTracking.isReceived : false,
      itemsInBox: boxItems,
      agentDeliveryDate: agentDate ? new Date(agentDate).getTime() + 86400000 : undefined,
      receptionDate: receptionDate ? new Date(receptionDate).getTime() + 86400000 : undefined,
      finalWeight: finalWeight ? parseFloat(finalWeight) : undefined
    };

    let trackingsList = trackingModalPurchase.trackings || [];
    
    if (editingTracking) {
      trackingsList = trackingsList.map(t => t.id === newTracking.id ? newTracking : t);
    } else {
      trackingsList = [...trackingsList, newTracking];
    }

    const updatedPurchase = { ...trackingModalPurchase, trackings: trackingsList };
    
    // Set temp state for immediate UI feedback while DB saves
    setTrackingModalPurchase(updatedPurchase);
    
    try {
      await updatePurchase(updatedPurchase);
      closeTrackingForm();
    } catch (error) {
      alert("Error saving tracking");
    } finally {
      setIsSavingPhase2(false);
    }
  };


  if (loading) return <div className="text-zinc-500">Loading purchases...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 italic flex items-center gap-2">
            <Package className="w-5 h-5 text-sky-400" /> Inventory Inbound (Compras)
          </h2>
          <p className="text-xs text-zinc-400">Track and register stock purchases from suppliers.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          REGISTRAR ORDEN (FASE 1)
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-800 text-zinc-400 text-[10px] uppercase font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Status & Ref</th>
                <th className="px-6 py-4">Order Date</th>
                <th className="px-6 py-4">Supplier & Channel</th>
                <th className="px-6 py-4">Items & Info</th>
                <th className="px-6 py-4 text-right">Total Cost</th>
                <th className="px-6 py-4 text-center">Tracking (Fase 2)</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {purchases.sort((a, b) => b.date - a.date).map(p => {
                const isClosed = p.status === 'CLOSED';
                const isPartial = p.status === 'PARTIAL';
                const trackings = p.trackings || [];
                const receivedTrackings = trackings.filter(t => t.isReceived).length;

                return (
                  <tr key={p.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5 w-fit">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          isClosed 
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                            : isPartial 
                            ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                        }`}>
                          {isClosed ? <CheckCircle2 className="w-3 h-3" /> : isPartial ? <Clock className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          <span>{p.status || 'OPEN'}</span>
                        </div>
                        <span className="font-mono text-[10px] text-zinc-500 px-1">{p.id.slice(0, 8)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs whitespace-nowrap">
                      <div className="space-y-1.5 flex flex-col items-start w-fit">
                         <div className="flex items-center gap-2 w-full justify-between">
                            <span className="text-zinc-500 flex items-center gap-1"><Calendar className="w-3 h-3"/> Order:</span> 
                            <span className="text-zinc-200 font-medium">{new Date(p.date).toLocaleDateString()}</span>
                         </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <div className="font-bold text-zinc-200">{p.supplier || 'N/A'}</div>
                      <div className="text-zinc-500 text-[10px]">{p.shippingModality} via {p.shippingChannel}</div>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <div className="text-zinc-300">{p.items.length} items</div>
                      <div className="text-zinc-500 line-clamp-1 max-w-[150px]" title={p.items.map(i=>i.name).join(', ')}>
                        {p.items[0]?.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-cyan-400">
                      {formatCurrency(p.totalCost)}
                    </td>
                    <td className="px-6 py-4 text-center">
                       <button
                         onClick={() => openTrackingModal(p)}
                         className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${isClosed ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20' : 'bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20'}`}
                       >
                         {trackings.length > 0 ? `${receivedTrackings} / ${trackings.length} Boxes RCVD` : 'Actualizar Track'}
                       </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDeleteClick(p.id)}
                        className={`transition-colors text-xs font-bold ${confirmingDelete === p.id ? 'text-rose-500' : 'text-zinc-500 hover:text-rose-400'}`}
                      >
                        {confirmingDelete === p.id ? 'Delete?' : <Trash2 className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {purchases.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-zinc-500 italic">No purchase history found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {trackingModalPurchase && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={() => { setTrackingModalPurchase(null); closeTrackingForm(); }}></div>
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-zinc-700 flex justify-between items-center bg-zinc-800/50 shrink-0">
               <div>
                  <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                     <Package className="w-5 h-5 text-sky-400" /> Tracking y Recepción (Fase 2)
                  </h3>
                  <p className="text-xs text-zinc-400">Orden original a: {trackingModalPurchase.supplier}</p>
               </div>
               <button onClick={() => { setTrackingModalPurchase(null); closeTrackingForm(); }} className="p-2 bg-zinc-800 rounded-lg text-zinc-400 hover:text-white">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-zinc-950/50">
               {!isAddingTracking ? (
                 <>
                   <div className="flex justify-between items-center mb-4">
                     <h4 className="text-sm font-bold text-zinc-300 uppercase">Trackings de esta Orden</h4>
                     <button
                       onClick={() => setIsAddingTracking(true)}
                       className="text-xs bg-sky-600 hover:bg-sky-500 text-white font-bold py-1.5 px-3 rounded-lg flex items-center gap-1 transition-colors"
                     >
                       <Plus className="w-3 h-3" /> Agregar Tracking
                     </button>
                   </div>
                   
                   <div className="space-y-3">
                     {(trackingModalPurchase.trackings || []).map(t => (
                       <div key={t.id} className="bg-zinc-800 p-4 border border-zinc-700 rounded-xl relative">
                         {t.isReceived && (
                           <div className="absolute top-4 right-4 flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                             <CheckCircle2 className="w-3 h-3" /> IN STOCK
                           </div>
                         )}
                         <div className="flex items-center gap-3 mb-2">
                            <span className="font-mono text-sm text-zinc-100 font-bold tracking-wider">{t.trackingNumber || 'Sin Asignar'}</span>
                         </div>
                         <div className="text-xs text-zinc-400 mb-3 flex gap-4">
                            <span><b>Status:</b> {t.status || 'N/A'}</span>
                            {t.finalWeight && <span><b>Peso:</b> {t.finalWeight} lbs</span>}
                         </div>
                         <div className="bg-zinc-900 border border-zinc-700/50 rounded-lg p-3">
                            <p className="text-[10px] font-bold text-zinc-500 mb-2 uppercase">Items que vienen aquí:</p>
                            <div className="space-y-1">
                              {t.itemsInBox.map(iib => {
                                 const pItem = trackingModalPurchase.items.find(i => i.id === iib.itemId);
                                 return (
                                   <div key={iib.itemId} className="text-xs flex justify-between">
                                      <span className="text-zinc-300">{pItem?.name || iib.itemId}</span>
                                      <span className="font-mono text-cyan-400 shrink-0 ml-2">Qty: {iib.quantity}</span>
                                   </div>
                                 );
                              })}
                            </div>
                         </div>
                         <div className="mt-3 flex gap-2">
                           {!t.isReceived && (
                             <button
                               onClick={() => initEditTracking(t)}
                               className="text-xs bg-zinc-700 hover:bg-zinc-600 text-white py-1.5 px-3 rounded-lg flex items-center gap-1 transition-colors font-bold"
                             >
                               <Edit className="w-3 h-3" /> Actualizar o Marcar como Recibido
                             </button>
                           )}
                         </div>
                       </div>
                     ))}
                     {(trackingModalPurchase.trackings || []).length === 0 && (
                       <div className="text-center p-8 bg-zinc-800/50 border border-zinc-700 border-dashed rounded-xl">
                         <Navigation className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
                         <p className="text-sm text-zinc-500">No hay trackings logísticos asociados.</p>
                       </div>
                     )}
                   </div>
                 </>
               ) : (
                 <form onSubmit={saveTracking} className="space-y-4">
                   <div className="flex items-center justify-between mb-2 pb-2 border-b border-zinc-800">
                     <h4 className="text-sm font-bold text-sky-400 flex items-center gap-2">
                       {editingTracking ? 'Actualizar Status de Caja' : 'Nuevo Envío/Tracking'}
                     </h4>
                     <button type="button" onClick={closeTrackingForm} className="text-xs text-zinc-500 hover:text-white bg-zinc-800 px-3 py-1 rounded">Cancelar</button>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                         <label className="text-[10px] uppercase text-zinc-500 font-bold">Tracking / Guía ID</label>
                         <input type="text" disabled={editingTracking?.isReceived} value={trackNumber} onChange={e=>setTrackNumber(e.target.value)} required className="w-full bg-zinc-800 disabled:opacity-50 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-sky-500" />
                      </div>
                      <div className="space-y-1">
                         <label className="text-[10px] uppercase text-zinc-500 font-bold">Estado Logístico</label>
                         <select disabled={editingTracking?.isReceived} value={trackStatus} onChange={e=>setTrackStatus(e.target.value)} className="w-full bg-zinc-800 border disabled:opacity-50 border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-sky-500">
                            <option value="">Seleccionar...</option>
                            <option value="Procesando">Procesando</option>
                            <option value="Enviado a Miami">Enviado a Miami</option>
                            <option value="Recibido en Miami">Recibido en Miami</option>
                            <option value="En Tránsito a NIC">En Tránsito a NIC</option>
                            <option value="Listo para Retiro">Listo para Retiro</option>
                         </select>
                      </div>
                   </div>

                   <div className="bg-zinc-800/80 border border-zinc-700 rounded-xl p-4 mt-2">
                      <h5 className="text-[10px] uppercase text-zinc-400 font-bold mb-3">Qué ítems vienen en EXACTAMENTE ESTA Caja?</h5>
                      <div className="space-y-2">
                         {trackingModalPurchase.items.map(pItem => {
                            const inBox = boxItems.find(i => i.itemId === pItem.id)?.quantity || 0;
                            // Calculate remaining unassigned items across other boxes
                            let otherBoxesQty = 0;
                            if (trackingModalPurchase.trackings) {
                              trackingModalPurchase.trackings.forEach(t => {
                                if (t.id !== editingTracking?.id) {
                                  otherBoxesQty += t.itemsInBox.find(i => i.itemId === pItem.id)?.quantity || 0;
                                }
                              });
                            }
                            const maxAllowed = pItem.quantity - otherBoxesQty;
                            
                            return (
                              <div key={pItem.id} className="flex flex-col sm:flex-row justify-between sm:items-center py-2 border-b border-zinc-700/50 gap-2">
                                <div className="text-xs text-zinc-300">
                                  {pItem.name} 
                                  <span className="block text-[10px] text-zinc-500">Ordenados: {pItem.quantity} | Disponibles para Asignar en cajas: {maxAllowed}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="number" 
                                    min="0"
                                    max={maxAllowed}
                                    disabled={editingTracking?.isReceived}
                                    value={inBox || ''}
                                    onChange={(e) => handleBoxItemChange(pItem.id, maxAllowed, e.target.value)}
                                    placeholder="0"
                                    className="w-16 bg-zinc-900 border disabled:opacity-50 border-zinc-600 rounded p-1 text-center text-sm text-white focus:border-sky-500 outline-none font-mono" 
                                  />
                                </div>
                              </div>
                            );
                         })}
                      </div>
                   </div>

                   <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                         <label className="text-[10px] uppercase text-zinc-500 font-bold">Peso Final Cobradas (lbs)</label>
                         <input disabled={editingTracking?.isReceived} type="number" step="any" value={finalWeight} onChange={e=>setFinalWeight(e.target.value)} className="w-full bg-zinc-800 disabled:opacity-50 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-sky-500" placeholder="Ej. 5.5" />
                      </div>
                      <div className="space-y-1">
                         <label className="text-[10px] uppercase text-zinc-500 font-bold">Agente Recibe (Miami)</label>
                         <input disabled={editingTracking?.isReceived} type="date" value={agentDate} onChange={e=>setAgentDate(e.target.value)} className="w-full bg-zinc-800 disabled:opacity-50 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-sky-500" />
                      </div>
                      <div className="space-y-1 col-span-2 md:col-span-1">
                         <label className="text-[10px] uppercase text-emerald-500 font-bold">Recepción en Bodega (NIC)</label>
                         <input disabled={editingTracking?.isReceived} type="date" value={receptionDate} onChange={e=>setReceptionDate(e.target.value)} className="w-full bg-zinc-800 border disabled:opacity-50 border-emerald-700/50 rounded-lg p-2 text-sm text-emerald-400 outline-none focus:border-emerald-500" />
                      </div>
                   </div>

                   <div className="pt-4 border-t border-zinc-800 mt-6">
                      {receptionDate && !editingTracking?.isReceived && (
                        <div className="p-3 mb-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-start gap-2">
                          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                          <p className="text-[10px] text-emerald-400 leading-relaxed uppercase font-semibold mt-0.5">Al establecer Fecha de Recepción e ingresar este tracking general, se sumarán al inventario permanentemente estas unidades. Revisa la cantidad correctamente.</p>
                        </div>
                      )}
                      
                      {!editingTracking?.isReceived && (
                        <button type="submit" disabled={isSavingPhase2} className="w-full bg-sky-600 hover:bg-sky-500 disabled:bg-sky-900 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg flex justify-center items-center">
                           {isSavingPhase2 ? 'Guardando...' : 'Guardar y Asociar a Orden'}
                        </button>
                      )}
                   </div>
                 </form>
               )}
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex-1 overflow-hidden">
               <PurchaseRegistration 
                 inventory={products}
                 suppliers={suppliers}
                 onAddSupplier={addSupplier}
                 onCancel={() => setIsModalOpen(false)}
                 onSuccess={() => setIsModalOpen(false)}
                 onAddProduct={async (newProductData: any) => {
                   const { fileToBase64, compressImage } = await import('../lib/utils');
                   let base64 = '';
                   if (newProductData.imageFile) {
                      const base64FromFile = await fileToBase64(newProductData.imageFile);
                      base64 = await compressImage(base64FromFile, 800, 800, 0.7);
                   }
                   
                   const id = uuidv4();
                   const productToSave: Product = {
                     id,
                     name: newProductData.name,
                     sku: newProductData.sku,
                     description: '',
                     price: newProductData.price,
                     cost: newProductData.cost,
                     stock: 0, 
                     minStockAlert: 5,
                     category: newProductData.category,
                     imageBase64: base64,
                     createdAt: Date.now(),
                     updatedAt: Date.now()
                   };
                   
                   await addProduct(productToSave);
                   return id;
                 }}
                 onAddPurchase={async (purchaseData: any) => {
                   const pId = uuidv4();
                   const purchase: Omit<Purchase, 'ownerId'> = {
                     id: pId,
                     date: purchaseData.date,
                     supplier: purchaseData.supplier,
                     platform: purchaseData.platform,
                     shippingChannel: purchaseData.shippingChannel,
                     shippingModality: purchaseData.shippingMode,
                     orderNumber: purchaseData.orderNumber,
                     financing: purchaseData.financing,
                     estimatedWeight: purchaseData.items.reduce((acc: number, i: any) => acc + (i.estimatedWeight || 0), 0) || undefined,
                     status: 'OPEN',
                     stockAdded: false,
                     currency: 'USD',
                     exchangeRate: companyInfo?.defaultExchangeRate || 36.6243,
                     items: purchaseData.items.map((item: any) => ({
                       id: item.itemId,
                       name: item.description,
                       sku: products.find((inv: any) => inv.id === item.itemId)?.sku || 'N/A',
                       cost: item.unitCost,
                       quantity: item.quantity,
                       receivedQuantity: 0,
                       color: item.color,
                       estimatedWeight: item.estimatedWeight,
                     })),
                     totalCost: purchaseData.items.reduce((acc: number, i: any) => acc + (i.unitCost * i.quantity), 0),
                     trackings: [],
                   };
                   
                   Object.keys(purchase).forEach(key => purchase[key as keyof typeof purchase] === undefined && delete purchase[key as keyof typeof purchase]);
                   purchase.items.forEach(item => {
                     Object.keys(item).forEach(key => item[key as keyof typeof item] === undefined && delete item[key as keyof typeof item]);
                   });

                   await recordPurchase(purchase);
                 }}
               />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
