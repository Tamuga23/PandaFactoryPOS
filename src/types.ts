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
