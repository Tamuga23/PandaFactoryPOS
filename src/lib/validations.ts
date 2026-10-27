import { z } from 'zod';
import type { Product, PublicCatalogProduct } from '../types';
import { saldoNio, totalNioDe, validarTelefono } from './apartados';

// Pilar 2: Zod Schemas and Validations

// --- Sub-estructuras tablet / catálogo público ---
export const SalesBulletSchema = z.object({
  text: z.string().min(1),
  /** Etiqueta corta arriba del bullet en la tablet (ej. "BRILLO", "BATERÍA"). */
  etiqueta: z.string().max(24).optional(),
  icon: z.string().optional(),
  order: z.number().optional(),
});

export const ObjectionOverrideSchema = z.object({
  objId: z.string().min(1),
  titulo: z.string().optional(),
  respuesta: z.string().min(1),
});

/**
 * Ficha técnica de CUALQUIER categoría (el nombre es histórico; ver
 * `src/lib/categorySpecs.ts`, que define qué campos aplican a cada categoría).
 *
 * Es a propósito PERMISIVO: las claves de proyector se validan con su tipo
 * exacto porque ya hay datos en producción, y el resto pasa por `catchall`. Así
 * agregar un campo nuevo al catálogo de categorías no obliga a tocar este
 * schema ni las reglas de Firestore (que solo exigen `specsProyector is map`).
 */
export const ProjectorSpecsSchema = z.object({
  // Claves históricas de proyector: tipo estricto, no renombrar.
  ansi: z.number().optional(),
  throwRatio: z.string().optional(),
  distMinEnfoque: z.string().optional(),
  autofoco: z.boolean().optional(),
  lumens: z.number().optional(),
  resolucion: z.string().optional(),
  contraste: z.string().optional(),
  conectividad: z.array(z.string()).optional(),
  garantiaMeses: z.number().optional(),
  extra: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
}).catchall(
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
);

/** Foto complementaria de la galería (formato nuevo). */
export const GalleryItemSchema = z.object({
  url: z.string().min(1),
  label: z.string().max(40).optional(),
});

export const TabletMediaSchema = z.object({
  heroImage: z.string().optional(),
  /** Acepta strings (legacy) u objetos {url, label} (nuevo). */
  gallery: z.array(z.union([z.string(), GalleryItemSchema])).optional(),
  videoUrl: z.string().optional(),
});

/**
 * Excepción de financiamiento por producto. El recargo es un mapa
 * meses→porcentaje (claves string porque así viajan en Firestore).
 */
export const FinanciamientoOverrideSchema = z.object({
  sinInteres: z.boolean().optional(),
  habilitado: z.boolean().optional(),
  minUsd: z.number().min(0).optional(),
  plazos: z.array(z.number().positive()).optional(),
  recargo: z.record(z.string(), z.number().min(0).max(100)).optional(),
});

/** Reglas de financiamiento (doc `config/financiamiento`). */
export const ConfigFinanciamientoSchema = z.object({
  banco: z.string().min(1),
  minUsd: z.number().min(0),
  plazos: z.array(z.number().positive()).min(1),
  recargoPorDefecto: z.record(z.string(), z.number().min(0).max(100)),
  porCategoria: z
    .record(
      z.string(),
      z.object({
        recargo: z.record(z.string(), z.number().min(0).max(100)).optional(),
        minUsd: z.number().min(0).optional(),
        plazos: z.array(z.number().positive()).optional(),
      }),
    )
    .optional(),
  actualizadoEn: z.number().optional(),
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
  financiamientoOverride: FinanciamientoOverrideSchema.optional(),
});

export const ProductSchema = z.object({
  id: z.string().min(1, "ID is required"),
  sku: z.string().min(1, "SKU is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().default(""),
  price: z.number().min(0, "Price must be non-negative"),
  cost: z.number().min(0, "Cost must be non-negative"),
  stock: z.number().min(0, "Stock cannot be negative"),
  // Unidades apartadas: fuera de `stock`, pero en la tienda. Ver Product en types.ts.
  apartadas: z.number().int().min(0).optional(),
  minStockAlert: z.number().min(0, "Min stock alert must be non-negative"),
  category: z.string().min(1, "Category is required"),
  imageBase64: z.string().optional(),
  isReordering: z.boolean().optional(),
  activo: z.boolean().optional(),
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

export const CustomerSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  documentType: z.string().optional(),
  documentNumber: z.string().optional(),
  createdAt: z.number(),
  ownerId: z.string().min(1),
});

export const SupplierSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  createdAt: z.number(),
  ownerId: z.string().min(1),
});

