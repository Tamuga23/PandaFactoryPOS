import type { FinanciamientoOverride } from './lib/financiamiento';
export type { FinanciamientoOverride };

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: number;
  cost: number;
  stock: number;
  minStockAlert: number;
  category: string;
  imageBase64?: string;
  isReordering?: boolean;
  /** Disponible en el POS. Si es false, se oculta del POS (la visibilidad en tablet es `publicar`). */
  activo?: boolean;

  // --- Campos tablet / catálogo público (OPCIONALES; el POS no los requiere) ---
  /** Slug normalizado de la categoría (derivable de `category`). */
  categorySlug?: string;
  /** Si es false, el producto NO se proyecta al espejo público. */
  publicar?: boolean;
  /** Precio promocional, si aplica. No reemplaza a `price`. */
  precioPromo?: number;
  /** Descuento por pago en efectivo, en porcentaje (0-100). */
  descEfectivoPct?: number;
  /** Campaña comercial asociada (ej. "Black Friday"). */
  campania?: string;
  /** Beneficio principal / gancho de venta. */
  beneficio?: string;
  /** Guiones / bullets de venta para la tablet. */
  bullets?: SalesBullet[];
  /** Ficha técnica para proyectar en la tablet. */
  specsProyector?: ProjectorSpecs;
  /** Overrides de objeciones universales para este producto. */
  objecionesOverride?: ObjectionOverride[];
  /** Recursos multimedia para la tablet. */
  media?: TabletMedia;
  /**
   * Excepción de financiamiento SOLO para este producto: fuerza 0%, cambia el
   * recargo o le saca las cuotas. Si no está, manda la regla de su categoría
   * (ver `config/financiamiento` y `src/lib/financiamiento.ts`).
   */
  financiamientoOverride?: FinanciamientoOverride;

  createdAt: number;
  updatedAt: number;
}

export interface CartItem extends Product {
  quantity: number;
  serialNumbers?: string[]; // Pilar 1: Seriales/IMEI para electrónicos
  /** Solo UI del carrito: precio efectivo aplicado a esta línea (se limpia al guardar). */
  efectivoApplied?: boolean;
}

export interface Customer {
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
  address?: string;
  documentType?: string;
  documentNumber?: string;
  createdAt: number;
  ownerId: string;
}

/**
 * Foto del plan de cuotas cobrado en una venta financiada.
 * Los montos van en CÓRDOBAS, que es la moneda en la que el banco cobra.
 */
export interface VentaFinanciamiento {
  /** Plazo elegido por el cliente, en meses. */
  plazoMeses: number;
  /** Recargo aplicado, en %. 0 = se cobró sin interés. */
  recargoPct: number;
  /** Cuota mensual en córdobas. */
  cuotaNio: number;
  /** Total cobrado en córdobas = cuotaNio × plazoMeses. */
  totalNio: number;
  /** Banco que otorgó el crédito, como estaba configurado ese día. */
  banco?: string;
}

export interface Sale {
  id: string;
  date: number;
  items: CartItem[];
  subtotal: number;
  tax: number; // Pilar 1: Generalmente 0 para Cuota Fija
  total: number;
  discount?: number;
  shipping?: number;
  
  // Pilar 1: Identificación y Documentos
  documentType: 'RECIBO_OFICIAL' | 'PROFORMA';
  clientDocumentType: 'CEDULA' | 'RUC' | 'PASAPORTE' | 'NINGUNO';
  clientDocumentNumber?: string;
  customerId?: string; // CRM integration
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  transport?: string;
  invoiceNumber: string;
  
  // Pilar 1: Moneda y Pagos
  currency: 'NIO' | 'USD';
  exchangeRate: number;
  /**
   * `FINANCIAMIENTO` = cuotas con el banco. Se separó de `TARJETA` (que ahora
   * significa pago único con tarjeta) porque sin esa distinción era imposible
   * saber cuánto cuesta realmente el financiamiento: ver `financiamiento`.
   */
  paymentMethod: 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA' | 'CREDITO' | 'FINANCIAMIENTO';
  paymentReference?: string;
  /**
   * Plan de cuotas efectivamente cobrado. Solo cuando
   * `paymentMethod === 'FINANCIAMIENTO'`.
   *
   * Es una FOTO del momento de la venta: guarda el recargo y el monto reales
   * cobrados, no una referencia a la config. Si mañana cambiás las tasas, las
   * ventas viejas siguen contando lo que de verdad pasó — y el reporte de margen
   * pasa de estimar a medir.
   */
  financiamiento?: VentaFinanciamiento;
  notes?: string;
  
