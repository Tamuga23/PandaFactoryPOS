/**
 * Cloud Functions (Gen 2) — proyección pública del catálogo.
 *
 * `onProductWritten` reconstruye `catalogo_publico/{id}` cada vez que cambia
 * un documento `products/{id}`:
 *   - producto borrado        -> borra el espejo
 *   - publicar === false      -> borra el espejo
 *   - cualquier otro caso     -> (re)escribe el espejo derivado (SIN `cost`)
 *
 * Usa una base de datos Firestore NOMBRADA, cuyo id se lee de
 * `firebase-applet-config.json` (campo `firestoreDatabaseId`) -> DATABASE_ID.
 *
 * La derivación es un espejo de `buildPublicCatalogDoc` en
 * src/lib/validations.ts. Se reimplementa aquí para mantener el paquete de
 * functions sin dependencias extra (sólo firebase-admin / firebase-functions).
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Resuelve el id de la base de datos NOMBRADA.
 * Prioridad: env FIRESTORE_DATABASE_ID -> firebase-applet-config.json -> '(default)'.
 * En deploy, conviene setear FIRESTORE_DATABASE_ID o copiar el config a functions/.
 */
function resolveDatabaseId(): string {
  if (process.env.FIRESTORE_DATABASE_ID) return process.env.FIRESTORE_DATABASE_ID;
  const candidates = [
    join(__dirname, '..', 'firebase-applet-config.json'), // functions/firebase-applet-config.json (deploy)
    join(__dirname, '..', '..', 'firebase-applet-config.json'), // raíz del repo (local / emulador)
    join(process.cwd(), 'firebase-applet-config.json'),
  ];
  for (const p of candidates) {
    try {
      const cfg = JSON.parse(readFileSync(p, 'utf8')) as { firestoreDatabaseId?: string };
      if (cfg.firestoreDatabaseId) return cfg.firestoreDatabaseId;
    } catch {
      /* probar siguiente candidato */
    }
  }
  return '(default)';
}

const DATABASE_ID = resolveDatabaseId();

initializeApp();
const db = getFirestore(DATABASE_ID);
db.settings({ ignoreUndefinedProperties: true });

// --- Tipos locales mínimos (lo que leemos de products) ---
interface ProductLike {
  id: string;
  sku: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  category: string;
  categorySlug?: string;
  publicar?: boolean;
  precioPromo?: number;
  descEfectivoPct?: number;
  campania?: string;
  beneficio?: string;
  bullets?: unknown[];
  specsProyector?: Record<string, unknown>;
  objecionesOverride?: unknown[];
  media?: Record<string, unknown>;
  updatedAt?: number;
  // OJO: `cost` existe en products pero NUNCA se lee aquí.
}

// --- Helpers (espejo de src/lib/validations.ts) ---
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function slugify(input: string): string {
  return (input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos/diacríticos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // quita símbolos
    .replace(/\s+/g, '-') // espacios -> guiones
    .replace(/-+/g, '-') // colapsa guiones
    .replace(/^-+|-+$/g, ''); // recorta extremos
}

function buildPublicCatalogDoc(p: ProductLike): Record<string, unknown> {
  const lista = p.price;
  const promo =
    typeof p.precioPromo === 'number' && p.precioPromo >= 0 ? p.precioPromo : undefined;
  const actual = promo ?? lista;
  const desc =
    typeof p.descEfectivoPct === 'number' && p.descEfectivoPct > 0 ? p.descEfectivoPct : undefined;
  const efectivo = round2(actual * (1 - (desc ?? 0) / 100));

  const precio: Record<string, number> = { lista, actual, efectivo };
  if (promo !== undefined) precio.promo = promo;
  if (desc !== undefined) precio.descEfectivoPct = desc;

  const doc: Record<string, unknown> = {
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    categorySlug: slugify(p.categorySlug || p.category || ''),
    precio,
    disponible: p.stock > 0 && p.publicar !== false,
    updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : Date.now(),
  };
  if (p.description) doc.description = p.description;
  if (p.campania) doc.campania = p.campania;
  if (p.beneficio) doc.beneficio = p.beneficio;
  if (p.bullets) doc.bullets = p.bullets;
  if (p.specsProyector) doc.specsProyector = p.specsProyector;
  if (p.objecionesOverride) doc.objecionesOverride = p.objecionesOverride;
  if (p.media) doc.media = p.media;
  // NUNCA copiamos `cost`.
  return doc;
}

/**
 * Reconstruye catalogo_publico/{id} ante cualquier cambio en products/{id}.
 * NOTA: `database` debe coincidir con la ubicación/región de la BD nombrada.
 */
// La region DEBE coincidir con la ubicacion de la BD nombrada (firebase.json -> us-east1).
export const onProductWritten = onDocumentWritten(
  { document: 'products/{id}', database: DATABASE_ID, region: process.env.FUNCTION_REGION || 'us-east1' },
  async (event) => {
    const productId = event.params.id as string;
    const mirrorRef = db.collection('catalogo_publico').doc(productId);
    const after = event.data?.after;

    // Producto borrado -> borrar espejo.
    if (!after || !after.exists) {
      await mirrorRef.delete();
      logger.info(`catalogo_publico/${productId} eliminado (producto borrado)`);
      return;
    }

    const product = {
      id: productId,
      ...(after.data() as Record<string, unknown>),
    } as ProductLike;

    // No publicado -> borrar espejo.
    if (product.publicar === false) {
      await mirrorRef.delete();
      logger.info(`catalogo_publico/${productId} eliminado (publicar=false)`);
      return;
    }

    const docData = buildPublicCatalogDoc(product);
    await mirrorRef.set({ ...docData, espejoActualizadoAt: FieldValue.serverTimestamp() });
    logger.info(`catalogo_publico/${productId} actualizado`);
  },
);