export const CompanyInfoSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  address: z.string().min(1),
  email: z.string().email(),
  logoBase64: z.string().optional(),
  ownerId: z.string().min(1),
  defaultExchangeRate: z.number().min(0.01),
});

/**
 * Plan de cuotas cobrado en una venta financiada. Montos en córdobas.
 * `totalNio` tiene que ser exactamente `cuotaNio × plazoMeses`: si no cuadra,
 * el número que se le mostró al cliente no era el que se cobró.
 */
export const VentaFinanciamientoSchema = z
  .object({
    plazoMeses: z.number().int().positive().max(60),
    recargoPct: z.number().min(0).max(100),
    cuotaNio: z.number().positive(),
    totalNio: z.number().positive(),
    banco: z.string().max(60).optional(),
  })
  .refine((f) => Math.abs(f.cuotaNio * f.plazoMeses - f.totalNio) < 1, {
    message: 'totalNio debe ser cuotaNio × plazoMeses',
    path: ['totalNio'],
  });

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
  customerId: z.string().max(128).optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().email().optional().or(z.literal('')),
  customerPhone: z.string().optional(),
  customerAddress: z.string().optional(),
  transport: z.string().optional(),
  invoiceNumber: z.string().min(1),
  
  currency: z.enum(['NIO', 'USD']),
  exchangeRate: z.number().min(0.01),
  paymentMethod: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CREDITO', 'FINANCIAMIENTO']),
  financiamiento: VentaFinanciamientoSchema.optional(),
  paymentReference: z.string().optional(),
  notes: z.string().optional(),
  // La venta que se emite al entregar un apartado lleva su id.
  apartadoId: z.string().max(128).optional(),

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
  receivedQuantity: z.number().int().min(0),
  color: z.string().optional(),
  estimatedWeight: z.number().min(0).optional(),
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

export const PurchaseTrackingSchema = z.object({
  id: z.string().min(1),
  trackingNumber: z.string().min(1),
  status: z.string().min(1),
  agentDeliveryDate: z.number().optional(),
  receptionDate: z.number().optional(),
  finalWeight: z.number().min(0).optional(),
  isReceived: z.boolean(),
  itemsInBox: z.array(
    z.object({
      itemId: z.string().min(1),
      quantity: z.number().int().min(1),
      // Ver `PurchaseTracking` en types.ts: el costo con el que entraron estas
      // unidades y el promedio de antes y de después, para poder revertir el
      // promedio ponderado sin adivinar.
      costoUnitarioReal: z.number().min(0).optional(),
      costoPrevio: z.number().min(0).optional(),
      costoDespues: z.number().min(0).optional(),
      stockDespues: z.number().optional(),
    })
  ),
});

