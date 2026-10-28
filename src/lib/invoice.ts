import { Sale, CompanyInfo, Apartado, Product } from '../types';
import { InvoiceData } from '../components/InvoicePreview';
import { DEFAULT_EXCHANGE_RATE, formatCurrencyNIO, telefonoWhatsApp } from './utils';
import { abonadoNio, estaPagado, pendientesDe, saldoNio, tienePendientes } from './apartados';
import { etiquetaMetodo } from './etiquetas';

/**
 * Los transportes que generan una etiqueta física de envío. Vivía como
 * constante privada del POS; ahora también la necesita la entrega de un
 * apartado, que emite la factura y puede tener que imprimir la etiqueta.
 */
export const TRANSPORTES_CON_ETIQUETA = ['DELIVERY MANAGUA', 'CARGOTRANS', 'BUSES INTERLOCALES'];

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
    paymentMethod: sale.paymentMethod,
    paymentReference: sale.paymentReference || undefined,
    shippingCostNIO: sale.shipping || 0,
    discountNIO: sale.discount || 0,
    customNote: sale.notes || '',
    warrantyText: DEFAULT_WARRANTY_TEXT,
    // Se toma la foto guardada en la venta, NO se recalcula: si las tasas
    // cambiaron desde entonces, reimprimir tiene que dar el mismo papel.
    financiamiento: sale.financiamiento
      ? {
          plazoMeses: sale.financiamiento.plazoMeses,
          cuotaNio: sale.financiamiento.cuotaNio,
          totalNio: sale.financiamiento.totalNio,
          banco: sale.financiamiento.banco,
        }
      : undefined,
  };
}

/**
 * P2.6: mensaje + link de WhatsApp con resumen de la factura. Normaliza el
 * teléfono a formato internacional de Nicaragua (+505) si viene local de 8
 * dígitos. El PDF se adjunta vía navigator.share (ver InvoicePreview);
 * wa.me solo lleva el texto.
 */
