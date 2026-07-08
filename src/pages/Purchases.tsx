import React, { useState, useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import { Purchase, PurchaseItem, Product, PurchaseTracking } from '../types';
import { formatCurrency, DEFAULT_EXCHANGE_RATE } from '../lib/utils';
import { Trash2, Calendar, User, Plus, Package, Clock, CheckCircle2, Navigation, Edit, Ban, X, Truck } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import PurchaseRegistration from '../components/PurchaseRegistration';
import { toast } from '../components/Toast';
import { useEscapeKey } from '../hooks/useEscapeKey';

// P2.8: parseo LOCAL de fechas yyyy-MM-dd (elimina el hack +86400000 de timezone).
// Se ancla a mediodía local para ser inmune a cambios de hora.
const parseLocalDate = (str: string): number | undefined => {
  if (!str) return undefined;
  const [y, m, d] = str.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
};
const toLocalDateStr = (ts?: number) => (ts ? format(new Date(ts), 'yyyy-MM-dd') : '');

export default function Purchases() {
  const { products, purchases, recordPurchase, updatePurchase, deletePurchase, cancelPurchase, revertTrackingReception, addProduct, companyInfo, loading, suppliers, addSupplier } = useStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [trackingModalPurchase, setTrackingModalPurchase] = useState<Purchase | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  // P1.6: `purchase.supplier` guarda el ID del proveedor; resolver el nombre.
  const supplierName = (idOrName?: string) =>
    suppliers.find(s => s.id === idOrName)?.name || idOrName || 'N/A';

  // P1.7: reversión de recepciones marcadas por error.
  const [confirmingRevert, setConfirmingRevert] = useState<string | null>(null);
  const [isReverting, setIsReverting] = useState(false);

  // P2.8: editar / cancelar orden (solo sin cajas recibidas).
  const [editingOrder, setEditingOrder] = useState<Purchase | null>(null);
  const [orderForm, setOrderForm] = useState<any>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState<string | null>(null);

  const canModifyOrder = (p: Purchase) =>
    p.status !== 'CANCELLED' && (p.trackings || []).every(t => !t.isReceived);

  // P4.7: ESC cierra el modal de más arriba.
  useEscapeKey(!!editingOrder || !!trackingModalPurchase || isModalOpen, () => {
    if (editingOrder) { setEditingOrder(null); setOrderForm(null); }
    else if (trackingModalPurchase) { setTrackingModalPurchase(null); closeTrackingForm(); }
    else setIsModalOpen(false);
  });

  const openOrderEdit = (p: Purchase) => {
    setEditingOrder(p);
    setOrderForm({
      platform: p.platform || '',
      orderNumber: p.orderNumber || '',
      financing: p.financing || '',
      shippingChannel: p.shippingChannel || '',
      shippingModality: p.shippingModality || '',
      shippingRatePerLb: p.shippingRatePerLb != null ? String(p.shippingRatePerLb) : '',
      freightCost: p.freightCost != null ? String(p.freightCost) : '',
      customsTaxes: p.customsTaxes != null ? String(p.customsTaxes) : '',
      insuranceCost: p.insuranceCost != null ? String(p.insuranceCost) : '',
      items: (p.items || []).map(i => ({
        ...i,
        costStr: String(i.cost),
        qtyStr: String(i.quantity),
        weightStr: i.estimatedWeight != null ? String(i.estimatedWeight) : '',
        colorStr: i.color || '',
      })),
    });
  };

  const setOrderItemField = (id: string, field: string, value: string) => {
    setOrderForm((prev: any) => ({
      ...prev,
      items: prev.items.map((i: any) => (i.id === id ? { ...i, [field]: value } : i)),
    }));
  };

  const saveOrderEdit = async () => {
    if (!editingOrder || !orderForm) return;
    // Unidades ya asignadas a cajas: la cantidad no puede bajar de eso.
    const assigned = new Map<string, number>();
    (editingOrder.trackings || []).forEach(t =>
      (t.itemsInBox || []).forEach(b => assigned.set(b.itemId, (assigned.get(b.itemId) || 0) + b.quantity))
    );

    const items: PurchaseItem[] = [];
    for (const it of orderForm.items) {
      const quantity = parseInt(it.qtyStr) || 0;
      const cost = Math.max(0, Number(it.costStr) || 0);
      if (quantity < 1) {
        toast.error(`Cantidad inválida en "${it.name}".`);
        return;
      }
      const asg = assigned.get(it.id) || 0;
      if (quantity < asg) {
        toast.error(`"${it.name}": la cantidad (${quantity}) no puede ser menor a lo ya asignado en cajas (${asg}).`);
        return;
      }
      const item: PurchaseItem = {
        id: it.id, name: it.name, sku: it.sku,
        cost, quantity, receivedQuantity: it.receivedQuantity || 0,
      };
      if (it.colorStr) item.color = it.colorStr;
      const w = Number(it.weightStr);
      if (it.weightStr && w > 0) item.estimatedWeight = w;
      items.push(item);
    }

    setIsSavingOrder(true);
    try {
      const num = (v: string) => (Number(v) > 0 ? Number(v) : undefined);
      const updated: Purchase = {
        ...editingOrder,
        platform: orderForm.platform || undefined,
        orderNumber: orderForm.orderNumber || undefined,
        financing: orderForm.financing || undefined,
        shippingChannel: orderForm.shippingChannel || undefined,
        shippingModality: (orderForm.shippingModality || undefined) as Purchase['shippingModality'],
        shippingRatePerLb: num(orderForm.shippingRatePerLb),
        freightCost: num(orderForm.freightCost),
        customsTaxes: num(orderForm.customsTaxes),
        insuranceCost: num(orderForm.insuranceCost),
        items,
        totalCost: items.reduce((a, i) => a + i.cost * i.quantity, 0),
      };
      await updatePurchase(updated);
      toast.success('Orden actualizada.');
      setEditingOrder(null);
      setOrderForm(null);
    } catch {
      toast.error('No se pudo actualizar la orden.');
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleCancelOrder = async (p: Purchase) => {
    if (confirmingCancel !== p.id) {
      setConfirmingCancel(p.id);
      setTimeout(() => setConfirmingCancel(null), 4000);
      return;
    }
    setConfirmingCancel(null);
    try {
      await cancelPurchase(p.id);
      toast.success('Orden cancelada. No se podrá recibir mercadería de ella.');
    } catch {
      toast.error('No se pudo cancelar la orden.');
    }
  };

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
    // P2.8: formateo LOCAL (toISOString corría el día en UTC-6).
    setAgentDate(toLocalDateStr(tracking.agentDeliveryDate));
    setReceptionDate(toLocalDateStr(tracking.receptionDate));
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

  const handleRevertClick = async (tracking: PurchaseTracking) => {
    if (!trackingModalPurchase) return;
    if (confirmingRevert !== tracking.id) {
      setConfirmingRevert(tracking.id);
      setTimeout(() => setConfirmingRevert(null), 4000);
      return;
    }
    setConfirmingRevert(null);
    setIsReverting(true);
    try {
      await revertTrackingReception(trackingModalPurchase.id, tracking.id);
      // Reflejar la reversión en el estado local del modal.
      setTrackingModalPurchase(prev => {
        if (!prev) return prev;
        const removeBy = new Map<string, number>();
        (tracking.itemsInBox || []).forEach(b => removeBy.set(b.itemId, (removeBy.get(b.itemId) || 0) + b.quantity));
        return {
          ...prev,
          items: prev.items.map(i => ({
            ...i,
            receivedQuantity: Math.max(0, (i.receivedQuantity || 0) - (removeBy.get(i.id) || 0)),
          })),
          trackings: prev.trackings.map(t =>
            t.id === tracking.id ? { ...t, isReceived: false, receptionDate: undefined } : t
          ),
        };
      });
      toast.success('Recepción revertida: el stock de esa caja se descontó del inventario. (El costo promedio no se recalcula.)');
    } catch {
      toast.error('No se pudo revertir la recepción.');
    } finally {
      setIsReverting(false);
    }
  };

  const saveTracking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingModalPurchase) return;

    if (boxItems.length === 0) {
        toast.error('Agregue al menos un ítem a esta caja.');
        return;
    }

    setIsSavingPhase2(true);

    const newTracking: PurchaseTracking = {
      id: editingTracking?.id || uuidv4(),
      trackingNumber: trackNumber,
      status: trackStatus,
      isReceived: editingTracking ? editingTracking.isReceived : false,
      itemsInBox: boxItems,
      agentDeliveryDate: parseLocalDate(agentDate),
      receptionDate: parseLocalDate(receptionDate),
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
      toast.error('Error al guardar el tracking.');
    } finally {
      setIsSavingPhase2(false);
    }
  };


  if (loading) return <div className="text-zinc-500">Cargando compras…</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 italic flex items-center gap-2">
            <Package className="w-5 h-5 text-cyan-400" /> Entradas de Inventario (Compras)
          </h2>
          <p className="text-xs text-zinc-400">Registro y seguimiento de compras a proveedores.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2"
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
                <th className="px-6 py-4">Estado y Ref</th>
                <th className="px-6 py-4">Fecha de Orden</th>
                <th className="px-6 py-4">Proveedor y Canal</th>
                <th className="px-6 py-4">Ítems</th>
                <th className="px-6 py-4 text-right">Costo Total</th>
                <th className="px-6 py-4 text-center">Tracking (Fase 2)</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {purchases.sort((a, b) => b.date - a.date).map(p => {
                const isClosed = p.status === 'CLOSED';
                const isPartial = p.status === 'PARTIAL';
                const isCancelled = p.status === 'CANCELLED';
                const trackings = p.trackings || [];
                const receivedTrackings = trackings.filter(t => t.isReceived).length;
                const modifiable = canModifyOrder(p);

                return (
                  <tr key={p.id} className={`hover:bg-zinc-800/30 transition-colors ${isCancelled ? 'opacity-60' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5 w-fit">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          isCancelled
                            ? 'bg-zinc-700/40 text-zinc-400 border border-zinc-600/40'
                            : isClosed
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            : isPartial
                            ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                        }`}>
                          {isCancelled ? <Ban className="w-3 h-3" /> : isClosed ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          <span>{isCancelled ? 'CANCELADA' : (p.status || 'OPEN')}</span>
                        </div>
                        <span className="font-mono text-[10px] text-zinc-500 px-1">{p.id.slice(0, 8)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs whitespace-nowrap">
                      <div className="space-y-1.5 flex flex-col items-start w-fit">
                         <div className="flex items-center gap-2 w-full justify-between">
                            <span className="text-zinc-500 flex items-center gap-1"><Calendar className="w-3 h-3"/> Orden:</span> 
                            <span className="text-zinc-200 font-medium">{new Date(p.date).toLocaleDateString()}</span>
                         </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <div className="font-bold text-zinc-200">{supplierName(p.supplier)}</div>
                      <div className="text-zinc-500 text-[10px]">{p.shippingModality} via {p.shippingChannel}</div>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <div className="text-zinc-300">{p.items.length} ítems</div>
                      <div className="text-zinc-500 line-clamp-1 max-w-[150px]" title={p.items.map(i=>i.name).join(', ')}>
                        {p.items[0]?.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-cyan-400">
                      {formatCurrency(p.totalCost)}
                    </td>
                    <td className="px-6 py-4 text-center">
                       {isCancelled ? (
                         <span className="text-xs text-zinc-600 italic">—</span>
                       ) : (
                       <button
                         onClick={() => openTrackingModal(p)}
                         className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${isClosed ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20'}`}
                       >
                         {trackings.length > 0 ? `${receivedTrackings} / ${trackings.length} cajas recibidas` : 'Gestionar cajas'}
                       </button>
                       )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* P2.8: editar orden (solo sin cajas recibidas) */}
                        {modifiable && (
                          <button
                            onClick={() => openOrderEdit(p)}
                            title="Editar orden (ítems, costos, landed cost)"
                            className="p-1.5 text-zinc-500 hover:text-cyan-400 hover:bg-zinc-800 rounded transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        {/* P2.8: cancelar orden */}
                        {modifiable && (
                          <button
                            onClick={() => handleCancelOrder(p)}
                            title="Cancelar orden (no elimina el registro)"
                            className={`p-1.5 rounded transition-colors text-xs font-bold ${confirmingCancel === p.id ? 'bg-amber-500/20 text-amber-400' : 'text-zinc-500 hover:text-amber-400 hover:bg-zinc-800'}`}
                          >
                            {confirmingCancel === p.id ? '¿Cancelar?' : <Ban className="w-4 h-4" />}
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteClick(p.id)}
                          className={`p-1.5 rounded transition-colors text-xs font-bold ${confirmingDelete === p.id ? 'text-rose-500' : 'text-zinc-500 hover:text-rose-400 hover:bg-zinc-800'}`}
                        >
                          {confirmingDelete === p.id ? '¿Eliminar?' : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {purchases.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-zinc-500 italic">Sin compras registradas todavía.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* P2.8: modal de edición de orden (solo sin cajas recibidas) */}
      {editingOrder && orderForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={() => { setEditingOrder(null); setOrderForm(null); }}></div>
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-zinc-700 flex justify-between items-center bg-zinc-800/50 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                  <Edit className="w-5 h-5 text-cyan-400" /> Editar Orden
                </h3>
                <p className="text-xs text-zinc-400">Proveedor: {supplierName(editingOrder.supplier)} · {new Date(editingOrder.date).toLocaleDateString()}</p>
              </div>
              <button onClick={() => { setEditingOrder(null); setOrderForm(null); }} className="p-2 bg-zinc-800 rounded-lg text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-5">
              {/* Datos de la orden */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {([
                  ['platform', 'Plataforma'], ['orderNumber', 'No. Orden'], ['financing', 'Financiación'],
                  ['shippingChannel', 'Canal de envío'], ['shippingModality', 'Modalidad'],
                ] as const).map(([key, label]) => (
                  <div key={key} className="space-y-1">
                    <label className="text-[10px] uppercase text-zinc-500 font-bold">{label}</label>
                    <input
                      type="text"
                      value={orderForm[key]}
                      onChange={(e) => setOrderForm((prev: any) => ({ ...prev, [key]: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-cyan-500"
                    />
                  </div>
                ))}
              </div>

              {/* Landed cost */}
              <div className="bg-zinc-800/30 border border-zinc-800 rounded-xl p-4">
                <p className="text-[10px] uppercase text-amber-400 font-bold mb-3">Costos de Importación (se aplican al recibir)</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {([
                    ['shippingRatePerLb', 'Tarifa $/lb'], ['freightCost', 'Flete Total USD'],
                    ['customsTaxes', 'Aduana USD'], ['insuranceCost', 'Seguro USD'],
                  ] as const).map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <label className="text-[10px] uppercase text-zinc-500 font-bold">{label}</label>
                      <input
                        type="number" step="any" min="0"
                        value={orderForm[key]}
                        onChange={(e) => setOrderForm((prev: any) => ({ ...prev, [key]: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-cyan-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Ítems */}
              <div>
                <p className="text-[10px] uppercase text-zinc-400 font-bold mb-2">Artículos de la orden</p>
                <div className="space-y-2">
                  {orderForm.items.map((it: any) => {
                    const assignedQty = (editingOrder.trackings || []).reduce(
                      (acc, t) => acc + ((t.itemsInBox || []).find(b => b.itemId === it.id)?.quantity || 0), 0);
                    return (
                      <div key={it.id} className="bg-zinc-800/40 border border-zinc-700/50 rounded-lg p-3">
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <p className="text-xs font-bold text-zinc-200">{it.name}
                            {assignedQty > 0 && <span className="text-[9px] text-amber-500 ml-2">({assignedQty} ya asignadas a cajas)</span>}
                          </p>
                          <button
                            onClick={() => {
                              if (assignedQty > 0) { toast.error('No se puede quitar: tiene unidades asignadas a cajas.'); return; }
                              if (orderForm.items.length <= 1) { toast.error('La orden debe tener al menos un artículo.'); return; }
                              setOrderForm((prev: any) => ({ ...prev, items: prev.items.filter((x: any) => x.id !== it.id) }));
                            }}
                            className="p-1 text-zinc-500 hover:text-rose-400"
                            title="Quitar artículo de la orden"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div>
                            <label className="text-[9px] uppercase text-zinc-500 font-bold">Costo USD</label>
                            <input type="number" step="any" min="0" value={it.costStr}
                              onChange={(e) => setOrderItemField(it.id, 'costStr', e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-700 rounded p-1.5 text-xs text-zinc-200 outline-none focus:border-cyan-500" />
                          </div>
                          <div>
                            <label className="text-[9px] uppercase text-zinc-500 font-bold">Cantidad</label>
                            <input type="number" min={Math.max(1, assignedQty)} value={it.qtyStr}
                              onChange={(e) => setOrderItemField(it.id, 'qtyStr', e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-700 rounded p-1.5 text-xs text-zinc-200 outline-none focus:border-cyan-500" />
                          </div>
                          <div>
                            <label className="text-[9px] uppercase text-zinc-500 font-bold">Peso lbs (total)</label>
                            <input type="number" step="any" min="0" value={it.weightStr}
                              onChange={(e) => setOrderItemField(it.id, 'weightStr', e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-700 rounded p-1.5 text-xs text-zinc-200 outline-none focus:border-cyan-500" />
                          </div>
                          <div>
                            <label className="text-[9px] uppercase text-zinc-500 font-bold">Color</label>
                            <input type="text" value={it.colorStr}
                              onChange={(e) => setOrderItemField(it.id, 'colorStr', e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-700 rounded p-1.5 text-xs text-zinc-200 outline-none focus:border-cyan-500" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-right text-xs text-zinc-400 mt-2">
                  Nuevo total: <span className="font-bold text-cyan-400">
                    {formatCurrency(orderForm.items.reduce((a: number, i: any) => a + (Number(i.costStr) || 0) * (parseInt(i.qtyStr) || 0), 0))}
                  </span>
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-700 bg-zinc-900 shrink-0 flex justify-end gap-3">
              <button
                onClick={() => { setEditingOrder(null); setOrderForm(null); }}
                disabled={isSavingOrder}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={saveOrderEdit}
                disabled={isSavingOrder}
                className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg text-sm disabled:opacity-50"
              >
                {isSavingOrder ? 'Guardando…' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {trackingModalPurchase && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={() => { setTrackingModalPurchase(null); closeTrackingForm(); }}></div>
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-zinc-700 flex justify-between items-center bg-zinc-800/50 shrink-0">
               <div>
                  <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                     <Package className="w-5 h-5 text-cyan-400" /> Tracking y Recepción (Fase 2)
                  </h3>
                  <p className="text-xs text-zinc-400">Orden original a: {supplierName(trackingModalPurchase.supplier)}</p>
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
                       className="text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-1.5 px-3 rounded-lg flex items-center gap-1 transition-colors"
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
                         <div className="text-xs text-zinc-400 mb-3 flex gap-4 flex-wrap">
                            <span><b>Status:</b> {t.status || 'N/A'}</span>
                            {t.finalWeight && <span><b>Peso:</b> {t.finalWeight} lbs</span>}
                            {/* P2.8: días en tránsito por caja (para reclamos al courier) */}
                            {(() => {
                              const startTs = t.agentDeliveryDate || trackingModalPurchase.date;
                              const endTs = t.receptionDate || Date.now();
                              const days = Math.max(0, Math.floor((endTs - startTs) / 86400000));
                              return (
                                <span className="flex items-center gap-1 text-cyan-400/80">
                                  <Truck className="w-3 h-3" />
                                  {t.isReceived ? 'Tránsito total:' : 'En tránsito:'} <b>{days} día{days === 1 ? '' : 's'}</b>
                                  {!t.agentDeliveryDate && <span className="text-zinc-500">(desde la orden)</span>}
                                </span>
                              );
                            })()}
                         </div>
                         <div className="bg-zinc-900 border border-zinc-700/50 rounded-lg p-3">
                            <p className="text-[10px] font-bold text-zinc-500 mb-2 uppercase">Items que vienen aquí:</p>
                            <div className="space-y-1">
                              {t.itemsInBox.map(iib => {
                                 const pItem = trackingModalPurchase.items.find(i => i.id === iib.itemId);
                                 const missingInCatalog = !products.some(inv => inv.id === iib.itemId);
                                 return (
                                   <div key={iib.itemId} className="text-xs flex justify-between">
                                      <span className="text-zinc-300">
                                        {pItem?.name || iib.itemId}
                                        {missingInCatalog && (
                                          <span className="text-amber-500 ml-1" title="El producto fue borrado del catálogo; al recibir esta caja no sumará stock.">
                                            ⚠ ya no existe en catálogo
                                          </span>
                                        )}
                                      </span>
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
                           {t.isReceived && (
                             <button
                               onClick={() => handleRevertClick(t)}
                               disabled={isReverting}
                               title="Descuenta del inventario las unidades de esta caja y reabre el tracking."
                               className={`text-xs py-1.5 px-3 rounded-lg flex items-center gap-1 transition-colors font-bold border disabled:opacity-50 ${
                                 confirmingRevert === t.id
                                   ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                                   : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-amber-400 hover:border-amber-500/30'
                               }`}
                             >
                               {isReverting ? 'Revirtiendo…' : confirmingRevert === t.id ? '¿Confirmar reversión? (resta stock)' : 'Revertir recepción'}
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
                     <h4 className="text-sm font-bold text-cyan-400 flex items-center gap-2">
                       {editingTracking ? 'Actualizar Status de Caja' : 'Nuevo Envío/Tracking'}
                     </h4>
                     <button type="button" onClick={closeTrackingForm} className="text-xs text-zinc-500 hover:text-white bg-zinc-800 px-3 py-1 rounded">Cancelar</button>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                         <label className="text-[10px] uppercase text-zinc-500 font-bold">Tracking / Guía ID</label>
                         <input type="text" disabled={editingTracking?.isReceived} value={trackNumber} onChange={e=>setTrackNumber(e.target.value)} required className="w-full bg-zinc-800 disabled:opacity-50 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-cyan-500" />
                      </div>
                      <div className="space-y-1">
                         <label className="text-[10px] uppercase text-zinc-500 font-bold">Estado Logístico</label>
                         <select disabled={editingTracking?.isReceived} value={trackStatus} onChange={e=>setTrackStatus(e.target.value)} className="w-full bg-zinc-800 border disabled:opacity-50 border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-cyan-500">
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
                            
                            const missingInCatalog = !products.some(inv => inv.id === pItem.id);
                            return (
                              <div key={pItem.id} className="flex flex-col sm:flex-row justify-between sm:items-center py-2 border-b border-zinc-700/50 gap-2">
                                <div className="text-xs text-zinc-300">
                                  {pItem.name}
                                  {missingInCatalog && (
                                    <span className="block text-[10px] text-amber-500">⚠ Ya no existe en el catálogo: al recibir NO sumará stock.</span>
                                  )}
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
                                    className="w-16 bg-zinc-900 border disabled:opacity-50 border-zinc-600 rounded p-1 text-center text-sm text-white focus:border-cyan-500 outline-none font-mono" 
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
                         <input disabled={editingTracking?.isReceived} type="number" step="any" value={finalWeight} onChange={e=>setFinalWeight(e.target.value)} className="w-full bg-zinc-800 disabled:opacity-50 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-cyan-500" placeholder="Ej. 5.5" />
                      </div>
                      <div className="space-y-1">
                         <label className="text-[10px] uppercase text-zinc-500 font-bold">Agente Recibe (Miami)</label>
                         <input disabled={editingTracking?.isReceived} type="date" value={agentDate} onChange={e=>setAgentDate(e.target.value)} className="w-full bg-zinc-800 disabled:opacity-50 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-cyan-500" />
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
                        <button type="submit" disabled={isSavingPhase2} className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-900 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg flex justify-center items-center">
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
                     // P1.5: costos de importación (antes se descartaban aquí)
                     freightCost: purchaseData.freightCost || undefined,
                     customsTaxes: purchaseData.customsTaxes || undefined,
                     insuranceCost: purchaseData.insuranceCost || undefined,
                     shippingRatePerLb: purchaseData.shippingRatePerLb || undefined,
                     status: 'OPEN',
                     stockAdded: false,
                     currency: 'USD',
                     exchangeRate: companyInfo?.defaultExchangeRate || DEFAULT_EXCHANGE_RATE,
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
