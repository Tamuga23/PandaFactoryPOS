import { useState, useMemo } from 'react';
import { useStoreData } from '../hooks/useStoreData';
import { Product, CartItem, Sale, ClientData } from '../types';
import { formatCurrency } from '../lib/utils';
import { Search, Plus, Minus, Trash2, ShoppingCart, FileText, Package } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import InvoicePreview, { InvoiceData } from '../components/InvoicePreview';
import ShippingLabelPreview from '../components/ShippingLabelPreview';

export default function POS() {
  const { products, recordSale, companyInfo, loading, customers, addCustomer, updateCustomer } = useStoreData();
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Mobile Layout View State
  const [showMobileCart, setShowMobileCart] = useState(false);
  
  // Customer Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [showCustomerPredictions, setShowCustomerPredictions] = useState(false);

  const [transport, setTransport] = useState('ENTREGA LOCAL');
  const [discount, setDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [customNote, setCustomNote] = useState('');
  const [previewData, setPreviewData] = useState<InvoiceData | null>(null);
  const [labelSaleData, setLabelSaleData] = useState<Sale | null>(null);
  const [pendingSale, setPendingSale] = useState<{sale: Sale, isProforma: boolean} | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (p.activo === false) return false; // A2: ocultar productos inactivos del POS
      const searchLower = searchTerm.toLowerCase();
      return (
        p.name.toLowerCase().includes(searchLower) || 
        p.sku.toLowerCase().includes(searchLower) ||
        (p.category && p.category.toLowerCase().includes(searchLower)) ||
        (p.description && p.description.toLowerCase().includes(searchLower))
      );
    }).sort((a, b) => {
      const aHasStock = a.stock > 0 ? 1 : 0;
      const bHasStock = b.stock > 0 ? 1 : 0;
      if (aHasStock !== bHasStock) {
        return bHasStock - aHasStock;
      }
      return a.name.localeCompare(b.name);
    });
  }, [products, searchTerm]);

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      if (existing.quantity >= product.stock) {
        alert('Cannot add more than available stock.');
        return;
      }
      setCart(cart.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      if (product.stock <= 0) {
        alert('Out of stock.');
        return;
      }
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        const newQ = item.quantity + delta;
        if (newQ > item.stock) {
          alert('Cannot exceed available stock.');
          return item;
        }
        return { ...item, quantity: Math.max(1, newQ) };
      }
      return item;
    }));
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const taxRate = 0; // Set to 0 to match screenshot logic (Total = Gross + Shipping - Discount)
  const tax = subtotal * taxRate;
  const currentExchangeRate = companyInfo?.defaultExchangeRate || 36.6243;
  const total = subtotal + tax + (shipping / currentExchangeRate) - (discount / currentExchangeRate);

  const handleTryCheckout = async (isProforma: boolean = false) => {
    if (cart.length === 0) return;

    const newInvoiceNumber = `A00${Math.floor(Math.random() * 1000) + 1000}`;
    
    // Calculate validity if it's a proforma (10 days from now)
    let validUntilDateStr: undefined | string = undefined;
    if (isProforma) {
        const validityDate = new Date();
        validityDate.setDate(validityDate.getDate() + 10);
        validUntilDateStr = validityDate.toLocaleDateString('es-ES');
    }

    // Defaulting missing UI fields to satisfy Pilar 1 type requirements for now
    const sale: Omit<Sale, "ownerId"> = {
      id: uuidv4(),
      date: Date.now(),
      items: [...cart],
      subtotal, // USD
      tax, // USD
      total: subtotal + tax + (shipping / currentExchangeRate) - (discount / currentExchangeRate), // Final Total in USD
      discount, // Stored explicitly as exact NIO typed
      shipping, // Stored explicitly as exact NIO typed
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      customerId: selectedCustomerId || undefined,
      transport,
      invoiceNumber: newInvoiceNumber,
      
      documentType: isProforma ? 'PROFORMA' : 'RECIBO_OFICIAL',
      clientDocumentType: 'NINGUNO',
      currency: 'USD',
      exchangeRate: currentExchangeRate,
      paymentMethod: 'EFECTIVO',
      status: 'completed',
      notes: customNote
    };
    
    // Prepare data for the preview component
    const invoiceData: InvoiceData = {
      type: isProforma ? 'PROFORMA' : 'RECIBO_OFICIAL',
      invoiceNumber: newInvoiceNumber,
      date: new Date(sale.date).toLocaleDateString('es-ES'),
      validUntil: validUntilDateStr,
      client: {
        fullName: sale.customerName || 'CLIENTE FINAL',
        address: sale.customerAddress || 'Dirección no proporcionada',
        phone: sale.customerPhone || 'N/A',
        transport: sale.transport || 'ENTREGA LOCAL'
      },
      companyInfo: companyInfo ? {
        name: companyInfo.name,
        address: companyInfo.address,
        phone: companyInfo.phone,
        email: companyInfo.email,
        logo: companyInfo.logoBase64
      } : undefined,
      items: sale.items.map(i => ({
        id: i.id,
        productName: i.name,
        quantity: i.quantity,
        priceNIO: i.price * currentExchangeRate, // Calculate NIO value for receipt
        priceUSD: i.price,
        image: i.imageBase64,
        sku: i.sku
      })),
      shippingCostNIO: sale.shipping || 0, // Exactly as inputted in NIO
      discountNIO: sale.discount || 0, // Exactly as inputted in NIO
      customNote: customNote, // Passed dynamically from checkout panel
      warrantyText: "1. Los productos vendidos por Panda Store tienen una garantía de [3] meses a partir de la fecha de compra.\n2. La garantía cubre defectos de fabricación y no incluye daños causados por mal uso o accidentes."
    };

    setPendingSale({ sale: sale as Sale, isProforma });
    setPreviewData(invoiceData);
  };

  const handleConfirmCheckout = async () => {
    if (!pendingSale) return;
    setIsConfirming(true);
    
    const { sale, isProforma } = pendingSale;

    // Process CRM specific logic if customer name is provided
    let finalCustomerId = sale.customerId;
    if (sale.customerName.trim() && !isProforma) {
      if (finalCustomerId) {
        // Find existing customer to check if update is needed
        const existingCust = customers.find(c => c.id === finalCustomerId);
        if (existingCust && (existingCust.fullName !== sale.customerName || existingCust.phone !== sale.customerPhone || existingCust.email !== sale.customerEmail || existingCust.address !== sale.customerAddress)) {
           await updateCustomer({
             ...existingCust,
             fullName: sale.customerName,
             phone: sale.customerPhone,
             email: sale.customerEmail,
             address: sale.customerAddress
           });
        }
      } else {
        // Create new customer
        const newCustomerId = uuidv4();
        finalCustomerId = newCustomerId;
        await addCustomer({
          id: newCustomerId,
          fullName: sale.customerName,
          phone: sale.customerPhone,
          email: sale.customerEmail,
          address: sale.customerAddress,
          createdAt: Date.now()
        });
      }
    }

    sale.customerId = finalCustomerId || undefined;

    try {
        await recordSale(sale);
    } catch (e) {
        alert("Transaction could not be completed. Stock might be insufficient.");
        setIsConfirming(false);
        return;
    }

    setCart([]);
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomNote('');
    setDiscount(0);
    setShipping(0);
    
    // Prepare label if transport requires it
    if (['DELIVERY MANAGUA', 'CARGOTRANS', 'BUSES INTERLOCALES'].includes(sale.transport)) {
        setLabelSaleData(sale as Sale);
    }

    setPendingSale(null);
    setIsConfirming(false);
  };

  if (loading) return <div className="text-zinc-500">Loading POS...</div>;

  return (
    <>
      {previewData && (
        <InvoicePreview 
          data={previewData}
          isOpen={!!previewData}
          onClose={() => {
            setPreviewData(null);
            setPendingSale(null);
          }}
          onConfirm={pendingSale ? handleConfirmCheckout : undefined}
          isConfirming={isConfirming}
        />
      )}
      {labelSaleData && (
        <ShippingLabelPreview 
          sale={labelSaleData}
          isOpen={!!labelSaleData}
          onClose={() => setLabelSaleData(null)}
          companyLogo={companyInfo?.logoBase64}
          companyName={companyInfo?.name}
        />
      )}
      <div className="flex flex-col lg:flex-row gap-6 lg:h-[calc(100vh-8rem)]">
      {/* Product Selection */}
      <div className={`${showMobileCart ? 'hidden lg:flex' : 'flex'} w-full lg:w-2/3 flex-col bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden h-[calc(100vh-12rem)] lg:h-full`}>
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/30">
          <h3 className="font-semibold text-zinc-200">Catalog</h3>
          <div className="relative w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-zinc-500" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-1.5 border border-zinc-700 rounded-lg leading-5 bg-zinc-800 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm"
              placeholder="Search products to add..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map(product => (
              <div 
                key={product.id} 
                onClick={() => addToCart(product)}
                className={`relative rounded-xl border p-3 cursor-pointer transition-colors ${
                  product.stock > 0 
                    ? 'bg-zinc-800/40 border-zinc-700 hover:bg-zinc-800 hover:border-zinc-600 shadow-sm' 
                    : 'bg-zinc-900/50 border-zinc-800 opacity-50 cursor-not-allowed'
                }`}
              >
                {product.imageBase64 ? (
                  <div className="aspect-w-1 aspect-h-1 w-full overflow-hidden rounded-lg bg-zinc-900 mb-3 border border-zinc-800">
                    <img src={product.imageBase64} alt={product.name} className="h-24 w-full object-cover" />
                  </div>
                ) : (
                  <div className="h-24 w-full rounded-lg bg-zinc-800 mb-3 border border-zinc-700 flex items-center justify-center">
                    <Package className="h-8 w-8 text-zinc-600" />
                  </div>
                )}
                <h3 className="text-sm font-medium text-zinc-200 line-clamp-2 leading-tight">{product.name}</h3>
                <p className="mt-1 text-[10px] text-zinc-500 uppercase">{product.sku}</p>
                <div className="mt-3 flex justify-between items-center">
                  <span className="text-sm font-bold text-cyan-400">{formatCurrency(product.price * (companyInfo?.defaultExchangeRate || 36.6243), 'NIO')}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${product.stock > 0 ? 'bg-cyan-500/10 text-cyan-500' : 'bg-rose-500/10 text-rose-500'}`}>
                    {product.stock} left
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile Sticky Bottom Bar (when viewing catalog) */}
      {!showMobileCart && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-zinc-900 border-t border-zinc-700 z-40 lg:hidden shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
           <button 
             onClick={() => setShowMobileCart(true)}
             className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg flex items-center justify-between"
           >
             <span className="flex items-center gap-2">
               <ShoppingCart className="w-5 h-5" /> 
               Ver Carrito ({cart.length} ítems)
             </span>
             <span>{formatCurrency((subtotal * (companyInfo?.defaultExchangeRate || 36.6243)) + shipping - discount, 'NIO')}</span>
           </button>
        </div>
      )}

      {/* Cart Panel */}
      <div className={`${!showMobileCart ? 'hidden lg:flex' : 'flex'} w-full lg:w-1/3 flex-col bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-2xl`}>
        <div className="p-4 border-b border-zinc-700 flex justify-between items-center">
          <div className="flex items-center gap-3">
             {/* Back button for mobile */}
             <button 
               onClick={() => setShowMobileCart(false)} 
               className="lg:hidden p-1.5 bg-zinc-800 rounded-lg text-zinc-400 hover:text-white flex items-center gap-2 px-3"
             >
               <span className="text-lg leading-none mb-0.5">←</span> Volver al Catálogo
             </button>
             <h3 className="font-semibold text-cyan-400 flex items-center gap-2">
                <span className="w-2 h-2 bg-cyan-500 rounded-full hidden lg:block"></span> POS Terminal
             </h3>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-[30vh]">
          {cart.length === 0 ? (
            <div className="text-center text-zinc-500 py-10 text-sm">Cart is empty</div>
          ) : (
            cart.map(item => (
              <div key={item.id} className="flex items-center justify-between bg-zinc-800/40 p-3 rounded-lg border border-zinc-700/50">
                <div className="flex-1 pr-3">
                  <h4 className="text-sm font-medium text-zinc-200 leading-tight mb-1">{item.name}</h4>
                  <div className="text-xs font-semibold text-cyan-400">{formatCurrency(item.price * (companyInfo?.defaultExchangeRate || 36.6243), 'NIO')}</div>
                </div>
                <div className="flex items-center space-x-1 bg-zinc-800 rounded-md border border-zinc-700 p-0.5">
                  <button onClick={() => updateQuantity(item.id, -1)} className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-medium w-6 text-center text-zinc-200">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, 1)} className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button onClick={() => removeFromCart(item.id)} className="p-1.5 ml-2 text-zinc-500 hover:text-rose-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-zinc-700 bg-zinc-900 overflow-y-auto lg:max-h-[50vh] custom-scrollbar">
          <div className="grid grid-cols-2 gap-3 mb-4 relative">
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-zinc-500 font-bold">Customer Name</label>
              <input 
                type="text" 
                placeholder="Ignacio Lula..." 
                className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  setShowCustomerPredictions(true);
                  if (selectedCustomerId) setSelectedCustomerId(null);
                }}
                onFocus={() => setShowCustomerPredictions(true)}
              />
              {/* Autocomplete Dropdown */}
              {showCustomerPredictions && customerName.trim().length > 1 && !selectedCustomerId && (
                <div className="absolute z-10 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {customers
                    .filter(c => c.fullName.toLowerCase().includes(customerName.toLowerCase()) || (c.phone && c.phone.includes(customerName)))
                    .map(c => (
                      <div 
                        key={c.id}
                        className="px-3 py-2 hover:bg-zinc-700 cursor-pointer flex flex-col"
                        onClick={() => {
                          setSelectedCustomerId(c.id);
                          setCustomerName(c.fullName);
                          setCustomerPhone(c.phone || '');
                          setCustomerEmail(c.email || '');
                          setCustomerAddress(c.address || '');
                          setShowCustomerPredictions(false);
                        }}
                      >
                        <span className="text-sm font-medium text-white">{c.fullName}</span>
                        <span className="text-[10px] text-zinc-400">{c.phone} {c.email ? `- ${c.email}` : ''}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-zinc-500 font-bold">Phone</label>
              <input 
                type="text" 
                placeholder="8765 9876" 
                className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1 mb-4">
            <label className="text-[10px] uppercase text-zinc-500 font-bold">Address</label>
            <textarea 
              rows={2}
              placeholder="Barrio Avenida Brasil..." 
              className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-zinc-500 font-bold">Transport</label>
              <select
                className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500 appearance-none cursor-pointer"
                value={transport}
                onChange={(e) => setTransport(e.target.value)}
              >
                <option value="ENTREGA LOCAL">ENTREGA LOCAL</option>
                <option value="DELIVERY MANAGUA">DELIVERY MANAGUA</option>
                <option value="CARGOTRANS">CARGOTRANS</option>
                <option value="BUSES INTERLOCALES">BUSES INTERLOCALES</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-zinc-500 font-bold text-rose-400">Discount</label>
              <input 
                type="number" 
                className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-zinc-500 font-bold text-cyan-400">Shipping</label>
              <input 
                type="number" 
                className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                value={shipping}
                onChange={(e) => setShipping(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-1 mb-4">
            <label className="text-[10px] uppercase text-zinc-500 font-bold">Nota / Referencia (Opcional)</label>
            <textarea 
              rows={2}
              placeholder="Ref: Carlos Pago mediante Transferencia..." 
              className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
            />
          </div>
          
          <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
            <div className="flex justify-between text-xs mb-2 text-zinc-300">
              <span>Monto Bruto</span>
              <span>{formatCurrency(subtotal * (companyInfo?.defaultExchangeRate || 36.6243), 'NIO')}</span>
            </div>
            {shipping > 0 && (
              <div className="flex justify-between text-xs mb-2 text-zinc-300">
                <span>Costo de Envío</span>
                <span>{formatCurrency(shipping, 'NIO')}</span>
              </div>
            )}
            {discount > 0 && (
              <div className="flex justify-between text-xs mb-2 text-rose-400">
                <span>Descuento</span>
                <span>-{formatCurrency(discount, 'NIO')}</span>
              </div>
            )}
            <div className="h-px bg-zinc-700 my-2"></div>
            <div className="flex justify-between font-bold text-sm sm:text-lg text-zinc-100 mt-2">
              <span>TOTAL (NIO)</span>
              <span className="text-sky-400">{formatCurrency((subtotal * (companyInfo?.defaultExchangeRate || 36.6243)) + shipping - discount, 'NIO')}</span>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => handleTryCheckout(false)}
              disabled={cart.length === 0}
              className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-cyan-900/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed text-sm sm:text-base"
            >
              FACTURAR
              <FileText className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleTryCheckout(true)}
              disabled={cart.length === 0}
              title="Generar Proforma (Cotización)"
              className="w-14 bg-zinc-800 hover:bg-zinc-700 text-sky-400 font-bold py-3 rounded-lg border border-zinc-700 flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText className="w-5 h-5" />
            </button>
          </div>
          <p className="text-[10px] text-zinc-500 text-center mt-2 italic">Includes auto-check for stock availability</p>
        </div>
      </div>
    </div>
    </>
  );
}
