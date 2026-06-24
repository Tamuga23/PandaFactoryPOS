import { z } from 'zod';
import type { Product, PublicCatalogProduct } from '../types';

// Pilar 2: Zod Schemas and Validations

// --- Sub-estructuras tablet / catálogo público ---
export const SalesBulletSchema = z.object({
  text: z.string().min(1),
  icon: z.string().optional(),
  order: z.number().optional(),
});

export const ObjectionOverrideSchema = z.object({
  objId: z.string().min(1),
  titulo: z.string().optional(),
  respuesta: z.string().min(1),
});

export const ProjectorSpecsSchema = z.object({
  lumens: z.number().optional(),
  resolucion: z.string().optional(),
  contraste: z.string().optional(),
  conectividad: z.array(z.string()).optional(),
  garantiaMeses: z.number().optional(),
  extra: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const TabletMediaSchema = z.object({
  heroImage: z.string().optional(),
  gallery: z.array(z.string()).optional(),
  videoUrl: z.string().optional(),
});

/** Campos OPCIONALES de tablet que extienden a Product. */
export const ProductTabletFieldsSchema = z.object({
  categorySlug: z.string().optional(),
  publicar: z.boolean().optional(),
  precioPromo: z.number().min(0).optional(),
  descEfectivoPct: z.number().min(0).max(100).optional(),
  campania: z.string().optional(),
  beneficio: z.string().optional(),
  bullets: z.array(SalesBulletSchema).optional(),
  specsProyector: ProjectorSpecsSchema.optional(),
  objecionesOverride: z.array(ObjectionOverrideSchema).optional(),
  media: TabletMediaSchema.optional(),
});

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
}).extend(ProductTabletFieldsSchema.shape);

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

// ---------------------------------------------------------------------------
// Helpers puros + proyección al catálogo público
// ---------------------------------------------------------------------------

/** Redondeo a 2 decimales estable. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Normaliza un texto a slug: sin acentos, minúsculas, espacios→guiones. */
export function slugify(input: string): string {
  return (input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos/diacríticos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // quita símbolos
    .replace(/\s+/g, '-') // espacios → guiones
    .replace(/-+/g, '-') // colapsa guiones
    .replace(/^-+|-+$/g, ''); // recorta extremos
}

/**
 * Deriva el documento del espejo público a partir de un Product.
 * Función PURA (sin I/O): la usan la Cloud Function y el backfill como referencia.
 * Reglas:
 *  - NUNCA copia `cost`.
 *  - disponible = stock>0 && publicar!==false
 *  - precio.efectivo = round2(actual*(1-desc/100))
 *  - categorySlug derivado con slugify
 */
export function buildPublicCatalogDoc(product: Product): PublicCatalogProduct {
  const lista = product.price;
  const promo =
    typeof product.precioPromo === 'number' && product.precioPromo >= 0
      ? product.precioPromo
      : undefined;
  const actual = promo ?? lista;
  const descEfectivoPct =
    typeof product.descEfectivoPct === 'number' && product.descEfectivoPct > 0
      ? product.descEfectivoPct
      : undefined;
  const efectivo = round2(actual * (1 - (descEfectivoPct ?? 0) / 100));
  const disponible = product.stock > 0 && product.publicar !== false;
  const categorySlug = slugify(product.categorySlug || product.category || '');

  const precio: PublicCatalogProduct['precio'] = { lista, actual, efectivo };
  if (promo !== undefined) precio.promo = promo;
  if (descEfectivoPct !== undefined) precio.descEfectivoPct = descEfectivoPct;

  const doc: PublicCatalogProduct = {
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    categorySlug,
    precio,
    disponible,
    updatedAt: product.updatedAt,
  };

  // Campos de display opcionales (nunca `cost`).
  if (product.description) doc.description = product.description;
  if (product.campania) doc.campania = product.campania;
  if (product.beneficio) doc.beneficio = product.beneficio;
  if (product.bullets) doc.bullets = product.bullets;
  if (product.specsProyector) doc.specsProyector = product.specsProyector;
  if (product.objecionesOverride) doc.objecionesOverride = product.objecionesOverride;
  if (product.media) doc.media = product.media;

  return doc;
}
