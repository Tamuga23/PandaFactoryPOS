import { z } from 'zod';

// Pilar 2: Zod Schemas and Validations

export const ProductSchema = z.object({
  id: z.string().min(1, "ID is required"),
  sku: z.string().min(1, "SKU is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().default(""),
  price: z.number().min(0, "Price must be non-negative"),
  cost: z.number().min(0, "Cost must be non-negative"),
  stock: z.number().min(0, "Stock cannot be negative"),
  minStockAlert: z.number().min(0, "Min stock alert must be non-negative"),
  category: z.string().min(1, "Category is required"),
  imageBase64: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const CartItemSchema = ProductSchema.extend({
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  serialNumbers: z.array(z.string()).optional(),
}).refine(
  (data) => {
    // If serial numbers are provided and not empty, their length must match exactly the quantity
    if (data.serialNumbers && data.serialNumbers.length > 0) {
      return data.serialNumbers.length === data.quantity;
    }
    return true; // No serials provided is valid
  },
  {
    message: "The number of serial numbers must match exactly the quantity of the item.",
    path: ["serialNumbers"],
  }
);

export const SaleSchema = z.object({
  id: z.string().min(1),
  date: z.number(),
  items: z.array(CartItemSchema).min(1, "Must have at least one item"),
  subtotal: z.number().min(0),
  tax: z.number().min(0),
  total: z.number().min(0),
  discount: z.number().min(0).optional(),
  shipping: z.number().min(0).optional(),
  
  documentType: z.enum(['RECIBO_OFICIAL', 'PROFORMA']),
  clientDocumentType: z.enum(['CEDULA', 'RUC', 'PASAPORTE', 'NINGUNO']),
  clientDocumentNumber: z.string().optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().email().optional().or(z.literal('')),
  customerPhone: z.string().optional(),
  customerAddress: z.string().optional(),
  transport: z.string().optional(),
  invoiceNumber: z.string().min(1),
  
  currency: z.enum(['NIO', 'USD']),
  exchangeRate: z.number().min(0.01),
  paymentMethod: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CREDITO']),
  paymentReference: z.string().optional(),
  
  ownerId: z.string().min(1),
  status: z.enum(['completed', 'returned', 'cancelled']),
}).refine(
  (data) => {
    // Nicaraguan ID format validation (14 digits + 1 uppercase letter)
    if (data.clientDocumentType === 'CEDULA') {
      if (!data.clientDocumentNumber) return false;
      return /^\d{14}[A-Z]$/i.test(data.clientDocumentNumber);
    }
    return true;
  },
  {
    message: "Cédula format is invalid. It must be 14 digits followed by an uppercase letter.",
    path: ["clientDocumentNumber"],
  }
);

export const PurchaseItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sku: z.string().min(1),
  cost: z.number().min(0),
  quantity: z.number().int().min(1),
  serialNumbers: z.array(z.string()).optional(),
}).refine(
  (data) => {
    if (data.serialNumbers && data.serialNumbers.length > 0) {
      return data.serialNumbers.length === data.quantity;
    }
    return true;
  },
  {
    message: "The number of serial numbers must match exactly the quantity of the purchased item.",
    path: ["serialNumbers"],
  }
);

export const PurchaseSchema = z.object({
  id: z.string().min(1),
  date: z.number(),
  supplier: z.string().min(1),
  notes: z.string().optional(),
  items: z.array(PurchaseItemSchema).min(1),
  totalCost: z.number().min(0),
  currency: z.enum(['NIO', 'USD']),
  exchangeRate: z.number().min(0.01),
  ownerId: z.string().min(1),
  invoiceNumber: z.string().optional(),
});
