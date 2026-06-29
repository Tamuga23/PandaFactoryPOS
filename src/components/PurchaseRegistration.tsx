import React, { useState, useMemo } from 'react';
import { Plus, Trash2, ShoppingBag, Search, Tag, Image as ImageIcon, Loader2, Package } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { Product, Supplier } from '../types';

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
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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

  // Landed Cost State
  const [freightCost, setFreightCost] = useState(0);
  const [customsTaxes, setCustomsTaxes] = useState(0);
  const [insuranceCost, setInsuranceCost] = useState(0);

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
    setFeedback(null);
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
      setFeedback({ message: 'Description and Category are required for new products.', type: 'error' });
      return;
    }
    if (!isNewProduct && !itemForm.itemId) {
      setFeedback({ message: 'Select an existing item.', type: 'error' });
      return;
    }
    if (itemForm.unitCost < 0 || itemForm.quantity <= 0) {
      setFeedback({ message: 'Valid cost and quantity are required.', type: 'error' });
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
    setFeedback(null);
  };

  const handleRemoveItem = (draftId: string) => {
    setItems(items.filter(i => i.draftId !== draftId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      setFeedback({ message: 'Añade al menos un artículo a la orden.', type: 'error' });
      return;
    }

    if (!supplier) {
      setFeedback({ message: 'El proveedor es requerido.', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

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
            sku: `SKU-${Math.floor(Math.random() * 10000)}`
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
        date: new Date(acquisitionDate).getTime(),
        items: finalItems
      };

      await onAddPurchase(purchaseData);

      setFeedback({ message: 'Orden de compra registrada exitosamente!', type: 'success' });
      
      setItems([]);
      
      if (onSuccess) {
        setTimeout(onSuccess, 1000);
      }
    } catch (error: any) {
      console.error("Submission error:", error);
      setFeedback({ message: error.message || 'An error occurred during submission.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-zinc-900 overflow-hidden">
      {/* Scrollable Container */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {feedback && (
          <div className={`p-4 mb-6 rounded-xl border ${feedback.type === 'success' ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
            {feedback.message}
          </div>
        )}

        <div className="space-y-8">
          {/* Order Details Section */}
          <div className="bg-zinc-800/30 p-6 rounded-xl border border-zinc-800">
             <h4 className="text-zinc-100 font-bold mb-4 flex items-center gap-2 border-b border-zinc-700/50 pb-2">
                <ShoppingBag className="w-4 h-4 text-sky-400" /> Detalles Generales de la Orden
             </h4>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">Proveedor</label>
                  {isCustomSupplier ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all"
                        value={supplier}
                        onChange={(e) => setSupplier(e.target.value)}
                        placeholder="Nombre del proveedor"
                      />
                      <button type="button" onClick={() => setIsCustomSupplier(false)} className="px-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-200 text-xs font-bold transition-colors">Volver</button>
                    </div>
                  ) : (
                    <select
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all"
                      value={supplier}
                      onChange={handleSupplierChange}
                    >
                      <option value="">-- Seleccionar --</option>
                      {suppliers.map((sup) => (
                        <option key={sup.id} value={sup.id}>{sup.name}</option>
                      ))}
                      <option value="CUSTOM" className="font-bold text-sky-400">+ Agregar nuevo proveedor</option>
                    </select>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">Plataforma</label>
                  {isCustomPlatform ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all"
                        value={platform}
                        onChange={(e) => setPlatform(e.target.value)}
                        placeholder="Nombre de la plataforma"
                      />
                      <button type="button" onClick={() => setIsCustomPlatform(false)} className="px-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-200 text-xs font-bold transition-colors">Volver</button>
                    </div>
                  ) : (
                    <select
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all"
                      value={platform}
                      onChange={handlePlatformChange}
                    >
                      {PLATFORMS.map((plat) => <option key={plat} value={plat}>{plat}</option>)}
                      <option value="CUSTOM" className="font-bold text-sky-400">+ Agregar plataforma</option>
                    </select>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">Fecha de Adquisición</label>
                  <input
                    type="date"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none"
                    value={acquisitionDate}
                    onChange={(e) => setAcquisitionDate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">Financiación</label>
                  {isCustomFinancing ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all"
                        value={financing}
                        onChange={(e) => setFinancing(e.target.value)}
                        placeholder="Tipo de financiación"
                      />
                      <button type="button" onClick={() => setIsCustomFinancing(false)} className="px-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-200 text-xs font-bold transition-colors">Volver</button>
                    </div>
                  ) : (
                    <select
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all"
                      value={financing}
                      onChange={handleFinancingChange}
                    >
                      <option value="">-- Seleccionar --</option>
                      <option value="Fondos Propios">Fondos Propios</option>
                      <option value="Tarjeta Socio A">Tarjeta Socio A</option>
                      <option value="Tarjeta B">Tarjeta B</option>
                      <option value="Crédito Proveedor">Crédito Proveedor</option>
                      <option value="CUSTOM" className="font-bold text-sky-400">+ Agregar financiación</option>
                    </select>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">Canal de Envío</label>
                  {isCustomShippingChannel ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all"
                        value={shippingChannel}
                        onChange={(e) => setShippingChannel(e.target.value)}
                        placeholder="Canal de envío"
                      />
                      <button type="button" onClick={() => setIsCustomShippingChannel(false)} className="px-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-200 text-xs font-bold transition-colors">Volver</button>
                    </div>
                  ) : (
                    <select
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all"
                      value={shippingChannel}
                      onChange={handleShippingChannelChange}
                    >
                      {SHIPPING_CHANNELS.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                      <option value="CUSTOM" className="font-bold text-sky-400">+ Agregar canal</option>
                    </select>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">Modalidad</label>
                  {isCustomShippingMode ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all"
                        value={shippingMode}
                        onChange={(e) => setShippingMode(e.target.value)}
                        placeholder="Modalidad de envío"
                      />
                      <button type="button" onClick={() => setIsCustomShippingMode(false)} className="px-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-200 text-xs font-bold transition-colors">Volver</button>
                    </div>
                  ) : (
                    <select
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all"
                      value={shippingMode}
                      onChange={handleShippingModeChange}
                    >
                      {SHIPPING_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                      <option value="CUSTOM" className="font-bold text-sky-400">+ Agregar modalidad</option>
                    </select>
                  )}
                </div>
                
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">No. Orden Master (Opcional)</label>
                  <input
                    type="text"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="Ej. 114-1234567-890"
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
                           {item.imagePreview ? <img src={item.imagePreview} className="w-full h-full object-cover rounded" /> : <Package className="w-4 h-4 text-zinc-500" />}
                         </div>
                         <div>
                            <div className="text-sm font-bold text-zinc-200">{item.description} {item.isNewProduct && <span className="text-[9px] bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded-full ml-1">NUEVO</span>}</div>
                            <div className="text-[10px] text-zinc-400">Cant: {item.quantity} × ${item.unitCost.toFixed(2)} = <span className="text-zinc-200 font-bold">${(item.quantity * item.unitCost).toFixed(2)}</span> {item.color && ` • Color: ${item.color}`} {item.estimatedWeight && ` • Peso: ${item.estimatedWeight}lbs`}</div>
                         </div>
                      </div>
                      <button onClick={() => handleRemoveItem(item.draftId)} className="p-2 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg">
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
                   className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${!isNewProduct ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                 >
                   Seleccionar Existente
                 </button>
                 <button
                   onClick={() => handleToggleProductMode(true)}
                   className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isNewProduct ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                 >
                   Definir Nuevo Producto
                 </button>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {!isNewProduct ? (
                    <>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">Buscar Inventario</label>
                        <select
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:border-sky-500 focus:ring-1 outline-none"
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
                        <label className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">Nombre del Producto</label>
                        <input
                          type="text"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none"
                          value={itemForm.description}
                          onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">Categoría</label>
                        {isCustomCategory ? (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none"
                              value={itemForm.category}
                              onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
                            />
                            <button type="button" onClick={() => setIsCustomCategory(false)} className="px-2 bg-zinc-700 rounded-lg text-xs text-white">Volver</button>
                          </div>
                        ) : (
                          <select
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none"
                            value={itemForm.category}
                            onChange={handleCategoryChange}
                          >
                            <option value="">-- Seleccionar --</option>
                            {uniqueCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                            <option value="CUSTOM" className="text-sky-400">+ Nueva</option>
                          </select>
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">Precio Venta Catálogo (USD)</label>
                        <input
                          type="number"
                          step="any" min="0"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none"
                          value={itemForm.catalogPriceUSD || ''}
                          onChange={(e) => setItemForm({ ...itemForm, catalogPriceUSD: Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                         <label className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">Imagen del Producto (Opcional)</label>
                         {itemForm.imagePreview ? (
                            <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-zinc-600">
                              <img src={itemForm.imagePreview} alt="Preview" className="w-full h-full object-cover" />
                              <button type="button" onClick={removeImage} className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-600 text-white p-1 rounded-full"><Trash2 className="w-3 h-3"/></button>
                            </div>
                         ) : (
                            <div className="flex items-center justify-center w-full">
                                <label className="flex flex-col items-center justify-center w-full h-20 border border-zinc-700 border-dashed rounded-xl cursor-pointer bg-zinc-800/50 hover:bg-zinc-800">
                                    <span className="text-[10px] text-zinc-400">Click para subir foto</span>
                                    <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                                </label>
                            </div>
                         )}
                      </div>
                    </>
                  )}

                  <div className="col-span-1 md:col-span-2 h-px bg-zinc-800 my-1"></div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider text-rose-400">Costo VNE (USD)</label>
                    <input
                      type="number"
                      step="any" min="0"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none"
                      value={itemForm.unitCost || ''}
                      onChange={(e) => setItemForm({ ...itemForm, unitCost: Number(e.target.value) })}
                      placeholder="Costo de compra"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider text-sky-400">Cantidad</label>
                    <input
                      type="number"
                      min="1"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none"
                      value={itemForm.quantity || ''}
                      onChange={(e) => setItemForm({ ...itemForm, quantity: Number(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">Color Específico</label>
                    <input
                      type="text"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none"
                      value={itemForm.color}
                      onChange={(e) => setItemForm({ ...itemForm, color: e.target.value })}
                      placeholder="Ej. Negro"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">Peso Estimado (lbs) por la cantidad entera</label>
                    <input
                      type="number"
                      step="any" min="0"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 outline-none"
                      value={itemForm.estimatedWeight}
                      onChange={(e) => setItemForm({ ...itemForm, estimatedWeight: e.target.value })}
                      placeholder="Ej. 2.5"
                    />
                  </div>

                  <div className="col-span-1 md:col-span-2 pt-2">
                     <button
                       type="button"
                       onClick={handleAddItem}
                       className="w-full bg-zinc-800 hover:bg-zinc-700 text-sky-400 border border-zinc-700 font-bold py-2.5 px-4 rounded-lg transition-all flex justify-center items-center gap-2 text-sm"
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
           className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900/50 disabled:text-emerald-700/50 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex justify-center items-center gap-2"
         >
           {isSubmitting && <Loader2 className="w-5 h-5 animate-spin" />}
           {isSubmitting ? 'Procesando Múltiples Artículos...' : `Finalizar y Guardar ${items.length > 0 ? items.length : ''} Artículos`}
         </button>
      </div>

    </div>
  );
}
