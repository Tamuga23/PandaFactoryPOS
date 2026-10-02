#!/usr/bin/env node
/**
 * Carga de contenido de fichas (beneficio, descripcion, bullets, objeciones)
 * a `products`, desde scripts/fichas_contenido.json (generado del Excel).
 *
 * Que hace (idempotente, add-only en objeciones):
 *   1. Crea las objeciones de CATEGORIA nuevas (proyector + dashcam) SOLO si no existen.
 *      Nunca sobrescribe una objecion de categoria que ya existe.
 *   2. Actualiza por cada producto: beneficio, bullets, objecionesOverride
 *      (y description si WRITE_DESCRIPTION = true).
 *      NUNCA toca precio, costo ni stock.
 *
 * Resolucion de producto:
 *   - Proyectores: por doc ID conocido (matchBy.id).
 *   - Dashcam: por nombre (matchBy.nameContains) / sku; la categoria solo desempata.
 *     Si hay 0 o >1 coincidencias, se reporta y se omite (no crea productos nuevos).
 *
 * Uso:
 *   node scripts/seed_fichas_contenido.mjs            # PRUEBA (dry-run, no escribe)
 *   node scripts/seed_fichas_contenido.mjs --apply    # aplica los cambios
 *
 * Credenciales: usa el service account del repo si esta presente; si no,
 * applicationDefault() (GOOGLE_APPLICATION_CREDENTIALS o `gcloud auth application-default login`).
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const APPLY = process.argv.includes('--apply');

// Si es true, escribe "Descripcion comercial" en el campo `description`.
// OJO: `description` tambien se ve en el POS (inventario/recibos) y se copia al
// catalogo publico. Poné false si preferis no tocar la descripcion del POS.
const WRITE_DESCRIPTION = true;

const cfg = JSON.parse(readFileSync(join(ROOT, 'firebase-applet-config.json'), 'utf8'));
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)';
const PROJECT_ID = cfg.projectId;
const DATA = JSON.parse(readFileSync(join(__dirname, 'fichas_contenido.json'), 'utf8'));

// --- credenciales ---
const saCandidates = [
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  join(ROOT, 'gen-lang-client-0460782288-firebase-adminsdk-fbsvc-5e894dbc0a.json'),
].filter(Boolean);
const saPath = saCandidates.find((p) => { try { return existsSync(p); } catch { return false; } });
initializeApp({
  credential: saPath ? cert(JSON.parse(readFileSync(saPath, 'utf8'))) : applicationDefault(),
  projectId: PROJECT_ID,
});
const db = getFirestore(DATABASE_ID);
db.settings({ ignoreUndefinedProperties: true });

const now = Date.now();
console.log('[fichas] projectId=' + PROJECT_ID + ' database=' + DATABASE_ID + ' apply=' + APPLY + ' writeDescription=' + WRITE_DESCRIPTION);
console.log('[fichas] credenciales: ' + (saPath ? 'service account (' + saPath.split(/[\\/]/).pop() + ')' : 'applicationDefault()'));

// ---------------------------------------------------------------------------
// 1. Objeciones de categoria nuevas (add-only)
// ---------------------------------------------------------------------------
console.log('\n-- Objeciones de categoria (crea solo las que faltan) --');
let catNew = 0, catSkip = 0;
for (const [categorySlug, list] of Object.entries(DATA.categoryObjections || {})) {
  for (const o of list) {
    const ref = db.collection('objeciones_categoria').doc(o.id);
    const snap = await ref.get();
    if (snap.exists) { console.log('  ~ ' + categorySlug + '/' + o.id + ' ya existe, se omite'); catSkip++; continue; }
    console.log('  + ' + categorySlug + '/' + o.id + ' -> "' + o.pregunta + '"');
    if (APPLY) await ref.set({ id: o.id, categorySlug, pregunta: o.pregunta, respuesta: o.respuesta, orden: o.orden ?? 99 });
    catNew++;
  }
}

// ---------------------------------------------------------------------------
// 2. Contenido por producto
// ---------------------------------------------------------------------------
async function resolveDoc(m) {
  if (m.id) {
    const ref = db.collection('products').doc(m.id);
    const snap = await ref.get();
    return snap.exists ? { ref, data: snap.data() } : null;
  }
  // por nombre / sku (primario); la categoria solo desempata si hay varios
  const all = await db.collection('products').get();
  let hits = [];
  all.forEach((d) => {
    const x = d.data();
    const nameOk = m.nameContains ? String(x.name || '').toLowerCase().includes(m.nameContains.toLowerCase()) : false;
    const skuOk = m.sku ? String(x.sku || '').toLowerCase() === String(m.sku).toLowerCase() : false;
    if (nameOk || skuOk) hits.push({ ref: d.ref, data: x });
  });
  if (hits.length > 1 && m.category) {
    const c = m.category.toLowerCase();
    const narrowed = hits.filter((h) =>
      String(h.data.category || '').toLowerCase().includes(c) ||
      String(h.data.categorySlug || '').toLowerCase().includes(c));
    if (narrowed.length === 1) hits = narrowed;
  }
  if (hits.length === 0) return null;
  return hits.length === 1 ? hits[0] : { ambiguous: hits };
}

console.log('\n-- Productos --');
let updated = 0, missing = 0, ambiguous = 0;
for (const m of DATA.productContent) {
  const found = await resolveDoc(m.matchBy);
  if (!found) {
    console.log('  x [' + m.label + '] producto NO encontrado (id=' + (m.matchBy.id ?? '-') + ') - se omite (crea el producto primero)');
    missing++; continue;
  }
  if (found.ambiguous) {
    console.log('  ! [' + m.label + '] ' + found.ambiguous.length + ' coincidencias, ambiguo - se omite:');
    found.ambiguous.forEach((h) => console.log('        - id=' + h.ref.id + ' name="' + h.data.name + '" sku="' + (h.data.sku || '') + '"'));
    ambiguous++; continue;
  }
  const { ref, data } = found;
  const bullets = m.bullets.map((b) => ({ text: b.text, order: b.order }));
  // Conserva `titulo` cuando viene: es la etiqueta legible del botón en la tablet.
  // Si falta, la tablet hereda la `pregunta` de la objeción base; si tampoco existe, muestra el slug.
  // (db.settings ignoreUndefinedProperties=true → un titulo undefined no se escribe.)
  const objecionesOverride = m.objeciones.map((o) => ({ objId: o.objId, titulo: o.titulo, respuesta: o.respuesta }));
  const update = { beneficio: m.beneficio, bullets, objecionesOverride, updatedAt: now };
  if (WRITE_DESCRIPTION) update.description = m.description;

  console.log('  -> [' + m.label + '] doc=' + ref.id + ' "' + data.name + '"');
  console.log('      beneficio: "' + m.beneficio + '"');
  if (WRITE_DESCRIPTION) {
    const before = data.description ? '"' + String(data.description).slice(0, 50) + '..." -> ' : '';
    console.log('      description: ' + before + '"' + m.description.slice(0, 50) + '..."');
  }
  console.log('      bullets: ' + bullets.length + ' | objecionesOverride: ' + objecionesOverride.length + ' (' + objecionesOverride.map((o) => o.objId).join(', ') + ')');
  if (m.beneficio && m.beneficio.length > 300) console.log('      ! beneficio > 300 chars (' + m.beneficio.length + '); las reglas del cliente lo rechazarian al editar en la app');
  if (APPLY) await ref.update(update);
  updated++;
}

console.log('\n' + (APPLY ? 'APLICADO' : 'PRUEBA (sin escribir) - corre con --apply para aplicar'));
console.log('Objeciones categoria -> nuevas: ' + catNew + ', existentes: ' + catSkip);
console.log('Productos -> actualizados: ' + updated + ', no encontrados: ' + missing + ', ambiguos: ' + ambiguous);
process.exit(0);