export const PurchaseSchema = z.object({
  id: z.string().min(1),
  date: z.number(),
  supplier: z.string().min(1),
  platform: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(PurchaseItemSchema).min(1),
  totalCost: z.number().min(0),
  
  shippingChannel: z.string().optional(),
  // La UI permite modalidades custom además de Sea/Air Cargo, así que se
  // valida como string (las reglas también aceptan cualquier string).
  shippingModality: z.string().optional(),
  orderNumber: z.string().optional(),
  financing: z.string().optional(),
  estimatedWeight: z.number().min(0).optional(),
  shippingRatePerLb: z.number().min(0).optional(),
  
  freightCost: z.number().min(0).optional(),
  customsTaxes: z.number().min(0).optional(),
  insuranceCost: z.number().min(0).optional(),

  trackings: z.array(PurchaseTrackingSchema),
  status: z.enum(['OPEN', 'PARTIAL', 'CLOSED', 'CANCELLED']),
  stockAdded: z.boolean(),
  
  currency: z.enum(['NIO', 'USD']),
  exchangeRate: z.number().min(0.01),
  ownerId: z.string().min(1),
  invoiceNumber: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Kardex (P2.7)
// ---------------------------------------------------------------------------

export const MovimientoSchema = z.object({
  id: z.string().optional(),
  productId: z.string().min(1),
  productName: z.string().optional(),
  sku: z.string().optional(),
  tipo: z.enum(['venta', 'devolucion', 'compra', 'reversion', 'ajuste', 'apartado', 'liberacion']),
  delta: z.number(),
  stockDespues: z.number().optional(),
  motivo: z.string().max(300).optional(),
  refId: z.string().optional(),
  fecha: z.number(),
  ownerId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Apartados
// ---------------------------------------------------------------------------
//
// OJO con cómo se arman. CartItemSchema y SaleSchema llevan `.refine`, y en
// Zod 4 un objeto refinado no se deja derivar: `.omit()`, `.pick()` y
// `.partial()` lanzan siempre, `.extend()` lanza si pisa una clave, y `.merge()`
// no lanza pero BORRA el refine sin avisar. Y como estos schemas viven a nivel
// de módulo, el error saltaría al importar este archivo, que lo importa
// useStoreData.ts: la aplicación entera en blanco, con `tsc` en cero errores
// porque los tipos permiten esos métodos. Por eso cada schema de acá es un
// `z.object` propio, y los ítems reusan CartItemSchema tal cual.

/** Las formas de pago de un abono: las del POS menos FINANCIAMIENTO (ver lib/apartados.ts). */
export const MetodoAbonoSchema = z.enum(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CREDITO']);

export const AbonoApartadoSchema = z.object({
  id: z.string().min(1).max(128),
  fecha: z.number(),
  montoNio: z.number().positive('El abono tiene que ser mayor que cero'),
  metodo: MetodoAbonoSchema,
  referencia: z.string().max(100).optional(),
});

export const AnulacionAbonoSchema = z.object({
  abonoId: z.string().min(1).max(128),
  motivo: z.string().trim().min(1, 'Escribí por qué se anula el abono').max(300),
  fecha: z.number(),
});

/**
 * Un apartado completo.
 *
 * Los topes de los datos del cliente son EXACTAMENTE los de `isValidSale` en
 * firestore.rules (nombre ≤100, correo ≤100, teléfono ≤50, dirección ≤500,
 * transporte ≤100). No es prolijidad: al entregar, estos datos se copian a una
 * venta que tiene que pasar esas reglas. Un apartado que se acepta hoy con un
 * teléfono de 60 caracteres sería, dentro de un mes y con el cliente pagado,
 * una factura que no se puede emitir.
 */
export const ApartadoSchema = z.object({
  id: z.string().min(1).max(128),
  numero: z.string().min(1).max(20),
  fecha: z.number(),
  fechaLimite: z.number(),
  items: z.array(CartItemSchema).min(1, 'Un apartado necesita al menos un producto').max(100),
  subtotal: z.number().min(0),
  tax: z.number().min(0),
  total: z.number().min(0),
  discount: z.number().min(0).optional(),
  shipping: z.number().min(0).optional(),
  exchangeRate: z.number().min(0.01),
  totalNio: z.number().positive(),
  abonos: z.array(AbonoApartadoSchema).min(1, 'Falta la prima').max(200),
  anulaciones: z.array(AnulacionAbonoSchema).max(200),
  customerId: z.string().max(128).optional(),
  customerName: z.string().trim().min(1, 'Falta el nombre del cliente').max(100),
  customerPhone: z.string().trim().min(1, 'Falta el teléfono del cliente').max(50),
  customerEmail: z.string().email().max(100).optional().or(z.literal('')),
  customerAddress: z.string().max(500).optional(),
  transport: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(['activo', 'entregado', 'cancelado']),
  saleId: z.string().max(128).optional(),
  invoiceNumber: z.string().max(50).optional(),
  entregadoEn: z.number().optional(),
  canceladoEn: z.number().optional(),
  motivoCancelacion: z.string().max(300).optional(),
  devueltoNio: z.number().min(0).optional(),
  ownerId: z.string().min(1),
  updatedAt: z.number(),
})
  .refine((ap) => ap.fechaLimite >= ap.fecha, {
    message: 'La fecha límite no puede ser anterior al apartado',
    path: ['fechaLimite'],
  })
  // El total congelado ES el que imprime el papel: misma cuenta que InvoicePreview.
  .refine(
    (ap) => Math.abs(totalNioDe(ap.items, ap.exchangeRate, ap.shipping || 0, ap.discount || 0) - ap.totalNio) < 0.005,
    { message: 'El total en córdobas no coincide con las líneas, la tasa, el envío y el descuento', path: ['totalNio'] },
  )
  .refine((ap) => saldoNio(ap) >= 0, { message: 'Lo abonado pasa del total del apartado', path: ['abonos'] })
  .refine((ap) => validarTelefono(ap.customerPhone) === null, {
    message: 'El teléfono tiene que tener 8 dígitos (o el número internacional completo)',
    path: ['customerPhone'],
  });

/** Lo único que se edita de un apartado ya creado. Ver `actualizarApartado`. */
export const ActualizacionApartadoSchema = z.object({
  fechaLimite: z.number().optional(),
  notes: z.string().max(2000).optional(),
  customerPhone: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .refine((t) => validarTelefono(t) === null, 'El teléfono tiene que tener 8 dígitos (o el número internacional completo)')
    .optional(),
});

/** Doc `config/apartados`. Coincide con `normalizarConfigApartados` y con la regla. */
export const ConfigApartadosSchema = z.object({
  primaMinimaPct: z.number().min(0).max(100),
  plazoDias: z.number().int('El plazo es en días enteros').min(1).max(365),
  actualizadoEn: z.number().optional(),
});

/**
 * Las claves de un producto que acepta `isValidProduct` en firestore.rules (el
 * `hasOnly`). SI SE CAMBIA UNA, SE CAMBIA LA OTRA.
 *
 * Existe para el diagnóstico: un script con Admin SDK se saltea las reglas y
 * puede dejar en un producto una clave fuera de esa lista (pasó con `specs` en
 * la T800E). Desde ese momento TODA escritura a ese producto se rechaza, y el
 * mensaje genérico de permisos culpa al deploy de reglas. Las transacciones de
 * apartados escriben productos, así que antes de escribir revisan esto y dicen
 * el nombre del campo.
 */
export const CAMPOS_PRODUCTO = [
  'id', 'sku', 'name', 'description', 'price', 'cost', 'stock', 'apartadas', 'minStockAlert',
  'category', 'imageBase64', 'isReordering', 'createdAt', 'updatedAt', 'ownerId',
  'categorySlug', 'publicar', 'precioPromo', 'descEfectivoPct', 'campania', 'beneficio',
  'bullets', 'specsProyector', 'objecionesOverride', 'media', 'activo', 'financiamientoOverride',
] as const;

/** Las claves de un producto que las reglas NO aceptan. Vacío = se puede escribir. */
export const camposFueraDeReglas = (data: Record<string, unknown>): string[] =>
  Object.keys(data).filter((k) => !(CAMPOS_PRODUCTO as readonly string[]).includes(k));

/**
 * Un correo que SaleSchema acepta. La ficha del cliente se guarda sin Zod y el
 * `<input type="email">` deja pasar `juan@gmail` (sin punto en el dominio); ese
 * correo, copiado a una venta, la hace rechazar.
 */
export const esEmailValido = (s?: string): boolean => !!s && z.string().email().safeParse(s).success;

// ---------------------------------------------------------------------------
// Objeciones
// ---------------------------------------------------------------------------

export const UniversalObjectionSchema = z.object({
  id: z.string().min(1).max(128),
  key: z.string().max(60).optional(),
  titulo: z.string().min(1).max(120),
  respuesta: z.string().min(1).max(2000),
  categoria: z.string().max(60).optional(),
  order: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  ownerId: z.string().min(1),
});

export const CategoryObjectionSchema = z.object({
  id: z.string().min(1).max(128),
  categorySlug: z.string().min(1).max(60),
  pregunta: z.string().min(1).max(120),
  respuesta: z.string().min(1).max(2000),
  orden: z.number(),
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
/**
 * El precio al que HOY se vende un producto: la promo si existe, si no la lista.
 *
 * Vive acá, al lado de `buildPublicCatalogDoc`, y no en cada pantalla, porque
 * el POS y el catálogo público TIENEN que dar el mismo número. Hasta ahora esta
 * regla existía sólo adentro del builder del espejo público: PandaWEB y
 * PandaLink mostraban `precioPromo`, el mostrador cobraba `price`, y el cliente
 * llegaba con el número de la web en el celular a discutir con el operador —
 * que además es el dueño, así que no hay a quién escalarle la discusión.
 * Con una sola función las dos superficies no pueden divergir por construcción.
 */
export function precioVigente(product: Pick<Product, 'price' | 'precioPromo'>): number {
  return typeof product.precioPromo === 'number' && product.precioPromo >= 0
    ? product.precioPromo
    : product.price;
}

export function buildPublicCatalogDoc(product: Product): PublicCatalogProduct {
  const lista = product.price;
  const promo =
    typeof product.precioPromo === 'number' && product.precioPromo >= 0
      ? product.precioPromo
      : undefined;
  const actual = precioVigente(product);
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
  // Excepción de financiamiento: es dato público (define la cuota que se
  // muestra). El costo que cobra el banco NO se copia nunca al espejo.
  if (product.financiamientoOverride) doc.financiamientoOverride = product.financiamientoOverride;

  return doc;
}
// (fin del archivo)
