import React, { useState, useMemo } from 'react';
import { Plus, Trash2, ShoppingBag, Search, Tag, Image as ImageIcon, Loader2, Package } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { Product, Supplier } from '../types';
import { toast } from './Toast';

interface PurchaseRegistrationProps {
  inventory: Product[];
  suppliers: Supplier[];
  onAddProduct: (productData: any) => Promise<string>;
  onAddPurchase: (purchaseData: any) => Promise<void>;
  onAddSupplier: (supplier: any) => Promise<void>;
  onSuccess?: () => void;
  onCancel: () => void;
}

const PLATFORMS = ['AliExpress', 'Amazon', 'eBay', 'Alibaba'];
const SHIPPING_CHANNELS = ['Correos', 'AWBOX', 'Tetraigodetodo'];
const SHIPPING_MODES = ['Sea Cargo', 'Air Cargo'];

interface DraftItem {
  draftId: string;
  isNewProduct: boolean;
  itemId: string;
  description: string;
  color: string;
  unitCost: number;
  quantity: number;
  estimatedWeight: string;
  catalogPriceUSD: number;
  category: string;
  imageFile: File | null;
  imagePreview: string;
}

export default function PurchaseRegistration({
  inventory,
  suppliers,
  onAddProduct,
  onAddPurchase,
  onAddSupplier,
  onSuccess,
  onCancel
}: PurchaseRegistrationProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Order Level State
  const [supplier, setSupplier] = useState('');
  const [isCustomSupplier, setIsCustomSupplier] = useState(false);
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [isCustomPlatform, setIsCustomPlatform] = useState(false);
  const [shippingChannel, setShippingChannel] = useState(SHIPPING_CHANNELS[0]);
  const [isCustomShippingChannel, setIsCustomShippingChannel] = useState(false);
  const [shippingMode, setShippingMode] = useState(SHIPPING_MODES[0]);
  const [isCustomShippingMode, setIsCustomShippingMode] = useState(false);
  const [acquisitionDate, setAcquisitionDate] = useState(new Date().toISOString().split('T')[0]);
  const [orderNumber, setOrderNumber] = useState('');
  const [financing, setFinancing] = useState('');
  const [isCustomFinancing, setIsCustomFinancing] = useState(false);

  // Landed Cost State (P1.5: ahora sí tienen inputs y viajan a la orden)
  const [freightCost, setFreightCost] = useState(0);
  const [customsTaxes, setCustomsTaxes] = useState(0);
  const [insuranceCost, setInsuranceCost] = useState(0);
  const [shippingRatePerLb, setShippingRatePerLb] = useState('');

  // Items State
  const [items, setItems] = useState<DraftItem[]>([]);

  // Item Form State
  const [isNewProduct, setIsNewProduct] = useState(false);
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  
  const [itemForm, setItemForm] = useState({
    itemId: '',
    description: '',
    color: '',
    unitCost: 0,
    quantity: 1,
    estimatedWeight: '',
    catalogPriceUSD: 0,
    category: '',
    imageFile: null as File | null,
    imagePreview: ''
  });

  const uniqueCategories = useMemo(() => {
    const categories = new Set(inventory.map((item) => item.category).filter(Boolean));
    return Array.from(categories);
  }, [inventory]);

  const handleToggleProductMode = (isNew: boolean) => {
    setIsNewProduct(isNew);
    setItemForm({
      ...itemForm,
      itemId: '',
      description: '',
      catalogPriceUSD: 0,
      category: uniqueCategories[0] || '',
      imageFile: null,
      imagePreview: ''
    });
  };

  const handleExistingItemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const selectedItem = inventory.find((item) => item.id === id);
    setItemForm((prev) => ({
      ...prev,
      itemId: id,
      description: selectedItem ? selectedItem.name : ''
    }));
  };

  const handleSupplierChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'CUSTOM') {
      setIsCustomSupplier(true);
      setSupplier('');
    } else {
      setSupplier(val);
    }
  };

  const handlePlatformChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'CUSTOM') {
      setIsCustomPlatform(true);
      setPlatform('');
    } else {
      setPlatform(val);
    }
  };

  const handleShippingChannelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'CUSTOM') {
      setIsCustomShippingChannel(true);
      setShippingChannel('');
    } else {
      setShippingChannel(val);
    }
  };

  const handleShippingModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'CUSTOM') {
      setIsCustomShippingMode(true);
      setShippingMode('');
    } else {
      setShippingMode(val);
    }
  };

  const handleFinancingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'CUSTOM') {
      setIsCustomFinancing(true);
      setFinancing('');
    } else {
      setFinancing(val);
    }
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'CUSTOM') {
      setIsCustomCategory(true);
      setItemForm((prev) => ({ ...prev, category: '' }));
    } else {
      setItemForm((prev) => ({ ...prev, category: val }));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setItemForm((prev) => ({
        ...prev,
        imageFile: file,
        imagePreview: URL.createObjectURL(file)
      }));
    }
  };

  const removeImage = () => {
    setItemForm((prev) => ({
      ...prev,
      imageFile: null,
      imagePreview: ''
    }));
  };

  const handleAddItem = () => {
    if (isNewProduct && (!itemForm.description || !itemForm.category)) {
      toast.error('Un producto nuevo necesita descripción y categoría.');
      return;
    }
    if (!isNewProduct && !itemForm.itemId) {
      toast.error('Elegí un producto del catálogo.');
      return;
    }
    if (itemForm.unitCost < 0 || itemForm.quantity <= 0) {
      toast.error('El costo y la cantidad tienen que ser números válidos.');
      return;
    }

    const newItem: DraftItem = {
      draftId: Math.random().toString(36).substring(7),
      isNewProduct,
      ...itemForm
    };

    setItems([...items, newItem]);
    
    // Reset item form
    setItemForm({
      itemId: '',
      description: '',
      color: '',
      unitCost: 0,
      quantity: 1,
      estimatedWeight: '',
      catalogPriceUSD: 0,
      category: '',
      imageFile: null,
      imagePreview: ''
    });
  };

  const handleRemoveItem = (draftId: string) => {
    setItems(items.filter(i => i.draftId !== draftId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      toast.error('Agregá al menos un artículo a la orden.');
      return;
    }

    if (!supplier) {
      toast.error('Falta el proveedor.');
      return;
    }

    setIsSubmitting(true);

    try {
      const finalItems = [];

      for (const item of items) {
        let finalItemId = item.itemId;

        if (item.isNewProduct) {
          const newProductData = {
            name: item.description,
            description: item.description,
            price: item.catalogPriceUSD, // Store base USD
            cost: item.unitCost, // Store base USD
            category: item.category,
            status: 'Activo',
            imageFile: item.imageFile,
            stock: 0, // stock increases on Phase 2
            // P3.5: SKU autogenerado único (timestamp base36; el aleatorio colisionaba)
            sku: `SKU-${Date.now().toString(36).toUpperCase()}`
          };

          const newId = await onAddProduct(newProductData);
          finalItemId = newId;
        }

        finalItems.push({
          itemId: finalItemId,
          description: item.description,
          color: item.color,
          unitCost: item.unitCost,
          quantity: item.quantity,
          estimatedWeight: item.estimatedWeight ? Number(item.estimatedWeight) : undefined
        });
      }

      // Record Supplier if Custom
      let finalSupplier = supplier;
      if (isCustomSupplier) {
        const newSupplierId = `SUP-${Math.floor(Math.random() * 100000)}`;
        await onAddSupplier({
          id: newSupplierId,
          name: supplier,
          createdAt: Date.now()
        });
        finalSupplier = newSupplierId;
      }

      // Record Order
      const purchaseData = {
        supplier: finalSupplier,
        platform,
        shippingChannel,
        shippingMode,
        orderNumber,
        financing,
        freightCost,
        customsTaxes,
        insuranceCost,
        shippingRatePerLb: shippingRatePerLb ? Number(shippingRatePerLb) : undefined,
        date: new Date(acquisitionDate).getTime(),
        items: finalItems
      };

      await onAddPurchase(purchaseData);

      toast.success('Orden de compra registrada.');
      
      setItems([]);
      
      if (onSuccess) {
        setTimeout(onSuccess, 1000);
      }
    } catch (error: any) {
      console.error("Submission error:", error);
      toast.error(error.message || 'No se pudo registrar la orden de compra.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-zinc-900 overflow-hidden">
      {/* Scrollable Container */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">

        <div className="space-y-8">
          {/* Order Details Section */}
          <div className="bg-zinc-800/30 p-6 rounded-xl border border-zinc-800">
             <h4 className="text-zinc-100 font-bold mb-4 flex items-center gap-2 border-b border-zinc-700/50 pb-2">
                <ShoppingBag className="w-4 h-4 text-cyan-400" /> Detalles Generales de la Orden
             </h4>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="ordencompra-proveedor" className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider">Proveedor</label>
                  {isCustomSupplier ? (
                    <div className="flex gap-2">
                      <input id="ordencompra-proveedor"
                        type="text"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                        value={supplier}
                        onChange={(e) => setSupplier(e.target.value)}
                        placeholder="Nombre del proveedor"
                      />
                      <button type="button" onClick={() => setIsCustomSupplier(false)} className="px-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-200 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500">Volver</button>
                    </div>
                  ) : (
                    /*
                      MISMO id que el <input> de la otra rama del ternario, a
                      propósito: son excluyentes, nunca coexisten en el DOM, y
                      comparten un solo <label>. Con ids distintos el `htmlFor`
                      quedaría colgando en una de las dos ramas. Un grep va a
                      ver el id "repetido": no lo está en tiempo de ejecución.
                    */
                    <select
                      id="ordencompra-proveedor"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                      value={supplier}
                      onChange={handleSupplierChange}
                    >
                      <option value="">-- Seleccionar --</option>
                      {suppliers.map((sup) => (
                        <option key={sup.id} value={sup.id}>{sup.name}</option>
                      ))}
                      <option value="CUSTOM" className="font-bold text-cyan-400">+ Agregar nuevo proveedor</option>
                    </select>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="ordencompra-plataforma" className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider">Plataforma</label>
                  {isCustomPlatform ? (
                    <div className="flex gap-2">
                      <input id="ordencompra-plataforma"
                        type="text"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                        value={platform}
                        onChange={(e) => setPlatform(e.target.value)}
                        placeholder="Nombre de la plataforma"
                      />
                      <button type="button" onClick={() => setIsCustomPlatform(false)} className="px-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-200 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500">Volver</button>
                    </div>
                  ) : (
                    /* Mismo id que el <input> de la otra rama del ternario: ver
                       la nota del selector de proveedor, más arriba. */
                    <select id="ordencompra-plataforma"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                      value={platform}
                      onChange={handlePlatformChange}
                    >
                      {PLATFORMS.map((plat) => <option key={plat} value={plat}>{plat}</option>)}
                      <option value="CUSTOM" className="font-bold text-cyan-400">+ Agregar plataforma</option>
                    </select>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider">Fecha de Adquisición</label>
                  <input aria-label="Fecha de Adquisición"
                    type="date"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                    value={acquisitionDate}
                    onChange={(e) => setAcquisitionDate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider">Financiación</label>
                  {isCustomFinancing ? (
                    <div className="flex gap-2">
                      <input aria-label="Financiación"
                        type="text"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                        value={financing}
                        onChange={(e) => setFinancing(e.target.value)}
                        placeholder="Tipo de financiación"
                      />
                      <button type="button" onClick={() => setIsCustomFinancing(false)} className="px-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-200 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500">Volver</button>
                    </div>
                  ) : (
                    <select aria-label="Financiación"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                      value={financing}
                      onChange={handleFinancingChange}
                    >
                      <option value="">-- Seleccionar --</option>
                      <option value="Fondos Propios">Fondos Propios</option>
                      <option value="Tarjeta Socio A">Tarjeta Socio A</option>
                      <option value="Tarjeta B">Tarjeta B</option>
                      <option value="Crédito Proveedor">Crédito Proveedor</option>
                      <option value="CUSTOM" className="font-bold text-cyan-400">+ Agregar financiación</option>
                    </select>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider">Canal de Envío</label>
                  {isCustomShippingChannel ? (
                    <div className="flex gap-2">
                      <input aria-label="Canal de Envío"
                        type="text"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                        value={shippingChannel}
                        onChange={(e) => setShippingChannel(e.target.value)}
                        placeholder="Canal de envío"
                      />
                      <button type="button" onClick={() => setIsCustomShippingChannel(false)} className="px-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-200 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500">Volver</button>
                    </div>
                  ) : (
                    <select aria-label="Canal de Envío"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                      value={shippingChannel}
                      onChange={handleShippingChannelChange}
                    >
                      {SHIPPING_CHANNELS.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                      <option value="CUSTOM" className="font-bold text-cyan-400">+ Agregar canal</option>
                    </select>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider">Modalidad</label>
                  {isCustomShippingMode ? (
                    <div className="flex gap-2">
                      <input aria-label="Modalidad"
                        type="text"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                        value={shippingMode}
                        onChange={(e) => setShippingMode(e.target.value)}
                        placeholder="Modalidad de envío"
                      />
                      <button type="button" onClick={() => setIsCustomShippingMode(false)} className="px-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-200 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500">Volver</button>
                    </div>
                  ) : (
                    <select aria-label="Modalidad"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                      value={shippingMode}
                      onChange={handleShippingModeChange}
                    >
                      {SHIPPING_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                      <option value="CUSTOM" className="font-bold text-cyan-400">+ Agregar modalidad</option>
                    </select>
                  )}
                </div>
                
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider">No. Orden Master (Opcional)</label>
                  <input aria-label="No. Orden Master (Opcional)"
                    type="text"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="Ej. 114-1234567-890"
                  />
                </div>
             </div>
          </div>

          {/* Landed Cost Section (P1.5) */}
          <div className="bg-zinc-800/30 p-6 rounded-xl border border-zinc-800">
             <h4 className="text-zinc-100 font-bold mb-1 flex items-center gap-2 border-b border-zinc-700/50 pb-2">
                <Tag className="w-4 h-4 text-amber-400" /> Costos de Importación (Landed Cost)
             </h4>
             <p className="text-[10px] text-zinc-400 mb-4 leading-relaxed">
               Estos costos se suman al costo real de cada unidad al recibirla. El flete se calcula por peso con la tarifa $/lb
               (si un ítem no tiene peso, se prorratea el Flete Total por valor). Aduana y seguro siempre se prorratean por valor.
             </p>
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider">Tarifa Flete (USD/lb)</label>
                  <input aria-label="Tarifa Flete (USD/lb)"
                    type="number" step="any" min="0"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-cyan-500"
                    value={shippingRatePerLb}
                    onChange={(e) => setShippingRatePerLb(e.target.value)}
                    placeholder={shippingMode === 'Air Cargo' ? 'Default: 6.5' : shippingMode === 'Sea Cargo' ? 'Default: 2.5' : 'Ej. 2.5'}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider">Flete Total (USD)</label>
                  <input aria-label="Flete Total (USD)"
                    type="number" step="any" min="0"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-cyan-500"
                    value={freightCost || ''}
                    onChange={(e) => setFreightCost(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="Si no usa $/lb"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="ordencompra-aduana-dga-usd" className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider">Aduana / DGA (USD)</label>
                  <input id="ordencompra-aduana-dga-usd"
                    type="number" step="any" min="0"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-cyan-500"
                    value={customsTaxes || ''}
                    onChange={(e) => setCustomsTaxes(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="Impuestos"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="ordencompra-seguro-usd" className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider">Seguro (USD)</label>
                  <input id="ordencompra-seguro-usd"
                    type="number" step="any" min="0"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-cyan-500"
                    value={insuranceCost || ''}
                    onChange={(e) => setInsuranceCost(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="Opcional"
                  />
                </div>
             </div>
          </div>

          {/* Items Section */}
          <div className="bg-zinc-800/30 p-6 rounded-xl border border-zinc-800">
             <h4 className="text-zinc-100 font-bold mb-4 flex items-center justify-between border-b border-zinc-700/50 pb-2">
                <span className="flex items-center gap-2"><Package className="w-4 h-4 text-emerald-400" /> Artículos en la Orden ({items.length})</span>
                <span className="text-xs text-zinc-400 bg-zinc-800 px-2 py-1 rounded">Total: ${items.reduce((acc, i) => acc + (i.unitCost * i.quantity), 0).toFixed(2)}</span>
             </h4>

             {/* Added Items List */}
             {items.length > 0 && (
               <div className="mb-6 space-y-2">
                 {items.map((item, index) => (
                   <div key={item.draftId} className="flex items-center justify-between bg-zinc-900 border border-zinc-700 p-3 rounded-lg">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center flex-shrink-0">
                           {item.imagePreview ? <img src={item.imagePreview} alt="" className="w-full h-full object-cover rounded" /> : <Package className="w-4 h-4 text-zinc-500" aria-hidden="true" />}
                         </div>
                         <div>
                            <div className="text-sm font-bold text-zinc-200">{item.description} {item.isNewProduct && <span className="text-[9px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full ml-1">NUEVO</span>}</div>
                            <div className="text-[10px] text-zinc-400">Cant: {item.quantity} × ${item.unitCost.toFixed(2)} = <span className="text-zinc-200 font-bold">${(item.quantity * item.unitCost).toFixed(2)}</span> {item.color && ` • Color: ${item.color}`} {item.estimatedWeight && ` • Peso: ${item.estimatedWeight}lbs`}</div>
                         </div>
                      </div>
                      <button onClick={() => handleRemoveItem(item.draftId)} className="p-2 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                   </div>
                 ))}
               </div>
             )}

             {/* Add Item Form */}
             <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
               <div className="flex gap-2 mb-4">
                 <button
                   onClick={() => handleToggleProductMode(false)}
                   className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${!isNewProduct ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'} focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                 >
                   Seleccionar Existente
                 </button>
                 <button
                   onClick={() => handleToggleProductMode(true)}
                   className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isNewProduct ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'} focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                 >
                   Definir Nuevo Producto
                 </button>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {!isNewProduct ? (
                    <>
                      <div className="space-y-2 md:col-span-2">
                        <label htmlFor="ordencompra-buscar-inventario" className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider">Buscar Inventario</label>
                        <select id="ordencompra-buscar-inventario"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-cyan-500 focus:ring-1 outline-none"
                          value={itemForm.itemId}
                          onChange={handleExistingItemChange}
                        >
                          <option value="">-- Seleccionar --</option>
                          {inventory.map((item) => (
                            <option key={item.id} value={item.id}>{item.sku} - {item.name}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-2 md:col-span-2">
                        <label htmlFor="ordencompra-nombre-del-producto" className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider">Nombre del Producto</label>
                        <input id="ordencompra-nombre-del-producto"
                          type="text"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                          value={itemForm.description}
                          onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="ordencompra-categoria" className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider">Categoría</label>
                        {isCustomCategory ? (
                          <div className="flex gap-2">
                            <input id="ordencompra-categoria"
                              type="text"
                              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                              value={itemForm.category}
                              onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
                            />
                            <button type="button" onClick={() => setIsCustomCategory(false)} className="px-2 bg-zinc-700 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500">Volver</button>
                          </div>
                        ) : (
                          <select aria-label="Categoría"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                            value={itemForm.category}
                            onChange={handleCategoryChange}
                          >
                            <option value="">-- Seleccionar --</option>
                            {uniqueCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                            <option value="CUSTOM" className="text-cyan-400">+ Nueva</option>
                          </select>
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider">Precio Venta Catálogo (USD)</label>
                        <input aria-label="Precio Venta Catálogo (USD)"
                          type="number"
                          step="any" min="0"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                          value={itemForm.catalogPriceUSD || ''}
                          onChange={(e) => setItemForm({ ...itemForm, catalogPriceUSD: Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                         <label className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider">Imagen del Producto (Opcional)</label>
                         {itemForm.imagePreview ? (
                            <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-zinc-600">
                              <img src={itemForm.imagePreview} alt="Preview" className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={removeImage}
                                aria-label="Quitar la imagen"
                                className="absolute top-1 right-1 bg-rose-600/20 border border-rose-500/30 text-rose-400 hover:bg-rose-600/30 p-1 rounded-full focus:outline-none focus:ring-1 focus:ring-rose-500"
                              >
                                <Trash2 className="w-3 h-3" aria-hidden="true" />
                              </button>
                            </div>
                         ) : (
                            <div className="flex items-center justify-center w-full">
                                <label className="flex flex-col items-center justify-center w-full h-20 border border-zinc-700 border-dashed rounded-xl cursor-pointer bg-zinc-800/50 hover:bg-zinc-800">
                                    <span className="text-[10px] text-zinc-400">Click para subir foto</span>
                                    <input aria-label="Elegir una imagen para el artículo" type="file" className="sr-only" accept="image/*" onChange={handleFileChange} />
                                </label>
                            </div>
                         )}
                      </div>
                    </>
                  )}

                  <div className="col-span-1 md:col-span-2 h-px bg-zinc-800 my-1"></div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider text-rose-400">Costo VNE (USD)</label>
                    <input aria-label="Costo VNE (USD)"
                      type="number"
                      step="any" min="0"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                      value={itemForm.unitCost || ''}
                      onChange={(e) => setItemForm({ ...itemForm, unitCost: Number(e.target.value) })}
                      placeholder="Costo de compra"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider text-cyan-400">Cantidad</label>
                    <input aria-label="Cantidad"
                      type="number"
                      min="1"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                      value={itemForm.quantity || ''}
                      onChange={(e) => setItemForm({ ...itemForm, quantity: Number(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider">Color Específico</label>
                    <input aria-label="Color Específico"
                      type="text"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                      value={itemForm.color}
                      onChange={(e) => setItemForm({ ...itemForm, color: e.target.value })}
                      placeholder="Ej. Negro"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="ordencompra-peso-estimado-lbs-por-la-cantidad-entera" className="text-[10px] uppercase text-zinc-400 font-bold tracking-wider">Peso Estimado (lbs) por la cantidad entera</label>
                    <input id="ordencompra-peso-estimado-lbs-por-la-cantidad-entera"
                      type="number"
                      step="any" min="0"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                      value={itemForm.estimatedWeight}
                      onChange={(e) => setItemForm({ ...itemForm, estimatedWeight: e.target.value })}
                      placeholder="Ej. 2.5"
                    />
                  </div>

                  <div className="col-span-1 md:col-span-2 pt-2">
                     <button
                       type="button"
                       onClick={handleAddItem}
                       className="w-full bg-zinc-800 hover:bg-zinc-700 text-cyan-400 border border-zinc-700 font-bold py-2.5 px-4 rounded-lg transition-all flex justify-center items-center gap-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                     >
                       <Plus className="w-4 h-4" /> Agregar Item a la Orden
                     </button>
                  </div>
               </div>
             </div>

          </div>
        </div>
      </div>
      
      {/* Sticky Bottom Actions */}
      <div className="p-4 border-t border-zinc-700 bg-zinc-900 shrink-0">
         <button
           onClick={handleSubmit}
           disabled={isSubmitting || items.length === 0}
           className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-900/50 disabled:text-emerald-700/50 text-white font-bold py-3 px-6 rounded-xl transition-all flex justify-center items-center gap-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
         >
           {isSubmitting && <Loader2 className="w-5 h-5 animate-spin" />}
           {isSubmitting ? 'Procesando Múltiples Artículos...' : `Finalizar y Guardar ${items.length > 0 ? items.length : ''} Artículos`}
         </button>
      </div>

    </div>
  );
}
