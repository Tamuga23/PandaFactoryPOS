#!/usr/bin/env node
/**
 * Backfill de la colección espejo `catalogo_publico` (script de UN solo uso).
 *
 * Recorre TODOS los `products` y (re)escribe el espejo derivado, respetando
 * `publicar`. NUNCA copia `cost`. Usa la base de datos NOMBRADA del proyecto.
 *
 * Requisitos:
 *   - Credenciales de Admin:
 *       export GOOGLE_APPLICATION_CREDENTIALS=/ruta/service-account.json
 *     o bien `gcloud auth application-default login`.
 *   - `firebase-admin` instalado (p.ej. `npm i firebase-admin` en la raíz).
 *
 * Uso:
 *   node scripts/backfill_catalogo_publico.mjs            # escribe
 *   node scripts/backfill_catalogo_publico.mjs --dry-run  # sólo muestra
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');

const cfg = JSON.parse(
  readFileSync(join(__dirname, '..', 'firebase-applet-config.json'), 'utf8'),
);
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)';
const PROJECT_ID = cfg.projectId;

// --- Helpers (espejo de src/lib/validations.ts) ---
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function slugify(input) {
  return (input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildPublicCatalogDoc(p) {
  const lista = p.price;
  const promo = typeof p.precioPromo === 'number' && p.precioPromo >= 0 ? p.precioPromo : undefined;
  const actual = promo ?? lista;
  const desc =
    typeof p.descEfectivoPct === 'number' && p.descEfectivoPct > 0 ? p.descEfectivoPct : undefined;
  const efectivo = round2(actual * (1 - (desc ?? 0) / 100));

  const precio = { lista, actual, efectivo };
  if (promo !== undefined) precio.promo = promo;
  if (desc !== undefined) precio.descEfectivoPct = desc;

  const doc = {
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

async function main() {
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore(DATABASE_ID);
  db.settings({ ignoreUndefinedProperties: true });

  console.log(`[backfill] projectId=${PROJECT_ID} database=${DATABASE_ID} dryRun=${DRY_RUN}`);

  const snap = await db.collection('products').get();
  console.log(`[backfill] ${snap.size} productos encontrados`);

  let published = 0;
  let removed = 0;
  let batch = db.batch();
  let ops = 0;

  const flush = async () => {
    if (ops > 0 && !DRY_RUN) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };

  for (const docSnap of snap.docs) {
    const product = { id: docSnap.id, ...docSnap.data() };
    const mirrorRef = db.collection('catalogo_publico').doc(docSnap.id);

    if (product.publicar === false) {
      // Respetar `publicar`: no se publica; eliminar espejo si existiera.
      if (!DRY_RUN) {
        batch.delete(mirrorRef);
        ops++;
      }
      removed++;
      console.log(`  - ${docSnap.id} (${product.name ?? ''}) -> NO publicado`);
    } else {
      const data = buildPublicCatalogDoc(product);
      if (!DRY_RUN) {
        batch.set(mirrorRef, { ...data, espejoActualizadoAt: FieldValue.serverTimestamp() });
        ops++;
      }
      published++;
      console.log(`  + ${docSnap.id} (${data.name}) -> disponible=${data.disponible}`);
    }

    if (ops >= 450) await flush();
  }
  await flush();

  console.log(`[backfill] listo. publicados=${published} eliminados/no-publicados=${removed}`);
}

main().catch((err) => {
  console.error('[backfill] ERROR', err);
  process.exit(1);
});
