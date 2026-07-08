import { Sale, CompanyInfo } from '../types';
import { InvoiceData } from '../components/InvoicePreview';
import { DEFAULT_EXCHANGE_RATE } from './utils';

/** Texto de garantía por defecto (P2.5: antes estaba hardcodeado con "[3]" sin rellenar). */
export const DEFAULT_WARRANTY_TEXT =
  '1. Los productos vendidos por Panda Store tienen una garantía de 3 meses a partir de la fecha de compra.\n' +
  '2. La garantía cubre defectos de fabricación y no incluye daños causados por mal uso o accidentes.';

/**
 * P2.5: construye el InvoiceData de una venta GUARDADA (reimprimir desde
 * Historial/CRM) o recién creada. Usa la tasa de cambio congelada en la venta.
 */
export function buildInvoiceDataFromSale(
  sale: Sale,
  companyInfo?: CompanyInfo | null,
): InvoiceData {
  const rate = sale.exchangeRate || companyInfo?.defaultExchangeRate || DEFAULT_EXCHANGE_RATE;
  const isProforma = sale.documentType === 'PROFORMA';

  let validUntil: string | undefined;
  if (isProforma) {
    const validity = new Date(sale.date);
    validity.setDate(validity.getDate() + 10);
    validUntil = validity.toLocaleDateString('es-ES');
  }

  return {
    type: isProforma ? 'PROFORMA' : 'RECIBO_OFICIAL',
    invoiceNumber: sale.invoiceNumber,
    date: new Date(sale.date).toLocaleDateString('es-ES'),
    validUntil,
    client: {
      fullName: sale.customerName || 'CLIENTE FINAL',
      address: sale.customerAddress || 'Dirección no proporcionada',
      phone: sale.customerPhone || 'N/A',
      transport: sale.transport || 'ENTREGA LOCAL',
    },
    companyInfo: companyInfo
      ? {
          name: companyInfo.name,
          address: companyInfo.address,
          phone: companyInfo.phone,
          email: companyInfo.email,
          logo: companyInfo.logoBase64,
        }
      : undefined,
    items: (sale.items || []).map(i => ({
      id: i.id,
      productName: i.name,
      quantity: i.quantity,
      priceNIO: i.price * rate,
      priceUSD: i.price,
      image: i.imageBase64,
      sku: i.sku,
    })),
    shippingCostNIO: sale.shipping || 0,
    discountNIO: sale.discount || 0,
    customNote: sale.notes || '',
    warrantyText: DEFAULT_WARRANTY_TEXT,
  };
}

/**
 * P2.6: link de WhatsApp con resumen de la factura. Normaliza el teléfono a
 * formato internacional de Nicaragua (+505) si viene local de 8 dígitos.
 */
export function buildWhatsAppLink(sale: Sale, totalNIOFormatted: string): string | null {
  const digits = (sale.customerPhone || '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  const phone = digits.length === 8 ? `505${digits}` : digits;
  const docLabel = sale.documentType === 'PROFORMA' ? 'proforma' : 'factura';
  const msg =
    `Hola ${sale.customerName || ''}! Te comparto tu ${docLabel} ${sale.invoiceNumber} ` +
    `de Panda Store por un total de ${totalNIOFormatted}. ¡Gracias por tu compra!`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg.trim())}`;
}
