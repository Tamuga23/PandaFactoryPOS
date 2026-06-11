import React, { useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';
import { formatCurrencyNIO } from '../lib/utils';
import { Download, X, Loader2, Check } from 'lucide-react';

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
  shippingCostNIO: number;
  discountNIO: number;
  customNote: string;
  warrantyText: string;
  mainLogo?: string;
  bankDetails?: string;
}

interface InvoicePreviewProps {
  data: InvoiceData;
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  isConfirming?: boolean;
}

const PAGE_HEIGHT_LIMIT = 980;
const HEADER_HEIGHT = 260; // Increased spacing for info boxes
const FOOTER_HEIGHT = 200; // Reduced from 310
const TABLE_HEADER_HEIGHT = 35; // Reduced from 45
const ITEM_WITH_IMAGE_HEIGHT = 65; // Reduced from 125
const ITEM_WITHOUT_IMAGE_HEIGHT = 40; // Reduced from 65

export default function InvoicePreview({ data, isOpen, onClose, onConfirm, isConfirming }: InvoicePreviewProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const handleDownloadPDF = async () => {
    if (!containerRef.current) return;
    setIsGenerating(true);
    try {
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
      const fileName = `${invoiceLabel}_${data.invoiceNumber}_${formattedName}.pdf`;
      pdf.save(fileName);
    } catch (err: any) {
      console.error('Error al generar PDF:', err);
      alert('Hubo un error al generar el PDF: ' + (err?.message || JSON.stringify(err) || 'Error desconocido'));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-zinc-900/90 backdrop-blur-sm overflow-hidden">
      {/* Navbar modal */}
      <div className="flex-none bg-zinc-950 p-4 border-b border-zinc-800 flex items-center justify-between sticky top-0 z-[101]">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          Vista Previa de Factura
        </h2>
        <div className="flex items-center gap-4">
          {onConfirm ? (
            <>
              <button
                onClick={onConfirm}
                disabled={isConfirming}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-2.5 rounded-lg transition-all shadow-lg disabled:opacity-50"
              >
                {isConfirming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                {isConfirming ? 'Procesando...' : 'Confirmar Venta'}
              </button>
              <button onClick={onClose} disabled={isConfirming} className="bg-zinc-800 text-zinc-300 hover:text-white px-4 py-2.5 rounded-lg hover:bg-zinc-700 transition-all font-semibold">
                Editar Datos
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleDownloadPDF}
                disabled={isGenerating}
                className="flex items-center gap-2 bg-[#1a6ba0] hover:bg-[#1a6ba0]/90 text-white font-bold px-6 py-2.5 rounded-lg transition-all disabled:opacity-50"
              >
                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                {isGenerating ? 'Generando PDF...' : 'Descargar PDF'}
              </button>
              <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white bg-zinc-800 hover:bg-rose-500 rounded-lg transition-all">
                <X className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Pages Container scrollable */}
      <div className="flex-1 overflow-auto p-8 custom-scrollbar">
        <div ref={containerRef} className="flex flex-col items-center gap-8 pb-16 min-w-max mx-auto">
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
                      <div className="flex items-center gap-4 text-[11px] font-semibold text-zinc-700">
                        <span className="w-24">{data.type === 'PROFORMA' ? 'Cotización No #' : 'Factura No #'}</span>
                        <span className="text-black font-bold uppercase">{data.invoiceNumber}</span>
                      </div>
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
                          <td className="px-2 py-2 text-center font-bold text-zinc-600 text-[10px] pt-3">{item.quantity}</td>
                          <td className="px-2 py-2 text-right font-bold text-zinc-600 text-[10px] pt-3">{formatCurrencyNIO(item.priceNIO)}</td>
                          <td className="px-2 py-2 text-right font-bold text-zinc-600 text-[10px] pt-3">${item.priceUSD.toFixed(2)}</td>
                          <td className="px-2 py-2 text-right font-bold text-[#135c7a] text-[10px] pt-3">
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
                                   <span className="text-zinc-900">{formatCurrencyNIO(subtotal)}</span>
                                 </div>
                                 <div className="flex justify-between items-center text-[11px] font-semibold text-zinc-500">
                                   <span>Costo de Envío</span>
                                   <span className="text-zinc-900">{data.shippingCostNIO > 0 ? formatCurrencyNIO(data.shippingCostNIO) : 'C$0.00'}</span>
                                 </div>
                                 <div className="flex justify-between items-center text-[11px] font-semibold text-rose-600">
                                   <span>Descuento</span>
                                   <span>{data.discountNIO > 0 ? `-${formatCurrencyNIO(data.discountNIO)}` : '-C$0.00'}</span>
                                 </div>
                                 <div className="h-px bg-zinc-100 w-full my-2"></div>
                                 <div className="flex justify-between items-center font-extrabold uppercase pt-1">
                                   <span className="text-zinc-900 text-[11px]">TOTAL (C$)</span>
                                   <span className="text-[#135c7a] text-base">{formatCurrencyNIO(total)}</span>
                                 </div>
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
                               {data.warrantyText ? (
                                 data.warrantyText.split('\n').map((line, i) => <p key={i}>{line}</p>)
                               ) : (
                                 <>
                                   <p>1. Los productos vendidos por Panda Store tienen una garantía de [3] meses a partir de la fecha de compra.</p>
                                   <p>2. La garantía cubre defectos de fabricación y no incluye daños causados por mal uso o accidentes.</p>
                                 </>
                               )}
                             </div>
                           </div>
                         </div>

                      <div className="text-center text-[8px] text-zinc-400 mt-6 pt-4 border-t border-zinc-100 flex flex-col gap-1 relative pb-2">
                        <p>Generado mediante <b>PandaStore System</b></p>
                        <p>Este documento electrónico es válido sin firma autógrafa.</p>
                      </div>
                   </div>
                 )}
                 <div className="absolute bottom-6 right-10 text-[11px] font-bold text-zinc-300">
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