export function buildWhatsAppMessage(
  sale: Sale,
  totalNIOFormatted: string,
): { text: string; link: string | null } {
  const phone = telefonoWhatsApp(sale.customerPhone);
  const docLabel = sale.documentType === 'PROFORMA' ? 'proforma' : 'factura';
  const text =
    `Hola ${sale.customerName || ''}! Te comparto tu ${docLabel} ${sale.invoiceNumber} ` +
    `de Panda Store por un total de ${totalNIOFormatted}. ¡Gracias por tu compra!`;
  return {
    text: text.replace(/\s+/g, ' ').trim(),
    link: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text.trim())}` : null,
  };
}

/** Compat: versión que devuelve solo el link. */
export function buildWhatsAppLink(sale: Sale, totalNIOFormatted: string): string | null {
  return buildWhatsAppMessage(sale, totalNIOFormatted).link;
}

const fechaCorta = (ms: number) => new Date(ms).toLocaleDateString('es-ES');

/**
 * El comprobante de un apartado: el papel que se lleva el cliente al apartar y
 * después de cada abono. Es el estado de cuenta del día en que se imprime.
 *
 * Las líneas van a `price × tasa`, igual que en `buildInvoiceDataFromSale`, así
 * que el TOTAL que calcula InvoicePreview es el MISMO número que `totalNio`
 * (ver `totalNioDe` en lib/apartados.ts): el total impreso, lo abonado y el
 * saldo cierran entre sí en el papel.
 *
 * La foto de cada línea sale del catálogo vigente, porque el apartado no la
 * guarda (ver `sanitizeApartadoItem`).
 */
export function buildInvoiceDataFromApartado(
  ap: Apartado,
  companyInfo?: CompanyInfo | null,
  products: Product[] = [],
  ahora: number = Date.now(),
  /** El plazo de la tienda: un encargo lo imprime en vez de una fecha. */
  plazoDias?: number,
): InvoiceData {
  const rate = ap.exchangeRate || companyInfo?.defaultExchangeRate || DEFAULT_EXCHANGE_RATE;
  const fotos = new Map(products.map((p) => [p.id, p.imageBase64]));
  const anulaciones = new Map((ap.anulaciones || []).map((x) => [x.abonoId, x]));
  /*
    Encargo: lo que todavía no llegó se marca línea por línea. Mientras algo
    falta, la fecha límite guardada es provisoria (ver crearApartado) y NO se
    imprime: el papel diría una fecha que la tienda todavía no fijó.
  */
  const esperando = ap.status === 'activo' && tienePendientes(ap);
  const faltan = pendientesDe(ap);

  return {
    type: 'APARTADO',
    invoiceNumber: ap.numero,
    date: fechaCorta(ap.fecha),
    client: {
      fullName: ap.customerName || 'CLIENTE',
      address: ap.customerAddress || 'Dirección no proporcionada',
      phone: ap.customerPhone || 'N/A',
      transport: ap.transport || 'ENTREGA LOCAL',
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
    items: (ap.items || []).map((i) => {
      // Si el producto viene en dos líneas, lo que falta se reparte en orden.
      const falta = Math.min(i.quantity, faltan.get(i.id) || 0);
      if (falta > 0) faltan.set(i.id, (faltan.get(i.id) || 0) - falta);
      return {
        id: i.id,
        productName: i.name,
        quantity: i.quantity,
        priceNIO: i.price * rate,
        priceUSD: i.price,
        image: fotos.get(i.id) || undefined,
        sku: i.sku,
        ...(esperando && falta > 0 ? { porLlegar: falta } : {}),
      };
    }),
    shippingCostNIO: ap.shipping || 0,
    discountNIO: ap.discount || 0,
    customNote: ap.notes || '',
    // El comprobante no imprime garantía: la garantía corre desde la factura,
    // que se emite al entregar. InvoicePreview la apaga por TIPO, no por este
    // texto (un '' caía al texto por defecto).
    warrantyText: '',
    apartado: {
      estado: ap.status,
      fechaLimite: fechaCorta(ap.fechaLimite),
      ...(esperando ? { esperando: true, plazoDias } : {}),
      saldoAl: fechaCorta(ahora),
      totalNio: ap.totalNio,
      abonadoNio: abonadoNio(ap),
      saldoNio: saldoNio(ap),
      abonos: (ap.abonos || []).map((a) => {
        const anulacion = anulaciones.get(a.id);
        return {
          fecha: fechaCorta(a.fecha),
          metodo: etiquetaMetodo(a.metodo),
          referencia: a.referencia,
          montoNio: a.montoNio,
          ...(anulacion ? { anulado: { motivo: anulacion.motivo, fecha: fechaCorta(anulacion.fecha) } } : {}),
        };
      }),
      invoiceNumber: ap.invoiceNumber,
      devueltoNio: ap.status === 'cancelado' ? (ap.devueltoNio ?? 0) : undefined,
    },
  };
}

/**
 * Mensaje de WhatsApp de un apartado: el comprobante (se manda con el PDF) o el
 * recordatorio de saldo (sólo texto).
 *
 * `telefono` es el de la ficha del cliente cuando la hay: el apartado guarda
 * una copia del día en que se creó, y si el cliente cambió de número, el
 * recordatorio tiene que ir al nuevo.
 *
 * Los montos salen de `totalNio` y del saldo de lib/apartados.ts, nunca de
 * `total × tasa`: es la misma cifra que imprime el papel.
 */
export function buildWhatsAppApartado(
  ap: Apartado,
  /** `llego`: el aviso de que un encargo ya está en la tienda y su plazo empezó. */
  tipo: 'comprobante' | 'recordatorio' | 'llego',
  telefono?: string,
): { text: string; link: string | null } {
  const phone = telefonoWhatsApp(telefono || ap.customerPhone);
  const nombre = (ap.customerName || '').trim();
  const saldo = saldoNio(ap);
  const vence = fechaCorta(ap.fechaLimite);
  let text: string;

  if (ap.status === 'cancelado') {
    text = `Hola ${nombre}! Te comparto el comprobante de tu apartado ${ap.numero} en Panda Store, que quedó cancelado.`;
  } else if (ap.status === 'entregado') {
    text = `Hola ${nombre}! Te comparto el comprobante de tu apartado ${ap.numero} en Panda Store: ` +
      `ya está entregado${ap.invoiceNumber ? `, con la factura ${ap.invoiceNumber}` : ''}. ¡Gracias por tu compra!`;
  } else if (tienePendientes(ap)) {
    // Encargo esperando: no hay fecha que recordar todavía (corre desde que
    // llega), así que ni el comprobante ni un recordatorio la mencionan.
    text = `Hola ${nombre}! Te comparto el comprobante de tu pedido ${ap.numero} en Panda Store. ` +
      `Total ${formatCurrencyNIO(ap.totalNio)}, abonado ${formatCurrencyNIO(abonadoNio(ap))}` +
      (saldo > 0
        ? `, saldo pendiente ${formatCurrencyNIO(saldo)}. Te avisamos cuando llegue; el plazo para completar el saldo empieza ese día.`
        : `: ya está pagado. Te avisamos cuando llegue.`);
  } else if (tipo === 'llego') {
    text = estaPagado(ap)
      ? `Hola ${nombre}! Ya llegó tu pedido ${ap.numero} a Panda Store y está pagado: pasá a retirarlo. ¡Te esperamos!`
      : `Hola ${nombre}! Ya llegó tu pedido ${ap.numero} a Panda Store y quedó reservado a tu nombre. ` +
        `Te queda un saldo de ${formatCurrencyNIO(saldo)}, y la fecha límite para completarlo es el ${vence}. ¡Te esperamos!`;
  } else if (estaPagado(ap)) {
    // Sin "cuando quieras": el dueño decidió un plazo de PAGO, no uno de retiro,
    // y un mensaje escrito que promete un retiro sin límite es una promesa que
    // nadie tomó.
    text = `Hola ${nombre}! Tu apartado ${ap.numero} en Panda Store ya está pagado: ` +
      `pasá a retirarlo. ¡Te esperamos!`;
  } else if (tipo === 'recordatorio') {
    text = `Hola ${nombre}! Te escribimos de Panda Store por tu apartado ${ap.numero}: ` +
      `te queda un saldo de ${formatCurrencyNIO(saldo)}, y la fecha límite para completarlo es el ${vence}. ` +
      `¡Te esperamos!`;
  } else {
    text = `Hola ${nombre}! Te comparto el comprobante de tu apartado ${ap.numero} en Panda Store. ` +
      `Total ${formatCurrencyNIO(ap.totalNio)}, abonado ${formatCurrencyNIO(abonadoNio(ap))}, ` +
      `saldo pendiente ${formatCurrencyNIO(saldo)}. Fecha límite para completarlo: ${vence}.`;
  }

  const limpio = text.replace(/\s+/g, ' ').trim();
  return {
    text: limpio,
    link: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(limpio)}` : null,
  };
}
