import { CartItem, Sale } from '../types';

/**
 * Persistencia de la venta en curso del POS.
 *
 * El carrito y los datos del cobro vivían solo en `useState`, así que un F5 —o
 * un clic al Catálogo Maestro para corregir un precio— destruía la venta armada
 * sin aviso y sin recuperación. Y salir del POS a mitad de venta no es una
 * excepción en este producto: el operador ES el administrador (PRODUCT.md), así
 * que ir a arreglar un dato y volver es parte del trabajo.
 *
 * Va a `localStorage` a propósito: el proyecto está en plan Spark y no hay
 * Cloud Functions ni nada de servidor que sostenga un borrador. Es por
 * navegador y por dispositivo, que es exactamente el alcance que hace falta
 * para una sola persona en una sola laptop.
 */

const CLAVE = 'pandastore:venta-en-curso:v1';

/** Descartamos borradores viejos: un carrito de anteayer no se quiere recuperar. */
const VENCE_EN_MS = 12 * 60 * 60 * 1000;

export interface VentaEnCurso {
  cart: CartItem[];
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  selectedCustomerId: string | null;
  transport: string;
  paymentMethod: Sale['paymentMethod'];
  paymentReference: string;
  plazoMeses: number | null;
  discount: number;
  shipping: number;
  customNote: string;
  guardadoEn: number;
}

/**
 * Guarda el borrador. Silencioso a propósito: si el almacenamiento está lleno o
 * bloqueado (modo privado), perder el borrador no puede romper el cobro — que
 * es la tarea que el operador tiene delante.
 */
export function guardarVentaEnCurso(v: Omit<VentaEnCurso, 'guardadoEn'>): void {
  try {
    if (v.cart.length === 0) {
      localStorage.removeItem(CLAVE);
      return;
    }
    localStorage.setItem(CLAVE, JSON.stringify({ ...v, guardadoEn: Date.now() }));
  } catch {
    /* almacenamiento no disponible: se sigue sin borrador */
  }
}

/**
 * Devuelve el borrador si hay uno usable. `null` si no existe, si está vencido,
 * si quedó corrupto o si el navegador no da acceso.
 *
 * No confía en la forma de lo que lee: `localStorage` es entrada externa y una
 * versión vieja del POS pudo dejar otra estructura. Valida lo mínimo para que
 * el POS no monte con basura.
 */
export function leerVentaEnCurso(): VentaEnCurso | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;

    const v = JSON.parse(crudo) as Partial<VentaEnCurso>;
    if (!v || !Array.isArray(v.cart) || v.cart.length === 0) return null;
    if (typeof v.guardadoEn !== 'number' || Date.now() - v.guardadoEn > VENCE_EN_MS) {
      localStorage.removeItem(CLAVE);
      return null;
    }
    // Cada línea tiene que traer lo mínimo para poder cobrarse.
    const lineasSanas = v.cart.every(
      (i: any) => i && typeof i.id === 'string' && typeof i.price === 'number' && typeof i.quantity === 'number',
    );
    if (!lineasSanas) {
      localStorage.removeItem(CLAVE);
      return null;
    }

    return {
      cart: v.cart,
      customerName: v.customerName ?? '',
      customerEmail: v.customerEmail ?? '',
      customerPhone: v.customerPhone ?? '',
      customerAddress: v.customerAddress ?? '',
      selectedCustomerId: v.selectedCustomerId ?? null,
      transport: v.transport ?? 'ENTREGA LOCAL',
      paymentMethod: v.paymentMethod ?? 'EFECTIVO',
      paymentReference: v.paymentReference ?? '',
      plazoMeses: typeof v.plazoMeses === 'number' ? v.plazoMeses : null,
      discount: typeof v.discount === 'number' ? v.discount : 0,
      shipping: typeof v.shipping === 'number' ? v.shipping : 0,
      customNote: v.customNote ?? '',
      guardadoEn: v.guardadoEn,
    };
  } catch {
    return null;
  }
}

/** Se llama al confirmar la venta y al descartarla a mano. */
export function borrarVentaEnCurso(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* nada que hacer */
  }
}

/** "hace 3 minutos" / "hace 2 horas", para la barra de recuperación. */
export function hace(ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} ${min === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.floor(min / 60);
  return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
}
