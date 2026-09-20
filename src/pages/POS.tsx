import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../context/StoreContext';
import { Product, CartItem, Sale, ClientData } from '../types';
import { formatCurrency, DEFAULT_EXCHANGE_RATE } from '../lib/utils';
import { Search, Plus, Minus, Trash2, ShoppingCart, FileText, Package } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { planesParaVenta } from '../lib/financiamiento';
import InvoicePreview, { InvoiceData } from '../components/InvoicePreview';
import ShippingLabelPreview from '../components/ShippingLabelPreview';
import { toast } from '../components/Toast';
import { buildInvoiceDataFromSale, buildWhatsAppMessage } from '../lib/invoice';
import { formatCurrencyNIO } from '../lib/utils';
import { round2 } from '../lib/validations';
import {
  guardarVentaEnCurso,
  leerVentaEnCurso,
  borrarVentaEnCurso,
  hace,
  type VentaEnCurso,
} from '../lib/ventaEnCurso';

export default function POS() {
  const { products, recordSale, companyInfo, loading, customers, addCustomer, updateCustomer, configFinanciamiento } = useStore();
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
  // P2.5: método de pago real (antes hardcodeado EFECTIVO) + referencia.
  const [paymentMethod, setPaymentMethod] = useState<Sale['paymentMethod']>('EFECTIVO');
  // Plazo elegido cuando la venta es financiada. null = todavía sin elegir.
  const [plazoMeses, setPlazoMeses] = useState<number | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  // P2.5: edición de precio por línea.
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [customNote, setCustomNote] = useState('');
  const [previewData, setPreviewData] = useState<InvoiceData | null>(null);
  const [labelSaleData, setLabelSaleData] = useState<Sale | null>(null);
  // La etiqueta de envío espera acá hasta que se cierre el preview. Antes se
  // montaba apenas se confirmaba la venta, y como el preview es z-[100] contra
  // el z-[60] de la etiqueta, quedaba invisible detrás y aparecía de golpe al
  // cerrar el primero: un segundo diálogo que nadie pidió, justo al final del
  // flujo. La regla del pico-final dice que se recuerda el final.
  const [pendingLabelSale, setPendingLabelSale] = useState<Sale | null>(null);
  const [pendingSale, setPendingSale] = useState<{sale: Sale, isProforma: boolean} | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  // WhatsApp con PDF adjunto disponible en el preview tras confirmar la venta.
  const [waShare, setWaShare] = useState<{ text: string; link: string | null } | null>(null);
  // Borrador encontrado al montar. Se ofrece, no se restaura solo: meterle una
  // venta ajena al operador sin avisar sería peor que perderla.
  const [borrador, setBorrador] = useState<VentaEnCurso | null>(null);

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
        toast.error(`No hay más stock disponible de "${product.name}".`);
        return;
      }
      setCart(cart.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      if (product.stock <= 0) {
        toast.error('Producto sin stock.');
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
          toast.error('No se puede superar el stock disponible.');
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

  /**
   * Descarta la venta en curso. No había forma de abandonar un carrito armado
   * por error salvo sacar las líneas de a una: con seis productos cargados eso
   * son seis clics con el cliente esperando.
   */
  const vaciarCarrito = () => {
    if (cart.length === 0) return;
    setCart([]);
    setPlazoMeses(null);
    borrarVentaEnCurso();
    toast.info('Venta descartada.');
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const taxRate = 0; // Set to 0 to match screenshot logic (Total = Gross + Shipping - Discount)
  const tax = subtotal * taxRate;
  const currentExchangeRate = companyInfo?.defaultExchangeRate || DEFAULT_EXCHANGE_RATE;
  const total = subtotal + tax + (shipping / currentExchangeRate) - (discount / currentExchangeRate);

  // P2.5: Enter agrega el match exacto de SKU (o el único resultado) — listo
  // para lector de código de barras (tipea el SKU y manda Enter).
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const term = searchTerm.trim().toLowerCase();
    if (!term) return;
    const exact = filteredProducts.find(p => p.sku.toLowerCase() === term);
    const target = exact || (filteredProducts.length === 1 ? filteredProducts[0] : undefined);
    if (target) {
      addToCart(target);
      setSearchTerm('');
    } else {
      toast.info('Sin coincidencia exacta de SKU o nombre único.');
    }
  };

  // P2.5: precio negociado por línea (se edita en C$ y se guarda en USD).
  const commitLinePrice = (id: string, nioValue: string) => {
    const nio = Math.max(0, Number(nioValue) || 0);
    setCart(prev => prev.map(item =>
      item.id === id
        ? { ...item, price: round2(nio / currentExchangeRate), efectivoApplied: false }
        : item
    ));
    setEditingPriceId(null);
  };

  // P2.5: descuento por pago en efectivo (descEfectivoPct del catálogo).
  const pendingCashDiscount = cart.filter(i => (i.descEfectivoPct || 0) > 0 && !i.efectivoApplied);
  const appliedCashCount = cart.filter(i => i.efectivoApplied).length;

  const applyCashDiscount = () => {
    setCart(prev => prev.map(item =>
      (item.descEfectivoPct || 0) > 0 && !item.efectivoApplied
        ? { ...item, price: round2(item.price * (1 - (item.descEfectivoPct || 0) / 100)), efectivoApplied: true }
        : item
    ));
  };

  const removeCashDiscount = () => {
    setCart(prev => prev.map(item => {
      if (!item.efectivoApplied) return item;
      // Restaura el precio base del catálogo (pierde negociación manual en esa línea).
      const base = products.find(p => p.id === item.id)?.price ?? item.price;
      return { ...item, price: base, efectivoApplied: false };
    }));
  };

  // Si el método deja de ser EFECTIVO, quitar los precios efectivos aplicados.
  useEffect(() => {
    if (paymentMethod !== 'EFECTIVO' && appliedCashCount > 0) removeCashDiscount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod]);

  // Al montar: ¿quedó una venta a medias? Se ofrece; no se restaura sola.
  useEffect(() => {
    const v = leerVentaEnCurso();
    if (v) setBorrador(v);
  }, []);

  /**
   * Guardar en cada cambio.
   *
   * DOS GUARDAS, y las dos son necesarias — sin ellas el borrador se borraba a
   * sí mismo en el montaje que lo ofrecía:
   *
   * 1. `montado`: en el primer render el carrito está vacío, y este efecto
   *    corre JUSTO DESPUÉS del de lectura, en el mismo commit. Sin saltear esa
   *    primera pasada, `guardarVentaEnCurso` recibía un carrito vacío y hacía
   *    `removeItem`: el borrador quedaba solo en memoria de React y un segundo
   *    refresco lo perdía para siempre.
   * 2. `borrador`: mientras el operador no decidió si recupera, no se pisa lo
   *    guardado. Si empieza a cargar productos con la oferta en pantalla, el
   *    carrito nuevo NO puede sobrescribir la venta que todavía puede querer.
   */
  const montado = useRef(false);
  useEffect(() => {
    if (!montado.current) { montado.current = true; return; }
    if (borrador) return;
    guardarVentaEnCurso({
      cart, customerName, customerEmail, customerPhone, customerAddress,
      selectedCustomerId, transport, paymentMethod, paymentReference,
      plazoMeses, discount, shipping, customNote,
    });
  }, [borrador, cart, customerName, customerEmail, customerPhone, customerAddress,
      selectedCustomerId, transport, paymentMethod, paymentReference,
      plazoMeses, discount, shipping, customNote]);

  const restaurarBorrador = () => {
    if (!borrador) return;
    setCart(borrador.cart);
    setCustomerName(borrador.customerName);
    setCustomerEmail(borrador.customerEmail);
    setCustomerPhone(borrador.customerPhone);
    setCustomerAddress(borrador.customerAddress);
    setSelectedCustomerId(borrador.selectedCustomerId);
    setTransport(borrador.transport);
    setPaymentMethod(borrador.paymentMethod);
    setPaymentReference(borrador.paymentReference);
    setPlazoMeses(borrador.plazoMeses);
    setDiscount(borrador.discount);
    setShipping(borrador.shipping);
    setCustomNote(borrador.customNote);
    setBorrador(null);
    toast.success('Venta recuperada.');
  };

  const descartarBorrador = () => {
    borrarVentaEnCurso();
    setBorrador(null);
  };

  // ---- Financiamiento a plazos -------------------------------------------
  // El recargo lo define la categoría de cada producto (o su override). Si el
  // carrito mezcla categorías, `planesParaVenta` pondera por monto: el
  // proyector al 0% no arrastra al smartwatch al 3% ni al revés.
  //
  // OJO con la base: el plan se calcula sobre el NETO, no sobre el bruto de las
  // líneas. `total` ya trae el envío sumado y el descuento restado, así que el
  // ajuste se prorratea sobre cada línea. Prorratear —en vez de sumar el ajuste
  // como una línea aparte— conserva el peso relativo de cada categoría, que es
  // justo lo que pondera el recargo, y deja que la suma de `montoUsd` sea
  // exactamente el total que se cobra.
  //
  // Sin esto, `cuotaNio × meses` no cuadra con el TOTAL del recibo apenas hay
  // descuento o envío, y la frase "el cliente paga X más" queda calculada sobre
  // otra base que el "de contado serían" de la misma oración.
  const planesVenta = useMemo(() => {
    const subtotalUsd = cart.reduce((s, i) => s + i.price * i.quantity, 0);
    if (subtotalUsd <= 0) return [];
    // Si el descuento se come el total, el factor sale <= 0 y `planesParaVenta`
    // descarta las líneas: no se ofrecen cuotas. Es el lado prudente.
    const factorAjuste = total / subtotalUsd;
    return planesParaVenta(
      cart.map((i) => ({
        categoria: i.categorySlug || i.category,
        override: i.financiamientoOverride,
        montoUsd: i.price * i.quantity * factorAjuste,
      })),
      currentExchangeRate,
      configFinanciamiento,
    );
  }, [cart, total, currentExchangeRate, configFinanciamiento]);

  const esFinanciada = paymentMethod === 'FINANCIAMIENTO';
  const planElegido = planesVenta.find((pl) => pl.meses === plazoMeses) ?? null;

  // Al cambiar de método o de carrito, el plazo elegido puede dejar de existir.
  useEffect(() => {
    if (!esFinanciada) { setPlazoMeses(null); return; }
    // Un solo plazo disponible: se preselecciona, no tiene sentido preguntar.
    if (planesVenta.length === 1) { setPlazoMeses(planesVenta[0].meses); return; }
    if (plazoMeses !== null && !planesVenta.some((pl) => pl.meses === plazoMeses)) {
      setPlazoMeses(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esFinanciada, planesVenta]);

  const handleTryCheckout = async (isProforma: boolean = false) => {
    if (cart.length === 0) return;

    // P1.7: el descuento no puede superar el monto de la venta.
    const grossNIO = subtotal * currentExchangeRate + shipping;
    if (discount > grossNIO) {
      toast.error('El descuento no puede superar el total de la venta.');
      return;
    }

    // Venta financiada sin plazo elegido: se corta acá. Registrar el plazo es
    // el único motivo por el que existe esta forma de pago — sin él la venta no
    // aporta nada al costo real de financiamiento.
    if (paymentMethod === 'FINANCIAMIENTO') {
      if (planesVenta.length === 0) {
        toast.error(
          `Esta venta no califica para cuotas (mínimo US$${configFinanciamiento.minUsd}). Elegí otra forma de pago.`,
        );
        return;
      }
      if (!planElegido) {
        toast.error('Elegí el plazo de las cuotas antes de cobrar.');
        return;
      }
    }

    // P1.1: el número correlativo definitivo se asigna en la transacción de
    // recordSale (counters/*), así que antes de confirmar todavía no existe.
    //
    // Va vacío a propósito. Antes decía 'POR ASIGNAR' y eso se imprimía en el
    // A4: cuando se gira la laptop para mostrarle la proforma al cliente —que
    // es la razón de ser de una proforma— lo que el cliente leía era
    // "Cotización No # POR ASIGNAR". InvoicePreview ahora oculta el renglón
    // completo mientras no haya número, en vez de rellenarlo con un aviso
    // interno.
    const newInvoiceNumber = '';

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
      // P2.5: método de pago real seleccionado en el checkout.
      paymentMethod,
      paymentReference: paymentReference.trim() || undefined,
      // Foto del plan cobrado. Congela el recargo y el monto reales: si mañana
      // cambian las tasas, esta venta sigue contando lo que de verdad pasó.
      financiamiento:
        paymentMethod === 'FINANCIAMIENTO' && planElegido
          ? {
              plazoMeses: planElegido.meses,
              recargoPct: planElegido.recargoPct,
              cuotaNio: planElegido.cuotaNio,
              totalNio: planElegido.totalNio,
              banco: configFinanciamiento.banco,
            }
          : undefined,
      status: 'completed',
      notes: customNote
    };

    // P2.5: el preview usa el builder compartido (mismo que reimprimir).
    const invoiceData: InvoiceData = buildInvoiceDataFromSale(sale as Sale, companyInfo);

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

    // P1.1: recordSale asigna y devuelve el número correlativo definitivo.
    let assignedNumber: string;
    try {
        assignedNumber = await recordSale(sale);
    } catch (e: any) {
        // `db.ts` ya humaniza permisos, conexión, cuota de Spark y concurrencia,
        // y `recordSale` lanza el diagnóstico exacto ("Stock insuficiente de X.
        // Pedido: 3, Disponible: 1"). Antes se descartaba todo eso y se decía
        // siempre "verifique el stock", que es el consejo equivocado para
        // cuatro de las cinco causas. El operador es su propia mesa de ayuda:
        // el mensaje en pantalla es todo el soporte que hay.
        toast.error(e?.message || 'No se pudo completar la venta. Intentá de nuevo.');
        setIsConfirming(false);
        return;
    }

    const confirmedSale = { ...sale, invoiceNumber: assignedNumber } as Sale;
    // Actualizar el preview abierto (pasa a modo descarga) con el número real.
    setPreviewData(prev => (prev ? { ...prev, invoiceNumber: assignedNumber } : prev));

    // La operación es IRREVERSIBLE —escribe venta, descuenta stock, mueve el
    // kardex y consume el correlativo— y hasta acá no confirmaba nada: el único
    // indicio era que cambiaba la botonera del modal. En una conexión lenta no
    // había forma de distinguir "se guardó" de "se colgó", y el instinto es
    // volver a apretar.
    toast.success(
      `${isProforma ? 'Proforma' : 'Venta'} ${assignedNumber} registrada · ` +
      `${formatCurrencyNIO(confirmedSale.total * currentExchangeRate)}` +
      `${isProforma ? '' : ' · stock actualizado'}`,
    );
    // Habilitar "Enviar por WhatsApp" (comparte el PDF) si hay teléfono.
    setWaShare(confirmedSale.customerPhone
      ? buildWhatsAppMessage(confirmedSale, formatCurrencyNIO(confirmedSale.total * currentExchangeRate))
      : null);

    setCart([]);
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomNote('');
    setDiscount(0);
    setShipping(0);
    setPaymentReference('');
    // El cliente seleccionado TIENE que limpiarse: `sale.customerId` sale de
    // acá, así que si queda pegado, la próxima venta de mostrador (sin nombre)
    // se archiva en silencio en el historial del cliente anterior.
    setSelectedCustomerId(null);
    // La forma de pago y el plazo también: heredar FINANCIAMIENTO de la venta
    // anterior arrastra el plazo al checkout siguiente y llega hasta el reporte
    // de margen. `transport` se deja a propósito: casi todas las ventas de una
    // misma jornada salen por la misma vía.
    setPaymentMethod('EFECTIVO');
    setPlazoMeses(null);
    // La venta ya está registrada: el borrador no tiene nada que recuperar.
    borrarVentaEnCurso();

    // Prepare label if transport requires it. Queda en espera: se monta recién
    // cuando el operador cierra el preview, no debajo de él.
    if (['DELIVERY MANAGUA', 'CARGOTRANS', 'BUSES INTERLOCALES'].includes(confirmedSale.transport || '')) {
        setPendingLabelSale(confirmedSale);
    }

    setPendingSale(null);
    setIsConfirming(false);
  };

  if (loading) return <div className="text-zinc-500">Cargando POS…</div>;

  return (
    <>
      {previewData && (
        <InvoicePreview
          data={previewData}
          isOpen={!!previewData}
          onClose={() => {
            setPreviewData(null);
            setPendingSale(null);
            setWaShare(null);
            // Recién ahora la etiqueta tiene la pantalla para ella sola.
            if (pendingLabelSale) {
              setLabelSaleData(pendingLabelSale);
              setPendingLabelSale(null);
            }
          }}
          onConfirm={pendingSale ? handleConfirmCheckout : undefined}
          isConfirming={isConfirming}
          whatsApp={waShare}
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
      {/*
        Barra de recuperación. Aparece solo si quedó una venta a medias y no se
        restaura sola: el operador decide. Antes, un F5 o un clic al Catálogo
        Maestro para corregir un precio destruía el carrito sin aviso — y salir
        del POS a mitad de venta es parte del trabajo cuando sos también el
        administrador.
      */}
      {borrador && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-4 py-3">
          <p className="text-sm text-zinc-200">
            Quedó una venta sin cobrar de {hace(borrador.guardadoEn)} —{' '}
            <span className="font-bold">
              {borrador.cart.length} {borrador.cart.length === 1 ? 'línea' : 'líneas'}
            </span>
            {borrador.customerName.trim() && <> a nombre de {borrador.customerName.trim()}</>}.
            {cart.length > 0 && (
              <span className="text-amber-400"> Recuperarla reemplaza lo que tenés cargado ahora.</span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={descartarBorrador}
              className="text-xs font-bold text-zinc-400 hover:text-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-500 rounded px-3 py-2 transition-colors"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={restaurarBorrador}
              className="text-xs font-bold bg-cyan-700 hover:bg-cyan-600 text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded-lg px-4 py-2 transition-colors"
            >
              Recuperar venta
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-col lg:flex-row gap-6 lg:h-[calc(100vh-8rem)]">
      {/* Product Selection */}
      <div className={`${showMobileCart ? 'hidden lg:flex' : 'flex'} w-full lg:w-3/5 flex-col bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden h-[calc(100vh-12rem)] lg:h-full`}>
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/30">
          <h3 className="font-semibold text-zinc-200">Catálogo</h3>
          <div className="relative w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-zinc-500" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-1.5 border border-zinc-700 rounded-lg leading-5 bg-zinc-800 text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm"
              placeholder="Buscar por nombre, SKU o categoría… (Enter agrega)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {/*
              Cada tarjeta es un <button>, no un <div onClick>. Agregar al
              carrito es LA acción de esta pantalla y antes no se alcanzaba con
              Tab: el único camino de teclado era saberse el SKU de memoria.
              Además, `disabled` cuando no hay stock reemplaza al toast de
              error: la tarjeta decía `cursor-not-allowed` pero igual respondía.
            */}
            {filteredProducts.length === 0 && (
              <div className="col-span-full py-12 text-center">
                <p className="text-sm text-zinc-300">
                  {searchTerm.trim()
                    ? <>No hay productos que coincidan con «{searchTerm.trim()}».</>
                    : 'No hay productos activos en el catálogo.'}
                </p>
                {searchTerm.trim() && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="mt-3 text-xs font-bold text-cyan-400 hover:text-cyan-300 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded px-3 py-1.5"
                  >
                    Limpiar búsqueda
                  </button>
                )}
              </div>
            )}
            {filteredProducts.map(product => (
              <button
                key={product.id}
                type="button"
                onClick={() => addToCart(product)}
                disabled={product.stock <= 0}
                aria-label={`Agregar ${product.name} al carrito`}
                className={`relative text-left w-full rounded-xl border p-3 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                  product.stock > 0
                    ? 'bg-zinc-800/40 border-zinc-700 hover:bg-zinc-800 hover:border-zinc-600 shadow-sm cursor-pointer'
                    : 'bg-zinc-900/50 border-zinc-800 cursor-not-allowed'
                }`}
              >
                {/*
                  La opacidad va SOLO sobre la imagen, no sobre la tarjeta. Antes
                  era `opacity-50` en el contenedor entero, y eso componía también
                  el texto contra el fondo: el nombre caía a 4.39:1, el precio a
                  3.33:1 y el SKU a 1.83:1. Atenuar la foto comunica lo mismo sin
                  volver ilegible lo que hay que leer.
                */}
                {product.imageBase64 ? (
                  <div className={`aspect-w-1 aspect-h-1 w-full overflow-hidden rounded-lg bg-zinc-900 mb-3 border border-zinc-800 ${product.stock > 0 ? '' : 'opacity-40'}`}>
                    <img src={product.imageBase64} alt="" className="h-24 w-full object-cover" />
                  </div>
                ) : (
                  <div className={`h-24 w-full rounded-lg bg-zinc-800 mb-3 border border-zinc-700 flex items-center justify-center ${product.stock > 0 ? '' : 'opacity-40'}`}>
                    <Package className="h-8 w-8 text-zinc-500" aria-hidden="true" />
                  </div>
                )}
                <h3 className="text-sm font-medium text-zinc-200 line-clamp-2 leading-tight">{product.name}</h3>
                <p className="mt-1 text-[10px] text-zinc-400 uppercase">{product.sku}</p>
                <div className="mt-3 flex justify-between items-center">
                  <span className="text-sm font-bold text-cyan-400">{formatCurrency(product.price * (companyInfo?.defaultExchangeRate || DEFAULT_EXCHANGE_RATE), 'NIO')}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${product.stock > 0 ? 'bg-cyan-500/10 text-cyan-500' : 'bg-rose-500/10 text-rose-400'}`}>
                    Stock: {product.stock}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile Sticky Bottom Bar (when viewing catalog) */}
      {!showMobileCart && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-zinc-900 border-t border-zinc-700 z-40 lg:hidden shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
           <button 
             onClick={() => setShowMobileCart(true)}
             className="w-full bg-cyan-700 hover:bg-cyan-600 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg flex items-center justify-between"
           >
             <span className="flex items-center gap-2">
               <ShoppingCart className="w-5 h-5" /> 
               Ver Carrito ({cart.length} ítems)
             </span>
             <span>{formatCurrency((subtotal * (companyInfo?.defaultExchangeRate || DEFAULT_EXCHANGE_RATE)) + shipping - discount, 'NIO')}</span>
           </button>
        </div>
      )}

      {/* Cart Panel */}
      <div className={`${!showMobileCart ? 'hidden lg:flex' : 'flex'} w-full lg:w-2/5 flex-col bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-2xl`}>
        {/*
          El encabezado decía "Terminal POS" con un punto decorativo: repetía lo
          que ya dice el ítem activo de la barra lateral y gastaba el renglón más
          caro del panel. Ahora lleva el estado real de la venta — cuántas líneas
          y a nombre de quién — que es lo que se consulta de reojo mientras se
          cobra con el cliente enfrente.
        */}
        <div className="flex-none p-4 border-b border-zinc-700 flex justify-between items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
             {/* Back button for mobile */}
             <button
               onClick={() => setShowMobileCart(false)}
               className="lg:hidden p-1.5 bg-zinc-800 rounded-lg text-zinc-400 hover:text-white flex items-center gap-2 px-3"
             >
               <span className="text-lg leading-none mb-0.5">←</span> Volver al Catálogo
             </button>
             <div className="min-w-0">
               <h3 className="font-semibold text-zinc-200 leading-tight">
                 {cart.length === 0
                   ? 'Nueva venta'
                   : `${cart.length} ${cart.length === 1 ? 'línea' : 'líneas'}`}
               </h3>
               <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold truncate">
                 {customerName.trim() || 'Cliente de mostrador'}
               </p>
             </div>
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={vaciarCarrito}
              className="flex-none text-[10px] uppercase tracking-wider font-bold text-zinc-400 hover:text-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-500 rounded px-2 py-1 transition-colors"
            >
              Vaciar
            </button>
          )}
        </div>

        {/*
          UNA sola área de scroll para líneas + formulario. Antes eran dos
          apiladas (la de líneas y la del formulario con `max-h-[50vh]`), cada
          una con su barra dentro de una columna angosta: el panel competía
          consigo mismo y el total quedaba a mitad de camino. Ahora todo lo que
          se completa scrollea junto, y el cierre queda fijo abajo.
        */}
        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
        <div className="p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="text-center text-zinc-500 py-10 text-sm">El carrito está vacío</div>
          ) : (
            cart.map(item => (
              <div key={item.id} className="flex items-center justify-between bg-zinc-800/40 p-3 rounded-lg border border-zinc-700/50">
                <div className="flex-1 pr-3">
                  <h4 className="text-sm font-medium text-zinc-200 leading-tight mb-1">{item.name}</h4>
                  {/* P2.5: precio negociable por línea (clic para editar, en C$) */}
                  {editingPriceId === item.id ? (
                    <input
                      autoFocus
                      type="number"
                      min="0"
                      step="any"
                      defaultValue={round2(item.price * currentExchangeRate)}
                      onBlur={(e) => commitLinePrice(item.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setEditingPriceId(null);
                      }}
                      className="w-24 bg-zinc-900 border border-cyan-600 rounded px-1.5 py-0.5 text-xs text-cyan-300 outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingPriceId(item.id)}
                      title={item.price < (item.cost || 0) ? '¡Precio por debajo del costo! Clic para editar' : 'Clic para editar el precio de esta línea'}
                      className={`text-xs font-semibold hover:underline decoration-dotted ${item.price < (item.cost || 0) ? 'text-rose-400' : 'text-cyan-400'}`}
                    >
                      {formatCurrency(item.price * currentExchangeRate, 'NIO')}
                      {item.efectivoApplied && <span className="text-emerald-400 ml-1 no-underline">·efectivo</span>}
                    </button>
                  )}
                </div>
                <div className="flex items-center space-x-1 bg-zinc-800 rounded-md border border-zinc-700 p-0.5">
                  <button onClick={() => updateQuantity(item.id, -1)} aria-label={`Quitar una unidad de ${item.name}`} className="p-2 rounded text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-medium w-6 text-center text-zinc-200">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, 1)} aria-label={`Agregar una unidad de ${item.name}`} className="p-2 rounded text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button onClick={() => removeFromCart(item.id)} aria-label={`Quitar ${item.name} del carrito`} className="p-2 ml-1 text-zinc-400 hover:text-rose-400 transition-colors focus:outline-none focus:ring-1 focus:ring-rose-500 rounded">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-zinc-700">
          {/* Sección: Cliente */}
          <p className="text-[10px] uppercase tracking-wider text-cyan-400/80 font-bold mb-2 flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-cyan-500"></span> Cliente
          </p>
          <div className="grid grid-cols-2 gap-3 mb-4 relative">
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-zinc-400 font-bold">Nombre del Cliente</label>
              <input 
                type="text" 
                placeholder="Ignacio Lula..." 
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-cyan-500"
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
              <label className="text-[10px] uppercase text-zinc-400 font-bold">Teléfono</label>
              <input 
                type="text" 
                placeholder="8765 9876" 
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-cyan-500"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1 mb-4">
            <label className="text-[10px] uppercase text-zinc-400 font-bold">Dirección</label>
            <textarea 
              rows={2}
              placeholder="Barrio Avenida Brasil..." 
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-cyan-500"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
            />
          </div>

          {/* Sección: Entrega y ajustes */}
          <p className="text-[10px] uppercase tracking-wider text-cyan-400/80 font-bold mb-2 flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-cyan-500"></span> Entrega y ajustes
          </p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-zinc-400 font-bold">Transporte</label>
              <select
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500 appearance-none cursor-pointer"
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
              <label className="text-[10px] uppercase font-bold text-rose-400">Descuento (NIO)</label>
              <input 
                type="number" 
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-cyan-500"
                value={discount || ''}
                min="0"
                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-cyan-400">Envío (NIO)</label>
              <input 
                type="number" 
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-cyan-500"
                value={shipping || ''}
                min="0"
                onChange={(e) => setShipping(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          </div>

          {/*
            Sección: Pago. Antes el método de pago, la referencia, la nota y el
            bloque de financiamiento caían debajo del rótulo "Entrega y ajustes",
            que terminaba arrastrando 7+ controles. Son etapas distintas del
            cobro y ahora se rotulan como tales: el orden de los campos no
            cambia, cambia dónde empieza cada grupo.
          */}
          <p className="text-[10px] uppercase tracking-wider text-cyan-400/80 font-bold mb-2 flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-cyan-500"></span> Pago
          </p>
          {/* P2.5: método de pago + referencia */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-zinc-400 font-bold">Método de Pago</label>
              <select
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500 appearance-none cursor-pointer"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as Sale['paymentMethod'])}
              >
                <option value="EFECTIVO">EFECTIVO</option>
                <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                <option value="TARJETA">TARJETA (pago único)</option>
                <option value="FINANCIAMIENTO">FINANCIAMIENTO (cuotas)</option>
                <option value="CREDITO">CRÉDITO</option>
              </select>
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-[10px] uppercase text-zinc-400 font-bold">Referencia de Pago (Opcional)</label>
              <input
                type="text"
                placeholder="N° de transferencia / voucher…"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-cyan-500"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1 mb-4">
            <label className="text-[10px] uppercase text-zinc-400 font-bold">Nota / Referencia (Opcional)</label>
            <textarea 
              rows={2}
              placeholder="Ref: Carlos Pago mediante Transferencia..." 
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-cyan-500"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
            />
          </div>
          
          {/* Plazo de las cuotas. Aparece SOLO con forma de pago FINANCIAMIENTO. */}
          {esFinanciada && (
            <div className="mb-4 p-3 bg-cyan-500/5 border border-cyan-500/20 rounded-lg">
              <label className="text-[10px] uppercase text-cyan-400 font-bold block mb-2">
                Plazo de las cuotas
              </label>

              {planesVenta.length === 0 ? (
                <p className="text-[11px] text-amber-400 leading-snug">
                  Esta venta no califica para cuotas: el mínimo es US${configFinanciamiento.minUsd}
                  {cart.length > 0 && ` y el total va en US$${total.toFixed(2)}`}. Puede que un
                  producto del carrito tenga las cuotas deshabilitadas.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {planesVenta.map((pl) => {
                      const activo = plazoMeses === pl.meses;
                      return (
                        <button
                          key={pl.meses}
                          type="button"
                          onClick={() => setPlazoMeses(pl.meses)}
                          className={`text-left p-2.5 rounded-lg border transition-colors ${
                            activo
                              ? 'bg-cyan-500/15 border-cyan-500 text-white'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-bold uppercase">{pl.meses} cuotas</span>
                            {pl.sinInteres ? (
                              <span className="text-[9px] font-bold text-emerald-400">0%</span>
                            ) : (
                              <span className="text-[9px] text-amber-400">+{pl.recargoPct}%</span>
                            )}
                          </div>
                          <div className="text-sm font-bold mt-0.5">
                            {formatCurrency(pl.cuotaNio, 'NIO')}
                            <span className="text-[10px] font-normal text-zinc-400"> /mes</span>
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            Total {formatCurrency(pl.totalNio, 'NIO')}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {plazoMeses === null && (
                    <p className="text-[11px] text-amber-400 mt-2">
                      Elegí un plazo para poder cobrar.
                    </p>
                  )}
                  {planElegido && !planElegido.sinInteres && (
                    <p className="text-[11px] text-zinc-400 mt-2 leading-snug">
                      De contado serían {formatCurrency(total * currentExchangeRate, 'NIO')}. A{' '}
                      {planElegido.meses} meses el cliente paga{' '}
                      {formatCurrency(planElegido.sobrePrecioNio, 'NIO')} más.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* P2.5: descuento por pago en efectivo */}
          {paymentMethod === 'EFECTIVO' && pendingCashDiscount.length > 0 && (
            <div className="mb-3 p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-between gap-2">
              <span className="text-[11px] text-emerald-400 leading-tight">
                {pendingCashDiscount.length} producto(s) con descuento por efectivo disponible
              </span>
              <button
                onClick={applyCashDiscount}
                className="text-[11px] font-bold bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1.5 rounded shrink-0"
              >
                Aplicar
              </button>
            </div>
          )}
          {appliedCashCount > 0 && (
            <div className="mb-3 p-2.5 bg-emerald-500/5 border border-emerald-500/10 rounded-lg flex items-center justify-between gap-2">
              <span className="text-[11px] text-emerald-500/80">
                Precio efectivo aplicado a {appliedCashCount} línea(s)
              </span>
              <button
                onClick={removeCashDiscount}
                title="Restaura el precio de catálogo en esas líneas"
                className="text-[11px] font-bold text-zinc-400 hover:text-rose-400 px-2 py-1"
              >
                Quitar
              </button>
            </div>
          )}

        </div>
        </div>

        {/*
          CIERRE FIJO. El total y el botón irreversible no se van nunca de
          pantalla: antes vivían al final de un formulario con scroll propio, así
          que la cifra que se lee en voz alta al cliente podía estar fuera de
          vista justo cuando se la estaba diciendo.
        */}
        <div className="flex-none p-4 border-t border-zinc-700 bg-zinc-900">
          <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
            <div className="flex justify-between text-xs mb-2 text-zinc-300">
              <span>Monto Bruto</span>
              <span className="tabular-nums">{formatCurrency(subtotal * (companyInfo?.defaultExchangeRate || DEFAULT_EXCHANGE_RATE), 'NIO')}</span>
            </div>
            {shipping > 0 && (
              <div className="flex justify-between text-xs mb-2 text-zinc-300">
                <span>Costo de Envío</span>
                <span className="tabular-nums">{formatCurrency(shipping, 'NIO')}</span>
              </div>
            )}
            {discount > 0 && (
              <div className="flex justify-between text-xs mb-2 text-rose-400">
                <span>Descuento</span>
                <span className="tabular-nums">-{formatCurrency(discount, 'NIO')}</span>
              </div>
            )}
            <div className="h-px bg-zinc-700 my-2"></div>
            {/*
              La cifra que se lee en voz alta. Antes era `text-sm sm:text-lg`
              (18px), cuatro píxeles por encima del cuerpo: los cuatro elementos
              más importantes de la pantalla cabían en un rango de 4px y ninguno
              mandaba. `tabular-nums` es la Regla del Dinero Alineado de
              DESIGN.md, que hasta ahora no se cumplía en ningún lado.
            */}
            <div className="flex items-baseline justify-between gap-2 mt-2">
              {/*
                La tasa con la que se convierte TODO no se mostraba en ninguna
                parte: el operador no tenía forma de verificar cuál se usó sin
                ir a Configuración. Va acá, al lado del total, que es donde
                importa.
              */}
              <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 shrink-0">
                {esFinanciada && planElegido ? 'Total a plazos' : 'Total a cobrar'}
                <span className="block normal-case tracking-normal font-normal text-zinc-500">
                  a {currentExchangeRate.toFixed(4)}
                </span>
              </span>
              <span className="text-3xl font-bold text-cyan-400 tabular-nums leading-none truncate">
                {formatCurrency(
                  esFinanciada && planElegido ? planElegido.totalNio : total * currentExchangeRate,
                  'NIO',
                )}
              </span>
            </div>
            {/*
              En una venta financiada el número grande NO puede ser el de
              contado: lo que el cliente paga son N cuotas. Se invierte la caja y
              el contado baja a línea secundaria.
            */}
            {esFinanciada && planElegido && (
              <div className="flex items-baseline justify-between gap-2 mt-1.5 pt-1.5 border-t border-zinc-700">
                <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 shrink-0">
                  {planElegido.meses} cuotas de
                </span>
                <span className="text-sm font-bold text-zinc-200 tabular-nums">
                  {formatCurrency(planElegido.cuotaNio, 'NIO')}
                  <span className="text-[10px] font-normal text-zinc-400"> /mes</span>
                </span>
              </div>
            )}
            {esFinanciada && planElegido && (
              <div className="flex items-baseline justify-between gap-2 mt-1">
                <span className="text-[10px] uppercase tracking-wider text-zinc-400 shrink-0">De contado</span>
                <span className="text-[11px] text-zinc-400 tabular-nums">
                  {formatCurrency(total * currentExchangeRate, 'NIO')}
                </span>
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => handleTryCheckout(false)}
              disabled={cart.length === 0}
              className="flex-1 bg-cyan-700 hover:bg-cyan-600 text-white font-bold py-3 rounded-lg shadow-lg shadow-cyan-900/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed text-sm sm:text-base"
            >
              FACTURAR
              <FileText className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleTryCheckout(true)}
              disabled={cart.length === 0}
              title="Generar Proforma (Cotización)"
              className="w-14 bg-zinc-800 hover:bg-zinc-700 text-cyan-400 font-bold py-3 rounded-lg border border-zinc-700 flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText className="w-5 h-5" />
            </button>
          </div>
          <p className="text-[10px] text-zinc-400 text-center mt-2 italic">El stock se verifica automáticamente al facturar</p>
        </div>
      </div>
    </div>
    </>
  );
}