  ownerId: string;
  status: 'completed' | 'returned' | 'cancelled';
}

export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  createdAt: number;
  ownerId: string;
}

export interface PurchaseItem {
  id: string;
  name: string;
  sku: string;
  cost: number;
  quantity: number;
  receivedQuantity: number;
  color?: string;
  estimatedWeight?: number;
  serialNumbers?: string[]; // Pilar 1: Seriales para ingresos
}

export type PurchaseStatus = 'OPEN' | 'PARTIAL' | 'CLOSED' | 'CANCELLED';
export type ShippingModality = 'Sea Cargo' | 'Air Cargo';

export interface PurchaseTracking {
  id: string;
  trackingNumber: string;
  status: string;
  agentDeliveryDate?: number;
  receptionDate?: number;
  finalWeight?: number;
  isReceived: boolean;
  itemsInBox: { itemId: string; quantity: number }[];
}

export interface Purchase {
  id: string;
  date: number;
  supplier: string;
  platform?: string;
  notes?: string;
  items: PurchaseItem[];
  totalCost: number;
  
  // Logistics Level 1 (Order)
  shippingChannel?: string;
  shippingModality?: ShippingModality;
  orderNumber?: string;
  financing?: string;
  estimatedWeight?: number;
  shippingRatePerLb?: number;
  
  // Landed Cost Components
  freightCost?: number;
  customsTaxes?: number;
  insuranceCost?: number;

  // Logistics Level 2 (Trackings)
  trackings: PurchaseTracking[];

  status: PurchaseStatus;
  stockAdded: boolean; // Retained for backwards compatibility if needed, though status dictates
  
  // Pilar 1: Moneda en compras
  currency: 'NIO' | 'USD';
  exchangeRate: number;
  
  ownerId: string;
  invoiceNumber?: string;
}

export interface CompanyInfo {
  name: string;
  phone: string;
  address: string;
  email: string;
  logoBase64?: string;
  ownerId: string;
  defaultExchangeRate: number; // Pilar 4: Tasa de cambio congelada (ej. 36.6243)
}

/** P2.7: movimiento de inventario (kardex). Colección `movimientos`, inmutable. */
export interface Movimiento {
  id?: string;
  productId: string;
  productName?: string;
  sku?: string;
  tipo: 'venta' | 'devolucion' | 'compra' | 'reversion' | 'ajuste';
  /** Cambio de stock (+entra / -sale). */
  delta: number;
  /** Stock resultante después del movimiento (si se conoce). */
  stockDespues?: number;
  motivo?: string;
  /** Id de la venta/compra que originó el movimiento. */
  refId?: string;
  fecha: number;
  ownerId: string;
}

export interface DashboardStats {
  totalProducts: number;
  totalStockValue: number;
  lowStockItems: Product[];
  recentSales: Sale[];
  totalSalesValue: number;
  /** Ventas completadas de HOY (ventana en vivo). */
  todaySalesValue: number;
}

export interface ClientData {
  fullName: string;
  address: string;
  phone: string;
  transport: string;
  clientDocumentType?: string;
  clientDocumentNumber?: string;
}

// ---------------------------------------------------------------------------
// Catálogo público / Tablet de ventas
// ---------------------------------------------------------------------------

/** Bullet / guion de venta mostrado en la tablet. */
export interface SalesBullet {
  text: string;
  icon?: string;
  order?: number;
}

/** Override de una objeción universal para un producto puntual. */
export interface ObjectionOverride {
  /** Referencia a la objeción universal (id o key, ej. "garantia"). */
  objId: string;
  titulo?: string;
  respuesta: string;
}

/**
 * Ficha técnica proyectable. El nombre es histórico (nació para proyectores);
 * hoy sirve a TODAS las categorías: qué campos se editan y cómo se muestran lo
 * decide `src/lib/categorySpecs.ts` según la categoría del producto.
 *
 * El campo en Firestore sigue llamándose `specsProyector` a propósito:
 * firestore.rules, la Cloud Function `onProductWritten` y los normalizadores de
 * PandaLink y PandaWEB ya lo soportan. Renombrarlo obligaría a deploy de reglas
 * + functions + backfill sin ningún cambio visible.
 *
 * Las claves de proyector NO se renombran nunca: hay productos en producción
 * con esos datos cargados.
 */
