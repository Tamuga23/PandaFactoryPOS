import React, { useRef, useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';
import { DEFAULT_WARRANTY_TEXT } from '../lib/invoice';
import { formatCurrencyNIO } from '../lib/utils';
import { Download, X, Loader2, Check, MessageCircle, AlertTriangle, Printer } from 'lucide-react';
import { toast } from './Toast';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';

export interface InvoiceItem {
  id: string;
  productName: string;
  quantity: number;
  priceNIO: number;
  priceUSD: number;
  image?: string;
  sku?: string;
}

export interface InvoiceData {
  type: 'RECIBO_OFICIAL' | 'PROFORMA';
  invoiceNumber: string;
  date: string;
  validUntil?: string; // used for PROFORMA
  client: {
    fullName: string;
    address: string;
    phone: string;
    transport: string;
  };
  companyInfo?: {
    name: string;
    address: string;
    phone: string;
    email: string;
    logo?: string;
  };
  items: InvoiceItem[];
  /**
   * Cómo se pagó. La venta ya lo guardaba, pero el documento no lo imprimía:
   * el cliente se llevaba un recibo que no dice si pagó en efectivo, por
   * transferencia o con tarjeta — y el pie repetía un texto genérico con todos
   * los métodos aceptados como si nada se hubiera cobrado todavía.
   */
  paymentMethod?: string;
  /**
   * El número de transferencia o voucher. Se tipeaba en el POS, se guardaba en
   * Firestore, y no existía en este tipo: el dato se cargaba y nunca se podía
   * leer en el papel, que es justo donde sirve para reclamar.
   */
  paymentReference?: string;
  shippingCostNIO: number;
  discountNIO: number;
  customNote: string;
  warrantyText: string;
  /** Plan de cuotas, si la venta se financió. Se imprime bajo el TOTAL. */
  financiamiento?: {
    plazoMeses: number;
    cuotaNio: number;
    totalNio: number;
    banco?: string;
  };
  mainLogo?: string;
  bankDetails?: string;
}

interface InvoicePreviewProps {
  data: InvoiceData;
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  isConfirming?: boolean;
  /** Si viene, el diálogo muestra que el último intento FALLÓ, con el motivo.
   *  El aviso flotante no alcanza: el modal ocupa la pantalla entera y es
   *  donde el operador está mirando cuando aprieta el botón. */
  errorConfirmacion?: string | null;
  /** Si viene, muestra "Enviar por WhatsApp": comparte el PDF vía navigator.share
   *  (con fallback: descarga el PDF y abre wa.me para adjuntarlo a mano). */
  whatsApp?: { text: string; link: string | null } | null;
}

const PAGE_HEIGHT_LIMIT = 980;
const HEADER_HEIGHT = 260; // Increased spacing for info boxes
const FOOTER_HEIGHT = 200; // Reduced from 310
const TABLE_HEADER_HEIGHT = 35; // Reduced from 45
const ITEM_WITH_IMAGE_HEIGHT = 65; // Reduced from 125
const ITEM_WITHOUT_IMAGE_HEIGHT = 40; // Reduced from 65

export default function InvoicePreview({ data, isOpen, onClose, onConfirm, isConfirming, whatsApp, errorConfirmacion }: InvoicePreviewProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  /**
   * Modo presentación: la pantalla es para el CLIENTE, no para el operador.
   *
   * Cuando se gira la laptop para mostrar la proforma —que es la razón de ser
   * de una proforma— el cliente veía la consola interna del negocio: fondo
   * zinc-950, "Revisá la cotización", "Confirmar Venta", "Editar Datos".
   * DESIGN.md declara dos mundos que no deben mezclarse, y este era el único
   * instante en que se tocaban: el que se filtraba era la consola.
   *
   * Acá el A4 se escala al alto del viewport con `transform`, NO con reflow:
   * el lienzo es de 794×1123px fijos porque es un documento de impresión, y
   * reflowarlo cambiaría la paginación que el PDF ya calculó.
   */
  const [modoCliente, setModoCliente] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  // Raíz del diálogo, para atrapar el foco adentro (P4.6 de AGENTS.md).
  const modalRef = useRef<HTMLDivElement>(null);

  // El A4 mide 1123px de alto fijos. Para que entre entero en pantalla se
  // escala por transform (no por reflow: reflowar cambiaría la paginación que
  // el PDF ya calculó). Se recalcula al redimensionar.
  const [escala, setEscala] = useState(1);
  useEffect(() => {
    if (!modoCliente) return;
    const calcular = () => setEscala(Math.min(1, (window.innerHeight - 24) / 1123));
    calcular();
    window.addEventListener('resize', calcular);
    return () => window.removeEventListener('resize', calcular);
  }, [modoCliente]);

  // P4.7: ESC cierra el preview (no mientras confirma o genera el PDF).
  useEscapeKey(
    isOpen && !isConfirming && !isGenerating && !isSharing,
    () => (modoCliente ? setModoCliente(false) : onClose()),
  );
  // Tabular dentro del diálogo ya no saca el foco al formulario de atrás.
  useFocusTrap(isOpen, modalRef);

  if (!isOpen) return null;

  // Lógica de paginación matemática estricta
  const pages: { items: InvoiceItem[]; showHeader: boolean; showFooter: boolean }[] = [];
  let currentPageItems: InvoiceItem[] = [];
  let currentPageHeight = HEADER_HEIGHT + TABLE_HEADER_HEIGHT;
  let isFirstPage = true;

  data.items.forEach((item) => {
    const itemHeight = item.image ? ITEM_WITH_IMAGE_HEIGHT : ITEM_WITHOUT_IMAGE_HEIGHT;
    
    if (currentPageHeight + itemHeight > PAGE_HEIGHT_LIMIT) {
      pages.push({
        items: currentPageItems,
        showHeader: isFirstPage,
        showFooter: false
      });
      isFirstPage = false;
      currentPageItems = [];
      currentPageHeight = TABLE_HEADER_HEIGHT;
    }
    
    currentPageItems.push(item);
    currentPageHeight += itemHeight;
  });

  if (currentPageHeight + FOOTER_HEIGHT <= PAGE_HEIGHT_LIMIT) {
    pages.push({
      items: currentPageItems,
      showHeader: isFirstPage,
      showFooter: true
    });
  } else {
    pages.push({
      items: currentPageItems,
      showHeader: isFirstPage,
      showFooter: false
    });
    pages.push({
      items: [],
      showHeader: false,
      showFooter: true
    });
  }

  const subtotal = data.items.reduce((acc, item) => acc + (item.priceNIO * item.quantity), 0);
  const total = subtotal + data.shippingCostNIO - data.discountNIO;

  // Genera el PDF (compartido por Descargar y Enviar por WhatsApp).
  const buildPdf = async (): Promise<{ pdf: jsPDF; fileName: string } | null> => {
    if (!containerRef.current) return null;
    const pageElements = Array.from(containerRef.current.querySelectorAll('.invoice-page')) as HTMLElement[];
    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'px',
      format: [794, 1123],
      compress: true
    });

    for (let i = 0; i < pageElements.length; i++) {
      // Safari requires DOM to be rendered multiple times to correctly paint images inside foreignObject
      await toPng(pageElements[i], { quality: 0.8, pixelRatio: 1 });
      await toPng(pageElements[i], { quality: 0.8, pixelRatio: 1 });

      const dUrl = await toPng(pageElements[i], {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });

      if (i > 0) pdf.addPage([794, 1123], 'p');
      pdf.addImage(dUrl, 'PNG', 0, 0, 794, 1123);
    }

    const formattedName = data.client.fullName.replace(/\s+/g, '_');
    const invoiceLabel = data.type === 'PROFORMA' ? 'proforma' : 'factura';
    return { pdf, fileName: `${invoiceLabel}_${data.invoiceNumber}_${formattedName}.pdf` };
  };

  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    try {
      const result = await buildPdf();
      result?.pdf.save(result.fileName);
    } catch (err: any) {
      console.error('Error al generar PDF:', err);
      toast.error('Hubo un error al generar el PDF: ' + (err?.message || 'Error desconocido'));
    } finally {
      setIsGenerating(false);
    }
  };

  // WhatsApp CON el PDF adjunto: navigator.share (Windows/Android/iOS lo
  // enrutan a WhatsApp). Fallback: descarga el PDF y abre el chat con el
  // texto, para adjuntarlo a mano.
  const handleShareWhatsApp = async () => {
    if (!whatsApp) return;
    setIsSharing(true);
    try {
      const result = await buildPdf();
      if (!result) return;
      const blob = result.pdf.output('blob');
      const file = new File([blob], result.fileName, { type: 'application/pdf' });
      const nav: any = navigator;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], text: whatsApp.text, title: result.fileName });
      } else {
        result.pdf.save(result.fileName);
        if (whatsApp.link) window.open(whatsApp.link, '_blank');
        toast.info('Este navegador no permite adjuntar directo: descargué el PDF — adjuntalo en el chat de WhatsApp que se abrió.');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Error al compartir:', err);
        toast.error('No se pudo compartir el PDF.');
      }
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      autoFocus
      aria-label={data.type === 'PROFORMA' ? 'Vista previa de la cotización' : 'Vista previa de la factura'}
      className="dialogo-impresion fixed inset-0 z-[100] flex flex-col bg-zinc-900/90 backdrop-blur-sm overflow-hidden"
    >
      {/* Navbar modal */}
      <div className={`flex-none bg-zinc-950 p-4 border-b border-zinc-800 items-center justify-between sticky top-0 z-[101] ${modoCliente ? 'hidden' : 'flex'}`}>
        {/*
          El título decía siempre "Vista Previa de Factura", incluso cuando el
          documento era una Cotización y también DESPUÉS de confirmar. Ahora
          nombra lo que hay en pantalla: qué documento es, y si ya quedó
          registrado, con su número.
        */}
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          {onConfirm ? (
            <>Revisá la {data.type === 'PROFORMA' ? 'cotización' : 'factura'}</>
          ) : data.invoiceNumber ? (
            <>
              <Check className="w-5 h-5 text-emerald-400" />
              {data.type === 'PROFORMA' ? 'Cotización' : 'Venta'} {data.invoiceNumber} registrada
            </>
          ) : (
            <>{data.type === 'PROFORMA' ? 'Cotización' : 'Factura'}</>
          )}
        </h2>
        <div className="flex items-center gap-4">
          {/*
            "Mostrar al cliente": oculta toda la cromática de consola y deja el
            documento solo, escalado al alto de la pantalla. Es el único momento
            en que el cliente mira esta pantalla, y hasta ahora lo que veía era
            el tablero interno del negocio.
          */}
          <button
            type="button"
            onClick={() => setModoCliente(true)}
            className="hidden sm:block text-xs font-bold text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500"
          >
            Mostrar al cliente
          </button>
          {/*
            Resumen pegado al botón irreversible. El TOTAL vive al pie de un A4
            de 1123px, así que en una laptop se ve el tercio superior del
            documento: se confirmaba de memoria la operación que escribe la
            venta, descuenta stock, mueve el kardex y consume el correlativo.
            Acá está lo mínimo para decidir sin scrollear.
          */}
          {onConfirm && (
            <div className="hidden sm:flex flex-col items-end leading-tight mr-1">
              <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400">
                {data.client.fullName || 'Cliente final'}
                {data.paymentMethod && <> · {data.paymentMethod}</>}
              </span>
              <span className="text-lg font-bold text-cyan-400 tabular-nums">
                {formatCurrencyNIO(
                  data.financiamiento ? data.financiamiento.totalNio : total,
                )}
                {data.financiamiento && (
                  <span className="text-[10px] font-normal text-zinc-400">
                    {' '}en {data.financiamiento.plazoMeses} cuotas
                  </span>
                )}
              </span>
            </div>
          )}
          {onConfirm ? (
            <>
              {/*
                Si el intento anterior falló, el diálogo lo dice ACÁ, pegado al
                botón. Antes el único rastro era un aviso flotante que se
                borraba solo: el modal volvía a mostrar el mismo botón verde,
                sin marca de error y sin razón, y el instinto es apretar otra
                vez. El botón además pasa a decir "Reintentar", que es lo que
                de verdad va a hacer.
              */}
              {errorConfirmacion && !isConfirming && (
                <div
                  role="alert"
                  className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 max-w-md"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-rose-300 text-xs leading-snug">{errorConfirmacion}</p>
                </div>
              )}
              <button
                onClick={onConfirm}
                disabled={isConfirming}
                className="flex items-center gap-2 bg-cyan-700 hover:bg-cyan-800 text-white font-bold px-6 py-2.5 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:opacity-50"
              >
                {isConfirming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                {/*
                  Decía "Confirmar Venta" también cuando el documento era una
                  COTIZACIÓN, que no mueve stock ni cobra nada. El botón tiene
                  que decir qué hace.
                */}
                {isConfirming
                  ? 'Procesando...'
                  : errorConfirmacion
                    ? 'Reintentar'
                    : data.type === 'PROFORMA'
                      ? 'Guardar Cotización'
                      : 'Confirmar Venta'}
              </button>
              <button onClick={onClose} disabled={isConfirming} className="bg-zinc-800 text-zinc-300 hover:text-white px-4 py-2.5 rounded-lg hover:bg-zinc-700 transition-all font-semibold focus:outline-none focus:ring-2 focus:ring-cyan-500">
                Editar Datos
              </button>
            </>
          ) : (
            <>
              {whatsApp && (
                <button
                  onClick={handleShareWhatsApp}
                  disabled={isSharing || isGenerating}
                  title="Comparte el PDF por WhatsApp (o lo descarga y abre el chat)"
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-6 py-2.5 rounded-lg transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {isSharing ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />}
                  {isSharing ? 'Preparando…' : 'Enviar por WhatsApp'}
                </button>
              )}
              {/*
                Imprimir DIRECTO. Antes el único camino era descargar el PDF,
                salir de la aplicación, buscar el archivo en Descargas, abrirlo
                y hacer Ctrl+P: cuatro acciones fuera del sistema por venta, con
                el cliente esperando el papel.

                Usa `window.print()` sobre la hoja `@media print` de
                `index.css`, así que imprime EXACTAMENTE el mismo A4 que está en
                pantalla — sin rasterizar nada y sin el rato de espera de
                "Generando PDF...", que hace tres pasadas de `html-to-image` por
                página con las fotos en base64 adentro.

                "Descargar PDF" se queda: sirve para el envío digital y para
                WhatsApp, que necesitan un archivo.
              */}
              <button
                onClick={() => window.print()}
                disabled={isGenerating || isSharing}
                className="flex items-center gap-2 bg-cyan-700 hover:bg-cyan-800 text-white font-bold px-6 py-2.5 rounded-lg transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-zinc-950"
              >
                <Printer className="w-5 h-5" aria-hidden="true" />
                Imprimir
              </button>
              <button
                onClick={handleDownloadPDF}
                disabled={isGenerating || isSharing}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-bold px-6 py-2.5 rounded-lg transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                {isGenerating ? 'Generando PDF...' : 'Descargar PDF'}
              </button>
              {/*
                Hover NEUTRO, no rosa. DESIGN.md reserva el rosa para lo
                destructivo, y cerrar el preview no destruye nada — menos todavía
                después de confirmar, cuando la venta ya está registrada. El
                patrón terciario documentado es "al hover toma el color de su
                acción: blanco para neutro".
              */}
              <button
                onClick={onClose}
                aria-label="Cerrar vista previa"
                className="p-2 text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                <X className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Pages Container scrollable */}
      <div className={`scroll-impresion flex-1 overflow-auto custom-scrollbar ${modoCliente ? 'bg-zinc-200 p-0 flex items-start justify-center' : 'p-8'}`}>
        {modoCliente && (
          <button
            type="button"
            onClick={() => setModoCliente(false)}
            className="fixed top-3 right-3 z-[102] bg-zinc-900/80 hover:bg-zinc-900 text-zinc-300 hover:text-white text-xs font-bold px-3 py-2 rounded-lg backdrop-blur focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            Salir (ESC)
          </button>
        )}
        <div
          ref={containerRef}
          className="zona-impresion flex flex-col items-center gap-8 pb-16 min-w-max mx-auto"
          style={modoCliente ? { transform: `scale(${escala})`, transformOrigin: 'top center' } : undefined}
        >
          {pages.map((page, pageIndex) => (
            <div 
              key={pageIndex} 
              className="invoice-page w-[794px] h-[1123px] p-[40px] bg-white shadow-xl relative overflow-hidden flex flex-col font-sans"
              style={{ boxSizing: 'border-box' }}
            >
              
              {/* HEADER */}
              {page.showHeader && (
                <div style={{ minHeight: `${HEADER_HEIGHT}px` }} className="w-full flex flex-col gap-6 shrink-0 relative z-10">
                  {/* Top Header Row */}
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h1 className="text-3xl font-extrabold text-[#1a6ba0] tracking-tight mb-4">
                        {data.type === 'PROFORMA' ? 'Cotización' : 'Factura'}
                      </h1>
                      {/*
                        El renglón del número solo existe si hay número. El
                        correlativo se asigna en la transacción de recordSale, así
                        que antes de confirmar no hay nada que mostrar — y un
                        placeholder interno impreso en el documento es lo que
                        termina leyendo el cliente cuando se le gira la pantalla.
                      */}
                      {data.invoiceNumber && (
                        <div className="flex items-center gap-4 text-[11px] font-semibold text-zinc-700">
                          <span className="w-24">{data.type === 'PROFORMA' ? 'Cotización No #' : 'Factura No #'}</span>
                          <span className="text-black font-bold uppercase">{data.invoiceNumber}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-4 text-[11px] font-semibold text-zinc-700 mt-1">
                        <span className="w-24">Fecha:</span>
                        <span className="text-black font-bold">{data.date}</span>
                      </div>
                      {data.type === 'PROFORMA' && data.validUntil && (
                        <div className="flex items-center gap-4 text-[11px] font-semibold text-rose-600 mt-1">
                          <span className="w-24">Válido hasta:</span>
                          <span className="font-bold">{data.validUntil}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Logo Section */}
                    {data.companyInfo?.logo ? (
                      <div className="w-24 h-24 bg-zinc-900 rounded-xl flex items-center justify-center p-2 shadow-md">
                        <img src={data.companyInfo.logo} alt="Logo" className="max-w-full max-h-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-24 h-24 bg-zinc-900 rounded-xl flex flex-col items-center justify-center p-2 shadow-md text-white">
                        <span className="font-bold text-[9px] uppercase tracking-widest leading-tight text-center">
                          {data.companyInfo?.name || 'STORE'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info Boxes */}
                  <div className="grid grid-cols-2 gap-4 mb-8">
                    {/* Facturado Por */}
                    <div className="bg-[#dff3fa] p-3 rounded-xl shadow-sm border border-[#a2d8ed]">
                      <h3 className="text-[9px] font-bold text-[#1a6ba0] uppercase tracking-wider mb-1">Facturado Por:</h3>
                      <p className="text-[11px] font-extrabold text-zinc-900 mb-0.5">{data.companyInfo?.name || 'Empresa'}</p>
                      <p className="text-[10px] text-zinc-600 leading-tight max-w-[90%] mb-1">
                        {data.companyInfo?.address || 'Dirección de la empresa'}
                      </p>
                      <div className="flex text-[10px] text-zinc-700 leading-tight">
                        <span className="font-bold w-12">Correo:</span>
                        <span>{data.companyInfo?.email || 'N/A'}</span>
                      </div>
                      <div className="flex text-[10px] text-zinc-700 leading-tight mt-0.5">
                        <span className="font-bold w-12">Teléfono:</span>
                        <span>{data.companyInfo?.phone || 'N/A'}</span>
                      </div>
                    </div>
                    
                    {/* Facturado A */}
                    <div className="bg-[#dff3fa] p-3 rounded-xl shadow-sm border border-[#a2d8ed]">
                      <h3 className="text-[9px] font-bold text-[#1a6ba0] uppercase tracking-wider mb-1">Facturado A:</h3>
                      <p className="text-[11px] font-extrabold text-zinc-900 mb-0.5">{data.client.fullName.toUpperCase() || 'CLIENTE FINAL'}</p>
                      <div className="flex text-[10px] text-zinc-700 leading-tight">
                        <span className="font-bold min-w-[55px]">Dirección:</span>
                        <span className="leading-tight line-clamp-2 pr-2">{data.client.address || 'N/A'}</span>
                      </div>
                      <p className="text-[10px] text-zinc-700 ml-[55px] leading-tight mb-1">
                        {data.client.phone || ''}
                      </p>
                      <div className="flex text-[10px] text-zinc-700 items-center leading-tight">
                        <span className="font-bold min-w-[60px]">Transporte:</span>
                        <span className="text-[#1a6ba0] font-bold uppercase py-0.5 px-2 border border-[#a2d8ed] bg-white rounded-full ml-1 text-[8px] tracking-wider shadow-sm">{data.client.transport || 'ENTREGA LOCAL'}</span>
                      </div>
                      {/*
                        Forma de pago y referencia. La venta ya los guardaba y el
                        papel no los decía: el cliente se llevaba un recibo que no
                        dejaba constancia de cómo pagó, y el número de
                        transferencia que se tipeaba en el POS no se podía leer en
                        ningún lado. Solo se imprime en el recibo oficial: en una
                        cotización todavía no se pagó nada.
                      */}
                      {data.type !== 'PROFORMA' && data.paymentMethod && (
                        <div className="flex text-[10px] text-zinc-700 items-center leading-tight mt-1">
                          <span className="font-bold min-w-[60px]">Pago:</span>
                          <span className="text-black font-bold ml-1">
                            {data.paymentMethod === 'EFECTIVO' ? 'Efectivo'
                              : data.paymentMethod === 'TRANSFERENCIA' ? 'Transferencia'
                              : data.paymentMethod === 'TARJETA' ? 'Tarjeta'
                              : data.paymentMethod === 'CREDITO' ? 'Crédito'
                              : data.paymentMethod === 'FINANCIAMIENTO' ? 'Financiamiento'
                              : data.paymentMethod}
                          </span>
                          {data.paymentReference && (
                            <span className="text-zinc-600 ml-1">· Ref. {data.paymentReference}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* EMPTY SPACE FILLER FOR PAGES > 1 IF NEEDED */}
              {!page.showHeader && (
                <div style={{ height: '20px' }}></div>
              )}

              {/* TABLE */}
              <div className="w-full flex-1 mb-4 rounded-xl overflow-hidden border border-[#135c7a]/20 shadow-sm">
                <table className="w-full text-left" style={{ tableLayout: 'fixed' }}>
                  <thead className="bg-[#135c7a] text-white">
                    <tr style={{ height: `${TABLE_HEADER_HEIGHT}px` }}>
                      <th className="px-3 py-2 font-bold text-[9px] uppercase tracking-wider text-left w-[47%]">Articulo</th>
                      <th className="px-2 py-2 text-center font-bold text-[9px] uppercase tracking-wider w-[10%]">Cant.</th>
                      <th className="px-2 py-2 text-right font-bold text-[9px] uppercase tracking-wider w-[15%]">Precio C$</th>
                      <th className="px-2 py-2 text-right font-bold text-[9px] uppercase tracking-wider w-[13%]">Precio $</th>
                      <th className="px-2 py-2 text-right font-bold text-[9px] uppercase tracking-wider w-[15%]">Total</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {page.items.map((item, idx) => {
                      const absoluteIndex = data.items.findIndex(i => i.id === item.id) + 1;
                      const hasImage = !!item.image;
                      
                      return (
                        <tr key={item.id + idx} className="border-b border-zinc-100 last:border-0 align-top even:bg-zinc-50">
                          <td className="px-3 py-2">
                            <div className="flex items-start gap-2">
                              <span className="w-4 h-4 rounded-full bg-[#dff3fa] text-[#1a6ba0] text-[8px] font-bold flex items-center justify-center shrink-0 border border-[#a2d8ed]/50 shadow-sm mt-0.5">
                                {absoluteIndex}
                              </span>
                              {(hasImage && item.image) && (
                                <div className="w-10 h-10 rounded-lg border border-zinc-200 bg-zinc-50 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm p-0.5 mt-0.5">
                                  <img src={item.image} alt="product" className="max-w-full max-h-full object-contain mix-blend-multiply rounded-md" />
                                </div>
                              )}
                              <span className="font-bold text-zinc-900 text-[10px] leading-tight break-words pt-1">{item.productName}</span>
                            </div>
                          </td>
                          {/* Es la factura impresa: aca es donde mas importa que
                              los montos de cada linea caigan uno debajo del otro. */}
                          <td className="px-2 py-2 text-center font-bold text-zinc-600 text-[10px] pt-3 tabular-nums">{item.quantity}</td>
                          <td className="px-2 py-2 text-right font-bold text-zinc-600 text-[10px] pt-3 tabular-nums">{formatCurrencyNIO(item.priceNIO)}</td>
                          <td className="px-2 py-2 text-right font-bold text-zinc-600 text-[10px] pt-3 tabular-nums">${item.priceUSD.toFixed(2)}</td>
                          <td className="px-2 py-2 text-right font-bold text-[#135c7a] text-[10px] pt-3 tabular-nums">
                            {formatCurrencyNIO(item.priceNIO * item.quantity)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

                  {/* PUSH FOOTER TO BOTTOM OF PAGE */}
                  <div className="mt-auto">
                    {/* FOOTER */}
                    {page.showFooter && (
                      <div style={{ minHeight: `${FOOTER_HEIGHT}px` }} className="w-full flex flex-col justify-end shrink-0 relative z-10 pt-4">
                         <div className="flex justify-between items-stretch gap-6 mb-8 mt-2">
                           {/* NOTE BOX */}
                           {data.customNote ? (
                             <div className="flex-1 border border-[#d2eaf4] bg-white rounded-xl flex p-3 shadow-sm items-start gap-3">
                                <span className="bg-[#eef8fc] text-[#1a6ba0] font-bold text-[8px] px-2 py-0.5 rounded-full shadow-sm border border-[#d2eaf4] shrink-0">NOTA</span>
                                <span className="text-[10px] italic text-zinc-600 flex-1 leading-tight mt-0.5 whitespace-pre-wrap">{data.customNote}</span>
                             </div>
                           ) : <div className="flex-1" />}

                           {/* TOTALS BOX */}
                           <div className="w-[280px] border border-zinc-100 bg-white shadow-sm p-4 rounded-xl shrink-0">
                              <div className="space-y-3">
                                 <div className="flex justify-between items-center text-[11px] font-semibold text-zinc-500">
                                   <span>Monto Bruto</span>
                                   <span className="text-zinc-900 tabular-nums">{formatCurrencyNIO(subtotal)}</span>
                                 </div>
                                 <div className="flex justify-between items-center text-[11px] font-semibold text-zinc-500">
                                   <span>Costo de Envío</span>
                                   <span className="text-zinc-900 tabular-nums">{data.shippingCostNIO > 0 ? formatCurrencyNIO(data.shippingCostNIO) : 'C$0.00'}</span>
                                 </div>
                                 <div className="flex justify-between items-center text-[11px] font-semibold text-rose-600">
                                   <span>Descuento</span>
                                   <span className="tabular-nums">{data.discountNIO > 0 ? `-${formatCurrencyNIO(data.discountNIO)}` : '-C$0.00'}</span>
                                 </div>
                                 <div className="h-px bg-zinc-100 w-full my-2"></div>
                                 <div className="flex justify-between items-center font-extrabold uppercase pt-1">
                                   <span className="text-zinc-900 text-[11px]">TOTAL (C$)</span>
                                   <span className="text-[#135c7a] text-base tabular-nums">{formatCurrencyNIO(total)}</span>
                                 </div>

                                 {/* Plan de cuotas cobrado. Va en el recibo para
                                     que quede por escrito qué se acordó: evita el
                                     "a mí me dijeron otra cuota" después. */}
                                 {data.financiamiento && (
                                   <div className="mt-1 pt-2.5 border-t border-dashed border-zinc-200 space-y-1.5">
                                     <div className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">
                                       Financiamiento{data.financiamiento.banco ? ` ${data.financiamiento.banco}` : ''}
                                     </div>
                                     <div className="flex justify-between items-center text-[11px] font-semibold text-zinc-500">
                                       <span>{data.financiamiento.plazoMeses} cuotas de</span>
                                       <span className="text-zinc-900 tabular-nums">{formatCurrencyNIO(data.financiamiento.cuotaNio)}</span>
                                     </div>
                                     <div className="flex justify-between items-center text-[11px] font-bold">
                                       <span className="text-zinc-900">Total a plazos</span>
                                       <span className="text-zinc-900 tabular-nums">{formatCurrencyNIO(data.financiamiento.totalNio)}</span>
                                     </div>
                                   </div>
                                 )}
                              </div>
                           </div>
                         </div>

                         <div className="space-y-4 text-[9px] text-zinc-600 leading-snug pb-4">
                           <div>
                             <div className="flex gap-2 items-center mb-1.5">
                               <div className="w-1.5 h-1.5 rounded-full bg-[#1a6ba0]" />
                               <h3 className="font-bold text-[#1a6ba0] text-xs tracking-wide">Pago</h3>
                             </div>
                             <div className="ml-3.5 space-y-0.5">
                               <p>1. El pago debe realizarse en su totalidad en el momento de la compra, a menos que se haya acordado un plazo de crédito por escrito.</p>
                               <p>2. Los métodos de pago aceptados son transferencia bancaria, efectivo y pago mediante Tarjeta de Credito/Debito</p>
                               {data.bankDetails && (
                                 <div className="mt-2 text-zinc-600 whitespace-pre-wrap">
                                   <span className="font-bold">Cuentas Bancarias:</span>
                                   <p>{data.bankDetails}</p>
                                 </div>
                               )}
                             </div>
                           </div>
                           <div>
                             <div className="flex gap-2 items-center mb-1.5 mt-2">
                               <div className="w-1.5 h-1.5 rounded-full bg-[#1a6ba0]" />
                               <h3 className="font-bold text-[#1a6ba0] text-xs tracking-wide">Garantía</h3>
                             </div>
                             <div className="ml-3.5 space-y-0.5">
                               {/*
                                   Acá había un texto de reserva que decía "garantía
                                   de [3] meses", con los corchetes puestos. Nunca se
                                   imprimió: los dos caminos que abren este preview
                                   —vender y reimprimir— arman los datos con
                                   `buildInvoiceDataFromSale`, que siempre pone
                                   `DEFAULT_WARRANTY_TEXT`, así que la rama estaba
                                   muerta. Pero era la versión que alguien iba a
                                   copiar el día que agregara un tercer camino, y el
                                   destinatario de esa hoja es el cliente.

                                   El texto de garantía vive en un solo lugar:
                                   `DEFAULT_WARRANTY_TEXT` en `src/lib/invoice.ts`.
                                */}
                               {(data.warrantyText || DEFAULT_WARRANTY_TEXT)
                                 .split('\n')
                                 .map((line, i) => <p key={i}>{line}</p>)}
                             </div>
                           </div>
                         </div>

                      <div className="text-center text-[8px] text-zinc-600 mt-6 pt-4 border-t border-zinc-100 flex flex-col gap-1 relative pb-2">
                        <p>Generado mediante <b>PandaStore System</b></p>
                        <p>Este documento electrónico es válido sin firma autógrafa.</p>
                      </div>
                   </div>
                 )}
                 <div className="absolute bottom-6 right-10 text-[11px] font-bold text-zinc-600">
                   Página {pageIndex + 1} de {pages.length}
                 </div>
               </div>

            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
