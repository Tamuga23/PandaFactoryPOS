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

  createdAt: number;
  updatedAt: number;
}

export interface CartItem extends Product {
  quantity: number;
  serialNumbers?: string[]; // Pilar 1: Seriales/IMEI para electrónicos
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
  paymentMethod: 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA' | 'CREDITO';
  paymentReference?: string;
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

export type PurchaseStatus = 'OPEN' | 'PARTIAL' | 'CLOSED';
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

export interface DashboardStats {
  totalProducts: number;
  totalStockValue: number;
  lowStockItems: Product[];
  recentSales: Sale[];
  totalSalesValue: number;
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

/** Ficha técnica proyectable (orientada a proyectores/electrónica, extensible). */
export interface ProjectorSpecs {
  lumens?: number;
  resolucion?: string;
  contraste?: string;
  conectividad?: string[];
  garantiaMeses?: number;
  /** Specs adicionales clave→valor. */
  extra?: Record<string, string | number | boolean>;
}

/** Recursos multimedia para la tablet. */
export interface TabletMedia {
  heroImage?: string;
  gallery?: string[];
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
  updatedAt: number;
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