export interface ProjectorSpecs {
  // --- Proyector (claves históricas, no renombrar) ---
  ansi?: number;
  throwRatio?: string;
  distMinEnfoque?: string;
  autofoco?: boolean;
  lumens?: number;
  resolucion?: string;
  contraste?: string;
  conectividad?: string[];
  garantiaMeses?: number;

  // --- Transversales a varias categorías ---
  /** Select ya redactado para el cliente, ej. "Apto para nadar (5 ATM)". */
  resistenciaAgua?: string;
  duracionBateria?: string;
  almacenamiento?: string;
  alimentacion?: string;
  instalacion?: string;
  campoVision?: string;
  visionNocturna?: string;
  memoria?: string;
  sistema?: string;
  carga?: string;
  gps?: boolean;

  // --- Smartwatch ---
  tamanoPantalla?: string;
  tipoPantalla?: string;
  salud?: string[];
  llamadas?: boolean;
  deportes?: string;
  compatibilidad?: string;
  correa?: string;

  // --- Cámara / dashcam ---
  uso?: string;
  deteccionMovimiento?: boolean;
  audioDoble?: boolean;
  sirena?: boolean;
  camaras?: string;
  modoEstacionamiento?: boolean;
  pantalla?: string;
  /** Cámara/dashcam/smart home: `string` (nombre de la app) o `boolean` (la tiene o no). */
  app?: string | boolean;

  // --- Parlante ---
  potencia?: string;
  tamano?: string;
  microfono?: boolean;
  luces?: boolean;
  emparejamiento?: boolean;
  manosLibres?: boolean;
  audio?: string;

  // --- Smart home ---
  funcion?: string;
  controlApp?: boolean;
  asistentes?: string[];
  rutinas?: boolean;

  // --- Smart TV / streaming ---
  apps?: string[];
  control?: string;
  espejo?: boolean;

  /** Specs adicionales clave→valor. Se expanden como filas propias en la ficha. */
  extra?: Record<string, string | number | boolean>;

  /** Un campo nuevo cargado desde el POS nunca rompe el tipado ni desaparece. */
  [key: string]:
    | string
    | number
    | boolean
    | string[]
    | Record<string, string | number | boolean>
    | undefined;
}

/** Foto complementaria de la galería de la tablet (ej. proyector a oscuras / con luz). */
export interface GalleryItem {
  url: string;
  /** Etiqueta corta visible en la tablet (ej. "A oscuras", "Con luz"). Máx ~40 chars. */
  label?: string;
}

/** Recursos multimedia para la tablet. */
export interface TabletMedia {
  heroImage?: string;
  /** Fotos complementarias. Formato nuevo: {url, label?}; docs viejos pueden traer strings (la tablet normaliza ambos). */
  gallery?: (string | GalleryItem)[];
  videoUrl?: string;
}

/**
 * Proyección pública de un Product (colección `catalogo_publico`).
 * NUNCA contiene `cost`. La escribe SÓLO el servidor (Cloud Function).
 */
export interface PublicCatalogProduct {
  id: string;
  sku: string;
  name: string;
  description?: string;
  category: string;
  categorySlug: string;
  precio: {
    /** Precio de lista (= Product.price). */
    lista: number;
    /** Precio promocional, si existe. */
    promo?: number;
    /** Precio "actual" mostrado (promo si existe, si no lista). */
    actual: number;
    /** Descuento por efectivo aplicado (%). */
    descEfectivoPct?: number;
    /** Precio final pagando en efectivo = round2(actual*(1-desc/100)). */
    efectivo: number;
  };
  /** stock > 0 && publicar !== false */
  disponible: boolean;
  campania?: string;
  beneficio?: string;
  bullets?: SalesBullet[];
  specsProyector?: ProjectorSpecs;
  objecionesOverride?: ObjectionOverride[];
  media?: TabletMedia;
  /** Excepción de financiamiento del producto. Define la cuota que ve el cliente. */
  financiamientoOverride?: FinanciamientoOverride;
  updatedAt: number;
}

/** Objeción por categoría: aplica a todos los productos de un categorySlug. */
export interface CategoryObjection {
  id: string;
  categorySlug: string;
  pregunta: string;
  respuesta: string;
  orden: number;
}

/** Objeción universal global (garantía, factura, conexión, …). Editable desde el OS. */
export interface UniversalObjection {
  id: string;
  /** Clave estable opcional, ej. "garantia" | "factura" | "conexion". */
  key?: string;
  titulo: string;
  respuesta: string;
  categoria?: string;
  order?: number;
  createdAt: number;
  updatedAt: number;
  ownerId: string;
}
