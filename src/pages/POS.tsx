import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../context/StoreContext';
import { Product, CartItem, Sale, ClientData } from '../types';
import { formatCurrency, DEFAULT_EXCHANGE_RATE } from '../lib/utils';
import { Search, Plus, Minus, Trash2, ShoppingCart, FileText, Package, Receipt } from 'lucide-react';
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
  // Opcion resaltada del autocompletado de cliente. -1 = ninguna.
  // El foco NUNCA sale del input: lo que se mueve es `aria-activedescendant`,
  // que es como el patron combobox de ARIA evita que el usuario pierda el
  // cursor de texto mientras elige.
  const [clienteActivo, setClienteActivo] = useState(-1);

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
  const buscadorRef = useRef<HTMLInputElement>(null);
  // Con cuánto paga el cliente, para calcular el vuelto. Solo UI: no viaja a
  // Firestore ni al documento. Vacío = todavía no lo dijo.
  const [pagaCon, setPagaCon] = useState('');

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
    setConfirmandoVaciar(false);
  };

  /**
   * Descarta la venta en curso. No había forma de abandonar un carrito armado
   * por error salvo sacar las líneas de a una: con seis productos cargados eso
   * son seis clics con el cliente esperando.
   */
  /**
   * Descarta la venta en curso, en DOS pasos.
   *
   * Antes bastaba un clic: con seis líneas cargadas y el cliente enfrente, un
   * toque accidental borraba todo sin deshacer. Y era incoherente con el resto
   * del sistema — borrar una venta YA REGISTRADA exige un modal de dos pasos
   * en el Historial, o sea que la acción más reversible tenía más fricción que
   * la menos reversible.
   */
  const [confirmandoVaciar, setConfirmandoVaciar] = useState(false);
  const vaciarCarrito = () => {
    if (cart.length === 0) return;
    setCart([]);
    setPlazoMeses(null);
    setPagaCon('');
    setConfirmandoVaciar(false);
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
    // Se edita con onBlur: vaciar el campo y hacer clic afuera dejaba la línea
    // en 0 sin decir nada, y una factura de C$0 igual consume el correlativo y
    // descuenta stock. Se rechaza y se conserva el precio anterior.
    if (nio <= 0) {
      toast.error('El precio de una línea no puede ser 0. Quedó el anterior.');
      setEditingPriceId(null);
      return;
    }
    setCart(prev => prev.map(item =>
      item.id === id
        // `efectivoApplied` se MANTIENE: si se pone en false, el chip vuelve a
        // ofrecer "Aplicar" sobre un precio que ya venía rebajado, y el
        // descuento se compone sin que nadie lo note. El operador acaba de
        // fijar el precio que quiere cobrar; no hay nada más que descontar.
        //
        // Y el precio tipeado pasa a ser TAMBIÉN el de reversión: si después se
        // cambia la forma de pago, la línea vuelve a lo que el operador fijó a
        // mano, no a un valor anterior que ya descartó.
        ? {
            ...item,
            price: round2(nio / currentExchangeRate),
            ...(item.efectivoApplied ? { precioAntesEfectivo: round2(nio / currentExchangeRate) } : {}),
          }
        : item
    ));
    setEditingPriceId(null);
  };

  // Clientes que matchean lo tipeado. Sale del JSX para poder preguntar si hay
  // alguno ANTES de montar el desplegable.
  const coincidenciasCliente = useMemo(() => {
    const q = customerName.trim().toLowerCase();
    if (q.length < 2) return [];
    return customers.filter(c =>
      c.fullName.toLowerCase().includes(q) || (c.phone && c.phone.includes(customerName.trim()))
    );
  }, [customers, customerName]);

  // Una sola definicion de "el desplegable esta abierto". Antes la condicion
  // vivia solo en el JSX, asi que el input no tenia como declarar
  // `aria-expanded` ni el teclado como saber si habia algo que recorrer.
  const sugerenciasAbiertas =
    showCustomerPredictions &&
    customerName.trim().length > 1 &&
    !selectedCustomerId &&
    coincidenciasCliente.length > 0;

  const elegirCliente = (c: typeof coincidenciasCliente[number]) => {
    setSelectedCustomerId(c.id);
    setCustomerName(c.fullName);
    setCustomerPhone(c.phone || '');
    setCustomerEmail(c.email || '');
    setCustomerAddress(c.address || '');
    setShowCustomerPredictions(false);
    setClienteActivo(-1);
  };

  // Al cambiar lo tipeado cambia la lista: si no se reinicia, el indice viejo
  // apunta a otro cliente y Enter registra la venta a nombre de quien no es.
  useEffect(() => {
    setClienteActivo(-1);
  }, [customerName]);

  // La lista tiene `max-h-48 overflow-y-auto`: sin esto las flechas resaltan
  // una opcion que queda fuera de la ventana visible y parece que no pasa nada.
  useEffect(() => {
    if (clienteActivo < 0) return;
    document
      .getElementById(`pos-cliente-op-${clienteActivo}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [clienteActivo]);

  const onTeclaCliente = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!sugerenciasAbiertas) {
      // Flecha abajo con el campo ya escrito vuelve a abrir la lista que se
      // habia cerrado con Escape, sin tener que borrar y retipear.
      if (e.key === 'ArrowDown' && coincidenciasCliente.length > 0 && !selectedCustomerId) {
        e.preventDefault();
        setShowCustomerPredictions(true);
        setClienteActivo(0);
      }
      return;
    }
    const ultimo = coincidenciasCliente.length - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setClienteActivo(a => (a >= ultimo ? 0 : a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setClienteActivo(a => (a <= 0 ? ultimo : a - 1));
    } else if (e.key === 'Enter') {
      // Solo intercepta el Enter si hay una opcion resaltada. Sin resaltar,
      // el Enter sigue siendo del formulario: el operador que tipea un nombre
      // nuevo no queda atrapado en un desplegable que no pidio.
      if (clienteActivo >= 0) {
        e.preventDefault();
        elegirCliente(coincidenciasCliente[clienteActivo]);
      }
    } else if (e.key === 'Escape') {
      // No se propaga: ESC cierra la lista, no el modal ni la pantalla.
      e.preventDefault();
      e.stopPropagation();
      setShowCustomerPredictions(false);
      setClienteActivo(-1);
    } else if (e.key === 'Tab') {
      setShowCustomerPredictions(false);
      setClienteActivo(-1);
    }
  };

  // P2.5: descuento por pago en efectivo (descEfectivoPct del catálogo).
  const pendingCashDiscount = cart.filter(i => (i.descEfectivoPct || 0) > 0 && !i.efectivoApplied);
  const appliedCashCount = cart.filter(i => i.efectivoApplied).length;

  const applyCashDiscount = () => {
    setCart(prev => prev.map(item =>
      (item.descEfectivoPct || 0) > 0 && !item.efectivoApplied
        ? {
            ...item,
            // Se recuerda el precio EXACTO de antes del descuento. Antes no se
            // guardaba y para revertir había que leer el catálogo, lo que
            // borraba cualquier negociación hecha en esa línea.
            precioAntesEfectivo: item.price,
            price: round2(item.price * (1 - (item.descEfectivoPct || 0) / 100)),
            efectivoApplied: true,
          }
        : item
    ));
  };

  /**
   * Revierte el precio de efectivo. Devuelve el precio que la línea tenía justo
   * antes de aplicarlo — que puede ser un precio negociado a mano, no el del
   * catálogo.
   *
   * Antes leía `products.find(...).price`, así que revertir pisaba la
   * negociación. Y como esto lo dispara automáticamente el cambio de forma de
   * pago, el total cambiaba solo, sin aviso, después de haberle dicho un número
   * al cliente en voz alta.
   */
  const removeCashDiscount = () => {
    let revertidas = 0;
    setCart(prev => prev.map(item => {
      if (!item.efectivoApplied) return item;
      revertidas++;
      const previo = item.precioAntesEfectivo
        ?? products.find(p => p.id === item.id)?.price
        ?? item.price;
      const { precioAntesEfectivo: _omitido, ...resto } = item;
      return { ...resto, price: previo, efectivoApplied: false };
    }));
    return revertidas;
  };

  // Si el método deja de ser EFECTIVO, quitar los precios efectivos aplicados.
  // Se AVISA: es plata que cambia sin que el operador lo haya pedido.
  useEffect(() => {
    if (paymentMethod !== 'EFECTIVO' && appliedCashCount > 0) {
      const n = removeCashDiscount();
      if (n > 0) {
        toast.info(
          `Se quitó el precio de efectivo en ${n} ${n === 1 ? 'línea' : 'líneas'}: ` +
          `el total cambió.`,
        );
      }
    }
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

  /**
   * Atajos de teclado. El operador hace esto decenas de veces por dia y hasta
   * ahora la accion mas repetida de la app exigia soltar el teclado y buscar un
   * boton abajo a la derecha. El acelerador de SKU (Enter en la busqueda) ya
   * demostraba que la pantalla sabe trabajar asi; faltaba terminarlo.
   *
   * No se disparan mientras se escribe en un campo, salvo F2/F3 — que son
   * teclas de funcion y no producen texto.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dentroDeCampo = /^(INPUT|TEXTAREA|SELECT)$/.test(
        (e.target as HTMLElement)?.tagName ?? '',
      );
      // Con un modal abierto el POS no manda: el preview tiene su propio ESC.
      if (previewData || labelSaleData) return;

      // El precio de línea se confirma SOLO con `onBlur`. Con el mouse eso
      // funciona solo (el mousedown sobre FACTURAR dispara el blur antes del
      // click), pero F2 es un keydown en `window` y no saca el foco del input:
      // el operador negociaba, tecleaba 3500, apretaba F2 y se facturaba el
      // precio anterior. Se fuerza el blur y se difiere un tick para que el
      // commit ya esté aplicado cuando se arme la venta.
      if (e.key === 'F2' || e.key === 'F3') {
        e.preventDefault();
        if (cart.length === 0) return;
        const proforma = e.key === 'F3';
        if (editingPriceId !== null) {
          (document.activeElement as HTMLElement | null)?.blur();
          setTimeout(() => handleTryCheckout(proforma), 0);
        } else {
          handleTryCheckout(proforma);
        }
        return;
      }
      if (e.key === '/' && !dentroDeCampo) {
        e.preventDefault();
        buscadorRef.current?.focus();
        buscadorRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // SIN arreglo de dependencias, a propósito. Antes decía
    // `[cart.length, previewData, labelSaleData]` con un `eslint-disable` que
    // silenciaba justamente la regla que existe para atrapar esto: la clausura
    // quedaba congelada en el render donde `cart.length` cambió por última
    // vez, y TODO lo que el operador tocara después era invisible para F2/F3,
    // porque nada de eso altera la cantidad de líneas — el precio negociado,
    // la cantidad, el cliente entero, la forma de pago, el descuento, el
    // flete, el transporte, el plazo de las cuotas. Apretar F2 con el
    // formulario lleno emitía una factura con el cliente vacío, EFECTIVO, sin
    // descuento y a precio de lista, consumiendo un correlativo irreversible.
    // Re-suscribir en cada render cuesta un addEventListener y es lo correcto.
  });

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
        // Se avisa: tipear un nombre daba de alta una ficha en el CRM sin que
        // nadie lo dijera, y despues aparecia en Clientes sin explicacion.
        toast.info(`Se creó la ficha de ${sale.customerName.trim()} en Clientes.`);
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
    setPagaCon('');
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

  if (loading) return <div className="text-zinc-400">Cargando POS…</div>;

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
              className="text-xs font-bold bg-cyan-700 hover:bg-cyan-800 text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded-lg px-4 py-2 transition-colors"
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
              ref={buscadorRef}
              aria-label="Buscar producto por nombre, SKU o categoría"
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
                    ? 'bg-zinc-800/40 border-zinc-700 hover:bg-zinc-800 hover:border-zinc-600 cursor-pointer'
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
                {/*
                  `aspect-w-1 aspect-h-1` no generaba una sola linea de CSS:
                  vienen de `@tailwindcss/aspect-ratio`, que no esta instalado
                  (verificado contra el CSS compilado de dist/ y contra
                  node_modules/@tailwindcss/). Quien leia el codigo veia una
                  caja cuadrada pedida; lo que recortaba de verdad era el
                  `h-24` del <img>. `aspect-square` si es core de Tailwind v4.
                */}
                {product.imageBase64 ? (
                  <div className={`aspect-square w-full overflow-hidden rounded-lg bg-zinc-900 mb-3 border border-zinc-800 ${product.stock > 0 ? '' : 'opacity-40'}`}>
                    <img src={product.imageBase64} alt="" className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className={`h-24 w-full rounded-lg bg-zinc-800 mb-3 border border-zinc-700 flex items-center justify-center ${product.stock > 0 ? '' : 'opacity-40'}`}>
                    <Package className="h-8 w-8 text-zinc-500" aria-hidden="true" />
                  </div>
                )}
                <span className="block text-sm font-medium text-zinc-200 line-clamp-2 leading-tight">{product.name}</span>
                <p className="mt-1 text-[10px] text-zinc-400 uppercase">{product.sku}</p>
                <div className="mt-3 flex justify-between items-center">
                  <span className="text-sm font-bold text-cyan-400">{formatCurrency(product.price * (companyInfo?.defaultExchangeRate || DEFAULT_EXCHANGE_RATE), 'NIO')}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${product.stock > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
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
        /*
          z-30, no z-40: el telon del menu movil (Layout.tsx:47) tambien es
          z-40 y tambien es `fixed` en el contexto raiz. Empatados, desempata
          el orden del DOM, y esta barra se monta dentro de <main>, o sea
          despues: quedaba iluminada por encima del velo. Bajo 768px los dos
          estan visibles a la vez (telon `md:hidden`, barra `lg:hidden`), asi
          que el operador que tocaba la barra creyendo cerrar el menu abria el
          carrito.
        */
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-zinc-900 border-t border-zinc-700 z-30 lg:hidden shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
           <button 
             onClick={() => setShowMobileCart(true)}
             className="w-full bg-cyan-700 hover:bg-cyan-800 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-cyan-400"
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
               className="lg:hidden p-1.5 bg-zinc-800 rounded-lg text-zinc-400 hover:text-white flex items-center gap-2 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500"
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
            confirmandoVaciar ? (
              <div className="flex-none flex items-center gap-1">
                {/*
                  El hover de este boton ACLARABA: blanco sobre rose-500 da
                  3.75:1 y no pasa AA, justo en el instante previo al clic
                  irreversible. Es el mismo fallo que describe la Correccion de
                  la Regla del Relleno Oscuro, y este boton habia quedado sin
                  corregir. rose-700 da 6.03:1. Y sube de px-2 py-1 a px-3 py-2:
                  la confirmacion de un descarte no puede ser el blanco mas
                  chico del panel.
                */}
                <button
                  type="button"
                  onClick={vaciarCarrito}
                  className="text-[10px] uppercase tracking-wider font-bold text-white bg-rose-600 hover:bg-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-400 rounded px-3 py-2 transition-colors"
                >
                  Descartar {cart.length} {cart.length === 1 ? 'línea' : 'líneas'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoVaciar(false)}
                  className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 hover:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded px-2 py-1 transition-colors"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoVaciar(true)}
                className="flex-none text-[10px] uppercase tracking-wider font-bold text-zinc-400 hover:text-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-500 rounded px-2 py-1 transition-colors"
              >
                Vaciar
              </button>
            )
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
            <div className="text-center text-zinc-400 py-10 text-sm">El carrito está vacío</div>
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
                      aria-label={`Precio de ${item.name} en cordobas`}
                      defaultValue={round2(item.price * currentExchangeRate)}
                      onBlur={(e) => commitLinePrice(item.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setEditingPriceId(null);
                      }}
                      className="w-24 bg-zinc-900 border border-cyan-600 rounded-lg px-1.5 py-0.5 text-xs text-cyan-300 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  ) : (
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      {/*
                        El precio editable no tenía ninguna afordancia en reposo:
                        había que SABER que se podía clickear. El subrayado
                        punteado ahora está siempre, no solo en hover.
                      */}
                      <button
                        type="button"
                        onClick={() => setEditingPriceId(item.id)}
                        aria-label={`Editar el precio de ${item.name}`}
                        title={item.price < (item.cost || 0) ? '¡Precio por debajo del costo! Clic para editar' : 'Clic para editar el precio de esta línea'}
                        className={`text-xs font-semibold underline decoration-dotted underline-offset-2 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded ${item.price < (item.cost || 0) ? 'text-rose-400' : 'text-cyan-400'}`}
                      >
                        {formatCurrency(item.price * currentExchangeRate, 'NIO')}
                      </button>
                      {item.efectivoApplied && <span className="text-[10px] text-emerald-400">·efectivo</span>}
                      {/*
                        Total de la línea. Antes solo estaba el precio unitario:
                        con cantidad 3 había que multiplicar de memoria mientras
                        el cliente esperaba.
                      */}
                      {item.quantity > 1 && (
                        <span className="text-[10px] text-zinc-400 tabular-nums">
                          × {item.quantity} ={' '}
                          <span className="font-bold text-zinc-300">
                            {formatCurrency(item.price * item.quantity * currentExchangeRate, 'NIO')}
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-1 bg-zinc-800 rounded-md border border-zinc-700 p-0.5">
                  <button onClick={() => updateQuantity(item.id, -1)} aria-label={`Quitar una unidad de ${item.name}`} className="p-2 rounded text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={item.stock}
                    value={item.quantity}
                    aria-label={`Cantidad de ${item.name}`}
                    onChange={(e) => {
                      const n = Math.floor(Number(e.target.value));
                      if (!Number.isFinite(n)) return;
                      // El techo de stock se respeta igual que con los botones.
                      const fijada = Math.min(Math.max(1, n), item.stock);
                      setCart(prev => prev.map(i => i.id === item.id ? { ...i, quantity: fijada } : i));
                    }}
                    className="text-xs font-medium w-9 text-center text-zinc-200 bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
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
              <label htmlFor="pos-cliente-nombre" className="text-[10px] uppercase text-zinc-400 font-bold">
                Nombre del Cliente
                <span className="normal-case font-normal text-zinc-400"> · opcional</span>
              </label>
              {/*
                Era un input comun con una lista colgando: nada le decia al
                lector de pantalla que habia aparecido un desplegable, y el
                teclado no llegaba a el sin tabular por cada opcion. Ahora es
                el patron combobox completo (ARIA 1.2, foco en el input):
                `aria-expanded` anuncia la apertura, `aria-activedescendant`
                dice cual opcion esta resaltada, y las flechas la mueven.
                `autoComplete="off"` porque si no, el desplegable del navegador
                se monta encima del nuestro.
              */}
              <input id="pos-cliente-nombre"
                type="text"
                placeholder="Ignacio Lula..."
                role="combobox"
                aria-expanded={sugerenciasAbiertas}
                aria-controls="pos-cliente-sugerencias"
                aria-autocomplete="list"
                aria-activedescendant={
                  sugerenciasAbiertas && clienteActivo >= 0
                    ? `pos-cliente-op-${clienteActivo}`
                    : undefined
                }
                autoComplete="off"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  setShowCustomerPredictions(true);
                  if (selectedCustomerId) setSelectedCustomerId(null);
                }}
                onFocus={() => setShowCustomerPredictions(true)}
                onKeyDown={onTeclaCliente}
                onBlur={() => {
                  // El desplegable se abria con el foco y no se cerraba con
                  // nada: al hacer clic en otra parte del formulario quedaba
                  // flotando sobre el campo de telefono, tapandolo. Elegir una
                  // opcion no pasa por aca porque el <ul> cancela su mousedown.
                  setShowCustomerPredictions(false);
                  setClienteActivo(-1);
                }}
              />
              {/*
                El contenedor solo se monta si HAY coincidencias: antes aparecia
                un panel vacio cuando el nombre tipeado no matcheaba con nadie.
                Cada opcion era un <button> dentro del <li role="option">, que
                es contenido invalido para un option y ademas metia una parada
                de Tab por cliente: con ocho coincidencias habia que tabular
                ocho veces para salir del campo. Ahora el <li> ES la opcion y se
                recorre con las flechas, que es lo que el rol prometia.
                `onMouseDown` con preventDefault: sin eso el input pierde el
                foco antes de que llegue el click y el desplegable se desmonta
                debajo del cursor.
              */}
              {sugerenciasAbiertas && (
                <ul
                  id="pos-cliente-sugerencias"
                  role="listbox"
                  aria-label="Clientes que coinciden"
                  className="absolute z-10 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-48 overflow-y-auto list-none"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {coincidenciasCliente.map((c, idx) => (
                    <li
                      key={c.id}
                      id={`pos-cliente-op-${idx}`}
                      role="option"
                      aria-selected={idx === clienteActivo}
                      onClick={() => elegirCliente(c)}
                      className={`px-3 py-2 flex flex-col cursor-pointer hover:bg-zinc-700 ${
                        idx === clienteActivo ? 'bg-zinc-700' : ''
                      }`}
                    >
                      <span className="text-sm font-medium text-white">{c.fullName}</span>
                      {/*
                        zinc-400 sobre el resalte zinc-700 da 3.98:1. El
                        telefono es justo el dato que distingue a dos clientes
                        con el mismo nombre, y perdia contraste en el momento
                        de elegir. zinc-300 da 7.07:1 sobre el resalte y 10.08:1
                        en reposo.
                      */}
                      <span className="text-[10px] text-zinc-300">{c.phone} {c.email ? `- ${c.email}` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor="pos-cliente-telefono" className="text-[10px] uppercase text-zinc-400 font-bold">Teléfono</label>
              <input id="pos-cliente-telefono" 
                type="text" 
                placeholder="8765 9876" 
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1 mb-4">
            <label htmlFor="pos-cliente-direccion" className="text-[10px] uppercase text-zinc-400 font-bold">Dirección</label>
            <textarea id="pos-cliente-direccion" 
              rows={2}
              placeholder="Barrio Avenida Brasil..." 
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
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
              <label htmlFor="pos-transporte" className="text-[10px] uppercase text-zinc-400 font-bold">Transporte</label>
              <select id="pos-transporte"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 appearance-none cursor-pointer"
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
              <label htmlFor="pos-descuento" className="text-[10px] uppercase font-bold text-zinc-400">Descuento (NIO)</label>
              <input id="pos-descuento" 
                type="number" 
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                value={discount || ''}
                min="0"
                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="pos-envio" className="text-[10px] uppercase font-bold text-zinc-400">Envío (NIO)</label>
              <input id="pos-envio" 
                type="number" 
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
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
              <label htmlFor="pos-metodo-pago" className="text-[10px] uppercase text-zinc-400 font-bold">Método de Pago</label>
              <select id="pos-metodo-pago"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 appearance-none cursor-pointer"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as Sale['paymentMethod'])}
              >
                {/*
                  Los rótulos dicen QUÉ es cada uno. Antes "CRÉDITO" y
                  "FINANCIAMIENTO" se leían como lo mismo ("paga después") y no
                  lo son: crédito es tarjeta de crédito en un pago, y
                  financiamiento son cuotas con tarjeta Banpro, que es lo único
                  que abre el selector de plazo y congela un plan.
                */}
                <option value="EFECTIVO">EFECTIVO</option>
                <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                <option value="TARJETA">TARJETA (débito, pago único)</option>
                <option value="CREDITO">TARJETA DE CRÉDITO (un pago)</option>
                <option value="FINANCIAMIENTO">CUOTAS BANPRO (3 o 6 meses)</option>
              </select>
              {paymentMethod === 'CREDITO' && (
                <p className="text-[10px] text-zinc-400 leading-snug mt-1">
                  Tarjeta de crédito en un solo pago. No registra plan de cuotas.
                </p>
              )}
              {esFinanciada && (
                <p className="text-[10px] text-zinc-400 leading-snug mt-1">
                  Solo con tarjeta Banpro. El recargo lo define la categoría de
                  cada producto (se configura en Configuración).
                </p>
              )}
            </div>
            <div className="space-y-1 col-span-2">
              <label htmlFor="pos-referencia-pago" className="text-[10px] uppercase text-zinc-400 font-bold">Referencia de Pago (Opcional)</label>
              <input id="pos-referencia-pago"
                type="text"
                placeholder="N° de transferencia / voucher…"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1 mb-4">
            <label htmlFor="pos-nota" className="text-[10px] uppercase text-zinc-400 font-bold">Nota / Referencia (Opcional)</label>
            <textarea id="pos-nota" 
              rows={2}
              placeholder="Ref: Carlos Pago mediante Transferencia..." 
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
            />
          </div>
          
          {/* Plazo de las cuotas. Aparece SOLO con forma de pago FINANCIAMIENTO. */}
          {esFinanciada && (
            <div className="mb-4 p-3 bg-cyan-500/5 border border-cyan-500/20 rounded-lg">
              {/*
                No es un <label>: rotula un GRUPO de botones, no un control.
                Un label sin control asociado no lo anuncia ningún lector.
              */}
              <p id="pos-plazo-rotulo" className="text-[10px] uppercase text-cyan-400 font-bold block mb-2">
                Plazo de las cuotas
              </p>

              {planesVenta.length === 0 ? (
                <p className="text-[11px] text-amber-400 leading-snug">
                  Esta venta no califica para cuotas: el mínimo es US${configFinanciamiento.minUsd}
                  {cart.length > 0 && ` y el total va en US$${total.toFixed(2)}`}. Puede que un
                  producto del carrito tenga las cuotas deshabilitadas.
                </p>
              ) : (
                <>
                  {/*
                    Decia `role="radiogroup"` pero se comportaba como dos
                    botones sueltos: cada uno era una parada de Tab y las
                    flechas no hacian nada. Un lector de pantalla anuncia "1 de
                    2" y el usuario presiona la flecha esperando el segundo.
                    Ahora es el patron completo: una sola parada de Tab para
                    todo el grupo (la opcion elegida, o la primera si todavia no
                    hay ninguna) y las flechas mueven la eleccion, que es como
                    funciona un grupo de radios nativo.
                  */}
                  <div
                    className="grid grid-cols-2 gap-2"
                    role="radiogroup"
                    aria-labelledby="pos-plazo-rotulo"
                    onKeyDown={(e) => {
                      const paso =
                        e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
                        : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1
                        : 0;
                      if (paso === 0) return;
                      e.preventDefault();
                      const i = planesVenta.findIndex((p) => p.meses === plazoMeses);
                      const desde = i < 0 ? (paso > 0 ? -1 : 0) : i;
                      const dest = planesVenta[(desde + paso + planesVenta.length) % planesVenta.length];
                      setPlazoMeses(dest.meses);
                      // El foco sigue a la eleccion: si se queda atras, el
                      // anillo de foco y la opcion marcada apuntan a plazos
                      // distintos.
                      document.getElementById(`pos-plazo-${dest.meses}`)?.focus();
                    }}
                  >
                    {planesVenta.map((pl, idx) => {
                      const activo = plazoMeses === pl.meses;
                      return (
                        <button
                          key={pl.meses}
                          id={`pos-plazo-${pl.meses}`}
                          type="button"
                          role="radio"
                          aria-checked={activo}
                          tabIndex={plazoMeses === null ? (idx === 0 ? 0 : -1) : activo ? 0 : -1}
                          onClick={() => setPlazoMeses(pl.meses)}
                          className={`text-left p-2.5 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
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
                {pendingCashDiscount.length} {pendingCashDiscount.length === 1 ? 'producto' : 'productos'} con descuento por efectivo
              </span>
              <button
                onClick={applyCashDiscount}
                className="text-[11px] font-bold bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 rounded-lg shrink-0 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              >
                Aplicar
              </button>
            </div>
          )}
          {appliedCashCount > 0 && (
            <div className="mb-3 p-2.5 bg-emerald-500/5 border border-emerald-500/10 rounded-lg flex items-center justify-between gap-2">
              <span className="text-[11px] text-emerald-500/80">
                Precio efectivo aplicado a {appliedCashCount} {appliedCashCount === 1 ? 'línea' : 'líneas'}
              </span>
              <button
                onClick={removeCashDiscount}
                title="Devuelve a cada línea el precio que tenía antes del descuento"
                className="text-[11px] font-bold text-zinc-400 hover:text-rose-400 px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-rose-500"
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
              <span>Subtotal</span>
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
                <span className="block normal-case tracking-normal font-normal text-zinc-400">
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
            {/*
              Vuelto. EFECTIVO es el método por defecto y los totales caen en
              cifras como C$ 12.713,45: la aritmética la hacía el operador de
              cabeza, con el cliente esperando. Solo aparece cobrando en
              efectivo — en los otros métodos no hay vuelto que dar.
            */}
            {paymentMethod === 'EFECTIVO' && cart.length > 0 && (
              <div className="mt-2 pt-2 border-t border-zinc-700">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor="pos-paga-con" className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 shrink-0">
                    Paga con
                  </label>
                  <input
                    id="pos-paga-con"
                    type="number"
                    min={0}
                    inputMode="decimal"
                    value={pagaCon}
                    onChange={(e) => setPagaCon(e.target.value)}
                    placeholder="0"
                    className="w-28 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-right text-zinc-200 tabular-nums placeholder-zinc-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                {pagaCon.trim() !== '' && (() => {
                  const vuelto = (Number(pagaCon) || 0) - total * currentExchangeRate;
                  return (
                    <div className="flex items-baseline justify-between gap-2 mt-1.5">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 shrink-0">
                        {vuelto >= 0 ? 'Vuelto' : 'Falta'}
                      </span>
                      <span className={`text-lg font-bold tabular-nums ${vuelto >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatCurrency(Math.abs(vuelto), 'NIO')}
                      </span>
                    </div>
                  );
                })()}
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
            {/*
              Dos consecuencias OPUESTAS compartían el mismo ícono `FileText`, y
              la proforma era además un botón de 56px sin etiqueta, descubrible
              solo por `title`. Facturar mueve stock, kardex y el correlativo;
              cotizar no escribe nada. Ahora se distinguen por ícono Y por
              palabra: Receipt para el recibo, FileText para el papel que
              todavía no compromete.
            */}
            <button
              onClick={() => handleTryCheckout(false)}
              disabled={cart.length === 0}
              title="Facturar (F2)"
              className="flex-1 bg-cyan-700 hover:bg-cyan-800 text-white font-bold py-3 rounded-lg shadow-lg shadow-cyan-900/20 flex items-center justify-center gap-2 transition-all focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed text-sm sm:text-base"
            >
              <Receipt className="w-4 h-4" />
              FACTURAR
            </button>
            <button
              onClick={() => handleTryCheckout(true)}
              disabled={cart.length === 0}
              title="Generar proforma — no descuenta stock (F3)"
              className="px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-bold py-3 rounded-lg border border-zinc-700 flex items-center justify-center gap-2 transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs"
            >
              <FileText className="w-4 h-4" />
              Proforma
            </button>
          </div>
          <p className="text-[10px] text-zinc-400 text-center mt-2 italic">
            El stock se verifica automáticamente al facturar
          </p>
          <p className="text-[10px] text-zinc-400 text-center mt-1">
            <kbd className="font-sans font-bold text-zinc-400">F2</kbd> facturar ·{' '}
            <kbd className="font-sans font-bold text-zinc-400">F3</kbd> proforma ·{' '}
            <kbd className="font-sans font-bold text-zinc-400">/</kbd> buscar
          </p>
        </div>
      </div>
    </div>
    </>
  );
}
