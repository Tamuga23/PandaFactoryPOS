import React, { useRef, useState } from 'react';
import { Sale } from '../types';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import { X, Download, Printer, Truck, MapPin, Phone, User, Info, Package } from 'lucide-react';

interface ShippingLabelPreviewProps {
  sale: Sale;
  isOpen: boolean;
  onClose: () => void;
  companyLogo?: string;
  companyName?: string;
}

export default function ShippingLabelPreview({ sale, isOpen, onClose, companyLogo, companyName }: ShippingLabelPreviewProps) {
  const labelRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    if (!labelRef.current) return;
    setIsGenerating(true);

    try {
      // Safari requires multiple renders
      await toPng(labelRef.current, { quality: 0.8, pixelRatio: 1 });
      await toPng(labelRef.current, { quality: 0.8, pixelRatio: 1 });

      const dataUrl = await toPng(labelRef.current, { 
        quality: 1, 
        pixelRatio: 3,
        backgroundColor: '#ffffff'
      });

      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'in',
        format: [4, 6]
      });

      pdf.addImage(dataUrl, 'PNG', 0, 0, 4, 6);
      pdf.save(`Etiqueta_${sale.customerName?.replace(/\s+/g, '_') || 'Envio'}.pdf`);
    } catch (error: any) {
      console.error('Error generating shipping label:', error);
      alert('Error generando etiqueta: ' + (error?.message || JSON.stringify(error) || 'Error desconocido'));
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  const renderBranding = () => {
    return (
      <div className="absolute top-4 right-4 flex flex-col items-end">
        {companyLogo ? (
          <img src={companyLogo} alt="Logo" className="w-16 h-16 object-contain grayscale" />
        ) : (
          <div className="font-black text-xl italic">{companyName || 'PandaStore'}</div>
        )}
      </div>
    );
  };

  const renderLabelContent = () => {
    const transport = sale.transport?.toUpperCase();

    if (transport === 'DELIVERY MANAGUA') {
      return (
        <div className="flex flex-col h-full border-4 border-black p-4 relative">
          {renderBranding()}
          <div className="border-b-4 border-black pb-3 mb-3 pr-20">
            <h1 className="text-3xl font-black uppercase tracking-tighter">DELIVERY LOCAL</h1>
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <User className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Destinatario</span>
              </div>
              <p className="text-2xl font-black leading-none">{sale.customerName}</p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <Phone className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Teléfono</span>
              </div>
              <p className="text-3xl font-black tabular-nums leading-none">{sale.customerPhone}</p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Dirección Exacta</span>
              </div>
              <p className="text-sm font-bold leading-tight uppercase line-clamp-3">{sale.customerAddress}</p>
            </div>

            {sale.notes && (
              <div className="border border-black p-2 rounded-lg bg-white text-black">
                <div className="flex items-center gap-2 mb-1">
                  <Info className="w-3 h-3 text-black" />
                  <span className="text-[9px] font-bold uppercase tracking-widest">Instrucciones de Cobro</span>
                </div>
                <p className="text-xs font-bold leading-tight line-clamp-2">{sale.notes}</p>
              </div>
            )}

            <div className="border-t-2 border-dashed border-black pt-2">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-3 h-3" />
                <span className="text-[9px] font-bold uppercase tracking-widest">Artículos a Entregar</span>
              </div>
              <ul className="space-y-0.5">
                {sale.items.map((item, idx) => (
                  <li key={idx} className="text-xs font-bold flex gap-2 leading-tight">
                    <span className="min-w-[1.25rem]">{item.quantity}x</span>
                    <span className="uppercase line-clamp-1">{item.sku} - {item.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-auto pt-2 border-t-4 border-black flex justify-between items-end">
            <div className="font-black text-xl">{companyName || 'PandaStore'}</div>
            <div className="text-[8px] uppercase font-bold tracking-widest opacity-50">Generated by PandaFactoryOS</div>
          </div>
        </div>
      );
    }

    if (transport === 'CARGOTRANS') {
      return (
        <div className="flex flex-col h-full border-4 border-black p-4 relative">
          {renderBranding()}
          <div className="border-b-4 border-black pb-3 mb-3 pr-20">
            <h1 className="text-3xl font-black uppercase tracking-tighter leading-tight">ENVÍO<br/>CARGOTRANS</h1>
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <User className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Consignatario</span>
              </div>
              <p className="text-2xl font-black leading-none">{sale.customerName}</p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <Phone className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Teléfono de Contacto</span>
              </div>
              <p className="text-3xl font-black tabular-nums leading-none">{sale.customerPhone}</p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Dirección de Destino</span>
              </div>
              <p className="text-sm font-bold leading-tight uppercase line-clamp-3">{sale.customerAddress}</p>
            </div>
            
            {sale.notes && (
              <div className="border border-black p-2 rounded-lg bg-white text-black">
                <div className="flex items-center gap-2 mb-1">
                  <Info className="w-3 h-3 text-black" />
                  <span className="text-[9px] font-bold uppercase tracking-widest">Instrucciones Especiales</span>
                </div>
                <p className="text-xs font-bold leading-tight line-clamp-2">{sale.notes}</p>
              </div>
            )}
            
            <div className="border-t-2 border-dashed border-black pt-2">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-3 h-3" />
                <span className="text-[9px] font-bold uppercase tracking-widest">Paquete Contiene</span>
              </div>
              <ul className="space-y-0.5">
                {sale.items.map((item, idx) => (
                  <li key={idx} className="text-xs font-bold flex gap-2 leading-tight">
                    <span className="min-w-[1.25rem]">{item.quantity}x</span>
                    <span className="uppercase line-clamp-1">{item.sku} - {item.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-auto pt-2 border-t-4 border-black flex justify-between items-end">
            <div className="font-black text-xl italic">{companyName || 'PandaStore'}</div>
            <div className="text-[8px] uppercase font-bold tracking-widest opacity-50">CARGOTRANS SHIPMENT</div>
          </div>
        </div>
      );
    }

    if (transport === 'BUSES INTERLOCALES') {
      return (
        <div className="flex flex-col h-full border-4 border-black p-4 relative">
          {renderBranding()}
          <div className="border-b-4 border-black pb-3 mb-3 pr-20">
            <h1 className="text-3xl font-black uppercase tracking-tighter leading-tight">ENVÍO POR<br/>BUS</h1>
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <User className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Cliente</span>
              </div>
              <p className="text-2xl font-black leading-none">{sale.customerName}</p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <Phone className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Teléfono Móvil</span>
              </div>
              <p className="text-3xl font-black tabular-nums leading-none">{sale.customerPhone}</p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Destino</span>
              </div>
              <p className="text-sm font-bold leading-tight uppercase line-clamp-3">{sale.customerAddress}</p>
            </div>

            {sale.notes && (
              <div className="border border-black p-2 rounded-lg bg-white text-black">
                <div className="flex items-center gap-2 mb-1">
                  <Info className="w-3 h-3 text-black" />
                  <span className="text-[9px] font-bold uppercase tracking-widest">Instrucciones de Envío</span>
                </div>
                <p className="text-xs font-bold leading-tight line-clamp-2">{sale.notes}</p>
              </div>
            )}
            
            <div className="border-t-2 border-dashed border-black pt-2">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-3 h-3" />
                <span className="text-[9px] font-bold uppercase tracking-widest">Artículos a Entregar</span>
              </div>
              <ul className="space-y-0.5">
                {sale.items.map((item, idx) => (
                  <li key={idx} className="text-xs font-bold flex gap-2 leading-tight">
                    <span className="min-w-[1.25rem]">{item.quantity}x</span>
                    <span className="uppercase line-clamp-1">{item.sku} - {item.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-auto pt-2 border-t-4 border-black flex justify-between items-end">
             <div className="font-black text-xl">{companyName || 'PandaStore'}</div>
             <div className="text-[8px] uppercase font-bold tracking-widest opacity-50">INTERCITY BUS DELIVERY</div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-full text-zinc-400">
        Este transporte no requiere etiqueta de envío.
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-300" 
        onClick={onClose} 
      />
      
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 slide-in-from-bottom-5 duration-300">
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
              <Truck className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white leading-none">Etiqueta de Envío</h2>
              <p className="text-zinc-400 text-xs mt-1">Venta {sale.invoiceNumber} • {sale.transport}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 bg-zinc-950 flex justify-center custom-scrollbar">
          <div 
            ref={labelRef}
            className="bg-white text-black shadow-2xl overflow-hidden"
            style={{ width: '384px', height: '576px', minWidth: '384px', minHeight: '576px' }}
          >
            {renderLabelContent()}
          </div>
        </div>

        <div className="p-6 bg-zinc-900 border-t border-zinc-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl text-zinc-400 hover:text-white font-bold transition-all text-sm"
          >
            Cerrar
          </button>
          <button
            onClick={handleDownload}
            disabled={isGenerating}
            className="px-8 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl shadow-lg font-bold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isGenerating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Download className="w-4 h-4" />}
            {isGenerating ? 'Generando...' : 'Descargar Etiqueta (4x6)'}
          </button>
        </div>
      </div>
    </div>
  );
}
